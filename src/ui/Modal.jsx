import { useEffect, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import styles from './Modal.module.css';

// Shared stack so Esc only ever closes the topmost dialog. Previously each
// surface registered its own bare window listener, so Esc inside the Action
// modal also closed the Actions view behind it.
const stack = [];
let scrollLocks = 0;

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])',
  '[contenteditable]', '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Accessible dialog: labelled, focus-trapped, Esc/backdrop dismissible,
 * returns focus to whatever opened it, and locks body scroll.
 *
 * size: 'sm' (confirm) | 'md' (forms) | 'lg' (multi-pane) | 'full'
 */
export default function Modal({
  title,
  description,
  onClose,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
  initialFocusRef,
}) {
  const panelRef = useRef(null);
  const returnFocusRef = useRef(null);
  const titleId = useId();
  const descId = useId();

  // Remember the trigger so focus can go home on close.
  useEffect(() => {
    returnFocusRef.current = document.activeElement;
    return () => {
      const el = returnFocusRef.current;
      if (el && document.contains(el)) el.focus?.();
    };
  }, []);

  // Body scroll lock, refcounted for stacked dialogs.
  useEffect(() => {
    if (scrollLocks++ === 0) {
      const bar = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = 'hidden';
      if (bar > 0) document.body.style.paddingRight = `${bar}px`;
    }
    return () => {
      if (--scrollLocks === 0) {
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
      }
    };
  }, []);

  // Esc — topmost only.
  useEffect(() => {
    const token = {};
    stack.push(token);
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (stack[stack.length - 1] !== token) return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      stack.splice(stack.indexOf(token), 1);
    };
  }, [onClose]);

  // Initial focus + Tab trap.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const target = initialFocusRef?.current || panel.querySelector(FOCUSABLE) || panel;
    target.focus?.();

    const onKey = (e) => {
      if (e.key !== 'Tab') return;
      const items = Array.from(panel.querySelectorAll(FOCUSABLE))
        .filter(el => el.offsetParent !== null || el === document.activeElement);
      if (items.length === 0) { e.preventDefault(); return; }
      const first = items[0];
      const last  = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    panel.addEventListener('keydown', onKey);
    return () => panel.removeEventListener('keydown', onKey);
  }, [initialFocusRef]);

  return createPortal(
    <div
      className={styles.overlay}
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={`${styles.panel} ${styles[size]}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
      >
        {title && (
          <div className={styles.header}>
            <h2 id={titleId} className={styles.title}>{title}</h2>
            <button className={styles.close} onClick={onClose} aria-label="Close dialog">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        {description && <p id={descId} className={styles.description}>{description}</p>}
        <div className={styles.body}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
