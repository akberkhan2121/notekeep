import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Highlight from '@tiptap/extension-highlight'
export default function Editor({ html, onChange }: { id: string; html: string; onChange: (html: string, text: string) => void }) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ link: { openOnClick: false } }), TaskList, TaskItem.configure({ nested: true }), Highlight],
    content: html,
    onUpdate: ({ editor }) => onChange(editor.getHTML(), editor.getText()),
  })
  if (!editor) return null
  const B = (label: string, cmd: () => void, active?: boolean, title?: string) =>
    <button type="button" title={title ?? label} className={active ? 'on' : ''} onMouseDown={e => { e.preventDefault(); cmd() }}>{label}</button>
  const c = () => editor.chain().focus()
  return <div className="editor">
    <div className="toolbar" role="toolbar">
      {B('H1', () => c().toggleHeading({ level: 1 }).run(), editor.isActive('heading', { level: 1 }), 'Heading 1')}
      {B('H2', () => c().toggleHeading({ level: 2 }).run(), editor.isActive('heading', { level: 2 }), 'Heading 2')}
      {B('B', () => c().toggleBold().run(), editor.isActive('bold'), 'Bold')}
      {B('I', () => c().toggleItalic().run(), editor.isActive('italic'), 'Italic')}
      {B('U', () => c().toggleUnderline().run(), editor.isActive('underline'), 'Underline')}
      {B('S', () => c().toggleStrike().run(), editor.isActive('strike'), 'Strikethrough')}
      {B('Mark', () => c().toggleHighlight().run(), editor.isActive('highlight'), 'Highlight')}
      {B('• List', () => c().toggleBulletList().run(), editor.isActive('bulletList'), 'Bulleted list')}
      {B('1. List', () => c().toggleOrderedList().run(), editor.isActive('orderedList'), 'Numbered list')}
      {B('☑ Tasks', () => c().toggleTaskList().run(), editor.isActive('taskList'), 'Checklist')}
      {B('</>', () => c().toggleCodeBlock().run(), editor.isActive('codeBlock'), 'Code block')}
      {B('“ ”', () => c().toggleBlockquote().run(), editor.isActive('blockquote'), 'Quote')}
      {B('Link', () => { const u = prompt('URL'); if (u) c().setLink({ href: u }).run(); else c().unsetLink().run() }, editor.isActive('link'))}
      {B('―', () => c().setHorizontalRule().run(), false, 'Divider')}
    </div>
    <EditorContent editor={editor} className="prose" />
  </div>
}
