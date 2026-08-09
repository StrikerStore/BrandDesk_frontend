import { useState, useRef, useEffect, useId } from 'react';
import Icon from './Icon.jsx';
import styles from './Menu.module.css';

/**
 * Small listbox popover. Replaces the native <select>s that carried state via
 * emoji (🔴 Urgent / ⚪ Normal) — emoji render differently per OS, can't
 * inherit colour or weight, and screen readers announce them as "red circle".
 *
 * options: [{ value, label, dot?, hint?, disabled? }]
 */
export default function Menu({
  value,
  options,
  onChange,
  label,
  align = 'start',
  tone,                 // optional {color, bg, border} applied to the trigger
  className = '',
  compact = false,
}) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const wrapRef = useRef(null);
  const listRef = useRef(null);
  const id = useId();

  const selected = options.find(o => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    if (open) setActiveIdx(options.findIndex(o => o.value === value));
  }, [open, options, value]);

  const commit = (opt) => {
    if (opt.disabled) return;
    onChange(opt.value);
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault(); setOpen(true); return;
    }
    if (!open) return;
    if (e.key === 'Escape')    { e.preventDefault(); e.stopPropagation(); setOpen(false); }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, options.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Home')      { e.preventDefault(); setActiveIdx(0); }
    if (e.key === 'End')       { e.preventDefault(); setActiveIdx(options.length - 1); }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (options[activeIdx]) commit(options[activeIdx]);
    }
  };

  return (
    <div className={`${styles.wrap} ${className}`} ref={wrapRef}>
      <button
        type="button"
        className={`${styles.trigger} ${compact ? styles.compact : ''}`}
        style={tone ? { color: tone.color, background: tone.bg, borderColor: tone.border } : undefined}
        onClick={() => setOpen(v => !v)}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
      >
        {selected?.dot && <span className={styles.dot} style={{ background: selected.dot }} />}
        <span className={styles.triggerLabel}>{selected?.label ?? label}</span>
        <Icon name="chevron" size={11} className={open ? styles.chevOpen : styles.chev} />
      </button>

      {open && (
        <ul
          className={`${styles.list} ${align === 'end' ? styles.alignEnd : ''}`}
          role="listbox"
          id={id}
          ref={listRef}
          tabIndex={-1}
          aria-label={label}
          onKeyDown={onKeyDown}
        >
          {options.map((opt, i) => (
            <li key={opt.value}>
              <button
                type="button"
                role="option"
                aria-selected={opt.value === value}
                disabled={opt.disabled}
                className={`${styles.option} ${i === activeIdx ? styles.optionActive : ''} ${opt.value === value ? styles.optionSelected : ''}`}
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => commit(opt)}
              >
                {opt.dot !== undefined && <span className={styles.dot} style={{ background: opt.dot || 'transparent' }} />}
                <span className={styles.optionLabel}>{opt.label}</span>
                {opt.hint && <span className={styles.optionHint}>{opt.hint}</span>}
                {opt.value === value && <Icon name="check" size={13} className={styles.tick} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
