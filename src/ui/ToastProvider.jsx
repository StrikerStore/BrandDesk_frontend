import { createContext, useContext, useCallback, useRef, useState } from 'react';
import styles from './ToastProvider.module.css';

const ToastContext = createContext(null);

// Module-level escape hatch so non-React code (the axios interceptor) can
// raise a toast. Set once by the provider; a no-op until then.
let externalPush = null;
export function pushToast(toast) { externalPush?.(toast); }

const DEFAULT_MS = { success: 4000, error: 8000, info: 5000, undo: 8000 };

let seq = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const push = useCallback((toast) => {
    const id = ++seq;
    const variant = toast.variant || 'info';
    const duration = toast.duration ?? DEFAULT_MS[variant];
    setToasts(prev => [...prev, { ...toast, id, variant }]);
    if (duration > 0) {
      timers.current.set(id, setTimeout(() => dismiss(id), duration));
    }
    return id;
  }, [dismiss]);

  externalPush = push;

  const value = useRef({
    success: (message, opts) => push({ ...opts, message, variant: 'success' }),
    error:   (message, opts) => push({ ...opts, message, variant: 'error'   }),
    info:    (message, opts) => push({ ...opts, message, variant: 'info'    }),
    // Fire-and-undo: the caller has already applied the change optimistically.
    undo:    (message, onUndo, opts) =>
      push({ ...opts, message, variant: 'undo', action: { label: 'Undo', onClick: onUndo } }),
    dismiss,
  }).current;

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Errors are assertive so they interrupt; everything else is polite. */}
      <div className={styles.viewport} role="region" aria-label="Notifications">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`${styles.toast} ${styles[t.variant]}`}
            role={t.variant === 'error' ? 'alert' : 'status'}
            aria-live={t.variant === 'error' ? 'assertive' : 'polite'}
          >
            <span className={styles.icon} aria-hidden="true">
              <Icon variant={t.variant} />
            </span>
            <div className={styles.text}>
              <span className={styles.message}>{t.message}</span>
              {t.detail && <span className={styles.detail}>{t.detail}</span>}
            </div>
            {t.action && (
              <button
                className={styles.action}
                onClick={() => { t.action.onClick(); dismiss(t.id); }}
              >
                {t.action.label}
              </button>
            )}
            <button className={styles.close} onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function Icon({ variant }) {
  const common = { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (variant === 'success') return <svg {...common}><path d="M20 6L9 17l-5-5" /></svg>;
  if (variant === 'error')   return <svg {...common}><circle cx="12" cy="12" r="10" /><path d="M12 8v5m0 3h.01" /></svg>;
  if (variant === 'undo')    return <svg {...common}><path d="M3 7v6h6" /><path d="M3 13a9 9 0 103-7.7L3 8" /></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="10" /><path d="M12 16v-5m0-3h.01" /></svg>;
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
