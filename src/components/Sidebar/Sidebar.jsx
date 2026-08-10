import { useState, useRef, useEffect, useCallback } from 'react';
import { fetchViews, createView, deleteView, fetchStats, errorMessage } from '../../utils/api';
import { formatTime, getBrandColor, STATUS_CONFIG, truncate, getInitials, displayOrderId } from '../../utils/helpers.js';
import { useToast } from '../../ui/ToastProvider.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { maskFor } from '../../ui/MaskedValue.jsx';
import styles from './Sidebar.module.css';

// Kept only for the mobile case, where opening a ticket swaps the list out of
// the tree entirely. Desktop keeps both panes mounted.
let savedListScrollTop = 0;

export default function Sidebar({
  threads, loading, loadingMore, hasMore, syncing, brands, filters, viewId,
  activeChips = [], onRemoveChip, onClearFilters,
  onFilterChange, onApplyView, selectedId, onSelect, onSync, onLoadMore, onNewTicket,
}) {
  const [searchVal, setSearchVal]         = useState(filters.search || '');
  const [stats, setStats]                 = useState({});
  const [savedViews, setSavedViews]       = useState([]);
  const [showSaveView, setShowSaveView]   = useState(false);
  const [viewName, setViewName]           = useState('');
  const [savingView, setSavingView]       = useState(false);
  const [showBrandMenu, setShowBrandMenu] = useState(false);
  const searchRef = useRef(null);
  const listRef   = useRef(null);
  const brandRef  = useRef(null);
  const toast     = useToast();

  // The URL is the source of truth for filters now, so an external change
  // (Back, a shared link, "clear all") has to flow back into the input.
  useEffect(() => { setSearchVal(filters.search || ''); }, [filters.search]);

  // Infinite scroll — load more when near bottom
  // onLoadMore has its own internal guards via refs, so just call it
  const handleListScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    savedListScrollTop = el.scrollTop;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distFromBottom < 200) {
      onLoadMore();
    }
  }, [onLoadMore]);

  // Restore the scroll position once rows exist after a remount (mobile)
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || !savedListScrollTop) return;
    const el = listRef.current;
    if (!el || threads.length === 0) return;
    el.scrollTop = savedListScrollTop;
    restoredRef.current = true;
  }, [threads.length]);

  // A new filter/search is a new list — start it at the top. Skipped on mount
  // so it can't wipe the position we're about to restore.
  const filtersKey = JSON.stringify(filters);
  const prevFiltersKey = useRef(filtersKey);
  useEffect(() => {
    if (prevFiltersKey.current === filtersKey) return;
    prevFiltersKey.current = filtersKey;
    savedListScrollTop = 0;
    restoredRef.current = true;
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [filtersKey]);

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
      onApplyView(data);
      setViewName('');
      setShowSaveView(false);
      toast.success(`View “${name}” saved`);
    } catch (err) {
      toast.error("Couldn't save this view", { detail: errorMessage(err) });
    } finally {
      setSavingView(false);
    }
  };

  // The ✕ sits inside the view pill, so a mis-tap used to destroy a saved view
  // with no confirmation and no way back. Deleting is cheap to reverse, so the
  // right guard is an undo toast rather than a blocking dialog.
  const handleDeleteView = async (view, e) => {
    e.stopPropagation();
    setSavedViews(prev => prev.filter(v => v.id !== view.id));

    try {
      await deleteView(view.id);
      toast.undo(`View “${view.name}” removed`, async () => {
        try {
          const { data } = await createView({ name: view.name, filters: view.filters });
          setSavedViews(prev => [...prev, data]);
        } catch (err) {
          toast.error("Couldn't restore that view", { detail: errorMessage(err) });
        }
      });
    } catch (err) {
      setSavedViews(prev => [...prev, view]);          // put it back
      toast.error("Couldn't remove this view", { detail: errorMessage(err) });
    }
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

  // Search is debounced into the URL now. It used to require Enter or a click
  // on a "Search" button, with no results-as-you-type at all.
  useEffect(() => {
    const val = searchVal.trim();
    if (val === (filters.search || '')) return;
    const id = setTimeout(() => {
      onFilterChange(f => ({ ...f, search: val || undefined }));
    }, 300);
    return () => clearTimeout(id);
  }, [searchVal, filters.search, onFilterChange]);

  const clearSearch = () => {
    setSearchVal('');
    onFilterChange(f => { const { search, ...rest } = f; return rest; });
    searchRef.current?.focus();
  };

  const handleSearchKey = (e) => {
    if (e.key === 'Escape') clearSearch();
  };

  // Close the brand popover on outside click / Esc.
  useEffect(() => {
    if (!showBrandMenu) return;
    const onDown = (e) => { if (brandRef.current && !brandRef.current.contains(e.target)) setShowBrandMenu(false); };
    const onKey  = (e) => { if (e.key === 'Escape') setShowBrandMenu(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [showBrandMenu]);

  const handleFilterChange = onFilterChange;

  const totalCount = Object.values(stats).reduce((a, b) => a + b, 0);

  const statusOptions = [
    { value: 'open',        label: 'Open',        count: stats.open        || 0 },
    { value: 'in_progress', label: 'In progress', count: stats.in_progress || 0 },
    { value: 'resolved',    label: 'Resolved',    count: stats.resolved    || 0 },
    { value: 'all',         label: 'All',         count: totalCount },
  ];

  const unreadCount = threads.filter(t => t.is_unread).length;
  const urgentCount = threads.filter(t => t.priority === 'urgent' && t.status !== 'resolved').length;

  // ⌘K now opens the command palette (AppShell). `/` focuses this field, and
  // j/k walk the list the way every mail client does.
  useEffect(() => {
    const isTyping = (el) =>
      el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);

    const handler = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTyping(document.activeElement)) return;

      if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); return; }

      if (e.key !== 'j' && e.key !== 'k' && e.key !== 'Enter') return;
      if (threads.length === 0) return;

      const idx = threads.findIndex(t => t.id === selectedId);
      if (e.key === 'Enter') {
        if (idx >= 0) return;                       // already open
        e.preventDefault(); onSelect(threads[0].id); return;
      }
      e.preventDefault();
      const next = e.key === 'j'
        ? Math.min(idx + 1, threads.length - 1)
        : Math.max(idx - 1, 0);
      onSelect(threads[next === -1 ? 0 : next].id);
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [threads, selectedId, onSelect]);

  const activeView = savedViews.find(v => v.id === viewId);

  return (
    <aside className={styles.root} aria-label="Ticket list">
      {/* Header — brand identity and global nav moved to the rail; what's left
          is inbox-scoped: the title, the two inbox actions, and filtering. */}
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <div className={styles.titleWrap}>
            <h1 className={styles.title}>Inbox</h1>
            {unreadCount > 0 && <span className={styles.unreadBadge}>{unreadCount} new</span>}
            {urgentCount > 0 && <span className={styles.urgentBadge}>{urgentCount} urgent</span>}
          </div>
          <div className={styles.headerActions}>
            <button className={styles.iconBtn} onClick={onSync} disabled={syncing}
              aria-label={syncing ? 'Fetching new email…' : 'Fetch new email'} title="Fetch new email">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }}>
                <path d="M23 4v6h-6M1 20v-6h6"/>
                <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
              </svg>
            </button>
            <button className={styles.newBtn} onClick={onNewTicket}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              New
            </button>
          </div>
        </div>

        {/* Search — debounced, no explicit commit */}
        <div className={styles.searchWrap} onClick={() => searchRef.current?.focus()}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={styles.searchIcon}>
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <label className="sr-only" htmlFor="ticket-search">Search tickets</label>
          <input
            id="ticket-search"
            type="search"
            ref={searchRef}
            className={styles.searchInput}
            placeholder="Search tickets…  /"
            value={searchVal}
            onChange={e => setSearchVal(e.target.value)}
            onKeyDown={handleSearchKey}
          />
          {searchVal && (
            <button className={styles.searchClear} onClick={clearSearch} aria-label="Clear search">✕</button>
          )}
        </div>

        {/* Saved views + brand filter — one row of controls, not two competing
            pill sets. Brands moved into a popover so a long brand list can no
            longer eat three rows of vertical space. */}
        <div className={styles.controlRow}>
          <div className={styles.viewSelectWrap}>
            <label className="sr-only" htmlFor="saved-view">Saved view</label>
            <select
              id="saved-view"
              className={styles.viewSelect}
              value={viewId ?? ''}
              onChange={e => {
                const v = savedViews.find(s => String(s.id) === e.target.value);
                if (v) onApplyView(v);
              }}
            >
              <option value="">{activeView ? activeView.name : 'No saved view'}</option>
              {savedViews.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>

          <div className={styles.brandWrap} ref={brandRef}>
            <button
              className={`${styles.brandBtn} ${filters.brand !== 'all' ? styles.brandBtnActive : ''}`}
              onClick={() => setShowBrandMenu(v => !v)}
              aria-expanded={showBrandMenu}
              aria-haspopup="listbox"
            >
              {filters.brand === 'all' ? 'All brands' : filters.brand}
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6"/></svg>
            </button>
            {showBrandMenu && (
              <div className={styles.brandMenu} role="listbox">
                <button
                  className={`${styles.brandOption} ${filters.brand === 'all' ? styles.brandOptionActive : ''}`}
                  role="option" aria-selected={filters.brand === 'all'}
                  onClick={() => { handleFilterChange(f => ({ ...f, brand: 'all' })); setShowBrandMenu(false); }}
                >All brands</button>
                {brands.map(b => {
                  const color = getBrandColor(b.name);
                  const isActive = filters.brand === b.name;
                  return (
                    <button key={b.name}
                      className={`${styles.brandOption} ${isActive ? styles.brandOptionActive : ''}`}
                      role="option" aria-selected={isActive}
                      onClick={() => { handleFilterChange(f => ({ ...f, brand: b.name })); setShowBrandMenu(false); }}
                    >
                      <span className={styles.brandSwatch} style={{ background: color.bg, borderColor: color.border }} />
                      {b.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

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
              <button className={styles.viewCancelBtn} onClick={() => { setShowSaveView(false); setViewName(''); }} aria-label="Cancel">✕</button>
            </div>
          ) : (
            <button className={styles.addViewBtn} onClick={() => setShowSaveView(true)} title="Save current filters as a view">
              + Save view
            </button>
          )}

          {activeView && (
            <button
              className={styles.viewPillDelete}
              onClick={(e) => handleDeleteView(activeView, e)}
              aria-label={`Remove view ${activeView.name}`}
              title="Remove this view"
            >✕</button>
          )}
        </div>

        {/* One place that shows everything currently narrowing the list, with
            a way out. Three separate filter controls used to leave "why is my
            list empty?" unanswerable. */}
        {activeChips.length > 0 && (
          <div className={styles.chipRow}>
            {activeChips.map(chip => (
              <span key={chip.key} className={styles.chip}>
                <span className={styles.chipLabel}>{chip.label}:</span> {chip.value}
                <button
                  className={styles.chipRemove}
                  onClick={() => onRemoveChip(chip.key)}
                  aria-label={`Remove ${chip.label} filter`}
                >✕</button>
              </span>
            ))}
            <button className={styles.clearAll} onClick={onClearFilters}>Clear all</button>
          </div>
        )}
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
            <p>{searchVal ? `No results for “${searchVal}”` : 'No tickets match these filters'}</p>
            {activeChips.length > 0 && (
              <button className={styles.emptyClear} onClick={onClearFilters}>Clear all filters</button>
            )}
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
    </aside>
  );
}

function ThreadRow({ thread, selected, onSelect }) {
  const { isAdmin } = useAuth();
  const brandColor  = getBrandColor(thread.brand);
  const status      = STATUS_CONFIG[thread.status] || STATUS_CONFIG.open;
  const rawName     = thread.customer_name || '';
  const isStoreName = rawName.toLowerCase().includes('shopify') || rawName.toLowerCase().includes(' store');
  // Falling back to the raw email would put a contact detail in front of every
  // agent, so the fallback is masked for them.
  const hasName     = !!rawName && !isStoreName;
  const displayName = hasName
    ? rawName
    : (maskFor(isAdmin, thread.customer_email, 'email') || 'Unknown');
  const initials    = getInitials(hasName ? rawName : (thread.customer_email || ''));
  // SLA is a management signal — agents see the queue, admins see the clock.
  // Nulling it here removes the row tint, the dot, the at-risk badge and the
  // breached pill in one place.
  const slaStatus   = isAdmin ? thread.sla_status : null;
  const tags = (() => {
    const raw = thread.tags;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    try { return JSON.parse(raw); } catch { return []; }
  })();

  return (
    <button
      className={`${styles.threadRow} ${selected ? styles.threadSelected : ''} ${thread.is_unread ? styles.threadUnread : ''} ${thread.priority === 'urgent' ? styles.threadUrgent : ''} ${slaStatus === 'breached' ? styles.threadBreached : slaStatus === 'at_risk' ? styles.threadAtRisk : ''}`}
      onClick={onSelect}
      data-focus-inset
      aria-current={selected ? 'true' : undefined}
    >
      {/* The unread/urgent/SLA cues are colour-and-shape only; spell them out
          so they survive a screen reader and colour-blind vision. */}
      <span className="sr-only">
        {thread.is_unread ? 'Unread. ' : ''}
        {thread.priority === 'urgent' ? 'Urgent. ' : ''}
        {slaStatus === 'breached' ? 'SLA breached. ' : slaStatus === 'at_risk' ? 'SLA at risk. ' : ''}
      </span>
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
          <div className={styles.threadSubject}>{thread.ticket_id}{thread.order_number ? ` · #${displayOrderId(thread.order_id_resolved || thread.order_number)}` : ''}</div>
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