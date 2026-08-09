import { useState, useRef } from 'react';
import Modal from './Modal.jsx';
import styles from './ConfirmDialog.module.css';

/**
 * Replaces window.confirm(). Use only for irreversible, high-stakes actions —
 * anything recoverable should just happen and offer an Undo toast instead.
 *
 * tone: 'danger' (destructive) | 'primary' (neutral commitment)
 */
export default function ConfirmDialog({
  title,
  message,
  consequence,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  onConfirm,
  onCancel,
}) {
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef(null);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={title}
      size="sm"
      onClose={busy ? () => {} : onCancel}
      // Focus lands on Cancel, not the destructive button — a stray Enter
      // should never be what deletes something.
      initialFocusRef={cancelRef}
      footer={
        <>
          <button ref={cancelRef} className={styles.cancel} onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            className={tone === 'danger' ? styles.danger : styles.primary}
            onClick={handleConfirm}
            disabled={busy}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      <p className={styles.message}>{message}</p>
      {consequence && <p className={styles.consequence}>{consequence}</p>}
    </Modal>
  );
}
