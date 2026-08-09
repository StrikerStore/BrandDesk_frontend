import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchThreads, syncThreads as apiSync, fullSyncThreads as apiFullSync, errorMessage } from '../utils/api';
import { pushToast } from '../ui/ToastProvider.jsx';

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

  // Load first page (or refresh).
  //
  // merge = true  → refresh page 1 in place and KEEP everything already loaded
  //                 from pages 2..N. Used by the background poll: replacing the
  //                 array with just page 1 shrinks scrollHeight and the browser
  //                 clamps the user's scrollTop, yanking the list back to top.
  // merge = false → hard replace (filter change, sync, explicit reload) where
  //                 resetting to the top is the expected behaviour.
  const load = useCallback(async (showLoader = false, merge = false) => {
    if (showLoader) setLoading(true);
    try {
      const { data } = await fetchThreads({ ...filtersRef.current, page: 1, limit: PAGE_SIZE });
      const list = data.threads || [];

      if (merge) {
        setThreads(prev => {
          const firstPageIds = new Set(list.map(t => t.id));
          // Rows beyond page 1 keep their existing order; anything that moved up
          // into page 1 is already in `list`, so no duplicates.
          const tail = prev.filter(t => !firstPageIds.has(t.id));
          const next = [...list, ...tail];
          // Keep the same array reference when nothing changed so a quiet poll
          // doesn't re-render every row (mirrors useThread.js)
          const unchanged = prev.length === next.length && next.every((t, i) => {
            const p = prev[i];
            return p && t.id === p.id && t.updated_at === p.updated_at &&
              t.is_unread === p.is_unread && t.message_count === p.message_count;
          });
          threadCountRef.current = unchanged ? prev.length : next.length;
          return unchanged ? prev : next;
        });
      } else {
        setThreads(list);
        pageRef.current = 1;
        threadCountRef.current = list.length;
      }

      setTotal(data.total || 0);
      setError(null);
      totalRef.current = data.total || 0;
    } catch (err) {
      // Don't surface transient poll failures over a list that's still valid
      if (!merge) setError(err.response?.data?.error || err.message);
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
      // Infinite scroll failing silently just looks like the list ending.
      pushToast({
        variant: 'error',
        message: "Couldn't load more tickets",
        detail: errorMessage(err),
        action: { label: 'Retry', onClick: loadMoreRef.current },
      });
    } finally {
      loadingRef.current = false;
      setLoadingMore(false);
    }
  }, []);  // no deps needed — all mutable state is in refs

  // Lets the retry action in the failure toast re-enter loadMore without
  // making loadMore depend on itself.
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;

  const hasMore = threads.length < total;

  // Both return a result so the caller can toast. Swallowing the rejection
  // made a failed sync indistinguishable from "no new mail".
  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      const { data } = await apiSync();
      await load();
      return { ok: true, imported: data?.imported };
    } catch (err) {
      return { ok: false, error: err };
    } finally {
      setSyncing(false);
    }
  }, [load]);

  const fullSync = useCallback(async () => {
    setSyncing(true);
    try {
      const { data } = await apiFullSync();
      await load();
      return { ok: true, imported: data?.imported };
    } catch (err) {
      return { ok: false, error: err };
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

  // Poll every 60s — refresh page 1 and merge it over the already-loaded pages
  // so the list never shrinks under the user's scroll position
  useEffect(() => {
    pollRef.current = setInterval(() => load(false, true), 60000);
    return () => clearInterval(pollRef.current);
  }, [load]);

  return {
    threads, loading, loadingMore, error, total, hasMore,
    syncing, reload: load, sync, fullSync, loadMore,
    updateThreadLocal, removeThreadLocal,
  };
}