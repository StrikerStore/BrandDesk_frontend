import { useState, useEffect, useCallback } from 'react';
import { fetchCustomer, updateCustomerNotes, createCustomer, fetchThread } from '../../utils/api.js';
import { getInitials, getBrandColor } from '../../utils/helpers.js';
import OrderPanel from '../Order/OrderPanel.jsx';
import styles from './CustomerPanel.module.css';

function maskPhone(phone) {
  if (!phone) return null;
  const p = phone.replace(/\D/g, '');
  if (p.length < 4) return phone;
  return '•'.repeat(Math.max(0, p.length - 4)) + p.slice(-4);
}

export default function CustomerPanel({ threadId }) {
  const [thread, setThread] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [pastTickets, setPastTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [notesSaved, setNotesSaved] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', location: '' });

  const load = useCallback(async () => {
    if (!threadId) return;
    setLoading(true);
    try {
      const { data: threadData } = await fetchThread(threadId);
      const t = threadData.thread;
      setThread(t);
      const { data } = await fetchCustomer(t.customer_email);
      setCustomer(data.customer || { email: t.customer_email, name: t.customer_name });
      setPastTickets(data.pastTickets || []);
      setNotes(data.customer?.notes || '');
    } catch (err) {
      console.error('Customer load error:', err.message);
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => { load(); }, [load]);

  const handleSaveNotes = async () => {
    if (!customer?.email) return;
    await updateCustomerNotes(customer.email, notes);
    setNotesSaved(true);
    setTimeout(() => setNotesSaved(false), 2000);
  };

  const handleAddCustomer = async () => {
    if (!customer?.email) return;
    await createCustomer({ email: customer.email, ...newCustomer });
    setShowAddForm(false);
    load();
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

  const brandColor = getBrandColor(thread?.brand || '');
  const rawName = customer?.name || thread?.customer_name || '';
  const isShopifyStoreName = rawName.toLowerCase().includes('shopify') || rawName.toLowerCase().includes(' store');
  const displayName = (!rawName || isShopifyStoreName) ? null : rawName;
  const initials = getInitials(displayName || customer?.email || '');
  const hasTicketInfo = thread?.ticket_id || thread?.order_number || thread?.issue_category;

  return (
    <div className={styles.root}>
      <div className={styles.panelHeader}>
        <span>Customer</span>
        {thread?.is_shopify_form ? <span className={styles.parsedBadge}>Auto-parsed</span> : null}
      </div>

      <div className={styles.body}>

        {/* Avatar + name */}
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
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Contact</div>
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
        </div>

        {/* This ticket's parsed info */}
        {hasTicketInfo && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>This ticket</div>
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
          </div>
        )}

        {/* Order details from external DB */}
        {thread?.order_number && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Order details</div>
            <OrderPanel thread={thread} />
          </div>
        )}

        {/* Past tickets */}
        {pastTickets.filter(t => t.id !== parseInt(threadId)).length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              Past tickets ({pastTickets.filter(t => t.id !== parseInt(threadId)).length})
            </div>
            {pastTickets
              .filter(t => t.id !== parseInt(threadId))
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
                      {t.order_number && <span className={styles.ptTag}>#{t.order_number}</span>}
                      {t.issue_category && <span className={styles.ptIssue}>{t.issue_category}</span>}
                    </div>
                  )}
                  <div className={styles.ptBrand}>{t.brand}</div>
                </div>
              ))}
          </div>
        )}

        {/* Agent notes */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Agent notes</div>
          <textarea
            className={styles.notesArea}
            rows={3}
            placeholder="Add private notes about this customer…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
          <button
            className={`${styles.saveNotesBtn} ${notesSaved ? styles.saved : ''}`}
            onClick={handleSaveNotes}
          >
            {notesSaved ? '✓ Saved' : 'Save notes'}
          </button>
        </div>

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