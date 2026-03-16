import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchThreads, syncThreads as apiSync, fullSyncThreads as apiFullSync } from '../utils/api';

export function useThreads(filters = {}) {
  const [threads, setThreads]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [total, setTotal]       = useState(0);
  const [syncing, setSyncing]   = useState(false);
  const pollRef     = useRef(null);
  const filtersKey  = JSON.stringify(filters);

  const load = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true);
    try {
      const { data } = await fetchThreads(filters);
      setThreads(data.threads || []);
      setTotal(data.total || 0);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [filtersKey]);

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      await apiSync();
      await load();
    } catch (err) {
      console.error('Sync failed:', err.message);
    } finally {
      setSyncing(false);
    }
  }, [load]);

  const fullSync = useCallback(async () => {
    setSyncing(true);
    try {
      await apiFullSync();
      await load();
    } catch (err) {
      console.error('Full sync failed:', err.message);
    } finally {
      setSyncing(false);
    }
  }, [load]);

  // Optimistic update — update fields but KEEP thread in current position
  // Only re-sort if priority changes (urgent floats to top)
  const updateThreadLocal = useCallback((id, updates) => {
    setThreads(prev => {
      const updated = prev.map(t => t.id === id ? { ...t, ...updates } : t);
      // Only re-sort if priority changed
      if (updates.priority !== undefined) {
        return [...updated].sort((a, b) => {
          const pa = a.priority === 'urgent' ? 1 : 2;
          const pb = b.priority === 'urgent' ? 1 : 2;
          return pa - pb;
        });
      }
      return updated;
    });
  }, []);

  const removeThreadLocal = useCallback((id) => {
    setThreads(prev => prev.filter(t => t.id !== id));
  }, []);

  useEffect(() => { load(true); }, [load]);

  // Poll every 60s — reload from server (may add new threads)
  useEffect(() => {
    pollRef.current = setInterval(() => load(), 60000);
    return () => clearInterval(pollRef.current);
  }, [load]);

  return { threads, loading, error, total, syncing, reload: load, sync, fullSync, updateThreadLocal, removeThreadLocal };
}