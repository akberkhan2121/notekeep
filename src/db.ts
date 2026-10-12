import { openDB, type IDBPDatabase } from 'idb'
export interface Notebook { id: string; name: string; stack?: string; createdAt: number; updatedAt: number; deletedAt?: number | null; dirty?: number }
export interface Note { id: string; title: string; html: string; text: string; notebookId: string; tags: string[]; pinned: boolean; deletedAt: number | null; purged?: boolean; createdAt: number; updatedAt: number; dirty?: number }
export type Store = 'notes' | 'notebooks'
/** Minimal store surface shared by IndexedDB (idb) and the in-memory fallback. */
export interface KV {
  get(s: string, k: IDBValidKey): Promise<any>; getAll(s: string): Promise<any[]>
  put(s: string, v: any, k?: IDBValidKey): Promise<IDBValidKey>; delete(s: string, k: IDBValidKey): Promise<void>
}
/** Data lives in a NEW database name (v4 layout). The legacy 'notekeep' DB is only read (copied once), never upgraded or deleted,
 *  so a stuck version upgrade in another tab can no longer block this app. */
export const DB_NAME = 'notekeep-data'
export const LEGACY_DB = 'notekeep'
export const DB_VERSION = 1
const STORES: [string, string?][] = [['notes', 'id'], ['notebooks', 'id'], ['meta'], ['settings']]
export type DbStatus = 'opening' | 'slow' | 'ready' | 'memory'
let dbStatus: DbStatus = 'opening'
const dbSubs = new Set<(s: DbStatus) => void>()
const setDbStatus = (s: DbStatus) => { dbStatus = s; dbSubs.forEach(f => f(s)) }
export const getDbStatus = () => dbStatus
export const onDbStatus = (f: (s: DbStatus) => void) => { dbSubs.add(f); return () => { dbSubs.delete(f) } }
export const SLOW_MS = 2000, FALLBACK_MS = 8000

export function memoryKV(): KV {
  const m = new Map<string, Map<any, any>>(STORES.map(([n]) => [n, new Map()]))
  const keyOf = (s: string, v: any, k?: IDBValidKey) => k ?? v[STORES.find(x => x[0] === s)![1]!]
  return {
    async get(s, k) { return structuredClone(m.get(s)!.get(k)) }, async getAll(s) { return [...m.get(s)!.values()].map(v => structuredClone(v)) },
    async put(s, v, k) { const key = keyOf(s, v, k); m.get(s)!.set(key, structuredClone(v)); return key }, async delete(s, k) { m.get(s)!.delete(k) },
  }
}
let opener: Promise<IDBPDatabase> | null = null
let dbp: Promise<KV> | null = null
const openIdb = () => (opener ??= openDB(DB_NAME, DB_VERSION, {
  upgrade(d) { for (const [n, kp] of STORES) if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, kp ? { keyPath: kp } : undefined) },
  blocking: () => { opener?.then(d => d.close()); location.reload() },   // a future version wants in: get out of the way
  terminated: () => { opener = null; dbp = null },
}))
/** Resolves with IndexedDB if it opens; shows 'slow' after 2s; after 8s (or on error) falls back to memory so the app never hangs. */
const db = (): Promise<KV> => (dbp ??= new Promise<KV>(resolve => {
  let done = false
  const slow = setTimeout(() => !done && setDbStatus('slow'), SLOW_MS)
  const fallback = setTimeout(() => { if (!done) { done = true; console.warn('Notekeep: IndexedDB did not open in time; using in-memory storage for this session'); setDbStatus('memory'); resolve(memoryKV()) } }, FALLBACK_MS)
  Promise.resolve().then(openIdb).then(d => { if (done) { d.close(); return } done = true; clearTimeout(slow); clearTimeout(fallback); setDbStatus('ready'); resolve(d as unknown as KV) },
    e => { opener = null; if (done) return; done = true; clearTimeout(slow); clearTimeout(fallback); console.warn('Notekeep: IndexedDB failed; using in-memory storage', e); setDbStatus('memory'); resolve(memoryKV()) })
}))
/** Never rejects; always resolves within FALLBACK_MS. */
export const dbReady = () => db()
export const isPersistent = () => dbStatus === 'ready'

/** One-time, non-destructive copy from the legacy DB. Opens it WITHOUT a version (never triggers/joins an upgrade), with a timeout.
 *  Rows merge last-write-wins; sync cursors are NOT copied so the next sync does a full pull. Returns rows imported. */
