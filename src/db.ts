import { openDB, type IDBPDatabase } from 'idb'
export interface Notebook { id: string; name: string; stack?: string; createdAt: number; updatedAt: number; deletedAt?: number | null; dirty?: number }
export interface Note { id: string; title: string; html: string; text: string; notebookId: string; tags: string[]; pinned: boolean; deletedAt: number | null; purged?: boolean; createdAt: number; updatedAt: number; dirty?: number }
export type Store = 'notes' | 'notebooks'
let dbp: Promise<IDBPDatabase> | null = null
export const DB_VERSION = 3
export type DbStatus = 'opening' | 'ready' | 'blocked' | 'error'
let dbStatus: DbStatus = 'opening'
const dbSubs = new Set<(s: DbStatus) => void>()
const setDbStatus = (s: DbStatus) => { dbStatus = s; dbSubs.forEach(f => f(s)) }
export const getDbStatus = () => dbStatus
export const onDbStatus = (f: (s: DbStatus) => void) => { dbSubs.add(f); return () => { dbSubs.delete(f) } }
/** Non-destructive, additive upgrades only: never delete or recreate a store that holds user data. */
export const upgradeDb = (d: IDBPDatabase, old: number) => {
  if (old < 1) { if (!d.objectStoreNames.contains('notes')) d.createObjectStore('notes', { keyPath: 'id' }); if (!d.objectStoreNames.contains('notebooks')) d.createObjectStore('notebooks', { keyPath: 'id' }) }
  if (old < 2 && !d.objectStoreNames.contains('meta')) d.createObjectStore('meta')
  if (old < 3 && !d.objectStoreNames.contains('settings')) d.createObjectStore('settings')
}
const db = () => (dbp ??= openDB('notekeep', DB_VERSION, {
  upgrade: (d, old) => upgradeDb(d, old),
  // Another tab still has an older version open: wait (the promise resolves once it closes) and tell the UI.
  blocked: () => setDbStatus('blocked'),
  // A newer version (another tab) wants to upgrade: release our connection and reload into the new code.
  blocking: () => { dbp?.then(d => d.close()); dbp = null; location.reload() },
  terminated: () => { dbp = null },
}).then(d => { setDbStatus('ready'); return d }, e => { dbp = null; setDbStatus('error'); throw e }))
/** Open (or reuse) the DB; rejects if it can't open within ms (e.g. upgrade blocked) instead of hanging forever. */
export const dbReady = (ms = 4000) => Promise.race([db(), new Promise<never>((_, rej) => setTimeout(() => rej(new Error(dbStatus === 'blocked' ? 'Local database upgrade is blocked by another Notekeep tab' : 'Local database timed out')), ms))])
/** Test helper. */
export const _resetDbForTests = async () => { if (dbp) (await dbp).close(); dbp = null; dbStatus = 'opening' }
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
