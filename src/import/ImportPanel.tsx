import { useRef, useState } from 'react'
import { Upload, FileText, X, CheckCircle2, AlertTriangle } from 'lucide-react'
import type { Notebook } from '../db'
import { runImport, notebookNameFromFile, type FilePlan, type Progress, type Summary } from './importer'

export default function ImportPanel({ notebooks, onImported }: { notebooks: Notebook[]; onImported: () => void }) {
  const [plans, setPlans] = useState<FilePlan[]>([])
  const [dedupe, setDedupe] = useState(true)
  const [drag, setDrag] = useState(false)
  const [prog, setProg] = useState<Progress | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const add = (files: FileList | null) => {
    if (!files) return
    const list = [...files].filter(f => /\.enex$/i.test(f.name) || f.type.includes('xml'))
    setSummary(null)
    setPlans(p => [...p, ...list.map(f => { const name = notebookNameFromFile(f.name); return { file: f, target: { kind: 'new' as const, name } } })])
  }
  const go = async () => {
    setBusy(true); setSummary(null)
    try { const s = await runImport(plans, { dedupe, onProgress: setProg }); setSummary(s); setPlans([]); onImported() }
    finally { setBusy(false); setProg(null) }
  }
  const pct = prog ? Math.round(((prog.fileIndex + (prog.bytesTotal ? prog.bytesRead / prog.bytesTotal : 1)) / prog.fileCount) * 100) : 0
  return <section className="spanel import">
    <h2>Import from Evernote</h2>
    <p className="sdesc">Choose one or more <strong>.enex</strong> files (Evernote exports one file per notebook). Imported notes are added; nothing existing is changed. They sync when you're signed in.</p>
    <div className={'drop-zone' + (drag ? ' over' : '')} onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files) }} onClick={() => input.current?.click()} role="button" tabIndex={0}>
      <Upload size={22} /><div><b>Drop .enex files here</b> or click to choose</div>
      <input ref={input} type="file" accept=".enex,application/xml,text/xml" multiple hidden aria-label="ENEX files" onChange={e => { add(e.target.files); e.target.value = '' }} />
    </div>
    {plans.length > 0 && <div className="plans">
      {plans.map((p, i) => <div className="plan" key={i}>
        <FileText size={16} /><span className="pname" title={p.file.name}>{p.file.name}</span><span className="psize">{(p.file.size / 1024 / 1024).toFixed(p.file.size > 1e6 ? 1 : 2)} MB</span>
        <span className="arrow">→</span>
        <select aria-label={'Target notebook for ' + p.file.name} value={p.target.kind === 'new' ? '__new' : p.target.id} disabled={busy}
          onChange={e => setPlans(ps => ps.map((x, j) => j !== i ? x : { ...x, target: e.target.value === '__new' ? { kind: 'new', name: notebookNameFromFile(x.file.name) } : { kind: 'existing', id: e.target.value } }))}>
          <option value="__new">New notebook “{notebookNameFromFile(p.file.name)}”</option>
          {notebooks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        {!busy && <button className="ic" title="Remove file" onClick={() => setPlans(ps => ps.filter((_, j) => j !== i))}><X size={14} /></button>}
      </div>)}
      <label className="dedupe"><input type="checkbox" checked={dedupe} onChange={e => setDedupe(e.target.checked)} disabled={busy} /> Skip notes that already exist in the target notebook (same title and created date)</label>
      <button className="primary" onClick={go} disabled={busy}>{busy ? 'Importing…' : `Import ${plans.length} file${plans.length > 1 ? 's' : ''}`}</button>
    </div>}
    {prog && <div className="progress" role="status">
      <div className="bar"><span style={{ width: pct + '%' }} /></div>
      <div className="pmeta">File {prog.fileIndex + 1} of {prog.fileCount}: {prog.fileName} · {prog.notes} notes imported · {pct}%</div>
    </div>}
    {summary && <div className={'summary' + (summary.errors.length ? ' warn' : '')} role="status">
      <div className="shead">{summary.errors.length ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />} Import finished</div>
      <ul>
        <li><b>{summary.notes}</b> notes imported</li>
        <li><b>{summary.notebooks}</b> notebooks created</li>
        <li><b>{summary.tags.length}</b> tags{summary.tags.length ? ': ' + summary.tags.slice(0, 12).join(', ') + (summary.tags.length > 12 ? '…' : '') : ''}</li>
        <li><b>{summary.skippedAttachments}</b> attachments not embedded (kept as placeholders)</li>
        {summary.duplicates > 0 && <li><b>{summary.duplicates}</b> duplicates skipped</li>}
        <li><b>{summary.errors.length}</b> errors</li>
      </ul>
      {summary.errors.length > 0 && <details><summary>Show errors</summary><pre>{summary.errors.join('\n')}</pre></details>}
    </div>}
  </section>
}
