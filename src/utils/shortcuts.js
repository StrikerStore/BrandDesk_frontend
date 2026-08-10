/**
 * The one place keyboard shortcuts are described for display.
 *
 * The handlers themselves stay where they belong (the sidebar owns j/k, the
 * editor owns send), so this registry can drift from reality. `implementedIn`
 * names the file and the literal its handler matches on, and shortcuts.test.mjs
 * asserts that literal is still there — a rebinding fails the test instead of
 * quietly making the guide lie.
 *
 * Every entry below was read out of the source or, for the editor bindings,
 * out of the installed Tiptap extensions. Nothing here is assumed.
 */

// `navigator.platform` is deprecated but still the most reliable signal;
// userAgentData is preferred where it exists.
export const IS_MAC = (() => {
  if (typeof navigator === 'undefined') return false;
  const p = navigator.userAgentData?.platform || navigator.platform || '';
  return /mac|iphone|ipad|ipod/i.test(p);
})();

/** '⌘' on Apple hardware, 'Ctrl' everywhere else. */
export const modKey = () => (IS_MAC ? '⌘' : 'Ctrl');

const KEY_LABELS = {
  Enter: () => (IS_MAC ? '↵' : 'Enter'),
  Shift: () => (IS_MAC ? '⇧' : 'Shift'),
  Alt:   () => (IS_MAC ? '⌥' : 'Alt'),
  Mod:   () => modKey(),
  Up:    () => '↑',
  Down:  () => '↓',
};

/**
 * 'Mod+Enter' → '⌘↵' on Mac, 'Ctrl+Enter' elsewhere.
 * Mac stacks the glyphs; other platforms join with '+', which is what those
 * keyboards are labelled like.
 */
export function formatShortcut(combo) {
  const parts = String(combo).split('+').map(p => (KEY_LABELS[p] ? KEY_LABELS[p]() : p));
  return IS_MAC ? parts.join('') : parts.join('+');
}

const SRC = 'src';

export const SHORTCUT_GROUPS = [
  {
    group: 'Anywhere',
    items: [
      { keys: ['Mod+K'], label: 'Open the command palette',
        note: 'Jump to any page, filtered view, or ticket by customer, ticket id or order number.',
        implementedIn: { file: `${SRC}/layouts/AppShell.jsx`, contains: "=== 'k'" } },
      { keys: ['Mod+\\'], label: 'Show or hide the customer panel',
        note: 'Desktop only — on a phone the panel is a sheet.',
        implementedIn: { file: `${SRC}/pages/InboxPage.jsx`, contains: "=== '\\\\'" } },
      { keys: ['Esc'], label: 'Close the topmost dialog, menu or sheet',
        implementedIn: { file: `${SRC}/ui/Modal.jsx`, contains: "'Escape'" } },
    ],
  },
  {
    group: 'Ticket list',
    note: 'Active when you are not typing in a field.',
    items: [
      { keys: ['/'], label: 'Focus search',
        implementedIn: { file: `${SRC}/components/Sidebar/Sidebar.jsx`, contains: "=== '/'" } },
      { keys: ['j'], label: 'Next ticket',
        implementedIn: { file: `${SRC}/components/Sidebar/Sidebar.jsx`, contains: "'j'" } },
      { keys: ['k'], label: 'Previous ticket',
        implementedIn: { file: `${SRC}/components/Sidebar/Sidebar.jsx`, contains: "'k'" } },
      { keys: ['Enter'], label: 'Open the first ticket',
        note: 'When nothing is selected yet.',
        implementedIn: { file: `${SRC}/components/Sidebar/Sidebar.jsx`, contains: "=== 'Enter'" } },
      { keys: ['Esc'], label: 'Clear search', note: 'While the search field has focus.',
        implementedIn: { file: `${SRC}/components/Sidebar/Sidebar.jsx`, contains: 'clearSearch' } },
    ],
  },
  {
    group: 'Writing a reply',
    items: [
      { keys: ['Mod+Enter'], label: 'Send the reply, or save the note',
        implementedIn: { file: `${SRC}/ui/RichEditor.jsx`, contains: "'Mod-Enter'" } },
      { keys: ['/'], label: 'Open templates', note: 'On an empty composer.',
        implementedIn: { file: `${SRC}/ui/RichEditor.jsx`, contains: "'/'" } },
      { keys: ['Mod+B'], label: 'Bold' },
      { keys: ['Mod+I'], label: 'Italic' },
      { keys: ['Mod+U'], label: 'Underline' },
      { keys: ['Mod+Z'], label: 'Undo' },
      { keys: ['Mod+Shift+Z'], label: 'Redo' },
      { keys: ['Shift+Enter'], label: 'Line break without sending' },
      { keys: ['Mod+Shift+8'], label: 'Bulleted list' },
      { keys: ['Mod+Shift+7'], label: 'Numbered list' },
    ],
  },
  {
    group: 'Menus and pickers',
    items: [
      { keys: ['Up', 'Down'], label: 'Move through options',
        implementedIn: { file: `${SRC}/ui/Menu.jsx`, contains: "'ArrowDown'" } },
      { keys: ['Enter'], label: 'Choose the highlighted option',
        implementedIn: { file: `${SRC}/ui/Menu.jsx`, contains: "'Enter'" } },
      { keys: ['Home', 'End'], label: 'Jump to first or last option',
        implementedIn: { file: `${SRC}/ui/Menu.jsx`, contains: "'Home'" } },
      { keys: ['Esc'], label: 'Close without choosing',
        implementedIn: { file: `${SRC}/ui/Menu.jsx`, contains: "'Escape'" } },
    ],
  },
  {
    group: 'Inline fields',
    note: 'Action details, tags, the link dialog and the order-id correction.',
    items: [
      { keys: ['Enter'], label: 'Save' },
      { keys: ['Esc'], label: 'Cancel and restore the previous value' },
      { keys: ['Mod+Enter'], label: 'Save a multi-line field' },
    ],
  },
];

/** Flat list, handy for tests and search. */
export const allShortcuts = () =>
  SHORTCUT_GROUPS.flatMap(g => g.items.map(i => ({ ...i, group: g.group })));
