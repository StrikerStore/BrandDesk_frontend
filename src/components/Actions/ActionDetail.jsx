import { useState, useEffect, useRef } from 'react';
import { getBrandColor, displayOrderId } from '../../utils/helpers.js';
import { TYPE_LABELS, TYPE_COLORS, schemaFor, progressOf } from '../../utils/actionTypes.js';
import Icon from '../../ui/Icon.jsx';
import styles from './ActionDetail.module.css';

const formatDateTime = (v) => v
  ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—';

/**
 * Side panel for one action. Everything here autosaves — there is no Save
 * button anywhere, because the old row mixed instant-commit checkboxes with
 * Save-button text fields and gave no clue which was which.
 */
export default function ActionDetail({ action, onClose, onSaveField, onCloseAction, onOpenTicket }) {
  const { items, checks, fields } = schemaFor(action.action_type);
  const { done, total } = progressOf(action);
  const isClosed = !!action.is_closed;
  const typeColor = TYPE_COLORS[action.action_type] || {};
  const brandColor = getBrandColor(action.brand || '');

  // Esc closes the panel; it isn't modal, so no focus trap.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <aside className={styles.panel} aria-label="Action details">
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <span className={styles.typeBadge}
            style={{ background: typeColor.bg, color: typeColor.color, borderColor: typeColor.border }}>
            {TYPE_LABELS[action.action_type]}
          </span>
          {isClosed && <span className={styles.closedPill}>Closed</span>}
          <button className={styles.close} onClick={onClose} aria-label="Close details">
            <Icon name="close" size={15} />
          </button>
        </div>

        <button className={styles.ticketLink} onClick={onOpenTicket}>
          <span className={styles.ticketName}>{action.customer_name || action.customer_email || 'Customer'}</span>
          <span className={styles.ticketMeta}>
            {action.ticket_id && <span className={styles.mono}>{action.ticket_id}</span>}
            {action.order_number && <span className={styles.mono}>#{displayOrderId(action.order_number)}</span>}
            <span className={styles.brandTag} style={{ background: brandColor.bg, color: brandColor.text }}>
              {action.brand}
            </span>
          </span>
          <span className={styles.openHint}>Open ticket →</span>
        </button>
      </header>

      <div className={styles.body}>
        {total > 0 && (
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h3 className={styles.sectionTitle}>Progress</h3>
              <span className={styles.progressCount}>{done} of {total}</span>
            </div>
            <div className={styles.checks}>
              {checks.map(c => (
                <CheckRow
                  key={c.key}
                  label={c.label}
                  checked={!!action[c.key]}
                  disabled={isClosed}
                  onChange={(v) => onSaveField(action.id, c.key, v ? 1 : 0)}
                />
              ))}
            </div>
          </section>
        )}

        {items.length > 0 && (
          <section className={styles.section}>
            {/* "Jerseys" was hard-coded domain jargon in the column header. */}
            <h3 className={styles.sectionTitle}>Items</h3>
            {items.map(it => (
              <AutoField
                key={it.key}
                label={it.label}
                value={action[it.key]}
                disabled={isClosed}
                multiline
                onSave={(v) => onSaveField(action.id, it.key, v || null)}
              />
            ))}
          </section>
        )}

        {fields.length > 0 && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>References</h3>
            {fields.map(f => (
              <AutoField
                key={f.key}
                label={f.label}
                value={action[f.key]}
                mono={f.mono}
                disabled={isClosed}
                onSave={(v) => onSaveField(action.id, f.key, v || null)}
              />
            ))}
          </section>
        )}

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Timeline</h3>
          <div className={styles.timelineRow}>
            <span className={styles.timelineLabel}>Logged</span>
            <span className={styles.timelineVal}>{formatDateTime(action.created_at)}</span>
          </div>
          {isClosed && action.closed_at && (
            <div className={styles.timelineRow}>
              <span className={styles.timelineLabel}>Closed</span>
              <span className={styles.timelineVal}>{formatDateTime(action.closed_at)}</span>
            </div>
          )}
        </section>
      </div>

      {!isClosed && (
        <footer className={styles.footer}>
          <button className={styles.closeActionBtn} onClick={onCloseAction}>
            <Icon name="checkCircle" size={14} /> Close action
          </button>
        </footer>
      )}
    </aside>
  );
}

function CheckRow({ label, checked, onChange, disabled }) {
  return (
    <label className={`${styles.checkRow} ${disabled ? styles.checkRowDisabled : ''}`}>
      <input
        type="checkbox"
        className={styles.nativeCheck}
        checked={checked}
        disabled={disabled}
        onChange={e => onChange(e.target.checked)}
      />
      <span className={`${styles.checkBox} ${checked ? styles.checkBoxOn : ''}`} aria-hidden="true">
        {checked && <Icon name="check" size={11} strokeWidth={3} active />}
      </span>
      <span className={`${styles.checkLabel} ${checked ? styles.checkLabelDone : ''}`}>{label}</span>
    </label>
  );
}

/**
 * Commits on blur, and shows what it did. No Save button — the previous
 * version needed one for text but not for checkboxes.
 */
function AutoField({ label, value, onSave, disabled, mono, multiline }) {
  const [draft, setDraft] = useState(value || '');
  const [state, setState] = useState('idle');       // idle | saving | saved | error
  const timer = useRef(null);

  // Follow external changes (a poll, or another agent) unless mid-edit.
  useEffect(() => {
    if (state === 'idle') setDraft(value || '');
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => clearTimeout(timer.current), []);

  const commit = async () => {
    const next = draft.trim();
    if (next === (value || '')) { setState('idle'); return; }
    setState('saving');
    const ok = await onSave(next);
    setState(ok ? 'saved' : 'error');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 2000);
  };

  const Field = multiline ? 'textarea' : 'input';

  return (
    <div className={styles.field}>
      <div className={styles.fieldHead}>
        <label className={styles.fieldLabel}>{label}</label>
        <span className={`${styles.saveState} ${styles[`save_${state}`]}`} aria-live="polite">
          {state === 'saving' && 'Saving…'}
          {state === 'saved'  && '✓ Saved'}
          {state === 'error'  && 'Not saved'}
        </span>
      </div>
      <Field
        className={`${styles.input} ${mono ? styles.mono : ''} ${multiline ? styles.textarea : ''}`}
        value={draft}
        disabled={disabled}
        rows={multiline ? 2 : undefined}
        placeholder={disabled ? '—' : `Add ${label.toLowerCase()}…`}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Escape') { setDraft(value || ''); e.currentTarget.blur(); }
          if (e.key === 'Enter' && !multiline) e.currentTarget.blur();
          if (e.key === 'Enter' && multiline && (e.metaKey || e.ctrlKey)) e.currentTarget.blur();
        }}
      />
    </div>
  );
}
