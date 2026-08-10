/**
 * Shortcut registry — run with:  node src/utils/shortcuts.test.mjs
 *
 * The guide's failure mode is going stale: someone rebinds a key and the Help
 * page keeps advertising the old one. Nothing else in the codebase would
 * notice, so the drift check below is the point of this file.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log(`  ok   ${name}`); }
  catch (err) { fail++; console.log(`  FAIL ${name}\n       ${err.message}`); }
};

// Platform is decided at import time, so each case needs a fresh module.
// Node >=21 ships its own `navigator` as a getter-only global, so plain
// assignment throws — redefine the property instead.
async function loadFor(platform) {
  Object.defineProperty(globalThis, 'navigator', {
    value: { platform, userAgentData: undefined },
    configurable: true,
    writable: true,
  });
  return import(`./shortcuts.js?p=${encodeURIComponent(platform)}`);
}

const mac = await loadFor('MacIntel');
const win = await loadFor('Win32');

console.log('\nplatform formatting');
test('mod key is ⌘ on Apple hardware and Ctrl elsewhere', () => {
  assert.equal(mac.modKey(), '⌘');
  assert.equal(win.modKey(), 'Ctrl');
});
test('Mod+Enter renders per platform', () => {
  assert.equal(mac.formatShortcut('Mod+Enter'), '⌘↵');
  assert.equal(win.formatShortcut('Mod+Enter'), 'Ctrl+Enter');
});
test('multi-modifier combos render per platform', () => {
  assert.equal(mac.formatShortcut('Mod+Shift+Z'), '⌘⇧Z');
  assert.equal(win.formatShortcut('Mod+Shift+Z'), 'Ctrl+Shift+Z');
});
test('bare keys pass through untouched', () => {
  assert.equal(win.formatShortcut('/'), '/');
  assert.equal(win.formatShortcut('Esc'), 'Esc');
  assert.equal(mac.formatShortcut('Up'), '↑');
});

console.log('\nregistry shape');
test('every entry has keys and a label', () => {
  for (const s of win.allShortcuts()) {
    assert.ok(Array.isArray(s.keys) && s.keys.length, `${s.label}: missing keys`);
    assert.ok(s.label && s.label.trim(), `${JSON.stringify(s.keys)}: missing label`);
  }
});
test('no duplicate key within a group', () => {
  for (const g of win.SHORTCUT_GROUPS) {
    const seen = new Set();
    for (const i of g.items) {
      const k = i.keys.join('+');
      assert.ok(!seen.has(k), `${g.group}: "${k}" listed twice`);
      seen.add(k);
    }
  }
});
test('groups are non-empty and uniquely named', () => {
  const names = win.SHORTCUT_GROUPS.map(g => g.group);
  assert.equal(new Set(names).size, names.length, 'duplicate group name');
  for (const g of win.SHORTCUT_GROUPS) assert.ok(g.items.length, `${g.group} is empty`);
});

console.log('\ndrift against the real handlers');
test('every claimed implementation file exists', () => {
  for (const s of win.allShortcuts()) {
    if (!s.implementedIn) continue;
    const f = path.join(ROOT, s.implementedIn.file);
    assert.ok(fs.existsSync(f), `${s.label}: ${s.implementedIn.file} is gone`);
  }
});
test('each handler still matches on the literal the guide claims', () => {
  const missing = [];
  for (const s of win.allShortcuts()) {
    if (!s.implementedIn) continue;
    const src = fs.readFileSync(path.join(ROOT, s.implementedIn.file), 'utf8');
    if (!src.includes(s.implementedIn.contains)) {
      missing.push(`${s.group} › ${s.label}: ${s.implementedIn.file} no longer contains ${s.implementedIn.contains}`);
    }
  }
  assert.equal(missing.length, 0, '\n       ' + missing.join('\n       '));
});

console.log('\neditor bindings match the installed Tiptap extensions');
test('Mod-Enter is ours, not HardBreak’s', () => {
  // StarterKit's HardBreak binds Mod-Enter to "insert a line break". Our
  // ComposerKeys extension must outrank it, or sending inserts a stray <br>.
  const src = fs.readFileSync(path.join(ROOT, 'src/ui/RichEditor.jsx'), 'utf8');
  assert.ok(src.includes("'Mod-Enter'"), 'RichEditor no longer binds Mod-Enter');
  assert.ok(/priority:\s*\d+/.test(src), 'ComposerKeys lost its priority — HardBreak would win');
});
test('advertised editor keys exist in the installed extensions', () => {
  const check = [
    ['@tiptap/extension-bold',      '"Mod-b"'],
    ['@tiptap/extension-italic',    '"Mod-i"'],
    ['@tiptap/extension-underline', '"Mod-u"'],
    ['@tiptap/extensions',          '"Mod-z"'],
    ['@tiptap/extension-list',      '"Mod-Shift-8"'],
  ];
  for (const [pkg, literal] of check) {
    const dist = path.join(ROOT, 'node_modules', pkg, 'dist', 'index.js');
    if (!fs.existsSync(dist)) continue;      // layout differs — skip, don't fail
    const src = fs.readFileSync(dist, 'utf8');
    assert.ok(src.includes(literal), `${pkg} no longer binds ${literal}`);
  }
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
