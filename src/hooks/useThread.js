import { useState, useEffect, useCallback } from 'react';
import { fetchThread, updateThread, sendReply as apiSendReply } from '../utils/api';

export function useThread(threadId) {
  const [thread, setThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!threadId) return;
    setLoading(true);
    try {
      const { data } = await fetchThread(threadId);
      setThread(data.thread);
      setMessages(data.messages || []);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    load();
  }, [load]);

  const patchStatus = useCallback(async (status) => {
    if (!thread) return;
    setThread(prev => ({ ...prev, status }));
    try {
      await updateThread(thread.id, { status });
    } catch (err) {
      console.error('Status update failed:', err.message);
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
      await apiSendReply(gmailThreadId, payload);

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

  return { thread, messages, loading, sending, error, reload: load, patchStatus, reply, setThread };
}
