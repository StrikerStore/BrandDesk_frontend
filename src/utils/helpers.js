// Format a date/timestamp for display
export function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
 
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString('en-IN', { weekday: 'short' });
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}
 
export function formatFullTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}
 
// Resolve template variables
export function resolveTemplate(body, vars = {}) {
  return body
    .replace(/\{\{customer_name\}\}/g, vars.customerName  || 'there')
    .replace(/\{\{order_id\}\}/g,      vars.orderId       || '[order ID]')
    .replace(/\{\{ticket_id\}\}/g,     vars.ticketId      || '[ticket ID]')
    .replace(/\{\{tracking_url\}\}/g,  vars.trackingUrl   || '[tracking URL]')
    .replace(/\{\{tracking_link\}\}/g, vars.trackingLink  || vars.trackingUrl || '[tracking link]')
    .replace(/\{\{amount\}\}/g,        vars.amount        || '[amount]')
    .replace(/\{\{brand\}\}/g,         vars.brand         || 'us');
}
 
// Brand color mapping
const BRAND_COLORS = [
  { bg: '#ede9fe', text: '#5b21b6', border: '#c4b5fd' },
  { bg: '#fce7f3', text: '#9d174d', border: '#f9a8d4' },
  { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' },
  { bg: '#fef3c7', text: '#78350f', border: '#fcd34d' },
  { bg: '#dbeafe', text: '#1e3a8a', border: '#93c5fd' },
  { bg: '#fee2e2', text: '#7f1d1d', border: '#fca5a5' },
];
 
const brandColorMap = {};
 
export function getBrandColor(brandName) {
  if (!brandColorMap[brandName]) {
    const idx = Object.keys(brandColorMap).length % BRAND_COLORS.length;
    brandColorMap[brandName] = BRAND_COLORS[idx];
  }
  return brandColorMap[brandName];
}
 
// Status config
export const STATUS_CONFIG = {
  open:        { label: 'Open',        color: '#d97706', bg: '#fffbeb', border: '#fcd34d' },
  in_progress: { label: 'In Progress', color: '#2563eb', bg: '#eff6ff', border: '#93c5fd' },
  resolved:    { label: 'Resolved',    color: '#16a34a', bg: '#f0fdf4', border: '#6ee7b7' },
};
 
// Priority config
export const PRIORITY_CONFIG = {
  urgent: { label: 'Urgent', color: '#dc2626' },
  normal: { label: 'Normal', color: '#6b6a66' },
  low:    { label: 'Low',    color: '#9e9d99' },
};
 
// Get initials from name
export function getInitials(name = '') {
  return name.trim().split(' ').filter(Boolean).slice(0, 2)
    .map(w => w[0].toUpperCase()).join('');
}
 
// "Open since 3h" / "In progress since 2 days"
export function statusSince(status, statusChangedAt) {
  if (!statusChangedAt) return null;
 
  // Parse the timestamp — MySQL returns local server time without timezone info
  // Force interpret as UTC if no timezone indicator present
  let changedAt = new Date(statusChangedAt);
  const raw = String(statusChangedAt);
  if (!raw.includes('Z') && !raw.includes('+') && !raw.match(/[+-]\d{2}:\d{2}$/)) {
    // No timezone info — MySQL sent bare datetime, treat as UTC
    changedAt = new Date(raw.replace(' ', 'T') + 'Z');
  }
 
  const diff = Date.now() - changedAt.getTime();
  if (diff < 0) return null; // Clock skew — don't show negative
 
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
 
  let duration;
  if (mins < 1)        duration = 'just now';
  else if (mins < 60)  duration = `${mins}m`;
  else if (hours < 24) duration = `${hours}h`;
  else if (days === 1) duration = '1 day';
  else                 duration = `${days} days`;
 
  if (duration === 'just now') return 'Just resolved';
 
  const label = status === 'in_progress' ? 'In progress'
    : status === 'resolved' ? 'Resolved'
    : 'Open';
  return `${label} since ${duration}`;
}

// Currency format
export function formatCurrency(amount) {
  if (!amount && amount !== 0) return '—';
  return `₹${parseFloat(amount).toLocaleString('en-IN', { minimumFractionDigits: 0 })}`;
}

// Truncate text
export function truncate(str, len = 60) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '…' : str;
}