import { useState } from 'react';
import { createThreadAction, errorMessage } from '../../utils/api.js';
// The type list used to be duplicated here, icons and all. It now comes from
// the shared config so a new type is one edit, not two.
import { ACTION_TYPES } from '../../utils/actionTypes.js';
import styles from './ActionModal.module.css';

export default function ActionModal({ threadId, onClose, onActionCreated }) {
  const [step, setStep] = useState(1); // 1 = choose type, 2 = fill details
  const [selectedType, setSelectedType] = useState(null);
  const [form, setForm] = useState({
    pickup_jersey: '', exchange_jersey: '', alternate_jersey: '',
    current_jersey: '', new_jersey: '', new_address: '',
    payment_amount: '', payment_reason: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSelectType = (type) => {
    setSelectedType(type);
    setError('');
  };

  const handleNext = () => {
    if (!selectedType) { setError('Please select an action type'); return; }
    setError('');
    setStep(2);
  };

  const handleSubmit = async () => {
    setError('');
    const pickupTypes = ['exchange', 'return', 'alternate_product', 'refund'];
    if (pickupTypes.includes(selectedType) && !form.pickup_jersey.trim()) {
      setError(selectedType === 'refund' ? 'Refund jersey name is required' : 'Pickup jersey name is required');
      return;
    }
    if (selectedType === 'exchange' && !form.exchange_jersey.trim()) {
      setError('Exchange jersey name is required'); return;
    }
    if (selectedType === 'alternate_product' && !form.alternate_jersey.trim()) {
      setError('Alternate jersey name is required'); return;
    }
    if (selectedType === 'change_size' && !form.current_jersey.trim()) {
      setError('Current jersey name is required'); return;
    }
    if (selectedType === 'change_size' && !form.new_jersey.trim()) {
      setError('New jersey name is required'); return;
    }
    if (selectedType === 'change_address' && !form.new_address.trim()) {
      setError('New address is required'); return;
    }
    if (selectedType === 'send_payment_link') {
      const amount = Number(form.payment_amount);
      if (!form.payment_amount.trim() || !Number.isFinite(amount) || amount <= 0) {
        setError('Enter a payment amount greater than 0'); return;
      }
      if (Math.round(amount * 100) / 100 !== amount) {
        setError('Amount cannot have more than 2 decimal places'); return;
      }
    }

    setSaving(true);
    try {
      const { data } = await createThreadAction(threadId, {
        action_type: selectedType,
        pickup_jersey: form.pickup_jersey || undefined,
        exchange_jersey: form.exchange_jersey || undefined,
        alternate_jersey: form.alternate_jersey || undefined,
        current_jersey: form.current_jersey || undefined,
        new_jersey: form.new_jersey || undefined,
        new_address: form.new_address || undefined,
        payment_amount: form.payment_amount || undefined,
        payment_reason: form.payment_reason || undefined,
      });
      // Second argument carries the thread's resulting status — logging an
      // action is itself progress, so the ticket moves to In progress.
      onActionCreated(data.action, data);
    } catch (err) {
      // PayU failures come back as 400 (not configured) or 502 (rejected) with
      // a real message. Surfacing it verbatim matters: the agent must not walk
      // away believing a link exists when none was minted.
      setError(errorMessage(err, 'Failed to log action'));
    } finally {
      setSaving(false);
    }
  };

  const typeConfig = ACTION_TYPES.find(t => t.id === selectedType);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <span className={styles.title}>
            {step === 1 ? 'Log Action' : `${typeConfig?.icon} ${typeConfig?.label}`}
          </span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Step 1 — Select type */}
        {step === 1 && (
          <div className={styles.body}>
            <p className={styles.stepHint}>What action needs to be taken for this customer?</p>
            <div className={styles.typeGrid}>
              {ACTION_TYPES.map(type => (
                <button
                  key={type.id}
                  className={`${styles.typeCard} ${selectedType === type.id ? styles.typeCardActive : ''}`}
                  onClick={() => handleSelectType(type.id)}
                >
                  <span className={styles.typeIcon}>{type.icon}</span>
                  <span className={styles.typeLabel}>{type.label}</span>
                  <span className={styles.typeDesc}>{type.desc}</span>
                </button>
              ))}
            </div>
            {error && <p className={styles.error}>{error}</p>}
            <div className={styles.footer}>
              <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
              <button className={styles.nextBtn} onClick={handleNext} disabled={!selectedType}>
                Next →
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — Fill details */}
        {step === 2 && (
          <div className={styles.body}>
            <p className={styles.stepHint}>Enter the details for this action.</p>

            {selectedType === 'refund' && (
              <div className={styles.refundNotice}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
                </svg>
                No pickup required. Refund details (ID &amp; date) can be added after logging.
              </div>
            )}

            {['exchange', 'return', 'alternate_product', 'refund'].includes(selectedType) && (
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>
                  {selectedType === 'refund' ? 'Refund Jersey(s)' : 'Pickup Jersey(s)'}
                  <span className={styles.fieldRequired}>*</span>
                </label>
                <textarea
                  autoFocus
                  className={styles.fieldTextarea}
                  placeholder={'e.g. Messi Argentina 2024 — Size L\nRonaldo Portugal 2024 — Size M'}
                  value={form.pickup_jersey}
                  onChange={e => setForm(f => ({ ...f, pickup_jersey: e.target.value }))}
                  rows={3}
                />
                <p className={styles.fieldHint}>
                  {selectedType === 'refund'
                    ? 'Jersey(s) the refund is for — one per line if multiple'
                    : 'Jersey(s) to be picked up — one per line if multiple'}
                </p>
              </div>
            )}

            {selectedType === 'exchange' && (
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>
                  Exchange Jersey(s)
                  <span className={styles.fieldRequired}>*</span>
                </label>
                <textarea
                  className={styles.fieldTextarea}
                  placeholder={'e.g. Ronaldo Portugal 2024 — Size M\nMbappe France 2024 — Size S'}
                  value={form.exchange_jersey}
                  onChange={e => setForm(f => ({ ...f, exchange_jersey: e.target.value }))}
                  rows={3}
                />
                <p className={styles.fieldHint}>Replacement jersey(s) to be sent — one per line if multiple</p>
              </div>
            )}

            {selectedType === 'alternate_product' && (
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>
                  Alternate Jersey(s)
                  <span className={styles.fieldRequired}>*</span>
                </label>
                <textarea
                  className={styles.fieldTextarea}
                  placeholder={'e.g. Neymar Brazil 2024 — Size M\nVinicius Brazil 2024 — Size S'}
                  value={form.alternate_jersey}
                  onChange={e => setForm(f => ({ ...f, alternate_jersey: e.target.value }))}
                  rows={3}
                />
                <p className={styles.fieldHint}>Alternate jersey(s) to be sent — one per line if multiple</p>
              </div>
            )}

            {selectedType === 'change_size' && (
              <>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>
                    Current Jersey
                    <span className={styles.fieldRequired}>*</span>
                  </label>
                  <textarea
                    autoFocus
                    className={styles.fieldTextarea}
                    placeholder={'e.g. Messi Argentina 2024 — Size L'}
                    value={form.current_jersey}
                    onChange={e => setForm(f => ({ ...f, current_jersey: e.target.value }))}
                    rows={2}
                  />
                  <p className={styles.fieldHint}>Jersey the customer currently has</p>
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>
                    New Jersey
                    <span className={styles.fieldRequired}>*</span>
                  </label>
                  <textarea
                    className={styles.fieldTextarea}
                    placeholder={'e.g. Messi Argentina 2024 — Size M'}
                    value={form.new_jersey}
                    onChange={e => setForm(f => ({ ...f, new_jersey: e.target.value }))}
                    rows={2}
                  />
                  <p className={styles.fieldHint}>Jersey with the new size to be sent</p>
                </div>
              </>
            )}

            {selectedType === 'change_address' && (
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>
                  New Address
                  <span className={styles.fieldRequired}>*</span>
                </label>
                <textarea
                  autoFocus
                  className={styles.fieldTextarea}
                  placeholder={'e.g. 12 MG Road, Indiranagar, Bengaluru, KA 560038'}
                  value={form.new_address}
                  onChange={e => setForm(f => ({ ...f, new_address: e.target.value }))}
                  rows={3}
                />
                <p className={styles.fieldHint}>Updated delivery address for the order</p>
              </div>
            )}

            {selectedType === 'send_payment_link' && (
              <>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>
                    Amount (₹)
                    <span className={styles.fieldRequired}>*</span>
                  </label>
                  <input
                    autoFocus
                    type="number"
                    min="1"
                    step="0.01"
                    className={styles.fieldInput}
                    placeholder="e.g. 499"
                    value={form.payment_amount}
                    onChange={e => setForm(f => ({ ...f, payment_amount: e.target.value }))}
                  />
                  <p className={styles.fieldHint}>
                    A PayU link for this exact amount is generated when you log the action.
                  </p>
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>What is this payment for?</label>
                  <input
                    className={styles.fieldInput}
                    placeholder="e.g. Size upgrade difference"
                    value={form.payment_reason}
                    onChange={e => setForm(f => ({ ...f, payment_reason: e.target.value }))}
                  />
                  <p className={styles.fieldHint}>
                    Shown to the customer on the PayU checkout page. Send the link with a template
                    containing {'{{payment_link}}'}.
                  </p>
                </div>
              </>
            )}

            {error && <p className={styles.error}>{error}</p>}

            <div className={styles.footer}>
              <button className={styles.cancelBtn} onClick={() => setStep(1)}>← Back</button>
              <button className={styles.submitBtn} onClick={handleSubmit} disabled={saving}>
                {saving ? (selectedType === 'send_payment_link' ? 'Generating link…' : 'Logging…') : 'Log Action'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
