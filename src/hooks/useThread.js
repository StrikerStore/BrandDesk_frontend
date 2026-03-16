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

  const reply = useCallback(async ({ body, isNote, brandName, gmailThreadId }) => {
    setSending(true);
    try {
      await apiSendReply(gmailThreadId, { body, isNote: !!isNote, brandName });

      // Append to local messages optimistically
      const newMsg = {
        id: Date.now(),
        direction: 'outbound',
        body,
        is_note: isNote ? 1 : 0,
        sent_at: new Date().toISOString(),
        from_email: 'you',
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
