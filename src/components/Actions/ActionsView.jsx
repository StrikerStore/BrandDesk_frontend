import { useState, useEffect, useCallback } from 'react';
import { fetchAllActions, updateAction, closeAction } from '../../utils/api.js';
import { getBrandColor } from '../../utils/helpers.js';
import styles from './ActionsView.module.css';

const TYPE_LABELS = {
  exchange:          '🔄 Exchange',
  return:            '↩ Return',
  alternate_product: '🔁 Alternate Product',
  refund:            '💰 Refund',
  change_size:       '📏 Change Size',
  change_address:    '📍 Change Address',
};

const TYPE_COLORS = {
  exchange:          { bg: '#eff6ff', color: '#1d4ed8', border: '#93c5fd' },
  return:            { bg: '#fef3c7', color: '#92400e', border: '#fcd34d' },
  alternate_product: { bg: '#f0fdf4', color: '#15803d', border: '#86efac' },
  refund:            { bg: '#f5f3ff', color: '#6d28d9', border: '#c4b5fd' },
  change_size:       { bg: '#ecfeff', color: '#0e7490', border: '#67e8f9' },
  change_address:    { bg: '#fdf2f8', color: '#be185d', border: '#f9a8d4' },
};

const STATUS_FILTER_OPTIONS = [
  { value: 'open',   label: 'Open' },
  { value: 'closed', label: 'Closed' },
  { value: '',       label: 'All' },
];

const TYPE_FILTER_OPTIONS = [
  { value: '',                  label: 'All types' },
  { value: 'exchange',          label: 'Exchange' },
  { value: 'return',            label: 'Return' },
  { value: 'alternate_product', label: 'Alternate Product' },
  { value: 'refund',            label: 'Refund' },
  { value: 'change_size',       label: 'Change Size' },
  { value: 'change_address',    label: 'Change Address' },
];

