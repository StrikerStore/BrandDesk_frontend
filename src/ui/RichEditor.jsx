import { forwardRef, useImperativeHandle, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';
import { sanitizeComposerHtml } from '../utils/sanitize.js';
import styles from './RichEditor.module.css';

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
  const editor = useEditor({
    extensions: [
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

  // ⌘↵ sends; `/` on an empty document opens templates. Both were previously
  // wired onto the contentEditable's keydown.
  const onKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); onSubmit?.(); return; }
    if (e.key === '/' && editor?.isEmpty) { e.preventDefault(); onSlash?.(); }
  };

  return (
    <div
      className={`${styles.wrap} ${isNote ? styles.wrapNote : ''} ${expanded ? styles.wrapExpanded : ''}`}
      onKeyDown={onKeyDown}
    >
      <EditorContent editor={editor} className={styles.editor} />
    </div>
  );
});

export default RichEditor;
