import { useState, useEffect, useCallback } from 'react';
import { fetchCustomer, updateCustomerNotes, createCustomer, fetchThread, errorMessage } from '../../utils/api.js';
import { getInitials, getBrandColor, displayOrderId, truncate } from '../../utils/helpers.js';
import { useToast } from '../../ui/ToastProvider.jsx';
import AccordionSection from '../../ui/Accordion.jsx';
import OrderPanel from '../Order/OrderPanel.jsx';
import styles from './CustomerPanel.module.css';

// Which sections an agent keeps open is a durable preference. Order is open by
// default because most tickets are about one — the panel used to be a single
// unbounded scroll where order details sat two scrolls down.
const DEFAULT_OPEN = { order: true, contact: false, ticket: false, history: false, notes: false };

function readOpenState() {
  try {
    return { ...DEFAULT_OPEN, ...JSON.parse(localStorage.getItem('bd_ctx_sections') || '{}') };
  } catch {
    return DEFAULT_OPEN;
  }
}

function maskPhone(phone) {
  if (!phone) return null;
  const p = phone.replace(/\D/g, '');
  if (p.length < 4) return phone;
  return '•'.repeat(Math.max(0, p.length - 4)) + p.slice(-4);
}

export default function CustomerPanel({ threadId }) {
  const toast = useToast();
  const [thread, setThread] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [pastTickets, setPastTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [notes, setNotes] = useState('');
  const [notesSaved, setNotesSaved] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', location: '' });
  const [openSections, setOpenSections] = useState(readOpenState);

  const isOpen = (key) => !!openSections[key];
  const toggle = (key) => setOpenSections(prev => {
    const next = { ...prev, [key]: !prev[key] };
    localStorage.setItem('bd_ctx_sections', JSON.stringify(next));
    return next;
  });

  const load = useCallback(async () => {
    if (!threadId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const { data: threadData } = await fetchThread(threadId);
      const t = threadData.thread;
      setThread(t);
      const { data } = await fetchCustomer(t.customer_email);
      setCustomer(data.customer || { email: t.customer_email, name: t.customer_name });
      setPastTickets(data.pastTickets || []);
      setNotes(data.customer?.notes || '');
    } catch (err) {
      // Previously console-only, so a failed load rendered as a customer with
      // no phone, no orders and no history — indistinguishable from a new one.
      setLoadError(errorMessage(err, 'Failed to load customer'));
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => { load(); }, [load]);

  // No catch here previously: on failure the "✓ Saved" tick simply never
  // appeared and nothing else happened, so the button looked inert.
  const handleSaveNotes = async () => {
    if (!customer?.email) return;
    try {
      await updateCustomerNotes(customer.email, notes);
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2000);
    } catch (err) {
      toast.error("Couldn't save notes", { detail: errorMessage(err) });
    }
  };

  const handleAddCustomer = async () => {
    if (!customer?.email) return;
    try {
      await createCustomer({ email: customer.email, ...newCustomer });
      setShowAddForm(false);
      load();
      toast.success('Customer details saved');
    } catch (err) {
      toast.error("Couldn't save customer details", { detail: errorMessage(err) });
    }
  };

  if (loading) {
    return (
      <div className={styles.root}>
        <div className={styles.panelHeader}><span>Customer</span></div>
        <div className={styles.loadingSkeleton}>
          <div className={styles.skAvatar} />
          {[1,2,3,4].map(i => (
            <div key={i} className={styles.skLine} style={{ width: `${60 + i * 8}%` }} />
          ))}
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={styles.root}>
        <div className={styles.panelHeader}><span>Customer</span></div>
        <div className={styles.body} role="alert">
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Couldn’t load customer</div>
            <div className={styles.noInfo}>
              {loadError}{' '}
              <button className={styles.inlineBtn} onClick={load}>Retry</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const brandColor = getBrandColor(thread?.brand || '');
  const rawName = customer?.name || thread?.customer_name || '';
  const isShopifyStoreName = rawName.toLowerCase().includes('shopify') || rawName.toLowerCase().includes(' store');
  const displayName = (!rawName || isShopifyStoreName) ? null : rawName;
  const initials = getInitials(displayName || customer?.email || '');
  const hasTicketInfo = thread?.ticket_id || thread?.order_number || thread?.issue_category;
  const priorTickets  = pastTickets.filter(t => t.id !== parseInt(threadId));

  return (
    <div className={styles.root}>
      <div className={styles.panelHeader}>
        <span>Customer</span>
        {thread?.is_manual ? (
          <span className={styles.parsedBadge} style={{ background: '#eff6ff', color: '#1d4ed8', borderColor: '#93c5fd' }}>
            Manual ticket
          </span>
        ) : thread?.is_shopify_form ? (
          <span className={styles.parsedBadge}>Auto-parsed</span>
        ) : null}
      </div>

      <div className={styles.body}>

        {/* Avatar + name — always visible; everything below it is a section */}
        <div className={styles.profileTop}>
          <div className={styles.avatar} style={{ background: brandColor.bg, color: brandColor.text }}>
            {initials || '?'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {displayName ? (
              <div className={styles.customerName}>{displayName}</div>
            ) : (
              <EditableName
                email={customer?.email}
                onSaved={(name) => setCustomer(p => ({ ...p, name }))}
              />
            )}
            <div className={styles.customerEmail}>{customer?.email}</div>
          </div>
        </div>

        {/* Contact info */}
        <AccordionSection
          title="Contact"
          open={isOpen('contact')}
          onToggle={() => toggle('contact')}
          summary={maskPhone(customer?.phone || thread?.customer_phone) || 'No phone on file'}
        >
          <div className={styles.detailRows}>
            {(customer?.phone || thread?.customer_phone) && (
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Phone</span>
                <span className={styles.detailVal}>
                  {maskPhone(customer?.phone || thread?.customer_phone)}
                </span>
              </div>
            )}
            {customer?.location && (
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Location</span>
                <span className={styles.detailVal}>{customer.location}</span>
              </div>
            )}
            {!customer?.phone && !thread?.customer_phone && (
              <div className={styles.noInfo}>
                No contact info yet.{' '}
                <button className={styles.inlineBtn} onClick={() => setShowAddForm(true)}>
                  Add manually
                </button>
              </div>
            )}
          </div>
          {showAddForm && (
            <div className={styles.addForm}>
              <input className={styles.addInput} placeholder="Name" value={newCustomer.name}
                onChange={e => setNewCustomer(p => ({ ...p, name: e.target.value }))} />
              <input className={styles.addInput} placeholder="Phone" value={newCustomer.phone}
                onChange={e => setNewCustomer(p => ({ ...p, phone: e.target.value }))} />
              <input className={styles.addInput} placeholder="Location" value={newCustomer.location}
                onChange={e => setNewCustomer(p => ({ ...p, location: e.target.value }))} />
              <div style={{ display: 'flex', gap: 6 }}>
                <button className={styles.saveAddBtn} onClick={handleAddCustomer}>Save</button>
                <button className={styles.cancelBtn} onClick={() => setShowAddForm(false)}>Cancel</button>
              </div>
            </div>
          )}
        </AccordionSection>

        {/* Order — open by default, because most tickets are about one */}
        {thread?.order_number && (
          <AccordionSection
            title="Order"
            open={isOpen('order')}
            onToggle={() => toggle('order')}
            summary={`#${displayOrderId(thread.order_id_resolved || thread.order_number)}`}
          >
            <OrderPanel thread={thread} />
          </AccordionSection>
        )}

        {/* This ticket's parsed info */}
        {hasTicketInfo && (
          <AccordionSection
            title="This ticket"
            open={isOpen('ticket')}
            onToggle={() => toggle('ticket')}
            summary={thread.issue_category || thread.ticket_id}
          >
            <div className={styles.ticketCard}>
              {thread.ticket_id && (
                <div className={styles.ticketIdRow}>
                  <span className={styles.ticketId}>{thread.ticket_id}</span>
                </div>
              )}
              <div className={styles.detailRows} style={{ marginTop: 8 }}>
                {thread.order_number && (
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Order</span>
                    <span className={styles.detailVal}>{thread.order_number}</span>
                  </div>
                )}
                {thread.issue_category && (
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Issue</span>
                    <span className={styles.detailVal}>{thread.issue_category}</span>
                  </div>
                )}
                {thread.sub_issue && thread.sub_issue !== thread.issue_category && (
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Sub-issue</span>
                    <span className={styles.detailVal}>{thread.sub_issue}</span>
                  </div>
                )}
              </div>
            </div>
          </AccordionSection>
        )}

        {/* History — "past tickets" and "past orders" were two separate panels
            answering the same question: what happened with this customer
            before? Past orders live inside OrderPanel above; this is tickets. */}
        <AccordionSection
          title="History"
          count={priorTickets.length}
          open={isOpen('history')}
          onToggle={() => toggle('history')}
          summary={priorTickets.length ? `${priorTickets.length} past ticket${priorTickets.length > 1 ? 's' : ''}` : 'First contact'}
          empty={priorTickets.length === 0}
          emptyText="No previous tickets from this customer."
        >
          {priorTickets
              .slice(0, 6)
              .map(t => (
                <div key={t.id} className={styles.pastTicket}>
                  <div className={styles.ptTop}>
                    <span className={styles.ptSubject}>{t.subject}</span>
                    <span className={styles.ptStatus} data-status={t.status}>
                      {t.status?.replace('_', ' ')}
                    </span>
                  </div>
                  {(t.ticket_id || t.order_number) && (
                    <div className={styles.ptMeta}>
                      {t.ticket_id && <span className={styles.ptTag}>{t.ticket_id}</span>}
                      {t.order_number && <span className={styles.ptTag}>#{displayOrderId(t.order_id_resolved || t.order_number)}</span>}
                      {t.issue_category && <span className={styles.ptIssue}>{t.issue_category}</span>}
                    </div>
                  )}
                  <div className={styles.ptBrand}>{t.brand}</div>
                </div>
              ))}
        </AccordionSection>

        {/* Agent notes */}
        <AccordionSection
          title="Notes"
          open={isOpen('notes')}
          onToggle={() => toggle('notes')}
          summary={notes ? truncate(notes, 34) : 'None'}
        >
          <textarea
            className={styles.notesArea}
            rows={3}
            placeholder="Add private notes about this customer…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            aria-label="Private notes about this customer"
          />
          <button
            className={`${styles.saveNotesBtn} ${notesSaved ? styles.saved : ''}`}
            onClick={handleSaveNotes}
          >
            {notesSaved ? '✓ Saved' : 'Save notes'}
          </button>
        </AccordionSection>

      </div>
    </div>
  );
}

function EditableName({ email, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');

  const handleSave = async () => {
    if (!value.trim()) return;
    await createCustomer({ email, name: value.trim() });
    onSaved(value.trim());
    setEditing(false);
  };

  if (editing) {
    return (
      <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
        <input
          autoFocus
          style={{
            flex: 1, fontSize: 13, fontWeight: 500,
            border: '1px solid var(--border-md)', borderRadius: 6,
            padding: '3px 7px', background: 'var(--surface)',
            color: 'var(--text-primary)', outline: 'none'
          }}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') setEditing(false);
          }}
          placeholder="Enter customer name"
        />
        <button
          onClick={handleSave}
          style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}
        >
          Save
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      style={{
        fontSize: 13, fontWeight: 500, color: 'var(--text-tertiary)',
        background: 'none', border: 'none', cursor: 'pointer',
        padding: 0, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 4
      }}
    >
      Customer name
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4z"/>
      </svg>
    </button>
  );
}