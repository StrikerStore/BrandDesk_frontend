import { useState, useEffect, useRef, useCallback } from 'react';
import { createManualThread, fetchCustomer, fetchThreads, errorMessage } from '../../utils/api.js';
import { ISSUE_CATEGORIES, ISSUE_SUBCATEGORIES } from '../../utils/issueCategories.js';
import { displayOrderId } from '../../utils/helpers.js';
import { useToast } from '../../ui/ToastProvider.jsx';
import Modal from '../../ui/Modal.jsx';
import Icon from '../../ui/Icon.jsx';
import styles from './NewTicketModal.module.css';

const DRAFT_KEY = 'bd_new_ticket_draft';

// Mirrors the subject line the Shopify form path ends up with
const deriveSubject = (category, subIssue) =>
  category && subIssue ? `${category} — ${subIssue}` : (category || '');

const EMPTY = {
  order_number: '', customer_name: '', customer_email: '', customer_phone: '',
  brand: '', priority: 'normal', issue_category: '', sub_issue: '',
  subject: '', description: '',
};

/** All rules in one place so submit can report every problem at once. */
function validate(form) {
  const e = {};
  if (!form.order_number.trim())          e.order_number   = 'Required — the order this is about';
  if (!form.customer_name.trim())         e.customer_name  = 'Required';
  if (!form.customer_email.includes('@')) e.customer_email = 'Enter a valid email address';
  if (!form.customer_phone.trim())        e.customer_phone = 'Required';
  if (!form.brand)                        e.brand          = 'Pick a brand';
  if (!form.issue_category)               e.issue_category = 'Pick a category';
  if (!form.sub_issue)                    e.sub_issue      = 'Pick a sub-issue';
  if (!form.subject.trim())               e.subject        = 'Required';
  if (!form.description.trim())           e.description    = 'Describe what the customer reported';
  return e;
}

