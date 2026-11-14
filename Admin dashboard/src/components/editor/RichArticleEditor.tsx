import React from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import LinkExtension from '@tiptap/extension-link';
import ImageExtension from '@tiptap/extension-image';
import {
  Bold,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
} from 'lucide-react';
import { ar } from '../../i18n/ar';
import { api } from '../../data';
import { AppError } from '../../lib/errors';
import { useNotify } from '../../hooks/useNotify';

export function RichArticleEditor({
  initialJson,
  initialHtml,
  onChange,
}: {
  initialJson: Record<string, unknown> | null;
  initialHtml: string | null;
  onChange: (payload: { json: Record<string, unknown>; html: string }) => void;
}) {
  const notify = useNotify();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      LinkExtension.configure({
        openOnClick: false,
        validate: (href) => href.startsWith('https://'),
      }),
      ImageExtension,
    ],
    content: initialJson && Object.keys(initialJson).length > 0 ? initialJson : initialHtml || '<p></p>',
    onUpdate: ({ editor: ed }) => {
      onChange({
        json: ed.getJSON() as Record<string, unknown>,
        html: ed.getHTML(),
      });
    },
  });

  const handleImageFile = async (file: File) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      notify.error(new AppError('FILE_TYPE_NOT_ALLOWED'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      notify.error(new AppError('FILE_TOO_LARGE'));
      return;
    }

    setUploading(true);
    try {
      const { publicUrl } = await api.uploadContentMedia(file);
      editor?.chain().focus().setImage({ src: publicUrl, alt: file.name }).run();
      notify.success('تم رفع الصورة وإدراجها في المقال');
    } catch (e) {
      notify.error(e);
    } finally {
      setUploading(false);
    }
  };

  const handleAddLink = () => {
    const url = window.prompt('أدخل الرابط الآمن (https://):', 'https://');
    if (!url) return;
    if (!url.trim().startsWith('https://')) {
      notify.error(new AppError('LINK_MUST_BE_HTTPS'));
      return;
    }
    editor?.chain().focus().setLink({ href: url.trim() }).run();
  };

  if (!editor) return null;

  const btnCls = (active: boolean) =>
    `rounded p-1.5 text-xs transition-colors cursor-pointer ${
      active ? 'bg-g700 text-white' : 'text-slate-700 hover:bg-slate-200'
    }`;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-300 bg-white">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={btnCls(editor.isActive('heading', { level: 2 }))}
          aria-label="عنوان رئيسي H2"
        >
          <Heading2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={btnCls(editor.isActive('heading', { level: 3 }))}
          aria-label="عنوان فرعي H3"
        >
          <Heading3 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={btnCls(editor.isActive('bold'))}
          aria-label="خط عريض"
        >
          <Bold className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={btnCls(editor.isActive('italic'))}
          aria-label="خط مائل"
        >
          <Italic className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={btnCls(editor.isActive('bulletList'))}
          aria-label="قائمة نقطية"
        >
          <List className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={btnCls(editor.isActive('orderedList'))}
          aria-label="قائمة مرقمة"
        >
          <ListOrdered className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={btnCls(editor.isActive('blockquote'))}
          aria-label="اقتباس"
        >
          <Quote className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleAddLink}
          className={btnCls(editor.isActive('link'))}
          aria-label="إدراج رابط HTTPS"
        >
          <LinkIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-g700 hover:bg-g50 cursor-pointer"
          aria-label={ar.content.uploadImage}
        >
          <ImageIcon className="h-4 w-4" />
          <span>{uploading ? 'جارٍ الرفع...' : ar.content.uploadImage}</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleImageFile(file);
            e.target.value = '';
          }}
        />
        <span className="mr-auto text-[11px] text-slate-500">{ar.content.uploadHint}</span>
      </div>

      <div className="p-4">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
