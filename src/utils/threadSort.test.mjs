/**
 * Ticket-list order — run with:  node src/utils/threadSort.test.mjs
 *
 * The rule is urgent first (in every tab), then newest activity, then id.
 * It has to hold no matter how the list was assembled, because the rows come
 * from several server responses stitched together.
 */
import assert from 'node:assert/strict';
import { sortThreads, byUrgentThenRecent, recencyOf, priorityRank } from './threadSort.js';

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log(`  ok   ${name}`); }
  catch (err) { fail++; console.log(`  FAIL ${name}\n       ${err.message}`); }
};

const at = (s) => new Date(s).toISOString();
const t = (id, last, extra = {}) => ({ id, last_message_at: last, priority: 'normal', ...extra });
const urgent = (id, last) => t(id, last, { priority: 'urgent' });

console.log('\nurgent pinning');
test('an old urgent ticket outranks a fresh normal one', () => {
  const out = sortThreads([
    t(1, at('2026-08-11T09:00Z')),
    urgent(2, at('2026-07-14T09:00Z')),
  ]);
  assert.deepEqual(out.map(x => x.id), [2, 1]);
});

test('urgent tickets are themselves newest-first', () => {
  const out = sortThreads([
    urgent(1, at('2026-07-14T09:00Z')),
    urgent(2, at('2026-08-11T09:00Z')),
    urgent(3, at('2026-08-01T09:00Z')),
  ]);
  assert.deepEqual(out.map(x => x.id), [2, 3, 1]);
});

test('non-urgent tickets follow, also newest-first', () => {
  const out = sortThreads([
    t(1, at('2026-07-14T09:00Z')),
    urgent(2, at('2026-08-01T09:00Z')),
    t(3, at('2026-08-11T09:00Z')),
    urgent(4, at('2026-07-20T09:00Z')),
  ]);
  assert.deepEqual(out.map(x => x.id), [2, 4, 3, 1]);
});

test('low ranks with normal, so it is not banded below by age', () => {
  const out = sortThreads([
    t(1, at('2026-08-01T09:00Z'), { priority: 'low' }),
    t(2, at('2026-07-01T09:00Z'), { priority: 'normal' }),
  ]);
  assert.deepEqual(out.map(x => x.id), [1, 2], 'a newer low ticket still beats an older normal one');
});

test('the rule is independent of the status tab', () => {
  for (const status of ['open', 'in_progress', 'resolved']) {
    const out = sortThreads([
      t(1, at('2026-08-11T09:00Z'), { status }),
      { ...urgent(2, at('2026-01-01T09:00Z')), status },
    ]);
    assert.deepEqual(out.map(x => x.id), [2, 1], `failed for ${status}`);
  }
});

console.log('\nrecency');
test('falls back to created_at when there are no messages', () => {
  const out = sortThreads([
    { id: 1, last_message_at: null, created_at: at('2026-08-11T09:00Z'), priority: 'normal' },
    t(2, at('2026-08-01T09:00Z')),
  ]);
  assert.deepEqual(out.map(x => x.id), [1, 2]);
});

test('unparseable dates sink instead of corrupting the order', () => {
  const out = sortThreads([t(1, 'not-a-date'), t(2, at('2026-08-01T09:00Z'))]);
  assert.deepEqual(out.map(x => x.id), [2, 1]);
  assert.equal(recencyOf({ last_message_at: 'nope' }), 0);
});

console.log('\ndeterminism');
test('equal timestamps break on id, the same way every call', () => {
  const same = at('2026-08-11T00:00Z');
  const once  = sortThreads([t(7, same), t(9, same), t(8, same)]).map(x => x.id);
  const twice = sortThreads([t(8, same), t(7, same), t(9, same)]).map(x => x.id);
  assert.deepEqual(once, [9, 8, 7]);
  assert.deepEqual(once, twice, 'input order must not affect the result');
});

test('sorting an already-sorted list changes nothing', () => {
  const list = sortThreads([t(1, at('2026-08-01T09:00Z')), urgent(2, at('2026-07-01T09:00Z'))]);
  assert.deepEqual(sortThreads(list).map(x => x.id), list.map(x => x.id));
});

test('does not mutate its input', () => {
  const input = [t(1, at('2026-07-01T09:00Z')), urgent(2, at('2026-06-01T09:00Z'))];
  const before = input.map(x => x.id);
  sortThreads(input);
  assert.deepEqual(input.map(x => x.id), before);
});

console.log('\nassembly from multiple responses');
test('poll-merge interleaves rather than appending', () => {
  const page1 = [urgent(10, at('2026-08-11T09:00Z')), t(11, at('2026-08-11T08:00Z'))];
  const tail  = [t(12, at('2026-08-11T08:30Z')), urgent(13, at('2026-08-05T00:00Z'))];
  assert.deepEqual(sortThreads([...page1, ...tail]).map(x => x.id), [10, 13, 12, 11]);
});

test('empty and undefined input are safe', () => {
  assert.deepEqual(sortThreads([]), []);
  assert.deepEqual(sortThreads(), []);
  assert.equal(priorityRank(undefined), 1);
  assert.equal(byUrgentThenRecent({ id: 1 }, { id: 2 }), 1);
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
