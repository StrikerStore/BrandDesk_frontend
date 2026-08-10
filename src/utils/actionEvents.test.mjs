/**
 * Action-timeline grouping tests — run with:
 *   node src/utils/actionEvents.test.mjs
 *
 * These cover the coalescing rules, which decide how noisy a busy ticket's
 * timeline gets, and the label lookup that turns column names into English.
 */
import assert from 'node:assert/strict';
import { coalesceEvents, describeEvent, fieldLabel, COALESCE_WINDOW_MS } from './actionEvents.js';

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log(`  ok   ${name}`); }
  catch (err) { fail++; console.log(`  FAIL ${name}\n       ${err.message}`); }
};

const T0 = Date.parse('2026-08-10T10:00:00Z');
const at = (msOffset) => new Date(T0 + msOffset).toISOString();

let seq = 0;
const ev = (over = {}) => ({
  id: ++seq,
  action_id: 1,
  action_type: 'return',
  event_type: 'check',
  field: 'return_created',
  user_id: 7,
  user_name: 'Priya',
  created_at: at(0),
  ...over,
});

console.log('\ncoalesceEvents — grouping');
test('two ticks 30s apart by one agent collapse into one entry', () => {
  const out = coalesceEvents([
    ev({ created_at: at(0),      field: 'return_created' }),
    ev({ created_at: at(30_000), field: 'return_received' }),
  ]);
  assert.equal(out.length, 1, `expected 1 entry, got ${out.length}`);
  assert.equal(out[0].lines.length, 2);
});

test('same two ticks by different agents stay separate', () => {
  const out = coalesceEvents([
    ev({ created_at: at(0),      user_id: 7, user_name: 'Priya' }),
    ev({ created_at: at(30_000), user_id: 9, user_name: 'Rahul', field: 'return_received' }),
  ]);
  assert.equal(out.length, 2);
});

test('a tick 5 minutes later starts a new entry', () => {
  const out = coalesceEvents([
    ev({ created_at: at(0) }),
    ev({ created_at: at(5 * 60_000), field: 'return_received' }),
  ]);
  assert.equal(out.length, 2);
});

test('exactly on the window boundary still merges', () => {
  const out = coalesceEvents([
    ev({ created_at: at(0) }),
    ev({ created_at: at(COALESCE_WINDOW_MS), field: 'return_received' }),
  ]);
  assert.equal(out.length, 1);
});

test('different actions never merge', () => {
  const out = coalesceEvents([
    ev({ created_at: at(0),      action_id: 1 }),
    ev({ created_at: at(10_000), action_id: 2 }),
  ]);
  assert.equal(out.length, 2);
});

test('reopened is never folded into a group', () => {
  const out = coalesceEvents([
    ev({ created_at: at(0) }),
    ev({ created_at: at(5_000), event_type: 'reopened', field: null }),
    ev({ created_at: at(9_000), field: 'refund_done' }),
  ]);
  assert.equal(out.length, 3, 'reopen must stand alone and break the run');
  assert.equal(out[1].standalone, true);
});

test('out-of-order input is sorted before grouping', () => {
  const out = coalesceEvents([
    ev({ id: 20, created_at: at(60_000), field: 'return_received' }),
    ev({ id: 10, created_at: at(0),      field: 'return_created' }),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].created_at, at(0), 'entry is stamped with its earliest event');
});

test('entry keeps the author for display', () => {
  const [entry] = coalesceEvents([ev({ user_name: 'Priya' })]);
  assert.equal(entry.user_name, 'Priya');
});

test('empty and undefined input are safe', () => {
  assert.deepEqual(coalesceEvents([]), []);
  assert.deepEqual(coalesceEvents(), []);
});

test('unattributed events (user_id null) group together', () => {
  const out = coalesceEvents([
    ev({ created_at: at(0),      user_id: null, user_name: null }),
    ev({ created_at: at(20_000), user_id: null, user_name: null, field: 'return_received' }),
  ]);
  assert.equal(out.length, 1);
});

console.log('\ndescribeEvent — wording');
test('created and closed name the action type', () => {
  assert.equal(describeEvent(ev({ event_type: 'created', field: null })), 'Return logged');
  assert.equal(describeEvent(ev({ event_type: 'closed',  field: null })), 'Return closed');
});
test('check uses the schema label', () => {
  assert.equal(describeEvent(ev({ event_type: 'check', field: 'return_received' })), 'Return received');
});
test('uncheck reads as undone', () => {
  assert.equal(describeEvent(ev({ event_type: 'uncheck', field: 'refund_done' })), 'Refund done undone');
});
test('field shows the new value, or says cleared', () => {
  assert.equal(
    describeEvent(ev({ event_type: 'field', field: 'refund_id', new_value: 'RF-991' })),
    'Refund ID → RF-991'
  );
  assert.equal(
    describeEvent(ev({ event_type: 'field', field: 'refund_id', new_value: null })),
    'Refund ID cleared'
  );
});
test('reopened has its own wording', () => {
  assert.equal(
    describeEvent(ev({ event_type: 'reopened', field: null })),
    'Reopened — action progress recorded'
  );
});

console.log('\nfieldLabel — unknown keys degrade rather than throw');
test('a column not in the schema becomes readable text', () => {
  assert.equal(fieldLabel('return', 'some_legacy_column'), 'Some Legacy Column');
});
test('an unknown action type does not throw', () => {
  assert.equal(fieldLabel('not_a_type', 'refund_done'), 'Refund Done');
});
test('null field returns null', () => {
  assert.equal(fieldLabel('return', null), null);
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
