import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Highlight from '@tiptap/extension-highlight'
import { Heading1, Heading2, Bold, Italic, Underline, Strikethrough, Highlighter, List, ListOrdered, ListChecks, Code2, Quote, Link, Minus } from 'lucide-react'
import type { ReactNode } from 'react'
export default function Editor({ html, onChange }: { html: string; onChange: (html: string, text: string) => void }) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ link: { openOnClick: false } }), TaskList, TaskItem.configure({ nested: true }), Highlight],
    content: html,
    onUpdate: ({ editor }) => onChange(editor.getHTML(), editor.getText()),
  })
  if (!editor) return null
  const B = (icon: ReactNode, title: string, cmd: () => void, active?: boolean) =>
    <button type="button" title={title} aria-label={title} className={active ? 'on' : ''} onMouseDown={e => { e.preventDefault(); cmd() }}>{icon}</button>
  const c = () => editor.chain().focus(); const s = 16
  return <div className="editor">
    <div className="toolbar" role="toolbar">
      {B(<Heading1 size={s} />, 'Heading 1', () => c().toggleHeading({ level: 1 }).run(), editor.isActive('heading', { level: 1 }))}
      {B(<Heading2 size={s} />, 'Heading 2', () => c().toggleHeading({ level: 2 }).run(), editor.isActive('heading', { level: 2 }))}
      <i className="sep" />
      {B(<Bold size={s} />, 'Bold', () => c().toggleBold().run(), editor.isActive('bold'))}
      {B(<Italic size={s} />, 'Italic', () => c().toggleItalic().run(), editor.isActive('italic'))}
      {B(<Underline size={s} />, 'Underline', () => c().toggleUnderline().run(), editor.isActive('underline'))}
      {B(<Strikethrough size={s} />, 'Strikethrough', () => c().toggleStrike().run(), editor.isActive('strike'))}
      {B(<Highlighter size={s} />, 'Highlight', () => c().toggleHighlight().run(), editor.isActive('highlight'))}
      <i className="sep" />
      {B(<List size={s} />, 'Bulleted list', () => c().toggleBulletList().run(), editor.isActive('bulletList'))}
      {B(<ListOrdered size={s} />, 'Numbered list', () => c().toggleOrderedList().run(), editor.isActive('orderedList'))}
      {B(<ListChecks size={s} />, 'Checklist', () => c().toggleTaskList().run(), editor.isActive('taskList'))}
      <i className="sep" />
      {B(<Code2 size={s} />, 'Code block', () => c().toggleCodeBlock().run(), editor.isActive('codeBlock'))}
      {B(<Quote size={s} />, 'Quote', () => c().toggleBlockquote().run(), editor.isActive('blockquote'))}
      {B(<Link size={s} />, 'Link', () => { const u = prompt('URL'); if (u) c().setLink({ href: u }).run(); else c().unsetLink().run() }, editor.isActive('link'))}
      {B(<Minus size={s} />, 'Divider', () => c().setHorizontalRule().run())}
    </div>
    <EditorContent editor={editor} className="prose" />
  </div>
}
