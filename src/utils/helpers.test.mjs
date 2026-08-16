/**
 * Template variable tests — run with:  node src/utils/helpers.test.mjs
 *
 * `resolveTemplate` is a hand-written chain of exact-match, case-sensitive
 * replaces, and the list of tokens it knows is written down again in the
 * TemplateEditor chips an agent clicks. When those two disagree the failure is
 * silent and customer-facing: the email goes out with a literal "{{foo}}" in it.
 * The drift check below is the point of this file.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTemplate } from './helpers.js';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log(`  ok   ${name}`); }
  catch (err) { fail++; console.log(`  FAIL ${name}\n       ${err.message}`); }
};

/** The chips offered in the template editor, read straight from the source. */
function advertisedVariables() {
  const src = fs.readFileSync(path.join(SRC, 'components/Templates/TemplateEditor.jsx'), 'utf8');
  const line = src.match(/const VARIABLES\s*=\s*\[([^\]]*)\]/);
  assert.ok(line, 'could not find the VARIABLES list in TemplateEditor.jsx');
  return [...line[1].matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]);
}

console.log('\nadvertised vs resolved');
test('every variable the editor offers is actually substituted', () => {
  const names = advertisedVariables();
  assert.ok(names.length >= 8, `expected the full chip list, got ${names.length}`);

  // Fully-populated context: nothing should fall through to a placeholder, and
  // no token should survive as literal text.
  const vars = {
    customerName: 'Asha', orderId: 'DS4334', ticketId: 'STKR-1',
    trackingUrl: 'https://track.test/1', trackingLink: 'https://track.test/1',
    amount: '₹499', paymentLink: 'https://pay.test/abc', brand: 'Striker Store',
  };
  for (const name of names) {
    const out = resolveTemplate(`[${name}] -> {{${name}}}`, vars);
    assert.ok(!out.includes(`{{${name}}}`), `{{${name}}} is offered as a chip but never resolved`);
  }
});

console.log('\npayment_link');
test('resolves to the link when one is supplied', () => {
  assert.equal(
    resolveTemplate('Pay: {{payment_link}}', { paymentLink: 'https://pay.test/abc' }),
    'Pay: https://pay.test/abc'
  );
});
test('falls back to a visible placeholder, never a raw token', () => {
  const out = resolveTemplate('Pay: {{payment_link}}', {});
  assert.equal(out, 'Pay: [payment link]');
  assert.ok(!out.includes('{{'), out);
});
test('replaces every occurrence, not just the first', () => {
  assert.equal(
    resolveTemplate('{{payment_link}} and {{payment_link}}', { paymentLink: 'x' }),
    'x and x'
  );
});
test('an unknown token is left alone rather than mangled', () => {
  assert.equal(resolveTemplate('{{nope}}', {}), '{{nope}}');
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
