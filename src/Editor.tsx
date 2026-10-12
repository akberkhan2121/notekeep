import { useEditor, EditorContent, type Editor as TEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Highlight from '@tiptap/extension-highlight'
import { TextStyle, FontFamily, FontSize, Color } from '@tiptap/extension-text-style'
import { TableKit } from '@tiptap/extension-table'
import TextAlign from '@tiptap/extension-text-align'
import Image from '@tiptap/extension-image'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import { Indent } from './Indent'
import { ChevronDown, CircleCheck, Undo2, Redo2, ListChecks, List, ListOrdered, Table, Minus, Code2, Quote, Link, Image as ImageIcon, Bold, Italic, Underline, Strikethrough, Highlighter, Palette, Superscript as SupIcon, Subscript as SubIcon, AlignLeft, AlignCenter, AlignRight, Indent as IndentIcon, Outdent, RemoveFormatting, Heading1, Heading2, Heading3, Heading4, Type } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

export const FONTS = [
  { label: 'Sans Serif', value: '' },
  { label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Slab Serif', value: '"Roboto Slab", Rockwell, "Courier Bold", Georgia, serif' },
  { label: 'Monospace', value: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
  { label: 'Handwritten', value: '"Comic Sans MS", "Bradley Hand", "Segoe Print", cursive' },
]
export const SIZES = [8, 9, 10, 12, 14, 15, 16, 18, 20, 24, 30, 36, 48, 64]
export const DEFAULT_SIZE = 15
/** Toolbar sizes are scaled so the default "15" renders at 16px, like the reference. */
export const toPx = (s: number) => +(s * 16 / DEFAULT_SIZE).toFixed(2) + 'px'
export const fromPx = (px: string) => Math.round(parseFloat(px) * DEFAULT_SIZE / 16)
const COLORS = ['#1f1f1f', '#737373', '#d93025', '#e8710a', '#c79100', '#188038', '#1a73e8', '#5565f6', '#9334e6']
const BLOCKS = [
  { label: 'Normal text', icon: <Type size={16} />, level: 0 },
  { label: 'Large header', icon: <Heading1 size={16} />, level: 1 },
  { label: 'Medium header', icon: <Heading2 size={16} />, level: 2 },
  { label: 'Small header', icon: <Heading3 size={16} />, level: 3 },
  { label: 'Extra small header', icon: <Heading4 size={16} />, level: 4 },
] as const

function Drop({ label, title, children, className = '', wide }: { label: ReactNode; title: string; children: (close: () => void) => ReactNode; className?: string; wide?: boolean }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { if (!open) return; const f = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }; document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f) }, [open])
  return <div className={'drop ' + className} ref={ref}>
    <button type="button" className={'tb drop-btn' + (open ? ' open' : '')} title={title} aria-label={title} aria-expanded={open} onMouseDown={e => { e.preventDefault(); setOpen(!open) }}>{label}<ChevronDown size={13} className="cv" /></button>
    {open && <div className={'dmenu' + (wide ? ' wide' : '')} role="menu">{children(() => setOpen(false))}</div>}
  </div>
}
const Item = ({ icon, label, onRun, active, kbd, close }: { icon?: ReactNode; label: string; onRun: () => void; active?: boolean; kbd?: string; close: () => void }) =>
  <button type="button" role="menuitem" className={'mitem' + (active ? ' on' : '')} onMouseDown={e => { e.preventDefault(); onRun(); close() }}>
    <span className="mi-ic">{icon}</span><span className="mi-l">{label}</span>{kbd && <span className="kbd">{kbd}</span>}</button>

