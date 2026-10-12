/** Last-write-wins merge by updatedAt. Pure; unit tested. */
export interface Row { id: string; updatedAt: number; dirty?: number }
export interface MergeResult<T> { toLocal: T[]; toRemote: T[] }
export function merge<T extends Row>(local: T[], remote: T[]): MergeResult<T> {
  const L = new Map(local.map(r => [r.id, r])); const R = new Map(remote.map(r => [r.id, r]))
  const toLocal: T[] = [], toRemote: T[] = []
  for (const r of remote) {
    const l = L.get(r.id)
    if (!l || r.updatedAt > l.updatedAt || (r.updatedAt === l.updatedAt && !l.dirty)) { if (!l || r.updatedAt !== l.updatedAt || l.dirty) toLocal.push(r) }
    else if (l.dirty || l.updatedAt > r.updatedAt) toRemote.push(l)
  }
  for (const l of local) if (!R.has(l.id) && l.dirty) toRemote.push(l)
  return { toLocal, toRemote }
}
