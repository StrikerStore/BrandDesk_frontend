import DOMPurify from 'dompurify';

/**
 * HTML sanitisation for message bodies.
 *
 * Outbound message bodies are rendered with dangerouslySetInnerHTML, and until
 * now that HTML came from a raw contentEditable where any paste — from Gmail,
 * Word, or a crafted page — was stored verbatim. Combined with the JWT sitting
 * in localStorage, that was a credential-theft path, not just a formatting
 * annoyance.
 *
 * Two profiles:
 *   EMAIL    — rendering stored bodies. Historical rows contain whatever the
 *              old editor accepted, so this keeps common email structure but
 *              removes anything executable or layout-hijacking.
 *   COMPOSER — text entering or leaving the composer. Matches the editor
 *              schema exactly, so what you see is what gets sent.
 */

const EMAIL_TAGS = [
  'p', 'br', 'div', 'span',
  'strong', 'b', 'em', 'i', 'u', 's', 'strike',
  'a', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr',
  'table', 'thead', 'tbody', 'tr', 'td', 'th',
];

const COMPOSER_TAGS = [
  'p', 'br', 'strong', 'em', 'u', 's', 'a', 'ul', 'ol', 'li', 'blockquote', 'code',
];

// No `style`: a stored body could otherwise position itself over the app.
// No `class`/`id`: they collide with our own CSS.
const COMMON_ATTR = ['href', 'title', 'target', 'rel'];

const BASE = {
  ALLOWED_ATTR: COMMON_ATTR,
  ALLOW_DATA_ATTR: false,
  ALLOW_ARIA_ATTR: false,
  // javascript:, data:, vbscript: never survive this.
  ALLOWED_URI_REGEXP: /^(?:https?|mailto|tel):/i,
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'link', 'meta', 'base'],
  FORBID_ATTR: ['style', 'srcset', 'formaction', 'background', 'ping'],
  KEEP_CONTENT: true,
  RETURN_DOM: false,
  RETURN_DOM_FRAGMENT: false,
};

let hooked = false;
function ensureHooks(purify) {
  if (hooked) return;
  hooked = true;
  // Any link that survives opens in a new tab and cannot reach back into the
  // opener window.
  purify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && node.getAttribute('href')) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer nofollow');
    }
  });
}

function run(html, tags) {
  if (!html) return '';
  ensureHooks(DOMPurify);
  return DOMPurify.sanitize(String(html), { ...BASE, ALLOWED_TAGS: tags });
}

/** For rendering a stored message body. */
export const sanitizeEmailHtml = (html) => run(html, EMAIL_TAGS);

/** For content entering or leaving the composer. */
export const sanitizeComposerHtml = (html) => run(html, COMPOSER_TAGS);

/** Escape plain text that will be interpolated into HTML (templates). */
export function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** True when the HTML carries no visible content — used to disable Send. */
export function isEmptyHtml(html) {
  if (!html) return true;
  return String(html)
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim().length === 0;
}
