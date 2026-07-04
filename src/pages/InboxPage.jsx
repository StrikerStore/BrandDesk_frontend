import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchBrands } from '../utils/api';
import { useThreads } from '../hooks/useThreads.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import Sidebar from '../components/Sidebar/Sidebar.jsx';
import ThreadPanel from '../components/Thread/ThreadPanel.jsx';
import CustomerPanel from '../components/Customer/CustomerPanel.jsx';
import Dashboard from '../components/Dashboard/Dashboard.jsx';
import ActionsView from '../components/Actions/ActionsView.jsx';
import NewTicketModal from '../components/NewTicket/NewTicketModal.jsx';
import Settings from '../components/Settings/Settings.jsx';
import BottomNav from '../components/Mobile/BottomNav.jsx';
import styles from './InboxPage.module.css';

const SIDEBAR_MIN = 220;
const SIDEBAR_MAX = 340;
const SIDEBAR_DEFAULT = 260;
const CUSTOMER_MIN = 280;
const CUSTOMER_MAX = 480;
const CUSTOMER_DEFAULT = 320;

export default function InboxPage({ user, onLogout }) {
  const [brands, setBrands]                     = useState([]);
  const [filters, setFilters]                   = useState({ brand: 'all', status: 'open' });
  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const [sidebarW, setSidebarW]                 = useState(SIDEBAR_DEFAULT);
  const [customerW, setCustomerW]               = useState(CUSTOMER_DEFAULT);
  const [showAnalytics, setShowAnalytics]       = useState(false);
  const [showActionsView, setShowActionsView]   = useState(false);
  const [showNewTicket, setShowNewTicket]       = useState(false);

  // Mobile-only navigation state (ignored on desktop)
  const isMobile = useIsMobile();
  const [mobileTab, setMobileTab]               = useState('inbox');
  const [showCustomerSheet, setShowCustomerSheet] = useState(false);

  const draggingRef = useRef(null);
  const startXRef   = useRef(0);
  const startWRef   = useRef(0);

  const { threads, loading, loadingMore, syncing, hasMore, sync, fullSync, loadMore, reload, updateThreadLocal, removeThreadLocal } = useThreads(
    (() => {
      const { search, ...rest } = filters;
      const params = { ...rest };
      if (search) params.search = search;
      return params;
    })()
  );

  useEffect(() => {
    fetchBrands().then(({ data }) => setBrands(data)).catch(() => {});
  }, []);

  useEffect(() => {
    const onMove = (e) => {
      if (!draggingRef.current) return;
      const dx = e.clientX - startXRef.current;
      if (draggingRef.current === 'sidebar') {
        setSidebarW(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startWRef.current + dx)));
      } else if (draggingRef.current === 'customer') {
        setCustomerW(Math.min(CUSTOMER_MAX, Math.max(CUSTOMER_MIN, startWRef.current - dx)));
      }
    };
    const onUp = () => {
      draggingRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  const startDrag = useCallback((which, e, currentW) => {
    e.preventDefault();
    draggingRef.current = which;
    startXRef.current   = e.clientX;
    startWRef.current   = currentW;
    document.body.style.cursor     = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const handleSelectThread = (id) => {
    setSelectedThreadId(id);
    updateThreadLocal(id, { is_unread: 0 });
  };

  const handleThreadUpdate = useCallback((threadId, updates) => {
    updateThreadLocal(threadId, updates);
    if (updates.snoozed_until) {
      setTimeout(() => removeThreadLocal(threadId), 800);
    }
  }, [updateThreadLocal, removeThreadLocal]);

  // ─────────────────────────────────────────────────────────────
  // MOBILE — stacked single-screen flow with a bottom tab bar.
  // Desktop 3-column layout below is left completely untouched.
  // ─────────────────────────────────────────────────────────────
  if (isMobile) {
    const inThread = mobileTab === 'inbox' && !!selectedThreadId;
    const unreadCount = threads.filter(t => t.is_unread).length;

    return (
      <div className={styles.mobileRoot}>
        {/* Inbox list (home) */}
        {mobileTab === 'inbox' && !selectedThreadId && (
          <Sidebar
            threads={threads}
            loading={loading}
            loadingMore={loadingMore}
            hasMore={hasMore}
            syncing={syncing}
            brands={brands}
            filters={filters}
            onFilterChange={setFilters}
            selectedId={selectedThreadId}
            onSelect={handleSelectThread}
            onSync={sync}
            onFullSync={fullSync}
            onLoadMore={loadMore}
            onAnalytics={() => setMobileTab('analytics')}
            onActionsView={() => setMobileTab('actions')}
            onNewTicket={() => setShowNewTicket(true)}
            user={user}
            onLogout={onLogout}
          />
        )}

        {/* Thread view */}
        {inThread && (
          <>
            <ThreadPanel
              threadId={selectedThreadId}
              brands={brands}
              onThreadUpdate={handleThreadUpdate}
              onBack={() => { setSelectedThreadId(null); setShowCustomerSheet(false); }}
              onOpenCustomer={() => setShowCustomerSheet(true)}
            />
            {showCustomerSheet && (
              <div className={styles.sheetOverlay} onClick={() => setShowCustomerSheet(false)}>
                <div className={styles.sheet} onClick={e => e.stopPropagation()}>
                  <div className={styles.sheetGrab} />
                  <div className={styles.sheetBody}>
                    <CustomerPanel threadId={selectedThreadId} />
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Actions tab */}
        {mobileTab === 'actions' && (
          <ActionsView
            onClose={() => setMobileTab('inbox')}
            sidebarWidth={0}
            onSelectThread={(threadId) => {
              setMobileTab('inbox');
              handleSelectThread(threadId);
            }}
          />
        )}

        {/* Analytics tab */}
        {mobileTab === 'analytics' && (
          <Dashboard onClose={() => setMobileTab('inbox')} sidebarWidth={0} />
        )}

        {/* Settings tab */}
        {mobileTab === 'settings' && (
          <Settings user={user} onClose={() => setMobileTab('inbox')} />
        )}

        {/* FAB — new ticket (inbox home only) */}
        {mobileTab === 'inbox' && !selectedThreadId && (
          <button className={styles.fab} onClick={() => setShowNewTicket(true)} aria-label="New ticket">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        )}

        {/* New ticket modal */}
        {showNewTicket && (
          <NewTicketModal
            brands={brands}
            onClose={() => setShowNewTicket(false)}
            onCreated={(thread) => {
              setShowNewTicket(false);
              setMobileTab('inbox');
              setSelectedThreadId(thread.id);
              reload();
            }}
          />
        )}

        {/* Bottom nav — hidden while reading a thread to maximize compose space */}
        {!inThread && (
          <BottomNav
            active={mobileTab}
            onChange={setMobileTab}
            badges={{ inbox: unreadCount }}
          />
        )}
      </div>
    );
  }

  return (
    <div className={styles.root} style={{ gridTemplateColumns: `${sidebarW}px 1fr ${customerW}px` }}>

      {/* Sidebar — always visible */}
      <div className={styles.col}>
        <Sidebar
          threads={threads}
          loading={loading}
          loadingMore={loadingMore}
          hasMore={hasMore}
          syncing={syncing}
          brands={brands}
          filters={filters}
          onFilterChange={setFilters}
          selectedId={selectedThreadId}
          onSelect={handleSelectThread}
          onSync={sync}
          onFullSync={fullSync}
          onLoadMore={loadMore}
          onAnalytics={() => setShowAnalytics(true)}
          onActionsView={() => setShowActionsView(true)}
          onNewTicket={() => setShowNewTicket(true)}
          user={user}
          onLogout={onLogout}
        />
        <div className={styles.handle} onMouseDown={(e) => startDrag('sidebar', e, sidebarW)} />
      </div>

      {/* Thread + Customer columns */}
      {selectedThreadId ? (
        <div className={styles.col} style={{ position: 'relative' }}>
          <ThreadPanel
            threadId={selectedThreadId}
            brands={brands}
            onThreadUpdate={handleThreadUpdate}
          />
          <div className={styles.handle} onMouseDown={(e) => startDrag('customer', e, customerW)} />
        </div>
      ) : (
        <EmptyState loading={loading} threadCount={threads.length} />
      )}

      {selectedThreadId && (
        <div className={styles.col}>
          <CustomerPanel threadId={selectedThreadId} />
        </div>
      )}

      {/* Analytics overlay — covers thread + customer, sidebar stays */}
      {showAnalytics && (
        <Dashboard
          onClose={() => setShowAnalytics(false)}
          sidebarWidth={sidebarW}
        />
      )}

      {/* Actions consolidated view */}
      {showActionsView && (
        <ActionsView
          onClose={() => setShowActionsView(false)}
          sidebarWidth={sidebarW}
          onSelectThread={(threadId) => {
            setShowActionsView(false);
            handleSelectThread(threadId);
          }}
        />
      )}

      {/* New ticket modal */}
      {showNewTicket && (
        <NewTicketModal
          brands={brands}
          onClose={() => setShowNewTicket(false)}
          onCreated={(thread) => {
            setSelectedThreadId(thread.id);
            reload();
          }}
        />
      )}
    </div>
  );
}

function EmptyState({ loading, threadCount }) {
  return (
    <div className={styles.emptyWrap}>
      {!loading && threadCount === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
            </svg>
          </div>
          <p className={styles.emptyTitle}>No tickets found</p>
          <p className={styles.emptySub}>Adjust your filters or sync to fetch new emails</p>
        </div>
      ) : (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Select a conversation</p>
          <p className={styles.emptySub}>Pick a ticket from the inbox to view the thread</p>
        </div>
      )}
    </div>
  );
}