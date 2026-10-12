import { useEffect, useMemo, useRef, useState } from 'react'
import { all, put, del, uid, type Note, type Notebook } from './db'
import Editor from './Editor'
import Account from './Account'
import { SyncEngine } from './sync'

type View = { kind: 'all' } | { kind: 'notebook'; id: string } | { kind: 'tag'; tag: string } | { kind: 'shortcuts' } | { kind: 'trash' }
const fmt = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

export default function App() {
  const [notes, setNotes] = useState<Note[]>([])
  const [books, setBooks] = useState<Notebook[]>([])
  const [view, setView] = useState<View>({ kind: 'all' })
  const [sel, setSel] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'updated' | 'created' | 'title'>('updated')
  const [tagInput, setTagInput] = useState('')
  const saveT = useRef<Record<string, number>>({})

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
    if (persistNow) put('notes', n); else saveT.current[n.id] = window.setTimeout(() => put('notes', n), 300)
  }
  const editBody = (id: string, html: string, text: string) => setNotes(ns => ns.map(x => {
    if (x.id !== id) return x
    const n = { ...x, html, text, updatedAt: Date.now() }; clearTimeout(saveT.current[id]); saveT.current[id] = window.setTimeout(() => put('notes', n), 300); return n }))
  const live = notes.filter(n => !n.deletedAt)
  const tags = useMemo(() => [...new Set(live.flatMap(n => n.tags))].sort(), [notes])
  const stacks = useMemo(() => { const m: Record<string, Notebook[]> = {}; books.forEach(b => (m[b.stack ?? ''] ??= []).push(b)); return m }, [books])

  const list = useMemo(() => {
    let l = view.kind === 'trash' ? notes.filter(n => n.deletedAt) : live
    if (view.kind === 'notebook') l = l.filter(n => n.notebookId === view.id)
    if (view.kind === 'tag') l = l.filter(n => n.tags.includes(view.tag))
    if (view.kind === 'shortcuts') l = l.filter(n => n.pinned)
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
    if (terms.length) l = l.filter(n => { const hay = (n.title + ' ' + n.text + ' ' + n.tags.join(' ')).toLowerCase(); return terms.every(t => t.startsWith('tag:') ? n.tags.includes(t.slice(4)) : hay.includes(t)) })
    return [...l].sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title) : sort === 'created' ? b.createdAt - a.createdAt : b.updatedAt - a.updatedAt)
  }, [notes, view, q, sort])
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
  const title = view.kind === 'all' ? 'Notes' : view.kind === 'trash' ? 'Trash' : view.kind === 'shortcuts' ? 'Shortcuts' : view.kind === 'tag' ? `#${view.tag}` : books.find(b => b.id === view.id)?.name
  const is = (v: View) => JSON.stringify(v) === JSON.stringify(view) ? 'item active' : 'item'

  return <div className="app">
    <aside className="sidebar">
      <div className="brand"><span className="logo">◆</span> Notekeep</div>
      <input className="search" placeholder="Search" value={q} onChange={e => setQ(e.target.value)} aria-label="Search notes" />
      <button className="new" onClick={newNote}>+ New note</button>
      <nav>
        <div className={is({ kind: 'all' })} onClick={() => setView({ kind: 'all' })}>📄 Notes <span className="count">{live.length}</span></div>
        <div className="section">Shortcuts</div>
        <div className={is({ kind: 'shortcuts' })} onClick={() => setView({ kind: 'shortcuts' })}>★ All shortcuts</div>
        {live.filter(n => n.pinned).map(n => <div key={n.id} className="item sub" onClick={() => { setView({ kind: 'shortcuts' }); setSel(n.id) }}>{n.title || 'Untitled'}</div>)}
        <div className="section">Notebooks <button className="mini" title="New notebook" onClick={newBook}>+</button></div>
        {Object.entries(stacks).sort().map(([s, bs]) => <div key={s}>
          {s && <div className="stack">▤ {s}</div>}
          {bs.map(b => <div key={b.id} className={is({ kind: 'notebook', id: b.id }) + (s ? ' sub' : '')} onClick={() => setView({ kind: 'notebook', id: b.id })}>
            📓 {b.name} <span className="count">{live.filter(n => n.notebookId === b.id).length}</span>
            <button className="mini x" title="Delete notebook" onClick={e => { e.stopPropagation(); delBook(b) }}>×</button></div>)}
        </div>)}
        <div className="section">Tags</div>
        {tags.map(t => <div key={t} className={is({ kind: 'tag', tag: t })} onClick={() => setView({ kind: 'tag', tag: t })}># {t}</div>)}
        <div className={is({ kind: 'trash' }) + ' trash'} onClick={() => setView({ kind: 'trash' })}>🗑 Trash <span className="count">{notes.length - live.length}</span></div>
      </nav>
      <Account engine={engine} />
    </aside>
    <section className="list">
      <header><h2>{title}</h2><div className="meta">{list.length} notes
        <select value={sort} onChange={e => setSort(e.target.value as typeof sort)} aria-label="Sort"><option value="updated">Date updated</option><option value="created">Date created</option><option value="title">Title</option></select></div>
        {view.kind === 'trash' && list.length > 0 && <button className="danger" onClick={() => { if (confirm('Permanently delete all notes in Trash?')) { list.forEach(n => del('notes', n.id)); setNotes(ns => ns.filter(n => !n.deletedAt)) } }}>Empty trash</button>}
      </header>
      {list.map(n => <article key={n.id} className={'card' + (n.id === sel ? ' sel' : '')} onClick={() => setSel(n.id)}>
        <h3>{n.pinned && '★ '}{n.title || 'Untitled'}</h3><p>{n.text.slice(0, 120) || 'No additional text'}</p><time>{fmt(n.updatedAt)}</time></article>)}
      {!list.length && <div className="empty">{q ? 'No matching notes' : 'No notes here yet'}</div>}
    </section>
    <main className="pane">
      {cur ? <>
        <div className="notebar">
          <select value={cur.notebookId} disabled={!!cur.deletedAt} onChange={e => upd({ ...cur, notebookId: e.target.value, updatedAt: Date.now() })} aria-label="Notebook">{books.map(b => <option key={b.id} value={b.id}>📓 {b.name}</option>)}</select>
          <span className="grow" />
          {cur.deletedAt ? <>
            <button onClick={() => upd({ ...cur, deletedAt: null })}>Restore</button>
            <button className="danger" onClick={() => { del('notes', cur.id); setNotes(ns => ns.filter(n => n.id !== cur.id)) }}>Delete forever</button>
          </> : <>
            <button onClick={() => upd({ ...cur, pinned: !cur.pinned })}>{cur.pinned ? '★ Unpin' : '☆ Shortcut'}</button>
            <button onClick={() => { navigator.clipboard?.writeText(location.origin + '/#note=' + cur.id) }} title="Copy link (local only)">Share link</button>
            <button className="danger" onClick={() => upd({ ...cur, deletedAt: Date.now(), pinned: false })}>Move to Trash</button>
          </>}
        </div>
        {cur.deletedAt && <div className="banner">This note is in Trash. Restore it to edit.</div>}
        <input className="title" placeholder="Title" value={cur.title} readOnly={!!cur.deletedAt} onChange={e => upd({ ...cur, title: e.target.value, updatedAt: Date.now() }, false)} />
        <div className="tags">{cur.tags.map(t => <span key={t} className="tag">{t}{!cur.deletedAt && <button onClick={() => upd({ ...cur, tags: cur.tags.filter(x => x !== t), updatedAt: Date.now() })}>×</button>}</span>)}
          {!cur.deletedAt && <input placeholder="+ Add tag" value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { const t = tagInput.trim().toLowerCase(); if (e.key === 'Enter' && t) { if (!cur.tags.includes(t)) upd({ ...cur, tags: [...cur.tags, t], updatedAt: Date.now() }); setTagInput('') } }} />}</div>
        <div className={cur.deletedAt ? 'ro' : ''}><Editor key={cur.id} id={cur.id} html={cur.html} onChange={(html, text) => editBody(cur.id, html, text)} /></div>
        <footer className="foot">Created {fmt(cur.createdAt)} · Updated {new Date(cur.updatedAt).toLocaleString()} · Saved locally</footer>
      </> : <div className="empty big">Select or create a note</div>}
    </main>
  </div>
}
