import { useState, useEffect, useCallback } from 'react';
import { fetchThreadActions, updateThreadAction, closeThreadAction } from '../../utils/api.js';
import styles from './ActionPanel.module.css';

const TYPE_LABELS = {
  exchange: '🔄 Exchange',
  return: '↩ Return',
  alternate_product: '🔁 Alternate Product',
  refund: '💰 Refund',
  change_size: '📏 Change Size',
  change_address: '📍 Change Address',
};

const TYPE_COLORS = {
  exchange: { bg: '#eff6ff', color: '#1d4ed8', border: '#93c5fd' },
  return: { bg: '#fef3c7', color: '#92400e', border: '#fcd34d' },
  alternate_product: { bg: '#f0fdf4', color: '#15803d', border: '#86efac' },
  refund: { bg: '#f5f3ff', color: '#6d28d9', border: '#c4b5fd' },
  change_size: { bg: '#ecfeff', color: '#0e7490', border: '#67e8f9' },
  change_address: { bg: '#fdf2f8', color: '#be185d', border: '#f9a8d4' },
};

function formatDateTime(val) {
  if (!val) return '';
  return new Date(val).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function ActionPanel({ threadId, onCountChange }) {
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!threadId) return;
    setLoading(true);
    try {
      const { data } = await fetchThreadActions(threadId);
      const list = data.actions || [];
      setActions(list);
      onCountChange?.(list.length);
    } catch (err) {
      console.error('Fetch actions error:', err.message);
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => { load(); }, [load]);

  const handleFieldUpdate = async (actionId, field, value) => {
    setActions(prev => prev.map(a => a.id === actionId ? { ...a, [field]: value } : a));
    try {
      await updateThreadAction(threadId, actionId, { [field]: value });
    } catch (err) {
      console.error('Update action field error:', err.message);
      load(); // revert on failure
    }
  };

  const handleClose = async (actionId) => {
    if (!window.confirm('Close this action? This cannot be undone.')) return;
    try {
      const { data } = await closeThreadAction(threadId, actionId);
      setActions(prev => prev.map(a => a.id === actionId ? data.action : a));
    } catch (err) {
      console.error('Close action error:', err.message);
    }
  };

  if (loading) {
    return (
      <div className={styles.root}>
        <div className={styles.loading}>
          <span className={styles.spinner} />
          Loading actions…
        </div>
      </div>
    );
  }

  if (actions.length === 0) {
    return (
      <div className={styles.root}>
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
              <rect x="9" y="3" width="6" height="4" rx="1"/>
              <path d="M9 12h6M9 16h4"/>
            </svg>
          </div>
          <p className={styles.emptyTitle}>No actions logged yet</p>
          <p className={styles.emptySub}>Click "Action" in the reply toolbar to log an exchange, return, or alternate product request.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      {actions.map(action => (
        <ActionCard
          key={action.id}
          action={action}
          onFieldUpdate={handleFieldUpdate}
          onClose={handleClose}
        />
      ))}
    </div>
  );
}

function ActionCard({ action, onFieldUpdate, onClose }) {
  const typeColor = TYPE_COLORS[action.action_type] || { bg: '#f9fafb', color: '#374151', border: '#e5e7eb' };
  const isClosed = !!action.is_closed;

  return (
    <div className={`${styles.card} ${isClosed ? styles.cardClosed : ''}`}>
      {/* Card header */}
      <div className={styles.cardHeader}>
        <div className={styles.cardHeaderLeft}>
          <span
            className={styles.typeBadge}
            style={{ background: typeColor.bg, color: typeColor.color, borderColor: typeColor.border }}
          >
            {TYPE_LABELS[action.action_type]}
          </span>
          {isClosed && <span className={styles.closedBadge}>Closed</span>}
        </div>
        <span className={styles.cardDate}>
          {formatDateTime(action.created_at)}
        </span>
      </div>

      {/* Jersey details */}
      <div className={styles.jerseyRow}>
        {action.pickup_jersey && <JerseyInfo label="Pickup" value={action.pickup_jersey} />}
        {action.exchange_jersey && <JerseyInfo label="Exchange" value={action.exchange_jersey} />}
        {action.alternate_jersey && <JerseyInfo label="Alternate" value={action.alternate_jersey} />}
        {action.current_jersey && <JerseyInfo label="Current" value={action.current_jersey} />}
        {action.new_jersey && <JerseyInfo label="New" value={action.new_jersey} />}
        {action.new_address && <JerseyInfo label="New Address" value={action.new_address} />}
      </div>

      {/* Status section */}
      <div className={styles.statusSection}>
        <div className={styles.statusTitle}>Action Status</div>

        {action.action_type === 'exchange' && (
          <ExchangeStatus action={action} onFieldUpdate={onFieldUpdate} disabled={isClosed} />
        )}
        {action.action_type === 'return' && (
          <ReturnStatus action={action} onFieldUpdate={onFieldUpdate} disabled={isClosed} />
        )}
        {action.action_type === 'alternate_product' && (
          <AlternateStatus action={action} onFieldUpdate={onFieldUpdate} disabled={isClosed} />
        )}
        {action.action_type === 'refund' && (
          <RefundStatus action={action} onFieldUpdate={onFieldUpdate} disabled={isClosed} />
        )}
        {action.action_type === 'change_size' && (
          <div className={styles.statusList}>
            <CheckboxRow
              label="Size Changed"
              checked={!!action.size_change_done}
              onChange={v => onFieldUpdate(action.id, 'size_change_done', v ? 1 : 0)}
              disabled={isClosed}
            />
          </div>
        )}
        {action.action_type === 'change_address' && (
          <div className={styles.statusList}>
            <CheckboxRow
              label="Address Updated"
              checked={!!action.address_change_done}
              onChange={v => onFieldUpdate(action.id, 'address_change_done', v ? 1 : 0)}
              disabled={isClosed}
            />
          </div>
        )}
      </div>

      {/* Close button */}
      {!isClosed && (
        <div className={styles.cardFooter}>
          <button className={styles.closeActionBtn} onClick={() => onClose(action.id)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
            Close Action
          </button>
        </div>
      )}
      {isClosed && action.closed_at && (
        <div className={styles.closedAt}>
          Closed on {formatDateTime(action.closed_at)}
        </div>
      )}
    </div>
  );
}

function JerseyInfo({ label, value }) {
  return (
    <div className={styles.jerseyItem}>
      <span className={styles.jerseyLabel}>{label}</span>
      <span className={styles.jerseyValue}>{value}</span>
    </div>
  );
}

// ── Exchange status ──────────────────────────────────────────────────────────

function ExchangeStatus({ action, onFieldUpdate, disabled }) {
  const [editingOrderId, setEditingOrderId] = useState(false);
  const [orderIdInput, setOrderIdInput] = useState(action.exchange_order_id || '');

  const saveOrderId = () => {
    onFieldUpdate(action.id, 'exchange_order_id', orderIdInput.trim() || null);
    setEditingOrderId(false);
  };

  return (
    <div className={styles.statusList}>
      {/* Exchange order ID */}
      <div className={styles.statusRow}>
        <div className={styles.statusRowLeft}>
          <span className={styles.statusLabel}>Exchange Order ID</span>
          {!editingOrderId && action.exchange_order_id && (
            <span className={styles.statusValue} style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
              {action.exchange_order_id}
            </span>
          )}
        </div>
        {!disabled && (
          editingOrderId ? (
            <div className={styles.inlineEdit}>
              <input
                autoFocus
                className={styles.inlineInput}
                placeholder="Order ID"
                value={orderIdInput}
                onChange={e => setOrderIdInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveOrderId(); if (e.key === 'Escape') setEditingOrderId(false); }}
              />
              <button className={styles.inlineSave} onClick={saveOrderId}>Save</button>
              <button className={styles.inlineCancel} onClick={() => setEditingOrderId(false)}>✕</button>
            </div>
          ) : (
            <button className={styles.editBtn} onClick={() => setEditingOrderId(true)}>
              {action.exchange_order_id ? 'Edit' : '+ Add'}
            </button>
          )
        )}
      </div>

      <CheckboxRow
        label="Exchange Pickup Done"
        checked={!!action.exchange_pickup_done}
        onChange={v => onFieldUpdate(action.id, 'exchange_pickup_done', v ? 1 : 0)}
        disabled={disabled}
      />
      <CheckboxRow
        label="Exchange Packed"
        checked={!!action.exchange_packed}
        onChange={v => onFieldUpdate(action.id, 'exchange_packed', v ? 1 : 0)}
        disabled={disabled}
      />
    </div>
  );
}

// ── Return status ────────────────────────────────────────────────────────────

function ReturnStatus({ action, onFieldUpdate, disabled }) {
  const [editingRefundId, setEditingRefundId] = useState(false);
  const [refundIdInput, setRefundIdInput] = useState(action.refund_id || '');
  const [editingRefundTime, setEditingRefundTime] = useState(false);
  const [refundTimeInput, setRefundTimeInput] = useState(action.refund_time || '');

  const saveRefundId = () => {
    onFieldUpdate(action.id, 'refund_id', refundIdInput.trim() || null);
    setEditingRefundId(false);
  };

  const saveRefundTime = () => {
    onFieldUpdate(action.id, 'refund_time', refundTimeInput.trim() || null);
    setEditingRefundTime(false);
  };

  return (
    <div className={styles.statusList}>
      <CheckboxRow
        label="Return Created"
        checked={!!action.return_created}
        onChange={v => onFieldUpdate(action.id, 'return_created', v ? 1 : 0)}
        disabled={disabled}
      />
      <CheckboxRow
        label="Return Received"
        checked={!!action.return_received}
        onChange={v => onFieldUpdate(action.id, 'return_received', v ? 1 : 0)}
        disabled={disabled}
      />
      <CheckboxRow
        label="Refund Done"
        checked={!!action.refund_done}
        onChange={v => onFieldUpdate(action.id, 'refund_done', v ? 1 : 0)}
        disabled={disabled}
      />

      {/* Refund ID */}
      <div className={styles.statusRow}>
        <div className={styles.statusRowLeft}>
          <span className={styles.statusLabel}>Refund ID</span>
          {!editingRefundId && action.refund_id && (
            <span className={styles.statusValue} style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
              {action.refund_id}
            </span>
          )}
        </div>
        {!disabled && (
          editingRefundId ? (
            <div className={styles.inlineEdit}>
              <input
                autoFocus
                className={styles.inlineInput}
                placeholder="Refund ID"
                value={refundIdInput}
                onChange={e => setRefundIdInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveRefundId(); if (e.key === 'Escape') setEditingRefundId(false); }}
              />
              <button className={styles.inlineSave} onClick={saveRefundId}>Save</button>
              <button className={styles.inlineCancel} onClick={() => setEditingRefundId(false)}>✕</button>
            </div>
          ) : (
            <button className={styles.editBtn} onClick={() => setEditingRefundId(true)}>
              {action.refund_id ? 'Edit' : '+ Add'}
            </button>
          )
        )}
      </div>

      {/* Refund time */}
      <div className={styles.statusRow}>
        <div className={styles.statusRowLeft}>
          <span className={styles.statusLabel}>Refund Time</span>
          {!editingRefundTime && action.refund_time && (
            <span className={styles.statusValue}>{action.refund_time}</span>
          )}
        </div>
        {!disabled && (
          editingRefundTime ? (
            <div className={styles.inlineEdit}>
              <input
                autoFocus
                className={styles.inlineInput}
                placeholder="e.g. 2 Jun 2025, 3:30 PM"
                value={refundTimeInput}
                onChange={e => setRefundTimeInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveRefundTime(); if (e.key === 'Escape') setEditingRefundTime(false); }}
              />
              <button className={styles.inlineSave} onClick={saveRefundTime}>Save</button>
              <button className={styles.inlineCancel} onClick={() => setEditingRefundTime(false)}>✕</button>
            </div>
          ) : (
            <button className={styles.editBtn} onClick={() => setEditingRefundTime(true)}>
              {action.refund_time ? 'Edit' : '+ Add'}
            </button>
          )
        )}
      </div>
    </div>
  );
}