export default function NewTicketModal({ brands, onClose, onCreated }) {
  const toast = useToast();

  // A closed modal used to lose nine filled-in fields with no warning.
  const [form, setForm] = useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null');
      if (saved) return { ...EMPTY, ...saved };
    } catch { /* ignore a corrupt draft */ }
    return { ...EMPTY, brand: brands[0]?.name || '' };
  });
  const [restored] = useState(() => !!sessionStorage.getItem(DRAFT_KEY));

  const [errors, setErrors]         = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [subjectTouched, setSubjectTouched] = useState(false);
  const [emailChecked, setEmailChecked]     = useState(false);
  const [dupe, setDupe]             = useState(null);
  const firstErrorRef = useRef(null);

  useEffect(() => {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(form));
  }, [form]);

  const set = (field) => (e) => {
    const value = e.target.value;
    setForm(f => ({ ...f, [field]: value }));
    // Clear a field's error as soon as the agent starts fixing it.
    setErrors(prev => (prev[field] ? { ...prev, [field]: undefined } : prev));
  };

  const subIssueOptions = ISSUE_SUBCATEGORIES[form.issue_category] || [];

  const handleCategoryChange = (e) => {
    const issue_category = e.target.value;
    setForm(f => ({
      ...f,
      issue_category,
      sub_issue: '',
      subject: subjectTouched ? f.subject : deriveSubject(issue_category, ''),
    }));
    setErrors(prev => ({ ...prev, issue_category: undefined, sub_issue: undefined }));
  };

  const handleSubIssueChange = (e) => {
    const sub_issue = e.target.value;
    setForm(f => ({
      ...f,
      sub_issue,
      subject: subjectTouched ? f.subject : deriveSubject(f.issue_category, sub_issue),
    }));
    setErrors(prev => ({ ...prev, sub_issue: undefined }));
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
      if (data.customer?.phone && !form.customer_phone) {
        setForm(f => ({ ...f, customer_phone: data.customer.phone }));
      }
    } catch { /* a new customer is the normal case */ }
  };

  // Raising a second ticket for an order that already has an open one is a
  // common and expensive duplicate; warn on blur rather than after submit.
  const checkDuplicate = useCallback(async () => {
    const order = displayOrderId(form.order_number);
    if (!order) { setDupe(null); return; }
    try {
      const { data } = await fetchThreads({ search: order, status: 'open', limit: 3 });
      const hit = (data.threads || [])[0];
      setDupe(hit || null);
    } catch { setDupe(null); }
  }, [form.order_number]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Validate everything, not just the first failure. The old version
    // returned on the first bad field, so agents fixed one, submitted, and
    // discovered the next.
    const next = validate(form);
    setErrors(next);
    if (Object.keys(next).length) {
      firstErrorRef.current?.focus?.();
      toast.error(`${Object.keys(next).length} field${Object.keys(next).length > 1 ? 's' : ''} need attention`);
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await createManualThread(form);
      sessionStorage.removeItem(DRAFT_KEY);
      toast.success('Ticket created');
      onCreated(data);
    } catch (err) {
      toast.error("Couldn't create the ticket", { detail: errorMessage(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const discard = () => {
    sessionStorage.removeItem(DRAFT_KEY);
    onClose();
  };

  const errorCount = Object.values(errors).filter(Boolean).length;
  let firstErrorAssigned = false;
  const refFor = (field) => {
    if (errors[field] && !firstErrorAssigned) { firstErrorAssigned = true; return firstErrorRef; }
    return undefined;
  };

  return (
    <Modal
      title="Raise ticket for customer"
      size="md"
      onClose={onClose}
      closeOnBackdrop={false}
      footer={
        <>
          <button type="button" className={styles.cancelBtn} onClick={discard}>Discard</button>
          <button type="submit" form="new-ticket-form" className={styles.submitBtn} disabled={submitting}>
            {submitting ? 'Creating…' : 'Create ticket'}
          </button>
        </>
      }
    >
      {restored && (
        <div className={styles.draftNote} role="status">
          <Icon name="history" size={13} />
          Restored your unfinished draft.
          <button type="button" className={styles.draftClear} onClick={() => setForm({ ...EMPTY, brand: brands[0]?.name || '' })}>
            Start fresh
          </button>
        </div>
      )}

      <form id="new-ticket-form" className={styles.body} onSubmit={handleSubmit} noValidate>
        <Fieldset legend="Order">
          <Field id="nt-order" label="Order number" required error={errors.order_number}
            hint="As the customer gave it — e.g. DS4334">
            <input
              id="nt-order" ref={refFor('order_number')}
              className={`${styles.input} ${errors.order_number ? styles.inputError : ''}`}
              placeholder="DS4334"
              value={form.order_number}
              onChange={set('order_number')}
              onBlur={checkDuplicate}
              autoFocus
            />
          </Field>

          {dupe && (
            <div className={styles.dupeWarn} role="status">
              <Icon name="alert" size={13} />
              <span>
                This order already has an open ticket
                {dupe.ticket_id ? ` (${dupe.ticket_id})` : ''}. Consider replying there instead.
              </span>
            </div>
          )}

          <div className={styles.row}>
            <Field id="nt-brand" label="Brand" required error={errors.brand}>
              <select id="nt-brand" ref={refFor('brand')}
                className={`${styles.select} ${errors.brand ? styles.inputError : ''}`}
                value={form.brand} onChange={set('brand')}>
                <option value="">— Select brand —</option>
                {brands.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
              </select>
            </Field>
            <Field id="nt-priority" label="Priority">
              <select id="nt-priority" className={styles.select} value={form.priority} onChange={set('priority')}>
                <option value="normal">Normal</option>
                <option value="urgent">Urgent</option>
              </select>
            </Field>
          </div>
        </Fieldset>

        <Fieldset legend="Customer">
          <Field id="nt-email" label="Email" required error={errors.customer_email}
            hint="We’ll pull their name and phone if we’ve seen them before">
            <input
              id="nt-email" ref={refFor('customer_email')}
              className={`${styles.input} ${errors.customer_email ? styles.inputError : ''}`}
              type="email"
              placeholder="customer@example.com"
              value={form.customer_email}
              onChange={(e) => { set('customer_email')(e); setEmailChecked(false); }}
              onBlur={lookupCustomer}
            />
          </Field>
          <div className={styles.row}>
            <Field id="nt-name" label="Full name" required error={errors.customer_name}>
              <input id="nt-name" ref={refFor('customer_name')}
                className={`${styles.input} ${errors.customer_name ? styles.inputError : ''}`}
                value={form.customer_name} onChange={set('customer_name')} />
            </Field>
            <Field id="nt-phone" label="Contact number" required error={errors.customer_phone}>
              <input id="nt-phone" ref={refFor('customer_phone')}
                className={`${styles.input} ${errors.customer_phone ? styles.inputError : ''}`}
                type="tel" value={form.customer_phone} onChange={set('customer_phone')} />
            </Field>
          </div>
        </Fieldset>

        <Fieldset legend="Issue">
          <div className={styles.row}>
            <Field id="nt-cat" label="Category" required error={errors.issue_category}>
              <select id="nt-cat" ref={refFor('issue_category')}
                className={`${styles.select} ${errors.issue_category ? styles.inputError : ''}`}
                value={form.issue_category} onChange={handleCategoryChange}>
                <option value="">— Select category —</option>
                {ISSUE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field id="nt-sub" label="Sub-issue" required error={errors.sub_issue}>
              <select id="nt-sub" ref={refFor('sub_issue')}
                className={`${styles.select} ${errors.sub_issue ? styles.inputError : ''}`}
                value={form.sub_issue} onChange={handleSubIssueChange}
                disabled={!form.issue_category}>
                <option value="">
                  {form.issue_category ? '— Select sub-issue —' : '— Pick a category first —'}
                </option>
                {subIssueOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>

          <Field id="nt-subject" label="Subject" required error={errors.subject}
            hint="Filled in from the category — edit if needed">
            <input id="nt-subject" ref={refFor('subject')}
              className={`${styles.input} ${errors.subject ? styles.inputError : ''}`}
              value={form.subject}
              onChange={(e) => { setSubjectTouched(true); set('subject')(e); }} />
          </Field>

          <Field id="nt-desc" label="What the customer reported" required error={errors.description}
            hint="Recorded on the ticket; the customer receives an acknowledgement email">
            <textarea id="nt-desc" ref={refFor('description')}
              className={`${styles.textarea} ${errors.description ? styles.inputError : ''}`}
              rows={4} value={form.description} onChange={set('description')} />
          </Field>
        </Fieldset>

        {errorCount > 0 && (
          <p className={styles.errorSummary} role="alert">
            {errorCount} field{errorCount > 1 ? 's' : ''} still need attention.
          </p>
        )}
      </form>
    </Modal>
  );
}

function Fieldset({ legend, children }) {
  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>{legend}</legend>
      {children}
    </fieldset>
  );
}

function Field({ id, label, required, hint, error, children }) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}{required && <span className={styles.req} aria-hidden="true"> *</span>}
      </label>
      {children}
      {error
        ? <span className={styles.fieldError} role="alert">{error}</span>
        : hint && <span className={styles.fieldHint}>{hint}</span>}
    </div>
  );
}