function formatDate(val) {
  if (!val) return '—';
  return new Date(val).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function ActionsView({ onClose, sidebarWidth, onSelectThread }) {
  const [actions, setActions]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [statusFilter, setStatus]   = useState('open');
  const [typeFilter, setType]       = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      if (typeFilter)   params.type   = typeFilter;
      const { data } = await fetchAllActions(params);
      setActions(data.actions || []);
    } catch (err) {
      console.error('Fetch all actions error:', err.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleFieldUpdate = async (actionId, field, value) => {
    setActions(prev => prev.map(a => a.id === actionId ? { ...a, [field]: value } : a));
    try {
      await updateAction(actionId, { [field]: value });
    } catch (err) {
      console.error('Update action error:', err.message);
      load();
    }
  };

  const handleClose = async (actionId) => {
    if (!window.confirm('Close this action? This cannot be undone.')) return;
    try {
      const { data } = await closeAction(actionId);
      setActions(prev => prev.map(a => a.id === actionId ? data.action : a));
    } catch (err) {
      console.error('Close action error:', err.message);
    }
  };

  const openCount   = actions.filter(a => !a.is_closed).length;
  const closedCount = actions.filter(a =>  a.is_closed).length;

  return (
    <div className={styles.root} style={{ left: sidebarWidth || 0 }}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>Actions</h1>
          <div className={styles.summaryBadges}>
            <span className={styles.summaryBadge} style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' }}>
              {openCount} open
            </span>
            <span className={styles.summaryBadge} style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac' }}>
              {closedCount} closed
            </span>
          </div>
        </div>
        <div className={styles.headerRight}>
          {/* Status filter */}
          <div className={styles.filterGroup}>
            {STATUS_FILTER_OPTIONS.map(opt => (
              <button
                key={opt.value}
                className={`${styles.filterBtn} ${statusFilter === opt.value ? styles.filterBtnActive : ''}`}
                onClick={() => setStatus(opt.value)}
              >{opt.label}</button>
            ))}
          </div>
          {/* Type filter */}
          <select
            className={styles.typeSelect}
            value={typeFilter}
            onChange={e => setType(e.target.value)}
          >
            {TYPE_FILTER_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button className={styles.closeBtn} onClick={onClose} title="Close (Esc)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
            Close
          </button>
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
          <span>Loading actions…</span>
        </div>
      ) : actions.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
              <rect x="9" y="3" width="6" height="4" rx="1"/>
              <path d="M9 12h6M9 16h4"/>
            </svg>
          </div>
          <p className={styles.emptyTitle}>No actions found</p>
          <p className={styles.emptySub}>
            Log an exchange, return, or alternate product from within any ticket using the Action button.
          </p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Ticket</th>
                <th>Type</th>
                <th>Jerseys</th>
                <th>Status checklist</th>
                <th>IDs / notes</th>
                <th>Logged</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {actions.map(action => (
                <ActionRow
                  key={action.id}
                  action={action}
                  onFieldUpdate={handleFieldUpdate}
                  onClose={handleClose}
                  onSelectThread={onSelectThread}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Action row ───────────────────────────────────────────────────────────────

function ActionRow({ action, onFieldUpdate, onClose, onSelectThread }) {
  const isClosed   = !!action.is_closed;
  const typeColor  = TYPE_COLORS[action.action_type] || {};
  const brandColor = getBrandColor(action.brand || '');

  const rawName    = action.customer_name || '';
  const isStore    = rawName.toLowerCase().includes('shopify') || rawName.toLowerCase().includes(' store');
  const displayName = (!rawName || isStore) ? (action.customer_email || 'Customer') : rawName;

  return (
    <tr className={`${styles.row} ${isClosed ? styles.rowClosed : ''}`}>
      {/* Ticket cell */}
      <td className={styles.ticketCell}>
        <button
          className={styles.ticketLink}
          onClick={() => onSelectThread(action.thread_id)}
          title="Open ticket"
        >
          <span className={styles.ticketName}>{displayName}</span>
          {action.ticket_id && <span className={styles.ticketId}>{action.ticket_id}</span>}
          {action.order_number && <span className={styles.orderNum}>#{action.order_number}</span>}
          <span className={styles.brandTag} style={{ background: brandColor.bg, color: brandColor.text }}>
            {action.brand}
          </span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={styles.linkArrow}>
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </button>
      </td>

      {/* Type */}
      <td>
        <span
          className={styles.typeBadge}
          style={{ background: typeColor.bg, color: typeColor.color, borderColor: typeColor.border }}
        >
          {TYPE_LABELS[action.action_type]}
        </span>
        {isClosed && <div className={styles.closedPill}>Closed</div>}
      </td>

      {/* Jerseys */}
      <td className={styles.jerseyCell}>
        {['exchange', 'return', 'alternate_product'].includes(action.action_type) && (
          <EditableJersey label="Pickup" value={action.pickup_jersey} disabled={isClosed}
            onSave={v => onFieldUpdate(action.id, 'pickup_jersey', v)} />
        )}
        {action.action_type === 'exchange' && (
          <EditableJersey label="Exchange" value={action.exchange_jersey} disabled={isClosed}
            onSave={v => onFieldUpdate(action.id, 'exchange_jersey', v)} />
        )}
        {action.action_type === 'alternate_product' && (
          <EditableJersey label="Alternate" value={action.alternate_jersey} disabled={isClosed}
            onSave={v => onFieldUpdate(action.id, 'alternate_jersey', v)} />
        )}
        {action.action_type === 'change_size' && (
          <>
            <EditableJersey label="Current" value={action.current_jersey} disabled={isClosed}
              onSave={v => onFieldUpdate(action.id, 'current_jersey', v)} />
            <EditableJersey label="New" value={action.new_jersey} disabled={isClosed}
              onSave={v => onFieldUpdate(action.id, 'new_jersey', v)} />
          </>
        )}
        {action.action_type === 'change_address' && (
          <EditableJersey label="Address" value={action.new_address} disabled={isClosed}
            onSave={v => onFieldUpdate(action.id, 'new_address', v)} />
        )}
        {action.action_type === 'refund' && (
          <EditableJersey label="Jersey" value={action.pickup_jersey} disabled={isClosed}
            onSave={v => onFieldUpdate(action.id, 'pickup_jersey', v)} />
        )}
      </td>

      {/* Status checklist */}
      <td className={styles.checklistCell}>
        {action.action_type === 'exchange' && (
          <>
            <CheckItem label="Pickup done"    checked={!!action.exchange_pickup_done} disabled={isClosed}
              onChange={v => onFieldUpdate(action.id, 'exchange_pickup_done', v ? 1 : 0)} />
            <CheckItem label="Packed"         checked={!!action.exchange_packed}      disabled={isClosed}
              onChange={v => onFieldUpdate(action.id, 'exchange_packed', v ? 1 : 0)} />
          </>
        )}
        {action.action_type === 'return' && (
          <>
            <CheckItem label="Return created"  checked={!!action.return_created}  disabled={isClosed}
              onChange={v => onFieldUpdate(action.id, 'return_created', v ? 1 : 0)} />
            <CheckItem label="Return received" checked={!!action.return_received} disabled={isClosed}
              onChange={v => onFieldUpdate(action.id, 'return_received', v ? 1 : 0)} />
            <CheckItem label="Refund done"     checked={!!action.refund_done}     disabled={isClosed}
              onChange={v => onFieldUpdate(action.id, 'refund_done', v ? 1 : 0)} />
          </>
        )}
        {action.action_type === 'alternate_product' && (
          <>
            <CheckItem label="Alt order created"    checked={!!action.alt_order_created}        disabled={isClosed}
              onChange={v => onFieldUpdate(action.id, 'alt_order_created', v ? 1 : 0)} />
            <CheckItem label="Original cancelled"   checked={!!action.original_order_cancelled} disabled={isClosed}
              onChange={v => onFieldUpdate(action.id, 'original_order_cancelled', v ? 1 : 0)} />
          </>
        )}
        {action.action_type === 'refund' && (
          <CheckItem label="Refund done" checked={!!action.refund_done} disabled={isClosed}
            onChange={v => onFieldUpdate(action.id, 'refund_done', v ? 1 : 0)} />
        )}
        {action.action_type === 'change_size' && (
          <CheckItem label="Size changed" checked={!!action.size_change_done} disabled={isClosed}
            onChange={v => onFieldUpdate(action.id, 'size_change_done', v ? 1 : 0)} />
        )}
        {action.action_type === 'change_address' && (
          <CheckItem label="Address updated" checked={!!action.address_change_done} disabled={isClosed}
            onChange={v => onFieldUpdate(action.id, 'address_change_done', v ? 1 : 0)} />
        )}
      </td>

      {/* IDs / notes */}
      <td className={styles.idsCell}>
        {action.action_type === 'exchange' && (
          <EditableField
            label="Exchange Order ID"
            value={action.exchange_order_id}
            disabled={isClosed}
            mono
            onSave={v => onFieldUpdate(action.id, 'exchange_order_id', v || null)}
          />
        )}
        {action.action_type === 'return' && (
          <>
            <EditableField
              label="Refund ID"
              value={action.refund_id}
              disabled={isClosed}
              mono
              onSave={v => onFieldUpdate(action.id, 'refund_id', v || null)}
            />
            <EditableField
              label="Refund time"
              value={action.refund_time}
              disabled={isClosed}
              onSave={v => onFieldUpdate(action.id, 'refund_time', v || null)}
            />
          </>
        )}
        {['alternate_product', 'change_size', 'change_address'].includes(action.action_type) && (
          <span className={styles.noIds}>—</span>
        )}
        {action.action_type === 'refund' && (
          <>
            <EditableField
              label="Refund ID"
              value={action.refund_id}
              disabled={isClosed}
              mono
              onSave={v => onFieldUpdate(action.id, 'refund_id', v || null)}
            />
            <EditableField
              label="Refund date"
              value={action.refund_time}
              disabled={isClosed}
              onSave={v => onFieldUpdate(action.id, 'refund_time', v || null)}
            />
          </>
        )}
      </td>

      {/* Logged date */}
      <td className={styles.dateCell}>
        {formatDate(action.created_at)}
        {isClosed && action.closed_at && (
          <div className={styles.closedDate}>Closed {formatDate(action.closed_at)}</div>
        )}
      </td>

      {/* Actions */}
      <td className={styles.actionsCell}>
        {!isClosed && (
          <button className={styles.closeActionBtn} onClick={() => onClose(action.id)} title="Mark as closed">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
            Close
          </button>
        )}
      </td>
    </tr>
  );
}

// ── Inline checkbox ──────────────────────────────────────────────────────────

function CheckItem({ label, checked, onChange, disabled }) {
  return (
    <label className={`${styles.checkItem} ${disabled ? styles.checkItemDisabled : ''}`}>
      <span className={`${styles.checkbox} ${checked ? styles.checkboxChecked : ''}`}>
        {checked && (
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
        )}
      </span>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        disabled={disabled} style={{ display: 'none' }} />
      <span className={`${styles.checkLabel} ${checked ? styles.checkLabelDone : ''}`}>{label}</span>
    </label>
  );
}

// ── Inline editable jersey / address (multiline) ─────────────────────────────

function EditableJersey({ label, value, onSave, disabled }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(value || '');

  const commit = () => { onSave(draft.trim() || null); setEditing(false); };

  if (editing) {
    return (
      <div className={styles.jerseyEdit}>
        <span className={styles.jerseyLabel}>{label}</span>
        <textarea
          autoFocus
          className={styles.jerseyTextarea}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commit();
            if (e.key === 'Escape') setEditing(false);
          }}
          rows={2}
          placeholder={label}
        />
        <div className={styles.jerseyEditBtns}>
          <button className={styles.inlineSave} onClick={commit}>Save</button>
          <button className={styles.inlineCancel} onClick={() => setEditing(false)}>✕</button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.jerseyItem}>
      <span className={styles.jerseyLabel}>{label}</span>
      {value
        ? <span className={styles.jerseyValue} style={{ whiteSpace: 'pre-line' }}>{value}</span>
        : <span className={styles.noIds}>—</span>}
      {!disabled && (
        <button className={styles.editFieldBtn} onClick={() => { setDraft(value || ''); setEditing(true); }}>
          {value ? 'Edit' : '+ Add'}
        </button>
      )}
    </div>
  );
}

// ── Inline editable field ────────────────────────────────────────────────────

function EditableField({ label, value, onSave, disabled, mono }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(value || '');

  const commit = () => { onSave(draft.trim()); setEditing(false); };

  if (editing) {
    return (
      <div className={styles.inlineEdit}>
        <span className={styles.inlineLabel}>{label}</span>
        <input
          autoFocus
          className={`${styles.inlineInput} ${mono ? styles.inlineInputMono : ''}`}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
          placeholder={label}
        />
        <button className={styles.inlineSave} onClick={commit}>Save</button>
        <button className={styles.inlineCancel} onClick={() => setEditing(false)}>✕</button>
      </div>
    );
  }

  return (
    <div className={styles.fieldRow}>
      <span className={styles.fieldRowLabel}>{label}</span>
      {value ? (
        <span className={`${styles.fieldRowValue} ${mono ? styles.fieldRowMono : ''}`}>{value}</span>
      ) : (
        !disabled && (
          <button className={styles.addFieldBtn} onClick={() => { setDraft(''); setEditing(true); }}>+ Add</button>
        )
      )}
      {value && !disabled && (
        <button className={styles.editFieldBtn} onClick={() => { setDraft(value); setEditing(true); }}>Edit</button>
      )}
    </div>
  );
}
