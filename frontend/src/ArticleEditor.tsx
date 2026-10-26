import { useEffect, useRef, useState } from 'react';
import { toast } from './toast';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { safeArticleHtml } from './article-html';
function escapePlain(text: string) {
  return text
    .split('\n')
    .map(
      (line) => `<p>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`,
    )
    .join('');
}
export function ArticleEditor({
  body,
  format,
  onChange,
  disabled = false,
}: {
  body: string;
  format?: string;
  onChange?: (html: string) => void;
  disabled?: boolean;
}) {
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState('');
  const editor = useEditor({
    immediatelyRender: false,
    onUpdate: ({ editor }) => changeRef.current?.(editor.getHTML()),
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: {
          openOnClick: false,
          protocols: ['http', 'https', 'mailto'],
          HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer nofollow ugc' },
        },
      }),
    ],
    content: format === 'HTML' ? safeArticleHtml(body) : escapePlain(body),
    editorProps: {
      attributes: { role: 'textbox', 'aria-label': 'Article text', 'aria-multiline': 'true' },
    },
  });
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e && !e.isDestroyed && e.schema
        ? {
            html: e.getHTML(),
            bold: e.isActive('bold'),
            italic: e.isActive('italic'),
            h2: e.isActive('heading', { level: 2 }),
            h3: e.isActive('heading', { level: 3 }),
            bullet: e.isActive('bulletList'),
            ordered: e.isActive('orderedList'),
            quote: e.isActive('blockquote'),
          }
        : null,
  });
  useEffect(() => {
    editor?.setEditable(!disabled, false);
  }, [editor, disabled]);
  if (!editor || editor.isDestroyed || !editor.schema) return <p>Loading editor…</p>;
  const tools: [string, () => void, boolean?][] = [
    [
      'Bold',
      () => {
        editor.chain().focus().toggleBold().run();
      },
      state?.bold,
    ],
    [
      'Italic',
      () => {
        editor.chain().focus().toggleItalic().run();
      },
      state?.italic,
    ],
    [
      'Heading 2',
      () => {
        editor.chain().focus().toggleHeading({ level: 2 }).run();
      },
      state?.h2,
    ],
    [
      'Heading 3',
      () => {
        editor.chain().focus().toggleHeading({ level: 3 }).run();
      },
      state?.h3,
    ],
    [
      'Bullet list',
      () => {
        editor.chain().focus().toggleBulletList().run();
      },
      state?.bullet,
    ],
    [
      'Numbered list',
      () => {
        editor.chain().focus().toggleOrderedList().run();
      },
      state?.ordered,
    ],
    [
      'Quote',
      () => {
        editor.chain().focus().toggleBlockquote().run();
      },
      state?.quote,
    ],
    [
      'Link',
      () => {
        setLinkValue(editor.getAttributes('link').href ?? '');
        setLinkOpen(true);
      },
    ],
    [
      'Remove link',
      () => {
        editor.chain().focus().unsetLink().run();
      },
    ],
    [
      'Undo',
      () => {
        editor.chain().focus().undo().run();
      },
    ],
    [
      'Redo',
      () => {
        editor.chain().focus().redo().run();
      },
    ],
  ];
  return (
    <div className="rich-editor">
      <div className="editor-toolbar" role="toolbar" aria-label="Article formatting">
        {tools.map(([label, action, active]) => (
          <button
            disabled={disabled}
            key={label}
            type="button"
            aria-label={label}
            aria-pressed={active}
            onClick={action}
          >
            {label}
          </button>
        ))}
      </div>
      {linkOpen && (
        <div className="editor-link-form">
          <label>
            Link address
            <input
              value={linkValue}
              onChange={(e) => setLinkValue(e.target.value)}
              placeholder="https://example.com"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              if (!linkValue.trim()) {
                editor.chain().focus().unsetLink().run();
                setLinkOpen(false);
                return;
              }
              try {
                const url = new URL(linkValue);
                if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) throw Error();
                editor.chain().focus().extendMarkRange('link').setLink({ href: url.href }).run();
                setLinkOpen(false);
              } catch {
                toast('Enter a valid HTTP, HTTPS or mailto address.', 'error');
              }
            }}
          >
            Apply link
          </button>
          <button type="button" onClick={() => setLinkOpen(false)}>
            Cancel link
          </button>
        </div>
      )}
      <EditorContent editor={editor} />
      <input type="hidden" name="body" value={state?.html ?? editor.getHTML()} />
      <p className="form-note">
        Format your story with headings, lists, quotes and links. Drafts save automatically while
        you write.
      </p>
    </div>
  );
}
