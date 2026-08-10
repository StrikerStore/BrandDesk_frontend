import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { fetchThreads } from '../utils/api.js';
import { displayOrderId } from '../utils/helpers.js';
import Icon from './Icon.jsx';
import styles from './CommandPalette.module.css';

/**
 * ⌘K used to just focus the search box, while the placeholder advertised
 * "Search or #tag… (⌘K)" — a promise the field never kept.
 *
 * This is jump-to-anything: destinations, filtered inbox views, and live
 * ticket search by customer, ticket id or order number.
 */
// `keywords` exists because the filter used to match on `label` alone: nobody
// types "Go to Insights", they type "sla" or "report". It is not shown.
const NAV_COMMANDS = [
  { id: 'inbox',    label: 'Go to Inbox',          icon: 'package',  to: '/inbox',                        keywords: 'tickets threads mail' },
  { id: 'actions',  label: 'Go to Actions',        icon: 'check',    to: '/actions',                      keywords: 'tasks refunds checklist' },
  { id: 'insights', label: 'Go to Insights',       icon: 'clock',    to: '/insights',                     keywords: 'analytics reports stats sla dashboard' },
  { id: 'tpl',      label: 'Go to Templates',      icon: 'note',     to: '/templates',                    keywords: 'canned saved replies snippets' },
  { id: 'settings', label: 'Go to Settings',       icon: 'user',     to: '/settings/account',             keywords: 'preferences account team automation' },
  { id: 'help',     label: 'Help & shortcuts',     icon: 'note',     to: '/help',                         keywords: 'guide keyboard shortcuts keys docs how to onboarding' },
  { id: 'open',     label: 'Open tickets',         icon: 'package',  to: '/inbox?status=open',            keywords: 'new unresolved' },
  { id: 'prog',     label: 'In-progress tickets',  icon: 'package',  to: '/inbox?status=in_progress',     keywords: 'working wip' },
  { id: 'mine',     label: 'Assigned to me',       icon: 'user',     to: '/inbox?assignee=me',            keywords: 'my mine owner' },
  { id: 'unassig',  label: 'Unassigned tickets',   icon: 'userPlus', to: '/inbox?assignee=unassigned',    keywords: 'nobody unclaimed queue' },
];

export default function CommandPalette({ onClose }) {
  const navigate = useNavigate();
  const [query, setQuery]     = useState('');
  const [tickets, setTickets] = useState([]);
  const [busy, setBusy]       = useState(false);
  const [active, setActive]   = useState(0);
  const inputRef = useRef(null);
  const listRef  = useRef(null);

  const commands = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return NAV_COMMANDS;
    return NAV_COMMANDS.filter(c =>
      c.label.toLowerCase().includes(q) || c.keywords?.includes(q)
    );
  }, [query]);

  // Ticket lookup is debounced; two characters is enough for an order number.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setTickets([]); return; }
    setBusy(true);
    const id = setTimeout(async () => {
      try {
        const { data } = await fetchThreads({ search: q, status: 'all', limit: 6 });
        setTickets(data.threads || []);
      } catch { setTickets([]); }
      finally { setBusy(false); }
    }, 220);
    return () => { clearTimeout(id); setBusy(false); };
  }, [query]);

  const items = useMemo(() => ([
    ...commands.map(c => ({ kind: 'nav', key: `nav-${c.id}`, ...c })),
    ...tickets.map(t => ({ kind: 'ticket', key: `t-${t.id}`, thread: t })),
  ]), [commands, tickets]);

  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const run = useCallback((item) => {
    if (!item) return;
    navigate(item.kind === 'nav' ? item.to : `/inbox/t/${item.thread.id}`);
    onClose();
  }, [navigate, onClose]);

  const onKeyDown = (e) => {
    if (e.key === 'Escape')    { e.preventDefault(); onClose(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, items.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter')     { e.preventDefault(); run(items[active]); }
  };

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  return createPortal(
    <div className={styles.overlay} onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.panel} role="dialog" aria-modal="true" aria-label="Command palette">
        <div className={styles.searchRow}>
          <Icon name="package" size={15} className={styles.searchIcon} />
          <input
            ref={inputRef}
            className={styles.input}
            placeholder="Jump to a ticket, customer, order or page…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label="Command palette search"
            aria-activedescendant={items[active]?.key}
          />
          <kbd className={styles.kbd}>esc</kbd>
        </div>

        <ul className={styles.list} ref={listRef} role="listbox">
          {items.length === 0 && (
            <li className={styles.empty}>{busy ? 'Searching…' : `Nothing matches “${query}”`}</li>
          )}

          {items.map((item, i) => (
            <li key={item.key} id={item.key} role="option" aria-selected={i === active}>
              <button
                className={`${styles.item} ${i === active ? styles.itemActive : ''}`}
                data-active={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => run(item)}
              >
                {item.kind === 'nav' ? (
                  <>
                    <Icon name={item.icon} size={14} className={styles.itemIcon} />
                    <span className={styles.itemLabel}>{item.label}</span>
                    <span className={styles.itemHint}>Page</span>
                  </>
                ) : (
                  <>
                    <Icon name="package" size={14} className={styles.itemIcon} />
                    <span className={styles.itemLabel}>
                      {item.thread.customer_name || item.thread.customer_email}
                    </span>
                    <span className={styles.itemMeta}>
                      {item.thread.ticket_id && <span className={styles.mono}>{item.thread.ticket_id}</span>}
                      {item.thread.order_number && (
                        <span className={styles.mono}>#{displayOrderId(item.thread.order_number)}</span>
                      )}
                      <span className={styles.itemHint}>{item.thread.brand}</span>
                    </span>
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>

        <div className={styles.footer}>
          <span><kbd className={styles.kbd}>↑</kbd><kbd className={styles.kbd}>↓</kbd> navigate</span>
          <span><kbd className={styles.kbd}>↵</kbd> open</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
