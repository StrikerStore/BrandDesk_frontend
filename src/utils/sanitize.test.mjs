/**
 * Sanitiser tests — run with:  node src/utils/sanitize.test.mjs
 *
 * These cover the XSS path that existed while outbound message bodies went
 * through dangerouslySetInnerHTML straight from a raw contentEditable.
 */
import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';

// DOMPurify needs a window; give it one before importing the module.
const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.DocumentFragment = dom.window.DocumentFragment;

const { sanitizeEmailHtml, sanitizeComposerHtml, escapeHtml, isEmptyHtml, linkifyUrls } =
  await import('./sanitize.js');

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log(`  ok   ${name}`); }
  catch (err) { fail++; console.log(`  FAIL ${name}\n       ${err.message}`); }
};

console.log('\nsanitizeEmailHtml — script execution');
test('strips <script>', () => {
  assert.ok(!sanitizeEmailHtml('<p>hi</p><script>steal()</script>').includes('script'));
});
test('strips inline event handlers', () => {
  const out = sanitizeEmailHtml('<p onclick="steal()">hi</p>');
  assert.ok(!out.includes('onclick'), out);
  assert.ok(out.includes('hi'));
});
test('strips javascript: hrefs', () => {
  const out = sanitizeEmailHtml('<a href="javascript:steal()">click</a>');
  assert.ok(!out.includes('javascript:'), out);
});
test('strips data: URIs', () => {
  const out = sanitizeEmailHtml('<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>');
  assert.ok(!out.includes('data:'), out);
});
test('strips <iframe>', () => {
  assert.ok(!sanitizeEmailHtml('<iframe src="https://evil.test"></iframe>').includes('iframe'));
});
test('strips svg onload payloads', () => {
  const out = sanitizeEmailHtml('<svg><animate onbegin=steal() attributeName=x></svg>');
  assert.ok(!out.includes('onbegin'), out);
});
test('strips <img onerror>', () => {
  const out = sanitizeEmailHtml('<img src=x onerror=steal()>');
  assert.ok(!out.includes('onerror'), out);
});

console.log('\nsanitizeEmailHtml — layout hijacking');
test('drops style attributes', () => {
  const out = sanitizeEmailHtml('<p style="position:fixed;inset:0;z-index:9999">x</p>');
  assert.ok(!out.includes('style'), out);
});
test('drops <style> blocks', () => {
  assert.ok(!sanitizeEmailHtml('<style>body{display:none}</style><p>x</p>').includes('<style'));
});

console.log('\nsanitizeEmailHtml — legitimate content survives');
test('keeps basic formatting', () => {
  const out = sanitizeEmailHtml('<p>Hi <strong>Rahul</strong>, your <em>order</em> shipped.</p>');
  assert.ok(out.includes('<strong>Rahul</strong>'), out);
  assert.ok(out.includes('<em>order</em>'), out);
});
test('keeps lists and tables', () => {
  const out = sanitizeEmailHtml('<ul><li>a</li></ul><table><tr><td>b</td></tr></table>');
  assert.ok(out.includes('<li>a</li>'), out);
  assert.ok(out.includes('<td>b</td>'), out);
});
test('keeps https links and hardens them', () => {
  const out = sanitizeEmailHtml('<a href="https://track.test/1">Track</a>');
  assert.ok(out.includes('href="https://track.test/1"'), out);
  assert.ok(out.includes('target="_blank"'), out);
  assert.ok(out.includes('noopener'), out);
});
test('keeps mailto and tel', () => {
  assert.ok(sanitizeEmailHtml('<a href="mailto:a@b.com">m</a>').includes('mailto:'));
  assert.ok(sanitizeEmailHtml('<a href="tel:+911234">t</a>').includes('tel:'));
});
test('unwraps disallowed tags but keeps their text', () => {
  assert.ok(sanitizeEmailHtml('<marquee>important</marquee>').includes('important'));
});

