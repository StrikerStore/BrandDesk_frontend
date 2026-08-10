/**
 * The one definition of ticket-list order, mirroring the server's ORDER BY.
 *
 *   1. Urgent tickets first, in every tab (open / in progress / resolved).
 *   2. Then newest activity first.
 *   3. Then id, so ties are deterministic.
 *
 * It lives here rather than inline in the hook because the list is stitched
 * from several server responses — page 1 refreshed by the 60s poll, pages
 * 2..N appended by infinite scroll — and each is only sorted within itself.
 * Applying this after every merge is what stops rows drifting out of order
 * the longer a session runs.
 *
 * `low` deliberately ranks with `normal`: giving it its own band would sink
 * low-priority tickets below every normal one regardless of age, recreating
 * the out-of-date-order banding that urgent-only avoids.
 */

export const isUrgent = (t) => t?.priority === 'urgent';

/** 0 for urgent, 1 for everything else. */
export const priorityRank = (t) => (isUrgent(t) ? 0 : 1);

/** Last activity as epoch ms; unparseable or missing dates sort last. */
export function recencyOf(t) {
  const ms = new Date(t?.last_message_at || t?.created_at).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function byUrgentThenRecent(a, b) {
  return (
    priorityRank(a) - priorityRank(b) ||
    recencyOf(b) - recencyOf(a) ||
    (b?.id ?? 0) - (a?.id ?? 0)
  );
}

/** Non-mutating sort into list order. */
export const sortThreads = (list = []) => [...list].sort(byUrgentThenRecent);
