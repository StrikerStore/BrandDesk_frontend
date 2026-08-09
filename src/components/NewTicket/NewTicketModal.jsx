import { useState } from 'react';
import { createManualThread, fetchCustomer } from '../../utils/api.js';
import { ISSUE_CATEGORIES, ISSUE_SUBCATEGORIES } from '../../utils/issueCategories.js';
import styles from './NewTicketModal.module.css';

// Mirrors the subject line the Shopify form path ends up with
const deriveSubject = (category, subIssue) =>
  category && subIssue ? `${category} — ${subIssue}` : (category || '');

export default function NewTicketModal({ brands, onClose, onCreated }) {
  const [form, setForm] = useState({
    order_number: '',
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    brand: brands[0]?.name || '',
    priority: 'normal',
    issue_category: '',
    sub_issue: '',
    subject: '',
    description: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [emailChecked, setEmailChecked] = useState(false);
  // Once the agent types their own subject we stop overwriting it
  const [subjectTouched, setSubjectTouched] = useState(false);

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const subIssueOptions = ISSUE_SUBCATEGORIES[form.issue_category] || [];

  // Category drives the sub-issue list, and both drive the subject
  const handleCategoryChange = (e) => {
    const issue_category = e.target.value;
    setForm(f => ({
      ...f,
      issue_category,
      sub_issue: '',
      subject: subjectTouched ? f.subject : deriveSubject(issue_category, ''),
    }));
  };

  const handleSubIssueChange = (e) => {
    const sub_issue = e.target.value;
    setForm(f => ({
      ...f,
      sub_issue,
      subject: subjectTouched ? f.subject : deriveSubject(f.issue_category, sub_issue),
    }));
  };

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
    if (!form.order_number.trim())          return setError('Order number is required');
    if (!form.customer_name.trim())         return setError('Customer name is required');
    if (!form.customer_email.includes('@')) return setError('Valid customer email required');
    if (!form.customer_phone.trim())        return setError('Contact number is required');
    if (!form.brand)                        return setError('Brand is required');
    if (!form.issue_category)               return setError('Issue category is required');
    if (!form.sub_issue)                    return setError('Sub issue is required');
    if (!form.subject.trim())               return setError('Subject is required');
    if (!form.description.trim())           return setError('Description is required');

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
          <div className={styles.field}>
            <label className={styles.label}>Order number <span className={styles.req}>*</span></label>
            <input
              className={styles.input}
              placeholder="e.g., #1234"
              value={form.order_number}
              onChange={set('order_number')}
              required
              autoFocus
            />
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Customer name <span className={styles.req}>*</span></label>
              <input
                className={styles.input}
                placeholder="Full name"
                value={form.customer_name}
                onChange={set('customer_name')}
                required
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Email <span className={styles.req}>*</span></label>
              <input
                className={styles.input}
                type="email"
                placeholder="customer@example.com"
                value={form.customer_email}
                onChange={(e) => { set('customer_email')(e); setEmailChecked(false); }}
                onBlur={lookupCustomer}
                required
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Contact <span className={styles.req}>*</span></label>
            <input
              className={styles.input}
              type="tel"
              placeholder="Customer's phone number"
              value={form.customer_phone}
              onChange={set('customer_phone')}
              required
            />
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

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Issue category <span className={styles.req}>*</span></label>
              <select className={styles.select} value={form.issue_category} onChange={handleCategoryChange}>
                <option value="">— Select issue category —</option>
                {ISSUE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Sub issue <span className={styles.req}>*</span></label>
              <select
                className={styles.select}
                value={form.sub_issue}
                onChange={handleSubIssueChange}
                disabled={!form.issue_category}
              >
                <option value="">
                  {form.issue_category ? '— Select sub issue —' : '— First select issue category —'}
                </option>
                {subIssueOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Subject <span className={styles.req}>*</span></label>
            <input
              className={styles.input}
              placeholder="Auto-filled from the issue category — edit if needed"
              value={form.subject}
              onChange={(e) => { setSubjectTouched(true); set('subject')(e); }}
              required
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Description <span className={styles.req}>*</span></label>
            <textarea
              className={styles.textarea}
              placeholder="What the customer reported — describe the issue in detail. This is recorded on the ticket; the customer gets an acknowledgement email."
              rows={5}
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