export async function importLegacy(timeoutMs = 3000): Promise<number> {
  const d = await db()
  if (await d.get('meta', 'legacyImported')) return 0
  if (typeof indexedDB === 'undefined') return 0
  const legacy = await new Promise<IDBDatabase | null>(res => {
    let settled = false; const t = setTimeout(() => { if (!settled) { settled = true; res(null) } }, timeoutMs)
    let req: IDBOpenDBRequest
    try { req = indexedDB.open(LEGACY_DB) } catch { clearTimeout(t); return res(null) }
    req.onupgradeneeded = () => { req.transaction?.abort() }       // legacy DB didn't exist: don't create it
    req.onsuccess = () => { clearTimeout(t); const ldb = req.result; ldb.onversionchange = () => ldb.close(); if (settled) ldb.close(); else { settled = true; res(ldb) } }
    req.onerror = () => { clearTimeout(t); if (!settled) { settled = true; res(null) } }
  })
  if (!legacy) return 0                                             // try again next load
  let n = 0
  try {
    const read = (s: string) => new Promise<{ k: IDBValidKey; v: any }[]>((res, rej) => {
      if (!legacy.objectStoreNames.contains(s)) return res([])
      const out: { k: IDBValidKey; v: any }[] = []; const c = legacy.transaction(s).objectStore(s).openCursor()
      c.onsuccess = () => { const cur = c.result; if (cur) { out.push({ k: cur.key, v: cur.value }); cur.continue() } else res(out) }; c.onerror = () => rej(c.error)
    })
    for (const s of ['notebooks', 'notes']) for (const { v } of await read(s)) {
      const mine = await d.get(s, v.id)
      if (!mine || (v.updatedAt ?? 0) > (mine.updatedAt ?? 0)) { await d.put(s, { ...v, updatedAt: v.updatedAt ?? Date.now() }); n++ }
    }
    for (const { k, v } of await read('settings')) { const mine = await d.get('settings', k); if (!mine || v.updatedAt > mine.updatedAt) await d.put('settings', v, k) }
    await d.put('meta', Date.now(), 'legacyImported')
  } finally { legacy.close() }
  return n
}
/** Test helper. */
export const _resetDbForTests = async () => { if (opener) (await opener).close(); opener = null; dbp = null; dbStatus = 'opening' }
export const uid = () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)
/** Raw rows, including tombstones (purged notes / deleted notebooks). */
export const allRaw = async <T,>(s: Store) => (await db()).getAll(s) as Promise<T[]>
/** Rows visible to the UI. */
export const all = async <T,>(s: Store) => (await allRaw<T & { purged?: boolean; deletedAt?: number | null }>(s))
  .filter(r => s === 'notes' ? !r.purged : !r.deletedAt) as T[]
/** Local write: marks the row dirty so the sync engine pushes it. Stamps updatedAt if missing. */
export const put = async <T extends { updatedAt?: number }>(s: Store, v: T) => {
  await (await db()).put(s, { ...v, updatedAt: v.updatedAt ?? Date.now(), dirty: 1 }); notify()
}
/** Write coming from the server (not dirty). */
export const putClean = async (s: Store, v: object) => { await (await db()).put(s, { ...v, dirty: 0 }) }
/** Delete = tombstone so the deletion syncs. */
export const del = async (s: Store, id: string) => {
  const d = await db(); const r = await d.get(s, id); if (!r) return
  await put(s, s === 'notes' ? { ...r, purged: true, updatedAt: Date.now() } : { ...r, deletedAt: Date.now(), updatedAt: Date.now() })
}
export const getMeta = async <T,>(k: string) => (await db()).get('meta', k) as Promise<T | undefined>
export const setMeta = async (k: string, v: unknown) => { await (await db()).put('meta', v, k) }
const subs = new Set<() => void>()
export const onLocalWrite = (f: () => void) => { subs.add(f); return () => subs.delete(f) }
const notify = () => subs.forEach(f => f())
export interface SettingsRecord<T> { value: T; updatedAt: number; dirty: number }
export const getSetting = async <T,>(k: string) => (await db()).get('settings', k) as Promise<SettingsRecord<T> | undefined>
/** Local settings write (dirty → synced). */
export const putSetting = async <T,>(k: string, value: T) => { await (await db()).put('settings', { value, updatedAt: Date.now(), dirty: 1 }, k); notify() }
export const putSettingClean = async <T,>(k: string, rec: SettingsRecord<T>) => { await (await db()).put('settings', { ...rec, dirty: 0 }, k) }
