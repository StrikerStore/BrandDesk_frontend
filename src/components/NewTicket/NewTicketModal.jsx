import { useState } from 'react';
import { createManualThread, fetchCustomer } from '../../utils/api.js';
import styles from './NewTicketModal.module.css';

const ISSUE_CATEGORIES = [
  'Delivery Issue',
  'Return Request',
  'Refund Request',
  'Order Cancellation',
  'Wrong Item',
  'Damaged Item',
  'Payment Issue',
  'Exchange Request',
  'Order Status',
  'Other',
];

export default function NewTicketModal({ brands, onClose, onCreated }) {
  const [form, setForm] = useState({
    customer_email: '',
    customer_name: '',
    brand: brands[0]?.name || '',
    subject: '',
    priority: 'normal',
    issue_category: '',
    order_number: '',
    description: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [emailChecked, setEmailChecked] = useState(false);

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const lookupCustomer = async () => {
    const email = form.customer_email.trim();
    if (!email.includes('@') || emailChecked) return;
    setEmailChecked(true);
    try {
      const { data } = await fetchCustomer(email);
      if (data.customer?.name && !form.customer_name) {
        setForm(f => ({ ...f, customer_name: data.customer.name }));
      }
    } catch {}
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.customer_email.includes('@')) return setError('Valid customer email required');
    if (!form.subject.trim()) return setError('Subject is required');
    if (!form.brand) return setError('Brand is required');
    if (!form.description.trim()) return setError('Description is required');

    setSubmitting(true);
    try {
      const { data } = await createManualThread(form);
      onCreated(data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create ticket');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.title}>Raise ticket for customer</div>
          <button className={styles.closeBtn} onClick={onClose} type="button">✕</button>
        </div>

        <form className={styles.body} onSubmit={handleSubmit}>
          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Customer email <span className={styles.req}>*</span></label>
              <input
                className={styles.input}
                type="email"
                placeholder="customer@example.com"
                value={form.customer_email}
                onChange={(e) => { set('customer_email')(e); setEmailChecked(false); }}
                onBlur={lookupCustomer}
                required
                autoFocus
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Customer name</label>
              <input
                className={styles.input}
                placeholder="Full name"
                value={form.customer_name}
                onChange={set('customer_name')}
              />
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Brand <span className={styles.req}>*</span></label>
              <select className={styles.select} value={form.brand} onChange={set('brand')}>
                {brands.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Priority</label>
              <select className={styles.select} value={form.priority} onChange={set('priority')}>
                <option value="normal">Normal</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Subject <span className={styles.req}>*</span></label>
            <input
              className={styles.input}
              placeholder="Brief description of the issue"
              value={form.subject}
              onChange={set('subject')}
              required
            />
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Issue category</label>
              <select className={styles.select} value={form.issue_category} onChange={set('issue_category')}>
                <option value="">— Select category —</option>
                {ISSUE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Order number</label>
              <input
                className={styles.input}
                placeholder="e.g. 10045"
                value={form.order_number}
                onChange={set('order_number')}
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Description <span className={styles.req}>*</span></label>
            <textarea
              className={styles.textarea}
              placeholder="Describe the customer's issue in detail…"
              rows={4}
              value={form.description}
              onChange={set('description')}
              required
            />
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.footer}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.submitBtn} disabled={submitting}>
              {submitting ? 'Creating…' : 'Create ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
