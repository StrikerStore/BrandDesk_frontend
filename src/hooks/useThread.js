import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  fetchThread, updateThread, sendReply as apiSendReply,
  cancelPendingSend, retryPendingSend, discardPendingSend,
} from '../utils/api';

const POLL_INTERVAL = 30000; // 30 seconds

export function useThread(threadId) {
  const [thread, setThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);
  const flushRef = useRef(null);

  const load = useCallback(async (silent = false) => {
    if (!threadId) return;
    if (!silent) setLoading(true);
    try {
      const { data } = await fetchThread(threadId);
      setThread(data.thread);
      setMessages(prev => {
        const next = data.messages || [];
        // Keep the same array reference when nothing changed so polls
        // don't retrigger effects (e.g. auto-scroll) in consumers
        const unchanged = prev.length === next.length && next.every((m, i) => m.id === prev[i]?.id);
        return unchanged ? prev : next;
      });
      setPending(prev => {
        const next = data.pending || [];
        // Status is part of the identity here — a row flipping queued → failed
        // must re-render even though its id never changes.
        const unchanged = prev.length === next.length &&
          next.every((p, i) => p.id === prev[i]?.id && p.status === prev[i]?.status);
        return unchanged ? prev : next;
      });
      setError(null);
    } catch (err) {
      // Don't overwrite error on silent poll failures
      if (!silent) setError(err.response?.data?.error || err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [threadId]);

  // Initial load when thread changes
  useEffect(() => {
    load();
  }, [load]);

  // Poll for new messages every 30s so customer replies appear automatically
  useEffect(() => {
    if (!threadId) return;
    pollRef.current = setInterval(() => load(true), POLL_INTERVAL);
    return () => clearInterval(pollRef.current);
  }, [threadId, load]);

  // Refresh shortly after the earliest recall window closes, so the real
  // message replaces the pending bubble promptly instead of up to 30s later.
  const nextFlushAt = useMemo(() => {
    const times = pending
      .filter(p => p.status === 'queued' && p.scheduled_for)
      .map(p => new Date(p.scheduled_for).getTime());
    return times.length ? Math.min(...times) : null;
  }, [pending]);

  useEffect(() => {
    clearTimeout(flushRef.current);
    if (!nextFlushAt) return;
    const delay = Math.max(nextFlushAt - Date.now(), 0) + 2000;
    flushRef.current = setTimeout(() => load(true), delay);
    return () => clearTimeout(flushRef.current);
  }, [nextFlushAt, load]);

  // Pending sends render as message bubbles so the thread reads naturally.
  // The server owns this list, which is why an Undo survives a refresh.
  const visibleMessages = useMemo(() => {
    if (!pending.length) return messages;
    const bubbles = pending.map(p => ({
      id: `pending-${p.id}`,
      direction: 'outbound',
      body: p.body,
      is_note: 0,
      sent_at: p.created_at,
      from_email: 'you',
      attachments: [],
      _pending: p,
    }));
    return [...messages, ...bubbles];
  }, [messages, pending]);

  // Rolls its own optimistic update back and hands the failure to the caller.
  // Logging to console meant the select kept showing a status the server never
  // accepted, and the agent moved on believing the ticket had been updated.
  const patchStatus = useCallback(async (status) => {
    if (!thread) return { ok: false };
    const previous = thread.status;
    setThread(prev => ({ ...prev, status }));
    try {
      await updateThread(thread.id, { status });
      return { ok: true };
    } catch (err) {
      setThread(prev => ({ ...prev, status: previous }));
      return { ok: false, previous, error: err };
    }
  }, [thread]);

  const reply = useCallback(async ({ body, isNote, brandName, gmailThreadId, attachments = [] }) => {
    setSending(true);
    try {
      let payload;
      if (attachments.length > 0) {
        const fd = new FormData();
        fd.append('body', body);
        fd.append('isNote', isNote ? 'true' : 'false');
        fd.append('brandName', brandName || '');
        attachments.forEach(f => fd.append('attachments', f));
        payload = fd;
      } else {
        payload = { body, isNote: !!isNote, brandName };
      }
      const { data } = await apiSendReply(gmailThreadId, payload);

      if (data?.pending) {
        // Bridge the gap until the next load(): key the bubble on the real
        // pending id so that load() replaces it rather than duplicating it.
        setPending(prev => [...prev, {
          id: data.pendingSendId,
          kind: 'reply',
          status: 'queued',
          body,
          attachment_count: attachments.length,
          scheduled_for: data.scheduledFor,
          error: null,
          created_at: new Date().toISOString(),
        }]);
      } else {
        // Append to local messages optimistically
        const newMsg = {
          id: Date.now(),
          direction: 'outbound',
          body,
          is_note: isNote ? 1 : 0,
          sent_at: new Date().toISOString(),
          from_email: 'you',
          _attachmentNames: attachments.map(f => ({ name: f.name, size: f.size, type: f.type })),
        };
        setMessages(prev => [...prev, newMsg]);
      }

      // Auto advance status
      if (!isNote && thread?.status === 'open') {
        setThread(prev => ({ ...prev, status: 'in_progress' }));
      }

      return true;
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      return false;
    } finally {
      setSending(false);
    }
  }, [thread]);

  // Returns the recalled body so the caller can restore it into the composer.
  const undoSend = useCallback(async (pendingSendId) => {
    try {
      const { data } = await cancelPendingSend(pendingSendId);
      setPending(prev => prev.filter(p => p.id !== pendingSendId));
      return { ok: true, body: data.body, kind: data.kind };
    } catch (err) {
      // 409 means it already flushed — reload so the UI shows the sent message.
      if (err.response?.status === 409) load(true);
      setError(err.response?.data?.error || err.message);
      return { ok: false };
    }
  }, [load]);

  const retrySend = useCallback(async (pendingSendId) => {
    try {
      await retryPendingSend(pendingSendId);
      await load(true);
      return true;
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      return false;
    }
  }, [load]);

  const discardSend = useCallback(async (pendingSendId) => {
    try {
      await discardPendingSend(pendingSendId);
      setPending(prev => prev.filter(p => p.id !== pendingSendId));
      return true;
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      return false;
    }
  }, []);

  return {
    thread, messages: visibleMessages, pending, loading, sending, error,
    reload: load, patchStatus, reply, setThread,
    undoSend, retrySend, discardSend,
  };
}
