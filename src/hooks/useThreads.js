import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchThreads, syncThreads as apiSync, fullSyncThreads as apiFullSync } from '../utils/api';

const PAGE_SIZE = 50;

export function useThreads(filters = {}) {
  const [threads, setThreads]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError]           = useState(null);
  const [total, setTotal]           = useState(0);
  const [syncing, setSyncing]       = useState(false);

  const pollRef       = useRef(null);
  const pageRef       = useRef(1);
  const loadingRef    = useRef(false);   // guards against concurrent loadMore calls
  const totalRef      = useRef(0);
  const threadCountRef = useRef(0);
  const filtersKey    = JSON.stringify(filters);
  const filtersRef    = useRef(filters);

  // Keep filtersRef in sync
  useEffect(() => { filtersRef.current = filters; }, [filtersKey]);

  // Load first page (or refresh)
  const load = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true);
    try {
      const { data } = await fetchThreads({ ...filtersRef.current, page: 1, limit: PAGE_SIZE });
      const list = data.threads || [];
      setThreads(list);
      setTotal(data.total || 0);
      setError(null);
      pageRef.current = 1;
      totalRef.current = data.total || 0;
      threadCountRef.current = list.length;
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [filtersKey]);

  // Reset and reload when filters change
  useEffect(() => {
    pageRef.current = 1;
    totalRef.current = 0;
    threadCountRef.current = 0;
    load(true);
  }, [load]);

  // Load next page and append — uses refs to avoid stale closures
  const loadMore = useCallback(async () => {
    // Guard: already loading, or no more data
    if (loadingRef.current) return;
    if (threadCountRef.current >= totalRef.current) return;

    loadingRef.current = true;
    setLoadingMore(true);

    const nextPage = pageRef.current + 1;

    try {
      const { data } = await fetchThreads({ ...filtersRef.current, page: nextPage, limit: PAGE_SIZE });
      const newThreads = data.threads || [];

      if (newThreads.length > 0) {
        setThreads(prev => {
          const existingIds = new Set(prev.map(t => t.id));
          const unique = newThreads.filter(t => !existingIds.has(t.id));
          const combined = [...prev, ...unique];
          threadCountRef.current = combined.length;
          return combined;
        });
        pageRef.current = nextPage;
      } else {
        // No more threads returned — mark as exhausted
        totalRef.current = threadCountRef.current;
      }

      totalRef.current = data.total || totalRef.current;
      setTotal(data.total || totalRef.current);
    } catch (err) {
      console.error('Load more failed:', err.message);
    } finally {
      loadingRef.current = false;
      setLoadingMore(false);
    }
  }, []);  // no deps needed — all mutable state is in refs

  const hasMore = threads.length < total;

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

  // Optimistic update
  const updateThreadLocal = useCallback((id, updates) => {
    setThreads(prev => {
      const updated = prev.map(t => t.id === id ? { ...t, ...updates } : t);
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
    setTotal(prev => Math.max(0, prev - 1));
    threadCountRef.current = Math.max(0, threadCountRef.current - 1);
    totalRef.current = Math.max(0, totalRef.current - 1);
  }, []);

  // Poll every 60s — reload first page (don't reset all loaded threads, just refresh page 1)
  useEffect(() => {
    pollRef.current = setInterval(() => load(), 60000);
    return () => clearInterval(pollRef.current);
  }, [load]);

  return {
    threads, loading, loadingMore, error, total, hasMore,
    syncing, reload: load, sync, fullSync, loadMore,
    updateThreadLocal, removeThreadLocal,
  };
}