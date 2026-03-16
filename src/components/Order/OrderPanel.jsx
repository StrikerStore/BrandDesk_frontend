import { useState, useEffect } from 'react';
import { fetchOrder, fetchOrdersByEmail } from '../../utils/api.js';
import styles from './OrderPanel.module.css';

// Mask phone: keep only last 4 digits → ••••••4321
function maskPhone(phone) {
  if (!phone) return null;
  const p = phone.replace(/\D/g, '');
  if (p.length < 4) return phone;
  return '•'.repeat(Math.max(0, p.length - 4)) + p.slice(-4);
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatPayment(type) {
  if (!type) return null;
  const t = type.toString().toUpperCase().trim();
  if (t === 'C' || t === 'COD' || t.includes('CASH')) return 'COD';
  if (t === 'P' || t === 'PREPAID' || t.includes('PREPAID') || t.includes('ONLINE') || t.includes('PAID')) return 'Prepaid';
  return type;
}

export default function OrderPanel({ thread }) {
  const orderId = thread?.order_number;
  const email   = thread?.customer_email;

  const [orderData, setOrderData]     = useState(null);
  const [pastOrders, setPastOrders]   = useState([]);
  const [pastOrderDetails, setPastOrderDetails] = useState({}); // id → full order data
  const [loading, setLoading]         = useState(false);
  const [pastLoading, setPastLoading] = useState(false);
  const [error, setError]             = useState(null);
  const [expandedPast, setExpandedPast] = useState({}); // accordion state

  useEffect(() => {
    if (!orderId) { setOrderData(null); setError(null); return; }
    setLoading(true);
    setError(null);
    setOrderData(null);
    fetchOrder(orderId)
      .then(({ data }) => setOrderData(data))
      .catch(err => setError(err.response?.data?.error || 'Failed to load order'))
      .finally(() => setLoading(false));
  }, [orderId]);

  useEffect(() => {
    if (!email) return;
    setPastLoading(true);
    fetchOrdersByEmail(email)
      .then(({ data }) => setPastOrders(data || []))
      .catch(() => setPastOrders([]))
      .finally(() => setPastLoading(false));
  }, [email]);

  const togglePast = async (pastOrderId) => {
    // Skip current order
    if (pastOrderId === orderId) return;

    const isOpen = expandedPast[pastOrderId];
    setExpandedPast(p => ({ ...p, [pastOrderId]: !isOpen }));

    // Fetch full details if not yet loaded
    if (!isOpen && !pastOrderDetails[pastOrderId]) {
      try {
        const { data } = await fetchOrder(pastOrderId);
        setPastOrderDetails(p => ({ ...p, [pastOrderId]: data }));
      } catch {}
    }
  };

  if (!orderId && !email) return null;

  return (
    <div className={styles.root}>

      {/* Current order */}
      {orderId && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            Order
            <span className={styles.orderId}>{orderId}</span>
            {orderData?.has_splits && (
              <span className={styles.splitBadge}>{orderData.split_count + 1} shipments</span>
            )}
          </div>

          {loading && <div className={styles.loading}><span className={styles.spinner} />Loading order…</div>}

          {error && (
            <div className={styles.errorBox}>
              {error === 'Order not found' ? `Order ${orderId} not found in the database` : error}
            </div>
          )}

          {orderData && <OrderLines orders={orderData.orders} baseId={orderId} />}
        </div>
      )}

      {/* Past orders */}
      {email && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            Past orders
            {pastOrders.length > 0 && <span className={styles.countBadge}>{pastOrders.length}</span>}
          </div>

          {pastLoading && <div className={styles.loading}><span className={styles.spinner} />Loading…</div>}

          {!pastLoading && pastOrders.length === 0 && (
            <div className={styles.emptyPast}>No past orders found</div>
          )}

          {pastOrders.length > 0 && (
            <div className={styles.pastList}>
              {pastOrders.filter(o => o.order_id !== orderId).map(o => {
                const isOpen = expandedPast[o.order_id];
                const detail = pastOrderDetails[o.order_id];

                return (
                  <div key={o.order_id} className={styles.pastAccordion}>
                    {/* Accordion header */}
                    <div className={styles.pastHeader} onClick={() => togglePast(o.order_id)}>
                      <div className={styles.pastLeft}>
                        <span className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}>
                          {isOpen ? '▾' : '▸'}
                        </span>
                        <span className={styles.pastOrderId}>{o.order_id}</span>
                        <span className={styles.pastDate}>{formatDate(o.order_date)}</span>
                      </div>
                      <div className={styles.pastRight}>
                        {o.current_shipment_status && (
                          <TrackingBadge status={o.current_shipment_status} url={o.tracking_url} small />
                        )}
                      </div>
                    </div>

                    {/* Accordion body */}
                    {isOpen && (
                      <div className={styles.pastBody}>
                        {detail ? (
                          <OrderLines orders={detail.orders} baseId={o.order_id} compact />
                        ) : (
                          <div className={styles.loading}><span className={styles.spinner} />Loading…</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Reusable order lines component ──────────────────────────

function OrderLines({ orders, baseId, compact }) {
  return (
    <div className={styles.orderRows}>
      {orders.map(o => (
        <div key={o.order_id} className={`${styles.orderRow} ${o.is_split ? styles.orderRowSplit : ''}`}>
          <div className={styles.orderRowHeader}>
            <div className={styles.orderRowLeft}>
              {o.is_split && <span className={styles.splitLabel}>{o.order_id}</span>}
              <span className={styles.productName}>{o.product}</span>
              {o.size && <span className={styles.sizeBadge}>{o.size}</span>}
              {o.quantity > 1 && <span className={styles.qtyBadge}>×{o.quantity}</span>}
            </div>
            <div className={styles.orderRowRight}>
              {o.tracking
                ? <TrackingBadge status={o.tracking.status} url={o.tracking.tracking_url} />
                : <span className={styles.noTracking}>No label</span>
              }
            </div>
          </div>

          {o.tracking && (
            <div className={styles.trackingInfo}>
              <div className={styles.trackingRow}>
                <span className={styles.trackingLabel}>Carrier</span>
                <span className={styles.trackingVal}>{o.tracking.carrier || '—'}</span>
              </div>
              <div className={styles.trackingRow}>
                <span className={styles.trackingLabel}>AWB</span>
                <span className={styles.trackingVal} style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                  {o.tracking.awb}
                </span>
              </div>
            </div>
          )}

          <div className={styles.paymentRow}>
            {formatPayment(o.payment_type) && (
              <span className={styles.paymentType}>{formatPayment(o.payment_type)}</span>
            )}
            {o.collectable > 0 && (
              <span className={styles.collectableAmt}>₹{Number(o.collectable).toLocaleString('en-IN')} collectible</span>
            )}
            {o.order_date && (
              <span className={styles.orderDate}>{formatDate(o.order_date)}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Tracking status badge ────────────────────────────────────

const STATUS_COLORS = {
  delivered:   { bg: '#f0fdf4', color: '#15803d', border: '#86efac' },
  shipped:     { bg: '#eff6ff', color: '#1d4ed8', border: '#93c5fd' },
  intransit:   { bg: '#eff6ff', color: '#1d4ed8', border: '#93c5fd' },
  'in transit':{ bg: '#eff6ff', color: '#1d4ed8', border: '#93c5fd' },
  pending:     { bg: '#fffbeb', color: '#b45309', border: '#fcd34d' },
  processing:  { bg: '#fffbeb', color: '#b45309', border: '#fcd34d' },
  rto:         { bg: '#fef2f2', color: '#b91c1c', border: '#fca5a5' },
  cancelled:   { bg: '#fef2f2', color: '#b91c1c', border: '#fca5a5' },
  lost:        { bg: '#fef2f2', color: '#b91c1c', border: '#fca5a5' },
};

function TrackingBadge({ status, url, small }) {
  if (!status) return null;
  const key = status.toLowerCase().replace(/\s+/g, '');
  const s = STATUS_COLORS[key] || STATUS_COLORS[status.toLowerCase()] || { bg: '#f9fafb', color: '#374151', border: '#e5e7eb' };

  const badge = (
    <span style={{
      fontSize: small ? 10 : 11, fontWeight: 600,
      padding: small ? '1px 6px' : '2px 8px',
      borderRadius: 99, background: s.bg, color: s.color,
      border: `1px solid ${s.border}`, whiteSpace: 'nowrap',
      cursor: url ? 'pointer' : 'default',
    }}>
      {status}{url ? ' ↗' : ''}
    </span>
  );

  if (url) {
    return (
      <a href={url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}
        onClick={e => e.stopPropagation()} title="Track shipment">
        {badge}
      </a>
    );
  }
  return badge;
}