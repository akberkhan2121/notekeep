import { md5 } from './md5'

export const MAX_INLINE_IMAGE = 1024 * 1024   // images up to 1 MB are embedded as data URLs
export interface Resource { hash: string; mime: string; name: string; size: number; base64: string }
export interface ParsedNote {
  title: string; html: string; text: string; tags: string[]; created: number; updated: number; sourceUrl?: string
  skipped: string[]   // attachments not embedded
}

/** ENEX dates: 20231004T120000Z (UTC). */
export function parseEnexDate(s: string | null | undefined): number | null {
  const m = s?.trim().match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/)
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null
}

/** Incrementally yields each <note>…</note> XML fragment from a stream of text chunks (keeps memory ~ one note). */
export async function* splitNotes(chunks: AsyncIterable<string> | Iterable<string>): AsyncGenerator<string> {
  let buf = ''
  for await (const c of chunks as AsyncIterable<string>) {
    buf += c
    for (;;) {
      const start = buf.indexOf('<note>'); if (start < 0) { buf = buf.slice(Math.max(0, buf.length - 6)); break }
      const end = buf.indexOf('</note>', start); if (end < 0) { buf = buf.slice(start); break }
      yield buf.slice(start, end + 7); buf = buf.slice(end + 7)
    }
  }
}
/** Text chunks from a File/Blob without loading it all at once. */
export async function* fileChunks(file: Blob): AsyncGenerator<string> {
  const dec = new TextDecoder(); const reader = file.stream().getReader()
  for (;;) { const { value, done } = await reader.read(); if (done) break; yield dec.decode(value, { stream: true }) }
  const tail = dec.decode(); if (tail) yield tail
}

const b64ToBytes = (b64: string) => { const bin = atob(b64); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out }
const txt = (el: Element | null | undefined, sel: string) => el?.getElementsByTagName(sel)[0]?.textContent ?? ''

/** Parse one <note> fragment. */
export function parseNote(xml: string): ParsedNote {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  const note = doc.getElementsByTagName('note')[0]
  if (!note || doc.getElementsByTagName('parsererror').length) throw new Error('Malformed note XML')
  const resources: Resource[] = []
  for (const r of Array.from(note.getElementsByTagName('resource'))) {
    const base64 = (txt(r, 'data') || '').replace(/\s+/g, '')
    let hash = ''
    try { hash = base64 ? md5(b64ToBytes(base64)) : '' } catch { /* bad base64 */ }
    resources.push({ hash, mime: txt(r, 'mime') || 'application/octet-stream', name: txt(r, 'file-name') || 'attachment', size: Math.floor(base64.length * 3 / 4), base64 })
  }
  const attrs = note.getElementsByTagName('note-attributes')[0]
  const now = Date.now()
  const created = parseEnexDate(txt(note, 'created')) ?? now
  const updated = parseEnexDate(txt(note, 'updated')) ?? created
  const { html, text, skipped } = enmlToHtml(txt(note, 'content'), resources)
  const sourceUrl = txt(attrs, 'source-url') || undefined
  return {
    title: txt(note, 'title').trim() || 'Untitled', html: sourceUrl ? html + `<p><a href="${escAttr(sourceUrl)}">Source: ${escText(sourceUrl)}</a></p>` : html, text,
    tags: Array.from(note.getElementsByTagName('tag')).map(t => (t.textContent ?? '').trim().toLowerCase()).filter(Boolean),
    created, updated, sourceUrl, skipped,
  }
}

const escText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escAttr = (s: string) => escText(s).replace(/"/g, '&quot;')
const BLOCK = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'blockquote', 'pre', 'hr', 'en-note'])
const DROP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'applet', 'form', 'input', 'button', 'select', 'textarea', 'meta', 'link', 'title', 'head'])
const KEEP_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'blockquote', 'pre', 'code', 'hr', 'br', 'a', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'sup', 'sub', 'span', 'img', 'mark'])
const STYLE_KEEP = ['color', 'background-color', 'font-family', 'font-size', 'text-align', 'font-weight', 'font-style', 'text-decoration']
const styleMap = (s: string | null) => Object.fromEntries((s ?? '').split(';').map(x => x.split(':')).filter(x => x.length >= 2).map(([k, ...v]) => [k.trim().toLowerCase(), v.join(':').trim()]))
const FONT_SIZES: Record<string, string> = { '1': '10px', '2': '13px', '3': '16px', '4': '18px', '5': '24px', '6': '32px', '7': '48px' }