// ── Alternate product status ─────────────────────────────────────────────────

function AlternateStatus({ action, onFieldUpdate, disabled }) {
  return (
    <div className={styles.statusList}>
      <CheckboxRow
        label="Alternate Jersey Order Created"
        checked={!!action.alt_order_created}
        onChange={v => onFieldUpdate(action.id, 'alt_order_created', v ? 1 : 0)}
        disabled={disabled}
      />
      <CheckboxRow
        label="Original Order Cancelled"
        checked={!!action.original_order_cancelled}
        onChange={v => onFieldUpdate(action.id, 'original_order_cancelled', v ? 1 : 0)}
        disabled={disabled}
      />
    </div>
  );
}

// ── Refund status ────────────────────────────────────────────────────────────

function RefundStatus({ action, onFieldUpdate, disabled }) {
  const [editingRefundId, setEditingRefundId] = useState(false);
  const [refundIdInput, setRefundIdInput] = useState(action.refund_id || '');
  const [editingRefundTime, setEditingRefundTime] = useState(false);
  const [refundTimeInput, setRefundTimeInput] = useState(action.refund_time || '');

  const saveRefundId = () => {
    onFieldUpdate(action.id, 'refund_id', refundIdInput.trim() || null);
    setEditingRefundId(false);
  };

  const saveRefundTime = () => {
    onFieldUpdate(action.id, 'refund_time', refundTimeInput.trim() || null);
    setEditingRefundTime(false);
  };

  return (
    <div className={styles.statusList}>
      <CheckboxRow
        label="Refund Done"
        checked={!!action.refund_done}
        onChange={v => onFieldUpdate(action.id, 'refund_done', v ? 1 : 0)}
        disabled={disabled}
      />

      {/* Refund ID */}
      <div className={styles.statusRow}>
        <div className={styles.statusRowLeft}>
          <span className={styles.statusLabel}>Refund ID</span>
          {!editingRefundId && action.refund_id && (
            <span className={styles.statusValue} style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
              {action.refund_id}
            </span>
          )}
        </div>
        {!disabled && (
          editingRefundId ? (
            <div className={styles.inlineEdit}>
              <input
                autoFocus
                className={styles.inlineInput}
                placeholder="Refund ID"
                value={refundIdInput}
                onChange={e => setRefundIdInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveRefundId(); if (e.key === 'Escape') setEditingRefundId(false); }}
              />
              <button className={styles.inlineSave} onClick={saveRefundId}>Save</button>
              <button className={styles.inlineCancel} onClick={() => setEditingRefundId(false)}>✕</button>
            </div>
          ) : (
            <button className={styles.editBtn} onClick={() => setEditingRefundId(true)}>
              {action.refund_id ? 'Edit' : '+ Add'}
            </button>
          )
        )}
      </div>

      {/* Refund date */}
      <div className={styles.statusRow}>
        <div className={styles.statusRowLeft}>
          <span className={styles.statusLabel}>Refund Date</span>
          {!editingRefundTime && action.refund_time && (
            <span className={styles.statusValue}>{action.refund_time}</span>
          )}
        </div>
        {!disabled && (
          editingRefundTime ? (
            <div className={styles.inlineEdit}>
              <input
                autoFocus
                className={styles.inlineInput}
                placeholder="e.g. 2 Jun 2025, 3:30 PM"
                value={refundTimeInput}
                onChange={e => setRefundTimeInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveRefundTime(); if (e.key === 'Escape') setEditingRefundTime(false); }}
              />
              <button className={styles.inlineSave} onClick={saveRefundTime}>Save</button>
              <button className={styles.inlineCancel} onClick={() => setEditingRefundTime(false)}>✕</button>
            </div>
          ) : (
            <button className={styles.editBtn} onClick={() => setEditingRefundTime(true)}>
              {action.refund_time ? 'Edit' : '+ Add'}
            </button>
          )
        )}
      </div>
    </div>
  );
}

// ── Shared checkbox row ──────────────────────────────────────────────────────

function CheckboxRow({ label, checked, onChange, disabled }) {
  return (
    <label className={`${styles.checkRow} ${disabled ? styles.checkRowDisabled : ''}`}>
      <span className={`${styles.checkbox} ${checked ? styles.checkboxChecked : ''}`}>
        {checked && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
        )}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        disabled={disabled}
        style={{ display: 'none' }}
      />
      <span className={`${styles.checkLabel} ${checked ? styles.checkLabelDone : ''}`}>
        {label}
      </span>
    </label>
  );
}
