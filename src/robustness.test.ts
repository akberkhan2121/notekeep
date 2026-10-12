import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { openDB, deleteDB } from 'idb'
import { allRaw, put, getDbStatus, getMeta, importLegacy, _resetDbForTests, DB_NAME, LEGACY_DB } from './db'

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }))
vi.stubGlobal('navigator', { onLine: true })
vi.stubGlobal('window', { setTimeout, clearTimeout, setInterval, clearInterval, addEventListener() {}, removeEventListener() {} })
vi.stubGlobal('document', { documentElement: { style: { setProperty() {} } }, addEventListener() {}, removeEventListener() {} })
const { SyncEngine } = await import('./sync')

/** Minimal chainable Supabase mock. tables: rows per table; fail: table → error | 'hang'. */
function mockClient(tables: Record<string, any[]>, fail: Record<string, any> = {}) {
  const upserts: Record<string, any[]> = {}
  const from = (t: string) => {
    const res = () => fail[t] === 'hang' ? new Promise(() => {}) : fail[t] ? Promise.resolve({ data: null, error: fail[t] }) : Promise.resolve({ data: t === 'user_settings' ? null : tables[t] ?? [], error: null })
    const b: any = { select: () => b, gt: () => b, order: () => b, eq: () => b, range: () => res(), maybeSingle: () => res(),
      upsert: (rows: any) => { if (fail[t]) return res(); (upserts[t] ??= []).push(...[rows].flat()); return Promise.resolve({ error: null }) } }
    return b
  }
  return { client: { from } as any, upserts }
}
const session = { user: { id: 'u1', email: 'a@b.c' } } as any
const note = (id: string, nb: string) => ({ id, title: id, html: '', text: '', notebookId: nb, tags: [], pinned: false, deletedAt: null, createdAt: 1, updatedAt: Date.now() })

beforeEach(async () => { await _resetDbForTests(); await deleteDB(DB_NAME); await deleteDB(LEGACY_DB) })
const v2 = () => openDB(LEGACY_DB, 2, { upgrade(d) { d.createObjectStore('notes', { keyPath: 'id' }); d.createObjectStore('notebooks', { keyPath: 'id' }); d.createObjectStore('meta') } })

describe('local DB (new name, legacy import)', () => {
  it('copies legacy v2 notes/notebooks into the new DB, leaves legacy DB untouched, does not copy sync cursors', async () => {
    const old = await v2()
    await old.put('notebooks', { id: 'nb1', name: 'Work', createdAt: 1, updatedAt: 1, dirty: 0 })
    await old.put('notes', { ...note('n1', 'nb1'), dirty: 1 }); await old.put('meta', 'cursorX', 'cursor:u1:notes'); old.close()
    expect(await importLegacy()).toBe(2)
    expect((await allRaw<any>('notes')).map(n => [n.id, n.dirty])).toEqual([['n1', 1]])
    expect((await allRaw<any>('notebooks'))[0].name).toBe('Work')
    expect(await getMeta('cursor:u1:notes')).toBeUndefined()          // → full pull on next sync
    const again = await openDB(LEGACY_DB); expect(again.version).toBe(2); expect(await again.count('notes')).toBe(1); again.close()
    expect(await importLegacy()).toBe(0)                                // only once
  })
  it('legacy DB stuck behind a blocked upgrade from another tab: new DB still opens immediately; import gives up and retries later', async () => {
    const old = await v2(); await old.put('notes', note('keep', 'nb1'))
    const stuck = openDB(LEGACY_DB, 3, { upgrade() {} })               // another tab's pending, blocked v3 upgrade
    const t0 = Date.now(); await put('notes', note('fresh', 'nb1'))
    expect(Date.now() - t0).toBeLessThan(1000); expect(getDbStatus()).toBe('ready')
    expect(await importLegacy(300)).toBe(0)
    expect(await getMeta('legacyImported')).toBeUndefined()
    old.close(); (await stuck).close()
    expect(await importLegacy()).toBe(1)
    expect((await allRaw<any>('notes')).map(n => n.id).sort()).toEqual(['fresh', 'keep'])
  })
  it('IndexedDB unavailable → falls back to memory instead of hanging', async () => {
    const real = globalThis.indexedDB; (globalThis as any).indexedDB = { open() { throw new Error('nope') } }
    try { await _resetDbForTests(); await put('notes', note('m1', 'nb1')); expect(getDbStatus()).toBe('memory'); expect((await allRaw<any>('notes')).map(n => n.id)).toEqual(['m1']) }
    finally { (globalThis as any).indexedDB = real; await _resetDbForTests() }
  })
})

describe('SyncEngine robustness', () => {
  it('missing user_settings table (PGRST205) does not block notes; status ends "synced"', async () => {
    await put('notebooks', { id: 'nb1', name: 'Work', createdAt: 1 } as any); await put('notes', note('n1', 'nb1'))
    const { client, upserts } = mockClient({}, { user_settings: { code: 'PGRST205', message: "Could not find the table 'public.user_settings' in the schema cache" } })
    const e = new SyncEngine(() => {}, client); e.session = session
    await e.sync()
    expect(e.status).toBe('synced'); expect(upserts.notes.map((r: any) => r.id)).toEqual(['n1']); expect(upserts.notebooks.map((r: any) => r.id)).toEqual(['nb1'])
  })
  it('one failing table does not stop the other; status "error", never stuck "syncing"', async () => {
    await put('notes', note('n1', 'nb1'))
    const { client, upserts } = mockClient({}, { notebooks: { code: '500', message: 'boom' } })
    const e = new SyncEngine(() => {}, client); e.session = session
    await e.sync()
    expect(e.status).toBe('error'); expect(e.lastError).toMatch(/notebooks: boom/); expect(upserts.notes.map((r: any) => r.id)).toEqual(['n1'])
  })
  it('hanging network request times out; status leaves "syncing"', async () => {
    const { client } = mockClient({}, { notebooks: 'hang', notes: 'hang', user_settings: 'hang' })
    const e = new SyncEngine(() => {}, client); e.session = session; e.netTimeout = 50
    await e.sync()
    expect(e.status).toBe('error'); expect(e.lastError).toMatch(/timed out/)
  })
  it('fresh DB + signed in: full pull of remote rows, pushes nothing', async () => {
    const remote = [{ id: 'r1', notebook_id: 'nb1', title: 'Remote', html: '', text: '', tags: [], pinned: false, deleted_at: null, purged: false, created_at: 1, updated_at: 5, server_updated_at: '2026-10-01T00:00:00Z' }]
    const { client, upserts } = mockClient({ notes: remote, notebooks: [{ id: 'nb1', name: 'Work', stack: null, created_at: 1, updated_at: 5, deleted_at: null, server_updated_at: '2026-10-01T00:00:00Z' }] })
    let refreshed = 0; const e = new SyncEngine(() => { refreshed++ }, client); e.session = session
    await e.sync()
    expect(e.status).toBe('synced'); expect(refreshed).toBe(1)
    expect((await allRaw<any>('notes')).map(n => n.title)).toEqual(['Remote']); expect(upserts).toEqual({})
  })
})