console.log('\nsanitizeComposerHtml — stricter schema');
test('drops headings the editor cannot produce', () => {
  const out = sanitizeComposerHtml('<h1>Big</h1>');
  assert.ok(!out.includes('<h1'), out);
  assert.ok(out.includes('Big'), out);
});
test('drops pasted tables', () => {
  const out = sanitizeComposerHtml('<table><tr><td>x</td></tr></table>');
  assert.ok(!out.includes('<table'), out);
});
test('drops Gmail wrapper divs and spans', () => {
  const out = sanitizeComposerHtml('<div class="gmail_quote"><span style="color:red">hi</span></div>');
  assert.ok(!out.includes('<div'), out);
  assert.ok(!out.includes('<span'), out);
  assert.ok(out.includes('hi'), out);
});
test('keeps the marks the toolbar offers', () => {
  const out = sanitizeComposerHtml('<p><strong>a</strong><em>b</em><u>c</u></p>');
  assert.ok(out.includes('<strong>a</strong>'), out);
  assert.ok(out.includes('<em>b</em>'), out);
  assert.ok(out.includes('<u>c</u>'), out);
});

console.log('\nhelpers');
test('escapeHtml neutralises tags and quotes', () => {
  assert.equal(escapeHtml('<b>"x"</b>'), '&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
});
test('isEmptyHtml recognises blank editor output', () => {
  assert.equal(isEmptyHtml('<p></p>'), true);
  assert.equal(isEmptyHtml('<p><br></p>'), true);
  assert.equal(isEmptyHtml('<p>&nbsp;</p>'), true);
  assert.equal(isEmptyHtml(''), true);
  assert.equal(isEmptyHtml('<p>hi</p>'), false);
});

// linkifyUrls runs on escaped template text so a payment link the customer is
// asked to click actually arrives as a link. It only ever sees escapeHtml
// output, so every case below is escaped first, as in ThreadPanel.
console.log('\nlinkifyUrls');
test('wraps a bare https URL', () => {
  const out = linkifyUrls(escapeHtml('Pay here: https://pay.example.com/abc123'));
  assert.equal(out, 'Pay here: <a href="https://pay.example.com/abc123">https://pay.example.com/abc123</a>');
});
test('keeps query strings intact through escaping', () => {
  const out = linkifyUrls(escapeHtml('https://pay.example.com/l?id=7&token=xy'));
  assert.equal(out, '<a href="https://pay.example.com/l?id=7&amp;token=xy">https://pay.example.com/l?id=7&amp;token=xy</a>');
});
test('leaves trailing sentence punctuation outside the link', () => {
  const out = linkifyUrls(escapeHtml('Use https://pay.example.com/x.'));
  assert.ok(out.endsWith('</a>.'), out);
  assert.ok(!out.includes('/x.</a>'), out);
});
test('does not swallow a following apostrophe', () => {
  const out = linkifyUrls(escapeHtml("https://pay.example.com/x's fine"));
  assert.ok(out.includes('>https://pay.example.com/x</a>'), out);
});
test('ignores non-http schemes', () => {
  assert.equal(linkifyUrls(escapeHtml('javascript:alert(1)')), 'javascript:alert(1)');
});
test('a quote cannot break out of the href attribute', () => {
  // The escaped quote must terminate the URL match, not be absorbed into it —
  // otherwise the payload would land inside href="..." as live markup.
  const out = linkifyUrls(escapeHtml('https://a.test/"><img src=x onerror=y>'));
  assert.equal(out, '<a href="https://a.test/">https://a.test/</a>&quot;&gt;&lt;img src=x onerror=y&gt;');
  assert.ok(!out.includes('<img'), out);
  assert.equal(sanitizeComposerHtml(out).includes('<img'), false);
});
test('the result survives the composer sanitiser as a link', () => {
  const html = linkifyUrls(escapeHtml('https://pay.example.com/abc'));
  const out = sanitizeComposerHtml(html);
  assert.ok(out.includes('href="https://pay.example.com/abc"'), out);
  assert.ok(out.includes('rel="noopener noreferrer nofollow"'), out);
});
test('empty input is safe', () => {
  assert.equal(linkifyUrls(''), '');
  assert.equal(linkifyUrls(undefined), '');
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
