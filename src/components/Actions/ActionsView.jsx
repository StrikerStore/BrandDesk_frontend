import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchAllActions, updateAction, closeAction, errorMessage } from '../../utils/api.js';
import { getBrandColor, displayOrderId, formatTime } from '../../utils/helpers.js';
import { ACTION_TYPES, TYPE_LABELS, TYPE_COLORS, schemaFor, progressOf } from '../../utils/actionTypes.js';
import { useToast } from '../../ui/ToastProvider.jsx';
import ConfirmDialog from '../../ui/ConfirmDialog.jsx';
import Icon from '../../ui/Icon.jsx';
import { maskFor } from '../../ui/MaskedValue.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import ActionDetail from './ActionDetail.jsx';
import styles from './ActionsView.module.css';

const STATUS_FILTERS = [
  { value: 'open',   label: 'Open' },
  { value: 'closed', label: 'Closed' },
  { value: '',       label: 'All' },
];

const SORTS = {
  age:      (a, b) => new Date(b.created_at) - new Date(a.created_at),
  oldest:   (a, b) => new Date(a.created_at) - new Date(b.created_at),
  type:     (a, b) => (TYPE_LABELS[a.action_type] || '').localeCompare(TYPE_LABELS[b.action_type] || ''),
  progress: (a, b) => progressOf(a).pct - progressOf(b).pct,
};

const daysSince = (d) => Math.floor((Date.now() - new Date(d)) / 86400000);