function Toolbar({ editor }: { editor: TEditor }) {
  const c = () => editor.chain().focus()
  const ts = editor.getAttributes('textStyle')
  const fam = FONTS.find(f => f.value && ts.fontFamily === f.value) ?? FONTS[0]
  const size = ts.fontSize ? fromPx(ts.fontSize) : DEFAULT_SIZE
  const level = BLOCKS.find(b => b.level && editor.isActive('heading', { level: b.level }))?.level ?? 0
  const mac = /Mac|iPhone|iPad/.test(navigator.platform); const M = mac ? '⌘' : 'Ctrl+'; const S = mac ? '⇧' : 'Shift+'
  const I = (icon: ReactNode, title: string, run: () => void, disabled = false, active = false) =>
    <button type="button" className={'tb' + (active ? ' on' : '')} title={title} aria-label={title} disabled={disabled} onMouseDown={e => { e.preventDefault(); run() }}>{icon}</button>
  return <div className="toolbar" role="toolbar" aria-label="Formatting">
    <Drop label="Insert" title="Insert" className="txt">{close => <>
      <Item close={close} icon={<ListChecks size={16} />} label="Checklist" kbd={M + S + 'C'} onRun={() => c().toggleTaskList().run()} />
      <Item close={close} icon={<List size={16} />} label="Bulleted list" kbd={M + S + '8'} onRun={() => c().toggleBulletList().run()} />
      <Item close={close} icon={<ListOrdered size={16} />} label="Numbered list" kbd={M + S + '7'} onRun={() => c().toggleOrderedList().run()} />
      <Item close={close} icon={<Table size={16} />} label="Table" onRun={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
      <div className="msep" />
      <Item close={close} icon={<Minus size={16} />} label="Divider" onRun={() => c().setHorizontalRule().run()} />
      <Item close={close} icon={<Code2 size={16} />} label="Code block" kbd={M + 'Alt+C'} onRun={() => c().toggleCodeBlock().run()} />
      <Item close={close} icon={<Quote size={16} />} label="Quote" kbd={M + S + 'B'} onRun={() => c().toggleBlockquote().run()} />
      <Item close={close} icon={<Link size={16} />} label="Link" onRun={() => { const u = prompt('Link URL', editor.getAttributes('link').href ?? 'https://'); if (u === null) return; if (u) c().extendMarkRange('link').setLink({ href: u }).run(); else c().unsetLink().run() }} />
      <Item close={close} icon={<ImageIcon size={16} />} label="Image from URL" onRun={() => { const u = prompt('Image URL'); if (u) c().setImage({ src: u }).run() }} />
    </>}</Drop>
    {I(<CircleCheck size={17} />, 'Checklist', () => c().toggleTaskList().run(), false, editor.isActive('taskList'))}
    <i className="sep" />
    {I(<Undo2 size={17} />, 'Undo', () => c().undo().run(), !editor.can().undo())}
    {I(<Redo2 size={17} />, 'Redo', () => c().redo().run(), !editor.can().redo())}
    <i className="sep" />
    <Drop label={<span className="aa">Aa</span>} title={'Turn into: ' + BLOCKS.find(b => b.level === level)!.label} wide>{close => <>
      <div className="mhead">Turn into</div>
      {BLOCKS.map(b => <Item key={b.level} close={close} icon={b.icon} label={b.label} active={b.level === level}
        onRun={() => b.level ? c().setHeading({ level: b.level as 1 | 2 | 3 | 4 }).run() : c().setParagraph().run()} />)}
    </>}</Drop>
    <i className="sep" />
    <Drop label={<span className="fam">{fam.label}</span>} title="Font" className="txt">{close => FONTS.map(f =>
      <Item key={f.label} close={close} label={f.label} active={f === fam} icon={<span style={{ fontFamily: f.value || 'inherit' }}>Aa</span>}
        onRun={() => f.value ? c().setFontFamily(f.value).run() : c().unsetFontFamily().run()} />)}</Drop>
    <i className="sep" />
    <Drop label={<span className="size">{size}</span>} title="Font size" className="txt">{close => SIZES.map(s =>
      <Item key={s} close={close} label={String(s)} active={s === size} onRun={() => s === DEFAULT_SIZE ? c().unsetFontSize().run() : c().setFontSize(toPx(s)).run()} />)}</Drop>
    <i className="sep" />
    <Drop label="More" title="More formatting" className="txt" wide>{close => <>
      <Item close={close} icon={<Bold size={16} />} label="Bold" kbd={M + 'B'} active={editor.isActive('bold')} onRun={() => c().toggleBold().run()} />
      <Item close={close} icon={<Italic size={16} />} label="Italic" kbd={M + 'I'} active={editor.isActive('italic')} onRun={() => c().toggleItalic().run()} />
      <Item close={close} icon={<Underline size={16} />} label="Underline" kbd={M + 'U'} active={editor.isActive('underline')} onRun={() => c().toggleUnderline().run()} />
      <Item close={close} icon={<Strikethrough size={16} />} label="Strikethrough" kbd={M + S + 'S'} active={editor.isActive('strike')} onRun={() => c().toggleStrike().run()} />
      <Item close={close} icon={<Highlighter size={16} />} label="Highlight" kbd={M + S + 'H'} active={editor.isActive('highlight')} onRun={() => c().toggleHighlight().run()} />
      <div className="mrow"><span className="mi-ic"><Palette size={16} /></span>{COLORS.map(col => <button key={col} type="button" className="swatch" title={'Text color ' + col} style={{ background: col }} onMouseDown={e => { e.preventDefault(); (col === COLORS[0] ? c().unsetColor() : c().setColor(col)).run(); close() }} />)}</div>
      <Item close={close} icon={<SupIcon size={16} />} label="Superscript" kbd={M + '.'} active={editor.isActive('superscript')} onRun={() => c().toggleSuperscript().run()} />
      <Item close={close} icon={<SubIcon size={16} />} label="Subscript" kbd={M + ','} active={editor.isActive('subscript')} onRun={() => c().toggleSubscript().run()} />
      <div className="msep" />
      <Item close={close} icon={<AlignLeft size={16} />} label="Align left" kbd={M + S + 'L'} active={editor.isActive({ textAlign: 'left' })} onRun={() => c().setTextAlign('left').run()} />
      <Item close={close} icon={<AlignCenter size={16} />} label="Align center" kbd={M + S + 'E'} active={editor.isActive({ textAlign: 'center' })} onRun={() => c().setTextAlign('center').run()} />
      <Item close={close} icon={<AlignRight size={16} />} label="Align right" kbd={M + S + 'R'} active={editor.isActive({ textAlign: 'right' })} onRun={() => c().setTextAlign('right').run()} />
      <Item close={close} icon={<IndentIcon size={16} />} label="Indent" kbd={M + ']'} onRun={() => c().indent().run()} />
      <Item close={close} icon={<Outdent size={16} />} label="Outdent" kbd={M + '['} onRun={() => c().outdent().run()} />
      <div className="msep" />
      <Item close={close} icon={<RemoveFormatting size={16} />} label="Clear formatting" onRun={() => c().unsetAllMarks().clearNodes().run()} />
    </>}</Drop>
  </div>
}

export default function Editor({ html, onChange, header }: { html: string; onChange: (html: string, text: string) => void; header?: ReactNode }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      TaskList, TaskItem.configure({ nested: true }), Highlight,
      TextStyle, FontFamily, FontSize, Color,
      TableKit.configure({ table: { resizable: false } }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Image, Subscript, Superscript, Indent,
    ],
    content: html,
    shouldRerenderOnTransaction: true,
    onUpdate: ({ editor }) => onChange(editor.getHTML(), editor.getText()),
  })
  if (!editor) return null
  return <div className="editor">
    <Toolbar editor={editor} />
    {header}
    <EditorContent editor={editor} className="prose" />
  </div>
}