/** ENML (<en-note>…) → sanitized HTML TipTap understands. */
export function enmlToHtml(enml: string, resources: Resource[] = []): { html: string; text: string; skipped: string[] } {
  const skipped: string[] = []
  const VOID = /^(br|hr|img|meta|link|input|area|base|col|embed|param|source|track|wbr)$/i
  // ENML is XHTML: expand self-closing non-void tags (<en-todo/>, <en-media/>, <div/>) so the HTML parser doesn't nest following content inside them.
  const src = enml.replace(/<\?xml[^>]*\?>/g, '').replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<([a-zA-Z][\w-]*)((?:\s[^<>]*?)?)\s*\/>/g, (m, t, a) => VOID.test(t) ? m : `<${t}${a}></${t}>`)
  const doc = new DOMParser().parseFromString(`<html><body>${src}</body></html>`, 'text/html')
  const root = doc.body.querySelector('en-note') ?? doc.body
  const byHash = new Map(resources.map(r => [r.hash, r]))
  let mediaIdx = 0
  const out = doc.createElement('div')

  const isTodo = (n: Node) => n.nodeType === 1 && (n as Element).tagName.toLowerCase() === 'en-todo'
  const checkedOf = (e: Element) => (e.getAttribute('checked') ?? '').toLowerCase() === 'true'
  const isBr = (n: Node) => n.nodeType === 1 && (n as Element).tagName.toLowerCase() === 'br'
  const blank = (n: Node) => n.nodeType === 3 ? !(n.textContent ?? '').trim() : isBr(n)
  const taskItem = (checked: boolean, kids: Node[]) => {
    const li = doc.createElement('li'); li.setAttribute('data-type', 'taskItem'); li.setAttribute('data-checked', String(checked))
    const p = doc.createElement('p'); kids.forEach(k => convertInto(k, p)); trimP(p); li.appendChild(p); return li
  }
  const trimP = (p: Element) => { const f = p.firstChild; if (f?.nodeType === 3) f.textContent = (f.textContent ?? '').replace(/^\s+/, '') }
  const taskList = () => { const ul = doc.createElement('ul'); ul.setAttribute('data-type', 'taskList'); return ul }

  /** Lines (split on <br>) of an element's children; returns todo items if every non-blank line starts with en-todo. */
  const todoLines = (el: Element): HTMLLIElement[] | null => {
    const lines: Node[][] = [[]]
    for (const c of Array.from(el.childNodes)) { if (isBr(c)) lines.push([]); else lines[lines.length - 1].push(c) }
    const real = lines.map(l => { let i = 0; while (i < l.length && blank(l[i])) i++; return l.slice(i) }).filter(l => l.length)
    if (!real.length || !real.every(l => isTodo(l[0]))) return null
    return real.map(l => taskItem(checkedOf(l[0] as Element), l.slice(1)) as HTMLLIElement)
  }
  const hasTodoChild = (el: Element) => Array.from(el.childNodes).some(isTodo)
  const blockKids = (el: Element) => Array.from(el.children).some(c => BLOCK.has(c.tagName.toLowerCase()))

  /** Converts children of `from` into `into`, grouping consecutive todo blocks into one task list. */
  const convertChildren = (from: Element, into: Element) => {
    let list: Element | null = null
    for (const c of Array.from(from.childNodes)) {
      let items: HTMLLIElement[] | null = null
      if (c.nodeType === 1) {
        const tag = (c as Element).tagName.toLowerCase()
        if ((tag === 'div' || tag === 'p') && hasTodoChild(c as Element) && !blockKids(c as Element)) items = todoLines(c as Element)
        else if (tag === 'en-todo') items = [taskItem(checkedOf(c as Element), [])]
      }
      if (items) { if (!list) { list = taskList(); into.appendChild(list) } items.forEach(i => list!.appendChild(i)); continue }
      if (list && c.nodeType === 3 && !(c.textContent ?? '').trim()) continue
      list = null
      convertInto(c, into)
    }
  }

  const convertInto = (n: Node, into: Element) => {
    if (n.nodeType === 3) { into.appendChild(doc.createTextNode(n.textContent ?? '')); return }
    if (n.nodeType !== 1) return
    const el = n as Element; let tag = el.tagName.toLowerCase()
    if (DROP.has(tag)) return
    if (tag === 'en-todo') { into.appendChild(doc.createTextNode(checkedOf(el) ? '☑ ' : '☐ ')); return }
    if (tag === 'en-crypt') { into.appendChild(placeholder('[encrypted content — not imported]')); return }
    if (tag === 'en-media' || tag === 'img') {
      const r = tag === 'en-media' ? (byHash.get(el.getAttribute('hash') ?? '') ?? (resources.length && !byHash.has(el.getAttribute('hash') ?? '') ? resources[mediaIdx] : undefined)) : undefined
      mediaIdx++
      if (tag === 'img') { const s = el.getAttribute('src') ?? ''; if (/^(https?:|data:image\/)/i.test(s)) { const img = doc.createElement('img'); img.setAttribute('src', s); into.appendChild(img) } return }
      const mime = el.getAttribute('type') ?? r?.mime ?? ''
      if (r && mime.startsWith('image/') && r.size <= MAX_INLINE_IMAGE && r.base64) { const img = doc.createElement('img'); img.setAttribute('src', `data:${mime};base64,${r.base64}`); img.setAttribute('alt', r.name); into.appendChild(img) }
      else { const name = r?.name ?? (mime || 'attachment'); skipped.push(name); into.appendChild(placeholder(`[attachment: ${name}${r && mime.startsWith('image/') ? ` (${Math.round(r.size / 1024)} KB, too large to embed)` : ''}]`)) }
      return
    }
    // Evernote v10 checklists: <ul style="--en-todo:true"><li style="--en-checked:true">…
    if ((tag === 'ul' || tag === 'ol') && (/--en-todo\s*:\s*true/i.test(el.getAttribute('style') ?? '') || el.getAttribute('data-type') === 'taskList' || /checklist/i.test(el.getAttribute('class') ?? ''))) {
      const ul = taskList()
      for (const li of Array.from(el.children).filter(c => c.tagName.toLowerCase() === 'li')) {
        const checked = /--en-checked\s*:\s*true/i.test(li.getAttribute('style') ?? '') || li.getAttribute('data-checked') === 'true'
        const item = doc.createElement('li'); item.setAttribute('data-type', 'taskItem'); item.setAttribute('data-checked', String(checked))
        const inner = doc.createElement('div'); convertChildren(li, inner)
        const kids = Array.from(inner.childNodes)
        const firstBlock = doc.createElement('p'); let i = 0
        while (i < kids.length && !(kids[i].nodeType === 1 && BLOCK.has((kids[i] as Element).tagName.toLowerCase()) && (kids[i] as Element).tagName.toLowerCase() !== 'p')) { const k = kids[i++]; if (k.nodeType === 1 && (k as Element).tagName.toLowerCase() === 'p') { while (k.firstChild) firstBlock.appendChild(k.firstChild) } else firstBlock.appendChild(k) }
        item.appendChild(firstBlock); kids.slice(i).forEach(k => item.appendChild(k))
        ul.appendChild(item)
      }
      into.appendChild(ul); return
    }
    if (tag === 'font') {
      const span = doc.createElement('span'); const st: string[] = []
      if (el.getAttribute('face')) st.push(`font-family: ${el.getAttribute('face')}`); if (el.getAttribute('color')) st.push(`color: ${el.getAttribute('color')}`)
      if (el.getAttribute('size') && FONT_SIZES[el.getAttribute('size')!]) st.push(`font-size: ${FONT_SIZES[el.getAttribute('size')!]}`)
      if (st.length) span.setAttribute('style', st.join('; ')); convertChildren(el, span); into.appendChild(span); return
    }
    if (tag === 'div' || tag === 'section' || tag === 'article' || tag === 'center') {
      if (blockKids(el)) { convertChildren(el, into); return }   // wrapper: unwrap
      tag = 'p'
    }
    if (tag === 'h5' || tag === 'h6') tag = 'h4'
    if (tag === 'b') tag = 'strong'; if (tag === 'i') tag = 'em'; if (tag === 'strike' || tag === 'del') tag = 's'
    if (tag === 'tt') tag = 'code'
    if (!KEEP_TAGS.has(tag)) { convertChildren(el, into); return }   // unknown inline: keep contents
    const o = doc.createElement(tag)
    if (tag === 'a') { const h = el.getAttribute('href') ?? ''; if (/^(https?:|mailto:|evernote:|#)/i.test(h)) o.setAttribute('href', h) }
    if (tag === 'td' || tag === 'th') for (const a of ['colspan', 'rowspan']) if (el.getAttribute(a)) o.setAttribute(a, el.getAttribute(a)!)
    const sm = styleMap(el.getAttribute('style')); const keep = STYLE_KEEP.filter(k => sm[k]).map(k => `${k}: ${sm[k]}`)
    if (keep.length && tag !== 'img') {
      if (['p', 'h1', 'h2', 'h3', 'h4', 'li', 'td', 'th'].includes(tag)) {   // block: alignment on block, text styles via inner span
        if (sm['text-align']) o.setAttribute('style', `text-align: ${sm['text-align']}`)
        const inl = keep.filter(k => !k.startsWith('text-align'))
        if (inl.length) { const span = doc.createElement('span'); span.setAttribute('style', inl.join('; ')); convertChildren(el, span); o.appendChild(span); into.appendChild(o); return }
      } else o.setAttribute('style', keep.join('; '))
    }
    if (tag !== 'br' && tag !== 'hr') convertChildren(el, o)
    into.appendChild(o)
  }
  const placeholder = (s: string) => { const e = doc.createElement('em'); e.textContent = s; return e }

  convertChildren(root, out)
  // top-level stray inline content → paragraphs
  const final = doc.createElement('div'); let para: Element | null = null
  for (const c of Array.from(out.childNodes)) {
    const isBlockEl = c.nodeType === 1 && BLOCK.has((c as Element).tagName.toLowerCase())
    if (isBlockEl) { para = null; final.appendChild(c); continue }
    if (isBr(c)) { para = null; continue }
    if (c.nodeType === 3 && !(c.textContent ?? '').trim() && !para) continue
    if (!para) { para = doc.createElement('p'); final.appendChild(para) }
    para.appendChild(c)
  }
  return { html: final.innerHTML, text: (final.textContent ?? '').replace(/\s+/g, ' ').trim(), skipped }
}
