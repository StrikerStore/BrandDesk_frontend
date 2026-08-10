import { schemaFor, actionLabel } from './actionTypes.js';

/**
 * Turning raw action_events rows into timeline entries.
 *
 * Kept free of React so it can be unit-tested on plain node — see
 * actionEvents.test.mjs.
 */

// Same action, same person, within this window → one entry. A three-step
// return ticked in one sitting should read as one thing that happened, not six.
export const COALESCE_WINDOW_MS = 2 * 60 * 1000;

/** Human label for a column, from the per-type schema. */
export function fieldLabel(actionType, field) {
  if (!field) return null;
  const { items, checks, fields } = schemaFor(actionType);
  const hit = [...items, ...checks, ...fields].find(f => f.key === field);
  if (hit) return hit.label;
  // Unknown column (an older event, or a field since removed) — degrade to
  // something readable rather than throwing.
  return field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** One-line description of a single event. */
export function describeEvent(event) {
  const label = fieldLabel(event.action_type, event.field);
  switch (event.event_type) {
    case 'created':  return `${actionLabel(event.action_type)} logged`;
    case 'closed':   return `${actionLabel(event.action_type)} closed`;
    case 'reopened': return 'Reopened — action progress recorded';
    case 'check':    return label;
    case 'uncheck':  return `${label} undone`;
    case 'field':
      return event.new_value
        ? `${label} → ${event.new_value}`
        : `${label} cleared`;
    default:
      return label || event.event_type;
  }
}

/**
 * Group a chronological event list into timeline entries.
 *
 * Events are merged when they share an action and an author and land inside
 * the window. `reopened` never merges — it is a status change, not progress,
 * and burying it inside a group of checkboxes would hide the thing an agent
 * most needs to notice.
 */
export function coalesceEvents(events = []) {
  const sorted = [...events].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at) || (a.id ?? 0) - (b.id ?? 0)
  );

  const entries = [];
  for (const event of sorted) {
    const last = entries[entries.length - 1];
    const standalone = event.event_type === 'reopened';

    const mergeable =
      last &&
      !standalone &&
      !last.standalone &&
      last.action_id === event.action_id &&
      (last.user_id ?? null) === (event.user_id ?? null) &&
      new Date(event.created_at) - new Date(last.lastAt) <= COALESCE_WINDOW_MS;

    if (mergeable) {
      last.events.push(event);
      last.lines.push(describeEvent(event));
      last.lastAt = event.created_at;
      continue;
    }

    entries.push({
      id: `evt-${event.id}`,
      standalone,
      action_id: event.action_id,
      action_type: event.action_type,
      user_id: event.user_id ?? null,
      user_name: event.user_name || null,
      created_at: event.created_at,   // the entry is stamped with its first event
      lastAt: event.created_at,
      events: [event],
      lines: [describeEvent(event)],
    });
  }

  return entries;
}
