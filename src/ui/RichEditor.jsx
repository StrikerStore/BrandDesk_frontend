import { forwardRef, useImperativeHandle, useEffect, useRef } from 'react';
import { useEditor, EditorContent, Extension } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';
import { sanitizeComposerHtml } from '../utils/sanitize.js';
import styles from './RichEditor.module.css';

/**
 * Send and templates, bound inside ProseMirror's own keymap.
 *
 * These used to live on a wrapping `onKeyDown`, which fires *after* the
 * editor has already handled the key. StarterKit's HardBreak claims
 * `Mod-Enter` for "insert a line break", so Ctrl/Cmd+Enter inserted a <br>
 * and *then* sent — every keyboard-sent reply carried a stray trailing break.
 * Registering here with a higher priority means our handler wins and returns
 * true, so HardBreak never runs.
 *
 * The handlers are read from a ref so rebinding never recreates the editor.
 */
const ComposerKeys = Extension.create({
  name: 'composerKeys',
  priority: 1000,
  addOptions: () => ({ handlers: { current: {} } }),
  addKeyboardShortcuts() {
    const get = () => this.options.handlers.current || {};
    return {
      'Mod-Enter': () => { get().onSubmit?.(); return true; },
      '/': () => {
        if (!this.editor.isEmpty) return false;   // only on an empty composer
        get().onSlash?.();
        return true;
      },
    };
  },
});

/**
 * Composer editor.
 *
 * Replaces a raw contentEditable driven by document.execCommand, which was
 * deprecated, behaved differently per browser, had no undo integration with
 * React, and — worst — accepted pasted HTML verbatim so whatever came off the
 * clipboard went out in the customer's email.
 *
 * ProseMirror's schema is the allowlist: anything the schema does not know is
 * dropped on the way in, whatever the source. `transformPastedHTML` runs our
 * own sanitiser first so obviously hostile markup never reaches the parser.
 *
 * The document is the single source of truth — there is no shadow plain-text
 * state that can drift out of sync with the HTML being sent.
 */
const RichEditor = forwardRef(function RichEditor(
  { placeholder, isNote, expanded, onChange, onSubmit, onSlash },
  ref
) {
  // Kept current every render so the keymap always calls today's handlers
  // without the editor being torn down and rebuilt.
  const handlers = useRef({ onSubmit, onSlash });
  handlers.current = { onSubmit, onSlash };

  const editor = useEditor({
    extensions: [
      ComposerKeys.configure({ handlers }),
      StarterKit.configure({
        // Email replies don't need block structure beyond lists and quotes.
        heading: false,
        horizontalRule: false,
        codeBlock: false,
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: 'https',
          HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
        },
      }),
      Placeholder.configure({ placeholder: () => placeholder || '' }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: styles.content,
        'aria-label': isNote ? 'Internal note' : 'Reply to customer',
      },
      // Belt and braces: sanitise before ProseMirror parses, then let the
      // schema drop anything else it doesn't recognise.
      transformPastedHTML: (html) => sanitizeComposerHtml(html),
    },
    onUpdate: ({ editor }) => onChange?.(editor.getText()),
  });

  // Keep the placeholder in step with the reply/note switch.
  useEffect(() => {
    if (!editor) return;
    editor.view.dispatch(editor.state.tr);      // repaint decorations
  }, [placeholder, editor]);

  useImperativeHandle(ref, () => ({
    focus:      () => editor?.chain().focus().run(),
    isEmpty:    () => !editor || editor.isEmpty,
    getHTML:    () => (editor ? sanitizeComposerHtml(editor.getHTML()) : ''),
    getText:    () => editor?.getText() ?? '',
    setHTML:    (html) => editor?.commands.setContent(sanitizeComposerHtml(html), { emitUpdate: true }),
    clear:      () => editor?.commands.clearContent(true),
    toggleBold:      () => editor?.chain().focus().toggleBold().run(),
    toggleItalic:    () => editor?.chain().focus().toggleItalic().run(),
    toggleUnderline: () => editor?.chain().focus().toggleUnderline().run(),
    toggleBullet:    () => editor?.chain().focus().toggleBulletList().run(),
    setLink: (url) => {
      if (!editor) return;
      if (!url) { editor.chain().focus().unsetLink().run(); return; }
      const href = /^[a-z]+:/i.test(url) ? url : `https://${url}`;
      editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    },
    isActive: (name) => !!editor?.isActive(name),
  }), [editor]);

  // Send and `/` are handled by the ComposerKeys extension above, inside
  // ProseMirror's keymap, so they take priority over the editor's own bindings.
  return (
    <div className={`${styles.wrap} ${isNote ? styles.wrapNote : ''} ${expanded ? styles.wrapExpanded : ''}`}>
      <EditorContent editor={editor} className={styles.editor} />
    </div>
  );
});

export default RichEditor;
