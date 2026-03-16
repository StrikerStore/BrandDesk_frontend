import { useState, useRef, useEffect, useCallback } from 'react';
import { logoutUser, fetchViews, createView, deleteView, fetchStats } from '../../utils/api';
import { formatTime, getBrandColor, STATUS_CONFIG, truncate, getInitials } from '../../utils/helpers.js';
import Settings from '../Settings/Settings.jsx';
import styles from './Sidebar.module.css';
import logo from '../../assets/logo.png';


export default function Sidebar({
  threads, loading, loadingMore, hasMore, syncing, brands, filters,
  onFilterChange, selectedId, onSelect, onSync, onFullSync, onLoadMore, onAnalytics, user, onLogout,
}) {
  const [showUserMenu, setShowUserMenu]   = useState(false);
  const [showSettings, setShowSettings]   = useState(false);
  const [searchVal, setSearchVal]         = useState('');
  const [activeSearch, setActiveSearch]   = useState('');
  const [stats, setStats]                 = useState({});
  const [savedViews, setSavedViews]       = useState([]);
  const [activeViewId, setActiveViewId]   = useState(null);
  const [showSaveView, setShowSaveView]   = useState(false);
  const [viewName, setViewName]           = useState('');
  const [savingView, setSavingView]       = useState(false);
  const searchRef = useRef(null);
  const listRef   = useRef(null);

  // Infinite scroll — load more when near bottom
  // onLoadMore has its own internal guards via refs, so just call it
  const handleListScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distFromBottom < 200) {
      onLoadMore();
    }
  }, [onLoadMore]);

  const handleLogout = async () => { try { await logoutUser(); } catch {} onLogout(); };

  // Load saved views from DB
  useEffect(() => {
    fetchViews()
      .then(({ data }) => setSavedViews(data || []))
      .catch(() => {});
  }, []);

  const handleSaveView = async () => {
    const name = viewName.trim();
    if (!name) return;
    setSavingView(true);
    try {
      const cleanFilters = Object.fromEntries(
        Object.entries(filters).filter(([k, v]) => v !== undefined && v !== null && k !== 'search')
      );
      const { data } = await createView({ name, filters: cleanFilters });
      setSavedViews(prev => [...prev, data]);
      setActiveViewId(data.id);
      setViewName('');
      setShowSaveView(false);
    } catch (err) {
      console.error('Save view failed:', err.message);
    } finally {
      setSavingView(false);
    }
  };

  const handleApplyView = (view) => {
    setActiveViewId(view.id);
    setSearchVal('');
    setActiveSearch('');
    // Parse filters — MySQL returns JSON columns as objects already
    const f = typeof view.filters === 'string' ? JSON.parse(view.filters) : view.filters;
    onFilterChange(f);
  };

  const handleDeleteView = async (id, e) => {
    e.stopPropagation();
    try {
      await deleteView(id);
      setSavedViews(prev => prev.filter(v => v.id !== id));
      if (activeViewId === id) setActiveViewId(null);
    } catch (err) {
      console.error('Delete view failed:', err.message);
    }
  };

  // Clear active view when filters change manually
  const handleFilterChange = (updater) => {
    setActiveViewId(null);
    onFilterChange(updater);
  };

  // Load counts
  const loadStats = () => {
    fetchStats().then(({ data }) => setStats(data.byStatus || {})).catch(() => {});
  };

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, []);

  // Note: stats are loaded from the backend via fetchStats() which gives
  // accurate total counts across ALL threads, not just the loaded page.

  const commitSearch = () => {
    const val = searchVal.trim();
    setActiveSearch(val);
    setActiveViewId(null);
    onFilterChange(f => ({ ...f, search: val || undefined }));
  };

  const clearSearch = () => {
    setSearchVal('');
    setActiveSearch('');
    onFilterChange(f => { const { search, ...rest } = f; return rest; });
  };

  const handleSearchKey = (e) => {
    if (e.key === 'Enter') commitSearch();
    if (e.key === 'Escape') clearSearch();
  };

  const handleSearchChange = (val) => {
    setSearchVal(val);
    if (val === '') {
      setActiveSearch('');
      onFilterChange(f => { const { search, ...rest } = f; return rest; });
    }
  };

  const totalCount = Object.values(stats).reduce((a, b) => a + b, 0);

  const statusOptions = [
    { value: 'open',        label: 'Open',        count: stats.open        || 0 },
    { value: 'in_progress', label: 'In progress', count: stats.in_progress || 0 },
    { value: 'resolved',    label: 'Resolved',    count: stats.resolved    || 0 },
    { value: 'all',         label: 'All',         count: totalCount },
  ];

  const unreadCount = threads.filter(t => t.is_unread).length;
  const urgentCount = threads.filter(t => t.priority === 'urgent' && t.status !== 'resolved').length;

  // Keyboard shortcut: Cmd/Ctrl+K to focus search
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <aside className={styles.root}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <div className={styles.logo}>
            <img src={logo} alt="Logo" style={{ width: 28, height: 28, objectFit: 'contain' }} />
            <span className={styles.logoText}>BrandDesk</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className={styles.iconBtn} onClick={onSync} disabled={syncing} title="Sync emails">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }}>
                <path d="M23 4v6h-6M1 20v-6h6"/>
                <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
              </svg>
            </button>
            <button className={styles.iconBtn} onClick={onAnalytics} title="Analytics">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="20" x2="18" y2="10"/>
                <line x1="12" y1="20" x2="12" y2="4"/>
                <line x1="6"  y1="20" x2="6"  y2="14"/>
              </svg>
            </button>
            <div style={{ position: 'relative' }}>
              <button className={styles.iconBtn} onClick={() => setShowUserMenu(v => !v)} title={user?.email}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                </svg>
              </button>
              {showUserMenu && (
                <div className={styles.userMenu}>
                  <div className={styles.userInfo}>
                    <div className={styles.userName}>{user?.name}</div>
                    <div className={styles.userEmail}>{user?.email}</div>
                    <span className={`${styles.userRole} ${user?.role === 'admin' ? styles.userRoleAdmin : ''}`}>
                      {user?.role}
                    </span>
                  </div>
                  <div className={styles.userMenuDivider} />
                  <button className={styles.userMenuItem} onClick={() => { setShowUserMenu(false); setShowSettings(true); }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
                    Settings
                  </button>
                  {user?.role === 'admin' && (
                    <button className={styles.userMenuItem}
                      onClick={() => { setShowUserMenu(false); onFullSync(); }}
                      disabled={syncing}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M23 4v6h-6M1 20v-6h6"/>
                        <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                      </svg>
                      {syncing ? 'Syncing…' : 'Full Sync (500)'}
                    </button>
                  )}
                  {user?.role === 'admin' && (
                    <a className={styles.userMenuItem}
                      href={`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/auth/google`}
                      onClick={() => setShowUserMenu(false)}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8a19.79 19.79 0 01-3.07-8.67A2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z"/></svg>
                      Connect Gmail
                    </a>
                  )}
                  <div className={styles.userMenuDivider} />
                  <button className={styles.userMenuItemDanger} onClick={handleLogout}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Inbox meta */}
        <div className={styles.inboxMeta}>
          <span className={styles.inboxLabel}>Inbox</span>
          <div style={{ display: 'flex', gap: 5 }}>
            {unreadCount > 0 && <span className={styles.unreadBadge}>{unreadCount} new</span>}
            {urgentCount > 0 && <span className={styles.urgentBadge}>{urgentCount} urgent</span>}
          </div>
        </div>
      </div>

      {/* Search */}
      <div className={styles.searchWrap}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={styles.searchIcon}>
          <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
        </svg>
        <input
          ref={searchRef}
          className={styles.searchInput}
          placeholder="Search… (⌘K)"
          value={searchVal}
          onChange={e => handleSearchChange(e.target.value)}
          onKeyDown={handleSearchKey}
        />
        {searchVal && (
          <button className={styles.searchClear} onClick={clearSearch} title="Clear search">✕</button>
        )}
        <button
          className={`${styles.searchBtn} ${activeSearch ? styles.searchBtnActive : ''}`}
          onClick={commitSearch}
          title="Search"
        >
          Search
        </button>
      </div>

      {/* Saved views */}
      {(savedViews.length > 0 || true) && (
        <div className={styles.savedViews}>
          <div className={styles.savedViewsRow}>
            {savedViews.map(view => (
              <div
                key={view.id}
                className={`${styles.viewPill} ${activeViewId === view.id ? styles.viewPillActive : ''}`}
                onClick={() => handleApplyView(view)}
                title={`${view.filters.brand !== 'all' ? view.filters.brand : 'All brands'} · ${view.filters.status}`}
              >
                <span className={styles.viewPillName}>{view.name}</span>
                <button
                  className={styles.viewPillDelete}
                  onClick={(e) => handleDeleteView(view.id, e)}
                  title="Remove view"
                >✕</button>
              </div>
            ))}
            {showSaveView ? (
              <div className={styles.saveViewInput}>
                <input
                  autoFocus
                  className={styles.viewNameInput}
                  placeholder="View name…"
                  value={viewName}
                  onChange={e => setViewName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleSaveView();
                    if (e.key === 'Escape') { setShowSaveView(false); setViewName(''); }
                  }}
                  maxLength={24}
                />
                <button className={styles.viewSaveBtn} onClick={handleSaveView} disabled={!viewName.trim() || savingView}>
                  {savingView ? '…' : 'Save'}
                </button>
                <button className={styles.viewCancelBtn} onClick={() => { setShowSaveView(false); setViewName(''); }}>✕</button>
              </div>
            ) : (
              <button className={styles.addViewBtn} onClick={() => setShowSaveView(true)} title="Save current filters as a view">
                + Save view
              </button>
            )}
          </div>
        </div>
      )}

      {/* Brand filters */}
      <div className={styles.filterSection}>
        <div className={styles.pills}>
          <button
            className={`${styles.pill} ${filters.brand === 'all' ? styles.pillActive : ''}`}
            onClick={() => handleFilterChange(f => ({ ...f, brand: 'all' }))}
          >All brands</button>
          {brands.map(b => {
            const color   = getBrandColor(b.name);
            const isActive = filters.brand === b.name;
            return (
              <button key={b.name}
                className={`${styles.pill} ${isActive ? styles.pillBrandActive : ''}`}
                style={isActive ? { background: color.bg, color: color.text, borderColor: color.border } : {}}
                onClick={() => handleFilterChange(f => ({ ...f, brand: b.name }))}
              >{b.name}</button>
            );
          })}
        </div>
      </div>

      {/* Status tabs */}
      <div className={styles.statusTabs}>
        {statusOptions.map(opt => (
          <button key={opt.value}
            className={`${styles.statusTab} ${filters.status === opt.value ? styles.statusTabActive : ''}`}
            onClick={() => handleFilterChange(f => ({ ...f, status: opt.value }))}
          >
            {opt.label}
            {opt.count > 0 && (
              <span className={`${styles.tabCount} ${filters.status === opt.value ? styles.tabCountActive : ''}`}>
                {opt.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Thread list */}
      <div className={styles.list} ref={listRef} onScroll={handleListScroll}>
        {loading && threads.length === 0 ? (
          <div className={styles.loadingWrap}>{[1,2,3,4].map(i => <ThreadSkeleton key={i} />)}</div>
        ) : threads.length === 0 ? (
          <div className={styles.emptyList}>
            <p>{searchVal ? `No results for "${searchVal}"` : 'No tickets match these filters'}</p>
          </div>
        ) : (
          <>
            {threads.map(t => (
              <ThreadRow key={t.id} thread={t} selected={t.id === selectedId} onSelect={() => onSelect(t.id)} />
            ))}
            {loadingMore && (
              <div className={styles.loadMoreWrap}>
                <div className={styles.loadMoreSpinner} />
                <span>Loading more…</span>
              </div>
            )}
            {!loadingMore && hasMore && (
              <div className={styles.threadCount}>
                Showing {threads.length} of {threads.length + '+'}  — scroll for more
              </div>
            )}
            {!hasMore && threads.length > 20 && (
              <div className={styles.threadCount}>
                All {threads.length} threads loaded
              </div>
            )}
          </>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {showSettings && <Settings onClose={() => setShowSettings(false)} user={user} />}
    </aside>
  );
}

function ThreadRow({ thread, selected, onSelect }) {
  const brandColor  = getBrandColor(thread.brand);
  const status      = STATUS_CONFIG[thread.status] || STATUS_CONFIG.open;
  const rawName     = thread.customer_name || '';
  const isStoreName = rawName.toLowerCase().includes('shopify') || rawName.toLowerCase().includes(' store');
  const displayName = (!rawName || isStoreName) ? (thread.customer_email || 'Unknown') : rawName;
  const initials    = getInitials(displayName);
  const slaStatus   = thread.sla_status; // 'on_track' | 'at_risk' | 'breached' | null
  const tags = (() => {
    const raw = thread.tags;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    try { return JSON.parse(raw); } catch { return []; }
  })();

  return (
    <button
      className={`${styles.threadRow} ${selected ? styles.threadSelected : ''} ${thread.priority === 'urgent' ? styles.threadUrgent : ''} ${slaStatus === 'breached' ? styles.threadBreached : slaStatus === 'at_risk' ? styles.threadAtRisk : ''}`}
      onClick={onSelect}
    >
      {thread.is_unread ? <span className={styles.unreadDot} /> : null}

      <div className={styles.avatarWrap}>
        <div className={styles.avatar} style={{ background: brandColor.bg, color: brandColor.text }}>
          {initials || '?'}
        </div>
        {thread.priority === 'urgent' && <span className={styles.urgentDot} title="Urgent" />}
        {slaStatus === 'breached' && <span className={styles.slaBreachedDot} title={thread.sla_label} />}
      </div>

      <div className={styles.threadBody}>
        <div className={styles.threadTop}>
          <span className={styles.threadName}>{displayName}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            {slaStatus === 'at_risk' && (
              <span className={styles.slaAtRiskBadge} title={thread.sla_label}>
                {thread.sla_label}
              </span>
            )}
            <span className={styles.threadTime}>{formatTime(thread.last_message_at || thread.created_at)}</span>
          </div>
        </div>
        {thread.ticket_id ? (
          <div className={styles.threadSubject}>{thread.ticket_id}{thread.order_number ? ` · #${thread.order_number}` : ''}</div>
        ) : (
          <div className={styles.threadSubject}>{truncate(thread.subject, 46)}</div>
        )}
        <div className={styles.threadMeta}>
          <span className={styles.brandTag} style={{ background: brandColor.bg, color: brandColor.text }}>{thread.brand}</span>
          <span className={styles.statusDot} style={{ background: status.color }} />
          <span className={styles.statusLabel} style={{ color: status.color }}>{status.label}</span>
          {tags.slice(0, 2).map(tag => (
            <span key={tag} className={styles.tagPill}>#{tag}</span>
          ))}
          {slaStatus === 'breached' && (
            <span className={styles.slaBreachedPill} title={thread.sla_label}>
              SLA breached
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function ThreadSkeleton() {
  return (
    <div className={styles.skeleton}>
      <div className={styles.skeletonAvatar} />
      <div className={styles.skeletonBody}>
        <div className={styles.skeletonLine} style={{ width: '60%' }} />
        <div className={styles.skeletonLine} style={{ width: '85%', height: 10 }} />
        <div className={styles.skeletonLine} style={{ width: '40%', height: 10 }} />
      </div>
    </div>
  );
}