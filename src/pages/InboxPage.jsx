import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { errorMessage } from '../utils/api';
import { useThreads } from '../hooks/useThreads.js';
import { useFilters } from '../hooks/useFilters.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { useToast } from '../ui/ToastProvider.jsx';
import { useShell } from '../layouts/AppShell.jsx';
import Sidebar from '../components/Sidebar/Sidebar.jsx';
import ThreadPanel from '../components/Thread/ThreadPanel.jsx';
import CustomerPanel from '../components/Customer/CustomerPanel.jsx';
import NewTicketModal from '../components/NewTicket/NewTicketModal.jsx';
import styles from './InboxPage.module.css';

const LIST_MIN = 260, LIST_MAX = 420, LIST_DEFAULT = 300;
const CTX_MIN  = 280, CTX_MAX  = 480, CTX_DEFAULT  = 320;

// Pane widths and drawer state are a per-agent preference; they shouldn't
// reset on every reload.
const readPref = (key, fallback) => {
  const v = Number(localStorage.getItem(key));
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

export default function InboxPage() {
  const toast    = useToast();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { brands } = useShell();
  const [, setSearchParams] = useSearchParams();

  // The open ticket is a URL segment now, not component state — so it is
  // linkable, survives refresh, and Back leaves the thread.
  const { threadId: threadIdParam } = useParams();
  const selectedThreadId = threadIdParam ? Number(threadIdParam) : null;

  const { filters, viewId, setFilters, applyView, clearAll, activeChips, removeChip } = useFilters();

  const [listW, setListW]       = useState(() => readPref('bd_list_w', LIST_DEFAULT));
  const [ctxW, setCtxW]         = useState(() => readPref('bd_ctx_w', CTX_DEFAULT));
  const [ctxOpen, setCtxOpen]   = useState(() => localStorage.getItem('bd_ctx_open') !== 'false');
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [showCustomerSheet, setShowCustomerSheet] = useState(false);

  const draggingRef = useRef(null);
  const startXRef   = useRef(0);
  const startWRef   = useRef(0);

  const {
    threads, loading, loadingMore, syncing, hasMore, error: listError,
    sync, fullSync, loadMore, reload, updateThreadLocal, removeThreadLocal,
  } = useThreads(filters);

  useEffect(() => {
    if (listError) toast.error("Couldn't load tickets", { detail: listError });
  }, [listError, toast]);

  const handleSync = useCallback(async (full = false) => {
    const res = await (full ? fullSync() : sync());
    if (!res?.ok) {
      toast.error("Couldn't fetch new email", { detail: errorMessage(res?.error) });
    } else if (res.imported === 0) {
      toast.info('No new email');
    } else if (res.imported > 0) {
      toast.success(`${res.imported} new ticket${res.imported > 1 ? 's' : ''} imported`);
    } else {
      toast.success('Inbox up to date');
    }
  }, [sync, fullSync, toast]);

  // ── Pane resizing ──────────────────────────────────────────────
  useEffect(() => {
    const onMove = (e) => {
      if (!draggingRef.current) return;
      const dx = e.clientX - startXRef.current;
      if (draggingRef.current === 'list') {
        setListW(Math.min(LIST_MAX, Math.max(LIST_MIN, startWRef.current + dx)));
      } else {
        setCtxW(Math.min(CTX_MAX, Math.max(CTX_MIN, startWRef.current - dx)));
      }
    };
    const onUp = () => {
      if (draggingRef.current === 'list') localStorage.setItem('bd_list_w', String(startWRef.current));
      draggingRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  // Persist whatever the drag settled on.
  useEffect(() => { localStorage.setItem('bd_list_w', String(listW)); }, [listW]);
  useEffect(() => { localStorage.setItem('bd_ctx_w', String(ctxW)); }, [ctxW]);
  useEffect(() => { localStorage.setItem('bd_ctx_open', String(ctxOpen)); }, [ctxOpen]);

  const startDrag = useCallback((which, e, currentW) => {
    e.preventDefault();
    draggingRef.current = which;
    startXRef.current   = e.clientX;
    startWRef.current   = currentW;
    document.body.style.cursor     = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  // ⌘\ toggles the context drawer — it's the pane agents hide most often.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') { e.preventDefault(); setCtxOpen(v => !v); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openThread = useCallback((id) => {
    updateThreadLocal(id, { is_unread: 0 });
    navigate(`/inbox/t/${id}${window.location.search}`);
  }, [navigate, updateThreadLocal]);

  const closeThread = useCallback(() => {
    setShowCustomerSheet(false);
    navigate(`/inbox${window.location.search}`);
  }, [navigate]);

  const handleThreadDeleted = useCallback(() => {
    closeThread();
    reload();
  }, [closeThread, reload]);

  const handleThreadUpdate = useCallback((id, updates) => {
    updateThreadLocal(id, updates);
    if (updates.snoozed_until) setTimeout(() => removeThreadLocal(id), 800);
  }, [updateThreadLocal, removeThreadLocal]);

  const list = (
    <Sidebar
      threads={threads}
      loading={loading}
      loadingMore={loadingMore}
      hasMore={hasMore}
      syncing={syncing}
      brands={brands}
      filters={filters}
      viewId={viewId}
      activeChips={activeChips}
      onRemoveChip={removeChip}
      onClearFilters={clearAll}
      onFilterChange={setFilters}
      onApplyView={applyView}
      selectedId={selectedThreadId}
      onSelect={openThread}
      onSync={() => handleSync(false)}
      onLoadMore={loadMore}
      onNewTicket={() => setShowNewTicket(true)}
    />
  );

  // ── Mobile: one pane at a time, driven by the same route ───────
  if (isMobile) {
    return (
      <div className={styles.mobileRoot}>
        {selectedThreadId ? (
          <>
            <ThreadPanel
              threadId={selectedThreadId}
              brands={brands}
              onThreadUpdate={handleThreadUpdate}
              onBack={closeThread}
              onOpenCustomer={() => setShowCustomerSheet(true)}
              onThreadDeleted={handleThreadDeleted}
            />
            {showCustomerSheet && (
              <div className={styles.sheetOverlay} onClick={() => setShowCustomerSheet(false)}>
                <div
                  className={styles.sheet}
                  role="dialog"
                  aria-modal="true"
                  aria-label="Customer details"
                  onClick={e => e.stopPropagation()}
                >
                  <div className={styles.sheetHead}>
                    <div className={styles.sheetGrab} />
                    <button
                      className={styles.sheetClose}
                      onClick={() => setShowCustomerSheet(false)}
                      aria-label="Close customer details"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className={styles.sheetBody}>
                    <CustomerPanel threadId={selectedThreadId} />
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          /* No FAB: the list header's "+ New" already opens this same modal,
             and two new-ticket buttons on one screen read as two actions. */
          list
        )}

        {showNewTicket && (
          <NewTicketModal
            brands={brands}
            onClose={() => setShowNewTicket(false)}
            onCreated={(thread) => { setShowNewTicket(false); reload(); navigate(`/inbox/t/${thread.id}`); }}
          />
        )}
      </div>
    );
  }

  // ── Desktop / tablet ───────────────────────────────────────────
  const showContext = !!selectedThreadId && ctxOpen;
  const columns = showContext
    ? `${listW}px minmax(480px, 1fr) ${ctxW}px`
    : `${listW}px minmax(480px, 1fr)`;

  return (
    <div className={styles.root} style={{ gridTemplateColumns: columns }}>
      <div className={styles.col}>
        {list}
        <div
          className={styles.handle}
          onMouseDown={(e) => startDrag('list', e, listW)}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize ticket list"
        />
      </div>

      {selectedThreadId ? (
        <div className={styles.col} style={{ position: 'relative' }}>
          <ThreadPanel
            threadId={selectedThreadId}
            brands={brands}
            onThreadUpdate={handleThreadUpdate}
            onThreadDeleted={handleThreadDeleted}
            contextOpen={ctxOpen}
            onToggleContext={() => setCtxOpen(v => !v)}
          />
          {showContext && (
            <div
              className={styles.handle}
              onMouseDown={(e) => startDrag('ctx', e, ctxW)}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize customer panel"
            />
          )}
        </div>
      ) : (
        <EmptyState
          loading={loading}
          threadCount={threads.length}
          hasFilters={activeChips.length > 0}
          onClearFilters={clearAll}
        />
      )}

      {showContext && (
        <div className={styles.col}>
          <CustomerPanel threadId={selectedThreadId} />
        </div>
      )}

      {showNewTicket && (
        <NewTicketModal
          brands={brands}
          onClose={() => setShowNewTicket(false)}
          onCreated={(thread) => { setShowNewTicket(false); reload(); navigate(`/inbox/t/${thread.id}`); }}
        />
      )}
    </div>
  );
}

function EmptyState({ loading, threadCount, hasFilters, onClearFilters }) {
  if (loading) return <div className={styles.emptyWrap} />;

  // "Nothing matches your filters" and "you're all caught up" used to render
  // the same grey sentence. One is a mistake to fix, the other is good news.
  if (threadCount === 0 && hasFilters) {
    return (
      <div className={styles.emptyWrap}>
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No tickets match these filters</p>
          <p className={styles.emptySub}>Nothing in the inbox fits the current narrowing.</p>
          <button className={styles.emptyAction} onClick={onClearFilters}>Clear all filters</button>
        </div>
      </div>
    );
  }

  if (threadCount === 0) {
    return (
      <div className={styles.emptyWrap}>
        <div className={styles.empty}>
          <div className={`${styles.emptyIcon} ${styles.emptyIconGood}`}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <p className={styles.emptyTitle}>All caught up</p>
          <p className={styles.emptySub}>No open tickets right now. New email appears here automatically.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.emptyWrap}>
      <div className={styles.empty}>
        <div className={styles.emptyIcon}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <p className={styles.emptyTitle}>Select a conversation</p>
        <p className={styles.emptySub}>Pick a ticket from the list to view the thread.</p>
      </div>
    </div>
  );
}