export default function ActionsView({ onSelectThread }) {
  const toast = useToast();
  const [actions, setActions]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [statusFilter, setStatus] = useState('open');
  const [typeFilter, setType]     = useState('');
  const [sort, setSort]           = useState('age');
  const [selected, setSelected]   = useState(() => new Set());
  const [detailId, setDetailId]   = useState(null);
  const [confirmClose, setConfirmClose] = useState(null);   // one action, or 'bulk'

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      if (typeFilter)   params.type   = typeFilter;
      const { data } = await fetchAllActions(params);
      setActions(data.actions || []);
      setSelected(new Set());
    } catch (err) {
      setLoadError(errorMessage(err, 'Failed to load actions'));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter]);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => [...actions].sort(SORTS[sort] || SORTS.age), [actions, sort]);
  const detail = actions.find(a => a.id === detailId) || null;

  // Single save path for every field. The old table had two: checkboxes wrote
  // immediately, text fields needed an explicit Save button, and nothing on
  // screen said which was which.
  const saveField = useCallback(async (actionId, field, value) => {
    const previous = actions.find(a => a.id === actionId)?.[field];
    setActions(prev => prev.map(a => a.id === actionId ? { ...a, [field]: value } : a));
    try {
      await updateAction(actionId, { [field]: value });
      return true;
    } catch (err) {
      setActions(prev => prev.map(a => a.id === actionId ? { ...a, [field]: previous } : a));
      toast.error("Couldn't save that change", { detail: errorMessage(err) });
      return false;
    }
  }, [actions, toast]);

  const closeOne = async (action) => {
    const { data } = await closeAction(action.id);
    setActions(prev => prev.map(a => a.id === action.id ? data.action : a));
  };

  const handleCloseConfirmed = async () => {
    const targets = confirmClose === 'bulk'
      ? actions.filter(a => selected.has(a.id) && !a.is_closed)
      : [confirmClose];
    try {
      for (const a of targets) await closeOne(a);
      setConfirmClose(null);
      setSelected(new Set());
      toast.success(targets.length === 1
        ? `${TYPE_LABELS[targets[0].action_type]} closed`
        : `${targets.length} actions closed`);
    } catch (err) {
      toast.error("Couldn't close everything", { detail: errorMessage(err) });
      load();
    }
  };

  const toggleSel = (id) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const openRows      = rows.filter(a => !a.is_closed);
  const allOpenPicked = openRows.length > 0 && openRows.every(a => selected.has(a.id));
  const selectedOpen  = actions.filter(a => selected.has(a.id) && !a.is_closed);
  const openCount     = actions.filter(a => !a.is_closed).length;
  const closedCount   = actions.filter(a =>  a.is_closed).length;

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>Actions</h1>
          <div className={styles.summaryBadges}>
            <span className={`${styles.summaryBadge} ${styles.badgeOpen}`}>{openCount} open</span>
            <span className={`${styles.summaryBadge} ${styles.badgeClosed}`}>{closedCount} closed</span>
          </div>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.filterGroup} role="group" aria-label="Status filter">
            {STATUS_FILTERS.map(opt => (
              <button
                key={opt.value}
                className={`${styles.filterBtn} ${statusFilter === opt.value ? styles.filterBtnActive : ''}`}
                onClick={() => setStatus(opt.value)}
                aria-pressed={statusFilter === opt.value}
              >{opt.label}</button>
            ))}
          </div>
          <label className="sr-only" htmlFor="action-sort">Sort by</label>
          <select id="action-sort" className={styles.typeSelect} value={sort} onChange={e => setSort(e.target.value)}>
            <option value="age">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="progress">Least progress</option>
            <option value="type">Type</option>
          </select>
        </div>
      </div>

      {/* Type filter as chips — a <select> hid which types even exist. */}
      <div className={styles.typeChips}>
        <button
          className={`${styles.typeChip} ${!typeFilter ? styles.typeChipActive : ''}`}
          onClick={() => setType('')}
          aria-pressed={!typeFilter}
        >All types</button>
        {ACTION_TYPES.map(t => {
          const on = typeFilter === t.id;
          return (
            <button
              key={t.id}
              className={`${styles.typeChip} ${on ? styles.typeChipActive : ''}`}
              style={on ? { background: t.color.bg, color: t.color.color, borderColor: t.color.border } : undefined}
              onClick={() => setType(on ? '' : t.id)}
              aria-pressed={on}
            >{t.label}</button>
          );
        })}
      </div>

      {/* Bulk bar — appears only with a selection */}
      {selectedOpen.length > 0 && (
        <div className={styles.bulkBar} role="status">
          <span className={styles.bulkCount}>{selectedOpen.length} selected</span>
          <button className={styles.bulkBtn} onClick={() => setConfirmClose('bulk')}>
            <Icon name="check" size={13} /> Close selected
          </button>
          <button className={styles.bulkClear} onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      {loading ? (
        <div className={styles.skeletonWrap}>
          {[1, 2, 3, 4, 5].map(i => <div key={i} className={styles.skeletonRow} />)}
        </div>
      ) : loadError ? (
        <div className={styles.emptyState} role="alert">
          <p className={styles.emptyTitle}>Couldn’t load actions</p>
          <p className={styles.emptySub}>{loadError}</p>
          <button className={styles.filterBtn} onClick={load} style={{ marginTop: 12 }}>Retry</button>
        </div>
      ) : rows.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}><Icon name="package" size={30} strokeWidth={1.4} /></div>
          <p className={styles.emptyTitle}>
            {statusFilter === 'open' ? 'No open actions' : 'No actions found'}
          </p>
          <p className={styles.emptySub}>
            {statusFilter === 'open'
              ? 'Everything logged has been closed out.'
              : 'Log an exchange, return or refund from inside any ticket.'}
          </p>
          {(typeFilter || statusFilter !== 'open') && (
            <button className={styles.filterBtn} style={{ marginTop: 12 }}
              onClick={() => { setType(''); setStatus('open'); }}>Reset filters</button>
          )}
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.selCell}>
                  <input
                    type="checkbox"
                    className={styles.nativeCheck}
                    checked={allOpenPicked}
                    onChange={() => setSelected(allOpenPicked ? new Set() : new Set(openRows.map(a => a.id)))}
                    aria-label="Select all open actions"
                  />
                </th>
                <th>Ticket</th>
                <th>Type</th>
                <th>Progress</th>
                <th>Age</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(action => (
                <ActionRow
                  key={action.id}
                  action={action}
                  selected={selected.has(action.id)}
                  active={action.id === detailId}
                  onToggleSel={() => toggleSel(action.id)}
                  onOpen={() => setDetailId(action.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail panel — the checklist and every editable field live here, so a
          table row no longer has to host six nested mini-forms. */}
      {detail && (
        <ActionDetail
          action={detail}
          onClose={() => setDetailId(null)}
          onSaveField={saveField}
          onCloseAction={() => setConfirmClose(detail)}
          onOpenTicket={() => { setDetailId(null); onSelectThread(detail.thread_id); }}
        />
      )}

      {confirmClose && (
        <ConfirmDialog
          title={confirmClose === 'bulk' ? `Close ${selectedOpen.length} actions?` : 'Close this action?'}
          message={confirmClose === 'bulk'
            ? selectedOpen.map(a => TYPE_LABELS[a.action_type]).join(', ')
            : `${TYPE_LABELS[confirmClose.action_type]} for ${confirmClose.ticket_id || 'this ticket'}.`}
          consequence="Closing is permanent — the checklist and fields become read-only and cannot be reopened."
          confirmLabel={confirmClose === 'bulk' ? 'Close all' : 'Close action'}
          onConfirm={handleCloseConfirmed}
          onCancel={() => setConfirmClose(null)}
        />
      )}
    </div>
  );
}

function ActionRow({ action, selected, active, onToggleSel, onOpen }) {
  const { isAdmin } = useAuth();
  const isClosed   = !!action.is_closed;
  const typeColor  = TYPE_COLORS[action.action_type] || {};
  const brandColor = getBrandColor(action.brand || '');
  const { done, total } = progressOf(action);
  const age = daysSince(action.created_at);

  const rawName     = action.customer_name || '';
  const isStore     = rawName.toLowerCase().includes('shopify') || rawName.toLowerCase().includes(' store');
  // Email fallback is a contact detail, so agents see it masked.
  const displayName = (!rawName || isStore)
    ? (maskFor(isAdmin, action.customer_email, 'email') || 'Customer')
    : rawName;

  return (
    <tr className={`${styles.row} ${isClosed ? styles.rowClosed : ''} ${active ? styles.rowActive : ''}`}>
      <td className={styles.selCell}>
        <input
          type="checkbox"
          className={styles.nativeCheck}
          checked={selected}
          disabled={isClosed}
          onChange={onToggleSel}
          aria-label={`Select ${TYPE_LABELS[action.action_type]} for ${displayName}`}
        />
      </td>

      <td>
        <button className={styles.rowOpen} onClick={onOpen} data-focus-inset>
          <span className={styles.ticketName}>{displayName}</span>
          <span className={styles.rowMeta}>
            {action.ticket_id && <span className={styles.ticketId}>{action.ticket_id}</span>}
            {action.order_number && <span className={styles.orderNum}>#{displayOrderId(action.order_number)}</span>}
            <span className={styles.brandTag} style={{ background: brandColor.bg, color: brandColor.text }}>
              {action.brand}
            </span>
          </span>
        </button>
      </td>

      <td>
        <span className={styles.typeBadge}
          style={{ background: typeColor.bg, color: typeColor.color, borderColor: typeColor.border }}>
          {TYPE_LABELS[action.action_type]}
        </span>
      </td>

      {/* Progress replaces the inline checklist — the detail panel owns the
          individual boxes; the table only needs "how far along is this". */}
      <td>
        <span className={styles.progressWrap} title={`${done} of ${total} steps done`}>
          <span className={styles.progressTrack}>
            <span
              className={`${styles.progressFill} ${done === total ? styles.progressDone : ''}`}
              style={{ width: `${total ? (done / total) * 100 : 0}%` }}
            />
          </span>
          <span className={styles.progressText}>{done}/{total}</span>
        </span>
      </td>

      <td className={styles.ageCell}>
        {/* Age is what makes a stalled action visible; the old table only had
            the logged date. */}
        <span className={!isClosed && age >= 7 ? styles.ageStale : undefined}>
          {age === 0 ? 'Today' : `${age}d`}
        </span>
      </td>

      <td>
        {isClosed
          ? <span className={styles.closedPill}>Closed</span>
          : <span className={styles.openPill}>Open</span>}
      </td>
    </tr>
  );
}
