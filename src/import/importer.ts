import { all, put, uid, type Note, type Notebook } from '../db'
import { parseNote, splitNotes } from './enex'

export type Target = { kind: 'new'; name: string } | { kind: 'existing'; id: string }
export interface FilePlan { file: Blob & { name: string }; target: Target }
export interface Progress { fileIndex: number; fileCount: number; fileName: string; bytesRead: number; bytesTotal: number; notes: number }
export interface Summary { notes: number; notebooks: number; tags: string[]; skippedAttachments: number; duplicates: number; errors: string[] }

export const notebookNameFromFile = (name: string) => name.replace(/\.enex$/i, '').trim() || 'Imported'

async function* readWithProgress(file: Blob, onBytes: (n: number) => void): AsyncGenerator<string> {
  const dec = new TextDecoder(); const reader = file.stream().getReader(); let read = 0
  for (;;) { const { value, done } = await reader.read(); if (done) break; read += value.byteLength; onBytes(read); yield dec.decode(value, { stream: true }) }
  const tail = dec.decode(); if (tail) yield tail
}

/** Imports ENEX files. Only ADDS notebooks/notes (marked dirty → synced); never modifies or deletes existing data. */
export async function runImport(plans: FilePlan[], opts: { dedupe: boolean; onProgress?: (p: Progress) => void }): Promise<Summary> {
  const sum: Summary = { notes: 0, notebooks: 0, tags: [], skippedAttachments: 0, duplicates: 0, errors: [] }
  const tags = new Set<string>()
  const existingNotes = await all<Note>('notes')
  for (const [i, plan] of plans.entries()) {
    const fileName = plan.file.name
    let notebookId: string
    if (plan.target.kind === 'existing') notebookId = plan.target.id
    else { const nb: Notebook = { id: uid(), name: plan.target.name, createdAt: Date.now(), updatedAt: Date.now() }; await put('notebooks', nb); notebookId = nb.id; sum.notebooks++ }
    const seen = new Set(existingNotes.filter(n => n.notebookId === notebookId && !n.deletedAt).map(n => n.title + '|' + n.createdAt))
    const prog: Progress = { fileIndex: i, fileCount: plans.length, fileName, bytesRead: 0, bytesTotal: plan.file.size, notes: sum.notes }
    let count = 0
    try {
      for await (const xml of splitNotes(readWithProgress(plan.file, b => { prog.bytesRead = b }))) {
        count++
        try {
          const p = parseNote(xml)
          const key = p.title + '|' + p.created
          if (opts.dedupe && seen.has(key)) { sum.duplicates++; continue }  // count already incremented
          seen.add(key)
          const n: Note = { id: uid(), title: p.title, html: p.html, text: p.text, notebookId, tags: p.tags, pinned: false, deletedAt: null, createdAt: p.created, updatedAt: p.updated }
          await put('notes', n)
          p.tags.forEach(t => tags.add(t)); sum.skippedAttachments += p.skipped.length; sum.notes++
        } catch (e: any) { sum.errors.push(`${fileName}: note ${count}: ${e?.message ?? e}`) }
        if (count % 10 === 0) { prog.notes = sum.notes; opts.onProgress?.({ ...prog }); await new Promise(r => setTimeout(r)) }  // keep UI responsive
      }
      if (count === 0) sum.errors.push(`${fileName}: no notes found (is this an .enex export?)`)
    } catch (e: any) { sum.errors.push(`${fileName}: ${e?.message ?? e}`) }
    prog.notes = sum.notes; prog.bytesRead = plan.file.size; opts.onProgress?.({ ...prog })
  }
  sum.tags = [...tags].sort()
  return sum
}
