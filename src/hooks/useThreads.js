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
  const [page, setPage]             = useState(1);
  const pollRef    = useRef(null);
  const filtersKey = JSON.stringify(filters);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [filtersKey]);

  // Load first page (or refresh)
  const load = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true);
    try {
      const { data } = await fetchThreads({ ...filters, page: 1, limit: PAGE_SIZE });
      setThreads(data.threads || []);
      setTotal(data.total || 0);
      setPage(1);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [filtersKey]);

  // Load next page and append
  const loadMore = useCallback(async () => {
    const nextPage = page + 1;
    const alreadyLoaded = threads.length;
    if (alreadyLoaded >= total || loadingMore) return;  // nothing more to load

    setLoadingMore(true);
    try {
      const { data } = await fetchThreads({ ...filters, page: nextPage, limit: PAGE_SIZE });
      const newThreads = data.threads || [];
      if (newThreads.length > 0) {
        setThreads(prev => {
          // Deduplicate by id in case of overlapping results
          const existingIds = new Set(prev.map(t => t.id));
          const unique = newThreads.filter(t => !existingIds.has(t.id));
          return [...prev, ...unique];
        });
        setPage(nextPage);
      }
      setTotal(data.total || total);
    } catch (err) {
      console.error('Load more failed:', err.message);
    } finally {
      setLoadingMore(false);
    }
  }, [filtersKey, page, total, threads.length, loadingMore]);

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
    setTotal(prev => Math.max(0, prev - 1));
  }, []);

  useEffect(() => { load(true); }, [load]);

  // Poll every 60s — reload first page from server (may add new threads)
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