// Single source of truth for fulfilment action types.
//
// This config was previously duplicated in three files — ActionsView.jsx,
// Thread/ActionPanel.jsx and Dashboard.jsx — and had already drifted
// ("🔁 Alternate" vs "🔁 Alternate Product"). Import from here instead.

export const ACTION_TYPES = [
  {
    id: 'exchange',
    label: 'Exchange',
    desc: 'Pick up original jersey and send a replacement',
    color: { bg: '#eff6ff', color: '#1d4ed8', border: '#93c5fd' },
  },
  {
    id: 'return',
    label: 'Return',
    desc: 'Pick up original jersey and process refund',
    color: { bg: '#fef3c7', color: '#92400e', border: '#fcd34d' },
  },
  {
    id: 'alternate_product',
    label: 'Alternate Product',
    desc: 'Send an alternate jersey to the customer',
    color: { bg: '#f0fdf4', color: '#15803d', border: '#86efac' },
  },
  {
    id: 'refund',
    label: 'Refund',
    desc: 'Process a direct refund — no pickup required',
    color: { bg: '#f5f3ff', color: '#6d28d9', border: '#c4b5fd' },
  },
  {
    id: 'change_size',
    label: 'Change Size',
    desc: 'Swap the customer’s jersey for a different size',
    color: { bg: '#ecfeff', color: '#0e7490', border: '#67e8f9' },
  },
  {
    id: 'change_address',
    label: 'Change Address',
    desc: 'Update the delivery address for the order',
    color: { bg: '#fdf2f8', color: '#be185d', border: '#f9a8d4' },
  },
];

// What each action type is made of. ActionsView and Thread/ActionPanel both
// used to hard-code this as parallel if-chains over `action.action_type`,
// which is why the two disagreed about labels and why adding a field meant
// editing it in two places.
//
//   items  — free-text lines (jerseys, addresses)
//   checks — booleans stored as 0/1; these drive the progress column
//   fields — short text values (ids, dates)
export const ACTION_SCHEMA = {
  exchange: {
    items:  [{ key: 'pickup_jersey', label: 'Pickup' }, { key: 'exchange_jersey', label: 'Exchange' }],
    checks: [{ key: 'exchange_pickup_done', label: 'Pickup done' }, { key: 'exchange_packed', label: 'Packed' }],
    fields: [{ key: 'exchange_order_id', label: 'Exchange order ID', mono: true }],
  },
  return: {
    items:  [{ key: 'pickup_jersey', label: 'Pickup' }],
    checks: [
      { key: 'return_created',  label: 'Return created' },
      { key: 'return_received', label: 'Return received' },
      { key: 'refund_done',     label: 'Refund done' },
    ],
    fields: [
      { key: 'refund_id',   label: 'Refund ID', mono: true },
      { key: 'refund_time', label: 'Refund time' },
    ],
  },
  alternate_product: {
    items:  [{ key: 'pickup_jersey', label: 'Pickup' }, { key: 'alternate_jersey', label: 'Alternate' }],
    checks: [
      { key: 'alt_order_created',        label: 'Alt order created' },
      { key: 'original_order_cancelled', label: 'Original cancelled' },
    ],
    fields: [],
  },
  refund: {
    items:  [{ key: 'pickup_jersey', label: 'Item' }],
    checks: [{ key: 'refund_done', label: 'Refund done' }],
    fields: [
      { key: 'refund_id',   label: 'Refund ID', mono: true },
      { key: 'refund_time', label: 'Refund date' },
    ],
  },
  change_size: {
    items:  [{ key: 'current_jersey', label: 'Current' }, { key: 'new_jersey', label: 'New' }],
    checks: [{ key: 'size_change_done', label: 'Size changed' }],
    fields: [],
  },
  change_address: {
    items:  [{ key: 'new_address', label: 'New address' }],
    checks: [{ key: 'address_change_done', label: 'Address updated' }],
    fields: [],
  },
};

export const schemaFor = (id) => ACTION_SCHEMA[id] || { items: [], checks: [], fields: [] };

/** Checklist completion, used for the progress column and row sorting. */
export function progressOf(action) {
  const { checks } = schemaFor(action.action_type);
  const done = checks.filter(c => !!action[c.key]).length;
  return { done, total: checks.length, pct: checks.length ? done / checks.length : 0 };
}

const BY_ID = Object.fromEntries(ACTION_TYPES.map(t => [t.id, t]));

const FALLBACK_COLOR = { bg: '#f9fafb', color: '#374151', border: '#e5e7eb' };

export const actionType  = (id) => BY_ID[id];
export const actionLabel = (id) => BY_ID[id]?.label || id;
export const actionColor = (id) => BY_ID[id]?.color || FALLBACK_COLOR;

// Legacy shapes kept so the three call sites can migrate incrementally
// without a big-bang rewrite of their JSX.
export const TYPE_LABELS = Object.fromEntries(ACTION_TYPES.map(t => [t.id, t.label]));
export const TYPE_COLORS = Object.fromEntries(ACTION_TYPES.map(t => [t.id, t.color]));
