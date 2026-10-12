import { Extension } from '@tiptap/core'
declare module '@tiptap/core' { interface Commands<ReturnType> { indent: { indent: () => ReturnType; outdent: () => ReturnType } } }
const TYPES = ['paragraph', 'heading']
/** Paragraph/heading indentation stored as data-indent + margin-left in note HTML. Lists use sink/lift instead. */
export const Indent = Extension.create({
  name: 'indent',
  addGlobalAttributes() {
    return [{ types: TYPES, attributes: { indent: {
      default: 0,
      parseHTML: el => Number(el.getAttribute('data-indent')) || 0,
      renderHTML: a => a.indent ? { 'data-indent': a.indent, style: `margin-left:${a.indent * 2}em` } : {},
    } } }]
  },
  addCommands() {
    const step = (d: number) => () => ({ editor, chain, state }: any) => {
      if (editor.isActive('listItem')) return d > 0 ? chain().sinkListItem('listItem').run() : chain().liftListItem('listItem').run()
      if (editor.isActive('taskItem')) return d > 0 ? chain().sinkListItem('taskItem').run() : chain().liftListItem('taskItem').run()
      const { from, to } = state.selection; let tr = state.tr; let changed = false
      state.doc.nodesBetween(from, to, (node: any, pos: number) => {
        if (TYPES.includes(node.type.name)) { const v = Math.max(0, Math.min(8, (node.attrs.indent || 0) + d)); if (v !== node.attrs.indent) { tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: v }); changed = true } }
      })
      if (changed) editor.view.dispatch(tr)
      return changed
    }
    return { indent: step(1), outdent: step(-1) }
  },
  addKeyboardShortcuts() { return { 'Mod-]': () => this.editor.commands.indent(), 'Mod-[': () => this.editor.commands.outdent() } },
})
