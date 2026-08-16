import { useState, useEffect, useCallback } from 'react';
import { fetchThreadActions, updateThreadAction, closeThreadAction, errorMessage } from '../../utils/api.js';
import { TYPE_LABELS, TYPE_COLORS } from '../../utils/actionTypes.js';
import { useToast } from '../../ui/ToastProvider.jsx';
import ConfirmDialog from '../../ui/ConfirmDialog.jsx';
import styles from './ActionPanel.module.css';

function formatDateTime(val) {
  if (!val) return '';
  return new Date(val).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// Land on the first still-open action — that's the one an agent needs
const firstOpenIdx = (list) => {
  const i = list.findIndex(a => !a.is_closed);
  return i === -1 ? 0 : i;
};

export default function ActionPanel({ threadId, onCountChange, onActionsChange, onThreadProgress }) {
  const toast = useToast();
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loadError, setLoadError] = useState(null);
  const [confirmClose, setConfirmClose] = useState(null);

  const load = useCallback(async () => {
    if (!threadId) return;
    setLoading(true);
    try {
      const { data } = await fetchThreadActions(threadId);
      const list = data.actions || [];
      setActions(list);
      setActiveIdx(firstOpenIdx(list));
      onCountChange?.(list.length);
      onActionsChange?.(list);
      setLoadError(null);
    } catch (err) {
      // Was console-only, so a failed fetch rendered the "No actions logged
      // yet" empty state — actively misleading on a ticket that has some.
      setLoadError(errorMessage(err, 'Failed to load actions'));
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => { load(); }, [load]);

  const handleFieldUpdate = async (actionId, field, value) => {
    setActions(prev => prev.map(a => a.id === actionId ? { ...a, [field]: value } : a));
    try {
      const { data } = await updateThreadAction(threadId, actionId, { [field]: value });
      // Progress moves the ticket to in progress server-side; reflect that in
      // the header and the sidebar row without waiting for the next poll.
      onThreadProgress?.(data);
    } catch (err) {
      load(); // revert on failure
      toast.error("Couldn't save that change", { detail: errorMessage(err) });
    }
  };

  const handleCloseConfirmed = async (action) => {
    try {
      const { data } = await closeThreadAction(threadId, action.id);
      onThreadProgress?.(data);
      setActions(prev => {
        const next = prev.map(a => a.id === action.id ? data.action : a);
        onActionsChange?.(next);
        return next;
      });
      setConfirmClose(null);
      toast.success(`${TYPE_LABELS[action.action_type]} closed`);
    } catch (err) {
      toast.error("Couldn't close this action", { detail: errorMessage(err) });
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

  if (loadError) {
    return (
      <div className={styles.root}>
        <div className={styles.empty} role="alert">
          <p className={styles.emptyTitle}>Couldn’t load actions</p>
          <p className={styles.emptySub}>{loadError}</p>
          <button className={styles.editBtn} onClick={load} style={{ marginTop: 10 }}>Retry</button>
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

  // activeIdx can go stale if the list shrinks between renders
  const current = actions[activeIdx] || actions[0];

  return (
    <div className={styles.root}>
      {actions.length > 1 && (
        <div className={styles.pagerStrip} role="tablist" aria-label="Actions on this ticket">
          {actions.map((a, i) => {
            const color = TYPE_COLORS[a.action_type];
            const isActive = a.id === current.id;
            return (
              <button
                key={a.id}
                role="tab"
                aria-selected={isActive}
                className={`${styles.pagerPill} ${isActive ? styles.pagerPillActive : ''} ${a.is_closed ? styles.pagerPillClosed : ''}`}
                style={isActive && color ? { background: color.bg, borderColor: color.border } : undefined}
                onClick={() => setActiveIdx(i)}
                title={a.is_closed ? 'Closed' : 'Open'}
              >
                <span className={styles.pagerIdx}>{i + 1}</span>
                {TYPE_LABELS[a.action_type] || a.action_type}
                <span className={`${styles.pagerDot} ${a.is_closed ? '' : styles.pagerDotOpen}`} />
              </button>
            );
          })}
        </div>
      )}

      <ActionCard
        key={current.id}
        action={current}
        onFieldUpdate={handleFieldUpdate}
        onCloseAction={setConfirmClose}
      />

      {confirmClose && (
        <ConfirmDialog
          title="Close this action?"
          message={`${TYPE_LABELS[confirmClose.action_type]} on this ticket.`}
          consequence="Closing is permanent — the checklist and fields become read-only and cannot be reopened."
          confirmLabel="Close action"
          onConfirm={() => handleCloseConfirmed(confirmClose)}
          onCancel={() => setConfirmClose(null)}
        />
      )}
    </div>
  );
}

function ActionCard({ action, onFieldUpdate, onCloseAction }) {
  const typeColor = TYPE_COLORS[action.action_type] || { bg: '#f9fafb', color: '#374151', border: '#e5e7eb' };
  const isClosed = !!action.is_closed;

  return (
    <div className={`${styles.card} ${isClosed ? styles.cardClosed : ''}`}>
      {/* Card header — also holds Close, so it can never be clipped */}
      <div className={styles.cardHeader}>
        <div className={styles.cardHeaderLeft}>
          <span
            className={styles.typeBadge}
            style={{ background: typeColor.bg, color: typeColor.color, borderColor: typeColor.border }}
          >
            {TYPE_LABELS[action.action_type]}
          </span>
          {/* Closed state reads off the right-hand timestamp; the badge is only
              a fallback for rows with no closed_at recorded */}
          {isClosed && !action.closed_at && <span className={styles.closedBadge}>Closed</span>}
          <span className={styles.cardDate}>
            {formatDateTime(action.created_at)}
          </span>
        </div>
        {isClosed ? (
          action.closed_at && (
            <span className={styles.closedAt}>Closed {formatDateTime(action.closed_at)}</span>
          )
        ) : (
          <button className={styles.closeActionBtn} onClick={() => onCloseAction(action)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
            Close
          </button>
        )}
      </div>

      {/* Jersey details */}
      <div className={styles.jerseyRow}>
        {action.pickup_jersey && <JerseyInfo label={action.action_type === 'refund' ? 'Jersey' : 'Pickup'} value={action.pickup_jersey} />}
        {action.exchange_jersey && <JerseyInfo label="Exchange" value={action.exchange_jersey} />}
        {action.alternate_jersey && <JerseyInfo label="Alternate" value={action.alternate_jersey} />}
        {action.current_jersey && <JerseyInfo label="Current" value={action.current_jersey} />}
        {action.new_jersey && <JerseyInfo label="New" value={action.new_jersey} />}
        {action.new_address && <JerseyInfo label="New Address" value={action.new_address} />}
        {action.payment_reason && <JerseyInfo label="For" value={action.payment_reason} />}
      </div>

      {/* Status section — the jersey row's border already separates it */}
      <div className={styles.statusSection}>
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
        {action.action_type === 'send_payment_link' && (
          <PaymentStatus action={action} onFieldUpdate={onFieldUpdate} disabled={isClosed} />
        )}
      </div>
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

// ── Payment link status ──────────────────────────────────────────────────────

function PaymentStatus({ action, onFieldUpdate, disabled }) {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(action.payment_link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard is blocked on insecure origins; the link is selectable below.
    }
  };

  const paid = !!action.payment_received;

  return (
    <div className={styles.statusList}>
      {/* Amount — set once at creation, because the PayU link is for this
          exact figure. Editing it here would only make the two disagree. */}
      <div className={styles.statusRow}>
        <div className={styles.statusRowLeft}>
          <span className={styles.statusLabel}>Amount</span>
          <span className={styles.statusValue}>
            ₹{Number(action.payment_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* The link itself — copying it is the main thing an agent does here */}
      {action.payment_link && (
        <div className={styles.statusRow}>
          <div className={styles.statusRowLeft}>
            <span className={styles.statusLabel}>Payment link</span>
            <a
              className={styles.statusValue}
              href={action.payment_link}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 11, wordBreak: 'break-all' }}
            >
              {action.payment_link}
            </a>
          </div>
          <button className={styles.editBtn} onClick={copyLink}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}

      <CheckboxRow
        label="Link Sent To Customer"
        checked={!!action.payment_link_sent}
        onChange={v => onFieldUpdate(action.id, 'payment_link_sent', v ? 1 : 0)}
        disabled={disabled}
      />

      {/* Always disabled: PayU owns this. The backend leaves payment_received
          out of its PATCH allow-list, so an editable box here would be a lie —
          it would appear to tick and then revert on the next load. */}
      <CheckboxRow
        label="Payment Received"
        checked={paid}
        onChange={() => {}}
        disabled
      />

      <div className={styles.statusRow}>
        <div className={styles.statusRowLeft}>
          <span className={styles.statusLabel}>Status</span>
          <span className={styles.statusValue}>
            {paid ? 'Paid' : (action.payment_status || 'pending')}
          </span>
        </div>
        {!paid && !disabled && (
          <span className={styles.statusValue} style={{ fontSize: 11, opacity: 0.7 }}>
            Updates automatically
          </span>
        )}
      </div>

      {action.payment_ref && (
        <div className={styles.statusRow}>
          <div className={styles.statusRowLeft}>
            <span className={styles.statusLabel}>PayU Reference</span>
            <span className={styles.statusValue} style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
              {action.payment_ref}
            </span>
          </div>
        </div>
      )}

      {action.payment_paid_at && (
        <div className={styles.statusRow}>
          <div className={styles.statusRowLeft}>
            <span className={styles.statusLabel}>Paid At</span>
            <span className={styles.statusValue}>{formatDateTime(action.payment_paid_at)}</span>
          </div>
        </div>
      )}
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
