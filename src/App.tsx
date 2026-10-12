import { useEffect, useMemo, useRef, useState } from 'react'
import { all, put, del, uid, type Note, type Notebook } from './db'
import Editor from './Editor'
import Account from './Account'
import { Search, Plus, FilePlus2, NotebookPen, MoreHorizontal, Home, Star, ChevronRight, ChevronDown, FileText, BookOpen, Tag, Trash2, ArrowDownUp, Filter, ChevronsLeft, ChevronsRight, Maximize2, Minimize2, Link2, Bell, Layers, X } from 'lucide-react'
import { SyncEngine } from './sync'

type View = { kind: 'all' } | { kind: 'notebook'; id: string } | { kind: 'tag'; tag: string } | { kind: 'shortcuts' } | { kind: 'trash' }
const fmtShort = (t: number) => { const d = new Date(t); return d.toLocaleDateString(undefined, d.getFullYear() === new Date().getFullYear() ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' }) }

export default function App() {
  const [notes, setNotes] = useState<Note[]>([])
  const [books, setBooks] = useState<Notebook[]>([])
  const [view, setView] = useState<View>({ kind: 'all' })
  const [sel, setSel] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'updated' | 'created' | 'title'>('updated')
  const [tagInput, setTagInput] = useState('')
  const saveT = useRef<Record<string, number>>({})
  const [saving, setSaving] = useState(0)
  const [hideSide, setHideSide] = useState(false)
  const [focus, setFocus] = useState(false)
  const [menu, setMenu] = useState<'' | 'note' | 'list' | 'sort'>('')
  const [open, setOpen] = useState({ shortcuts: true, notebooks: true, tags: true })
  const [pinnedOnly, setPinnedOnly] = useState(false)
  const later = (n: Note) => { clearTimeout(saveT.current[n.id]); setSaving(1); saveT.current[n.id] = window.setTimeout(() => put('notes', n).then(() => setSaving(0)), 300) }

  useEffect(() => { (async () => {
    let b = await all<Notebook>('notebooks')
    if (!b.length) {
      const nb = { id: uid(), name: 'First Notebook', createdAt: Date.now(), updatedAt: Date.now() }; await put('notebooks', nb); b = [nb]
      const now = Date.now()
      await put('notes', { id: uid(), title: 'Welcome to Notekeep', html: '<h1>Welcome to Notekeep</h1><p>Capture ideas, organize them into <strong>notebooks</strong> and <mark>tags</mark>, and find anything with search.</p><ul data-type="taskList"><li data-type="taskItem" data-checked="true">Create your first note</li><li data-type="taskItem" data-checked="false">Pin a note to Shortcuts</li></ul>', text: 'Welcome to Notekeep Capture ideas, organize them into notebooks and tags, and find anything with search. Create your first note Pin a note to Shortcuts', notebookId: nb.id, tags: ['getting-started'], pinned: true, deletedAt: null, createdAt: now, updatedAt: now })
    }
    setBooks(b); setNotes(await all<Note>('notes'))
  })() }, [])
  const engine = useMemo(() => new SyncEngine(async () => { setBooks(await all<Notebook>('notebooks')); setNotes(await all<Note>('notes')) }), [])
  useEffect(() => engine.start(), [engine])

  const upd = (n: Note, persistNow = true) => {
    setNotes(ns => ns.map(x => x.id === n.id ? n : x))
    clearTimeout(saveT.current[n.id])
    if (persistNow) put('notes', n); else later(n)
  }
  const editBody = (id: string, html: string, text: string) => setNotes(ns => ns.map(x => {
    if (x.id !== id) return x
    const n = { ...x, html, text, updatedAt: Date.now() }; later(n); return n }))
  const live = notes.filter(n => !n.deletedAt)
  const tags = useMemo(() => [...new Set(live.flatMap(n => n.tags))].sort(), [notes])
  const stacks = useMemo(() => { const m: Record<string, Notebook[]> = {}; books.forEach(b => (m[b.stack ?? ''] ??= []).push(b)); return m }, [books])

  const list = useMemo(() => {
    let l = view.kind === 'trash' ? notes.filter(n => n.deletedAt) : live
    if (view.kind === 'notebook') l = l.filter(n => n.notebookId === view.id)
    if (view.kind === 'tag') l = l.filter(n => n.tags.includes(view.tag))
    if (view.kind === 'shortcuts' || pinnedOnly) l = l.filter(n => n.pinned)
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
    if (terms.length) l = l.filter(n => { const hay = (n.title + ' ' + n.text + ' ' + n.tags.join(' ')).toLowerCase(); return terms.every(t => t.startsWith('tag:') ? n.tags.includes(t.slice(4)) : hay.includes(t)) })
    return [...l].sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title) : sort === 'created' ? b.createdAt - a.createdAt : b.updatedAt - a.updatedAt)
  }, [notes, view, q, sort, pinnedOnly])
  const cur = notes.find(n => n.id === sel) ?? null
  useEffect(() => { if (!list.find(n => n.id === sel)) setSel(list[0]?.id ?? null) }, [list])

  const newNote = async () => {
    const nbId = view.kind === 'notebook' ? view.id : books[0]?.id
    const n: Note = { id: uid(), title: '', html: '', text: '', notebookId: nbId, tags: view.kind === 'tag' ? [view.tag] : [], pinned: view.kind === 'shortcuts', deletedAt: null, createdAt: Date.now(), updatedAt: Date.now() }
    await put('notes', n); setNotes(ns => [n, ...ns]); if (view.kind === 'trash') setView({ kind: 'all' }); setQ(''); setSel(n.id)
  }
  const newBook = async () => {
    const name = prompt('Notebook name'); if (!name) return
    const stack = prompt('Stack (optional — groups notebooks)') || undefined
    const b = { id: uid(), name, stack, createdAt: Date.now(), updatedAt: Date.now() }; await put('notebooks', b); setBooks(x => [...x, b]); setView({ kind: 'notebook', id: b.id })
  }
  const delBook = async (b: Notebook) => {
    if (books.length < 2) return alert('You need at least one notebook.')
    if (!confirm(`Delete notebook "${b.name}"? Its notes move to Trash.`)) return
    notes.filter(n => n.notebookId === b.id && !n.deletedAt).forEach(n => upd({ ...n, deletedAt: Date.now(), notebookId: books.find(x => x.id !== b.id)!.id }))
    await del('notebooks', b.id); setBooks(x => x.filter(y => y.id !== b.id)); setView({ kind: 'all' })
  }
  const title = view.kind === 'all' ? 'All Notes' : view.kind === 'trash' ? 'Trash' : view.kind === 'shortcuts' ? 'Shortcuts' : view.kind === 'tag' ? view.tag : books.find(b => b.id === view.id)?.name
  const is = (v: View) => JSON.stringify(v) === JSON.stringify(view) ? 'item active' : 'item'
  const sortLabel = { updated: 'Date updated', created: 'Date created', title: 'Title' }
  const Sec = ({ k, icon, label, onAdd }: { k: keyof typeof open; icon: React.ReactNode; label: string; onAdd?: () => void }) =>
    <div className="item sec" onClick={() => setOpen(o => ({ ...o, [k]: !o[k] }))}>
      {icon}<span>{label}</span>{onAdd && <button className="mini" title="New notebook" onClick={e => { e.stopPropagation(); onAdd() }}><Plus size={14} /></button>}
      {open[k] ? <ChevronDown size={14} className="chev" /> : <ChevronRight size={14} className="chev" />}</div>

  return <div className={'app' + (hideSide ? ' noside' : '') + (focus ? ' focus' : '')} onClick={() => menu && setMenu('')}>
    <aside className="sidebar">
      <label className="search"><Search size={16} /><input placeholder="Search" value={q} onChange={e => setQ(e.target.value)} aria-label="Search notes" /></label>
      <div className="actions">
        <button className="new" onClick={newNote}><FilePlus2 size={17} /> Note</button>
        <button className="round" title="New notebook" onClick={newBook}><NotebookPen size={16} /></button>
        <button className="round" title={hideSide ? '' : 'Collapse sidebar'} onClick={() => setHideSide(true)}><ChevronsLeft size={16} /></button>
      </div>
      <nav>
        <div className={is({ kind: 'all' })} onClick={() => setView({ kind: 'all' })}><Home size={16} /><span>Home</span><span className="count">{live.length}</span></div>
        <div className="item sec" onClick={() => { setView({ kind: 'shortcuts' }); setOpen(o => ({ ...o, shortcuts: !o.shortcuts })) }}><Star size={16} /><span>Shortcuts</span>{open.shortcuts ? <ChevronDown size={14} className="chev" /> : <ChevronRight size={14} className="chev" />}</div>
        {open.shortcuts && live.filter(n => n.pinned).map(n => <div key={n.id} className={'item sub' + (n.id === sel && view.kind === 'shortcuts' ? ' active' : '')} onClick={() => { setView({ kind: 'shortcuts' }); setSel(n.id) }}><FileText size={15} /><span>{n.title || 'Untitled'}</span></div>)}
        <Sec k="notebooks" icon={<BookOpen size={16} />} label="Notebooks" onAdd={newBook} />
        {open.notebooks && Object.entries(stacks).sort().map(([s, bs]) => <div key={s}>
          {s && <div className="item sub stack"><Layers size={15} /><span>{s}</span></div>}
          {bs.map(b => <div key={b.id} className={is({ kind: 'notebook', id: b.id }) + ' sub' + (s ? ' deep' : '')} onClick={() => setView({ kind: 'notebook', id: b.id })}>
            <BookOpen size={15} /><span>{b.name}</span><span className="count">{live.filter(n => n.notebookId === b.id).length}</span>
            <button className="mini x" title="Delete notebook" onClick={e => { e.stopPropagation(); delBook(b) }}><X size={13} /></button></div>)}
        </div>)}
        <Sec k="tags" icon={<Tag size={16} />} label="Tags" />
        {open.tags && tags.map(t => <div key={t} className={is({ kind: 'tag', tag: t }) + ' sub'} onClick={() => setView({ kind: 'tag', tag: t })}><Tag size={14} /><span>{t}</span></div>)}
        <div className={is({ kind: 'trash' })} onClick={() => setView({ kind: 'trash' })}><Trash2 size={16} /><span>Trash</span><span className="count">{notes.length - live.length}</span></div>
      </nav>
      <Account engine={engine} />
    </aside>
    <section className="list">
      <header>
        <div className="lt"><h2>{title}</h2><span className="n">{list.length}</span></div>
        <div className="tools">
          <button title="New note" onClick={newNote}><FilePlus2 size={16} /></button>
          <span className="rel"><button title={'Sort: ' + sortLabel[sort]} onClick={e => { e.stopPropagation(); setMenu(menu === 'sort' ? '' : 'sort') }}><ArrowDownUp size={16} /></button>
            {menu === 'sort' && <div className="menu">{(Object.keys(sortLabel) as (keyof typeof sortLabel)[]).map(k => <button key={k} className={k === sort ? 'on' : ''} onClick={() => setSort(k)}>{sortLabel[k]}</button>)}</div>}</span>
          <button title={pinnedOnly ? 'Showing shortcuts only' : 'Filter: shortcuts only'} className={pinnedOnly ? 'on' : ''} onClick={() => setPinnedOnly(!pinnedOnly)}><Filter size={16} /></button>
          <span className="rel"><button title="More" onClick={e => { e.stopPropagation(); setMenu(menu === 'list' ? '' : 'list') }}><MoreHorizontal size={16} /></button>
            {menu === 'list' && <div className="menu">
              <button onClick={newBook}>New notebook</button>
              {view.kind === 'notebook' && <button className="danger" onClick={() => { const b = books.find(x => x.id === view.id); if (b) delBook(b) }}>Delete notebook</button>}
              {view.kind === 'trash' && list.length > 0 && <button className="danger" onClick={() => { if (confirm('Permanently delete all notes in Trash?')) { list.forEach(n => del('notes', n.id)); setNotes(ns => ns.filter(n => !n.deletedAt)) } }}>Empty trash</button>}
            </div>}</span>
        </div>
      </header>
      <div className="cards">
        {list.map(n => <article key={n.id} className={'card' + (n.id === sel ? ' sel' : '')} onClick={() => setSel(n.id)}>
          <h3>{n.title || 'Untitled'}</h3><p>{n.text.slice(0, 160) || 'No additional text'}</p><time>{fmtShort(n.updatedAt)}</time></article>)}
        {!list.length && <div className="empty">{q ? 'No matching notes' : 'No notes here yet'}</div>}
      </div>
    </section>
    <main className="pane">
      {cur ? <>
        <div className="notebar">
          {hideSide && <button className="ic" title="Show sidebar" onClick={() => setHideSide(false)}><ChevronsRight size={16} /></button>}
          <button className="ic" title={focus ? 'Exit full screen' : 'Expand note'} onClick={() => setFocus(!focus)}>{focus ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button>
          <div className="crumbs">
            <span className="crumb-book"><select value={cur.notebookId} disabled={!!cur.deletedAt} onChange={e => upd({ ...cur, notebookId: e.target.value, updatedAt: Date.now() })} aria-label="Notebook">{books.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></span>
            <ChevronRight size={13} /><span className="crumb-title">{cur.title || 'Untitled'}</span>
          </div>
          <span className="grow" />
          {cur.deletedAt ? <>
            <button className="btn" onClick={() => upd({ ...cur, deletedAt: null })}>Restore</button>
            <button className="btn danger" onClick={() => { del('notes', cur.id); setNotes(ns => ns.filter(n => n.id !== cur.id)) }}>Delete forever</button>
          </> : <>
            <div className="share"><button onClick={() => navigator.clipboard?.writeText(location.origin + '/#note=' + cur.id)}>Share</button><button title="Copy link" onClick={() => navigator.clipboard?.writeText(location.origin + '/#note=' + cur.id)}><Link2 size={15} /></button></div>
            <span className="rel"><button className="ic" title="More actions" onClick={e => { e.stopPropagation(); setMenu(menu === 'note' ? '' : 'note') }}><MoreHorizontal size={18} /></button>
              {menu === 'note' && <div className="menu right">
                <button onClick={() => upd({ ...cur, pinned: !cur.pinned })}>{cur.pinned ? 'Remove from Shortcuts' : 'Add to Shortcuts'}</button>
                <button className="danger" onClick={() => upd({ ...cur, deletedAt: Date.now(), pinned: false })}>Move to Trash</button>
              </div>}</span>
          </>}
        </div>
        <div className="edited">Edited {fmtShort(cur.updatedAt)}</div>
        <div className="scroll">
          <div className="col">
            {cur.deletedAt && <div className="banner">This note is in Trash. Restore it to edit.</div>}
            <div className={cur.deletedAt ? 'ro' : ''}><Editor key={cur.id} html={cur.html} onChange={(html, text) => editBody(cur.id, html, text)}
              header={<input className="title" placeholder="Title" value={cur.title} readOnly={!!cur.deletedAt} onChange={e => upd({ ...cur, title: e.target.value, updatedAt: Date.now() }, false)} />} /></div>
          </div>
        </div>
        <footer className="bottombar">
          <button className="ic" title="Reminders (not available yet)" disabled><Bell size={16} /></button>
          <Tag size={16} className="muted" />
          <div className="tags">{cur.tags.map(t => <span key={t} className="tag">{t}{!cur.deletedAt && <button title={'Remove tag ' + t} onClick={() => upd({ ...cur, tags: cur.tags.filter(x => x !== t), updatedAt: Date.now() })}><X size={11} /></button>}</span>)}
            {!cur.deletedAt && <input placeholder="Add tag" value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { const t = tagInput.trim().toLowerCase(); if (e.key === 'Enter' && t) { if (!cur.tags.includes(t)) upd({ ...cur, tags: [...cur.tags, t], updatedAt: Date.now() }); setTagInput('') } }} />}</div>
          <span className="grow" />
          <span className="saved">{saving ? 'Saving…' : 'All changes saved'}</span>
        </footer>
      </> : <div className="empty big">Select or create a note</div>}
    </main>
  </div>
}
