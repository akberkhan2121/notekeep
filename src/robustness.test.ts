import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { openDB, deleteDB } from 'idb'
import { allRaw, put, getDbStatus, dbReady, _resetDbForTests, DB_VERSION } from './db'

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

beforeEach(async () => { await _resetDbForTests(); await deleteDB('notekeep') })

describe('IndexedDB upgrade', () => {
  it('v2 → v3 keeps all notes, notebooks and meta', async () => {
    const v2 = await openDB('notekeep', 2, { upgrade(d) { d.createObjectStore('notes', { keyPath: 'id' }); d.createObjectStore('notebooks', { keyPath: 'id' }); d.createObjectStore('meta') } })
    await v2.put('notebooks', { id: 'nb1', name: 'Work', createdAt: 1, updatedAt: 1 })
    await v2.put('notes', note('n1', 'nb1')); await v2.put('meta', 'cursor', 'cursor:u1:notes'); v2.close()
    expect((await allRaw<any>('notes')).map(n => n.id)).toEqual(['n1'])
    expect((await allRaw<any>('notebooks'))[0].name).toBe('Work')
    const d = await openDB('notekeep'); expect(d.version).toBe(DB_VERSION); expect([...d.objectStoreNames].sort()).toEqual(['meta', 'notebooks', 'notes', 'settings']); expect(await d.get('meta', 'cursor:u1:notes')).toBe('cursor'); d.close()
  })
  it('blocked upgrade (old tab open) reports "blocked", times out instead of hanging, then completes when the old tab closes', async () => {
    const v2 = await openDB('notekeep', 2, { upgrade(d) { d.createObjectStore('notes', { keyPath: 'id' }); d.createObjectStore('notebooks', { keyPath: 'id' }); d.createObjectStore('meta') } })
    await v2.put('notes', note('keep', 'nb1'))
    const pending = allRaw<any>('notes')
    await expect(dbReady(300)).rejects.toThrow(/blocked/)
    expect(getDbStatus()).toBe('blocked')
    v2.close()
    expect((await pending).map(n => n.id)).toEqual(['keep'])
    expect(getDbStatus()).toBe('ready')
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
  it('blocked local DB → sync fails fast with an error instead of hanging', async () => {
    const v2 = await openDB('notekeep', 2, { upgrade(d) { d.createObjectStore('notes', { keyPath: 'id' }); d.createObjectStore('notebooks', { keyPath: 'id' }); d.createObjectStore('meta') } })
    const { client } = mockClient({})
    const e = new SyncEngine(() => {}, client); e.session = session
    const t0 = Date.now(); await e.sync()
    expect(e.status).toBe('error'); expect(e.lastError).toMatch(/blocked/); expect(Date.now() - t0).toBeLessThan(6000)
    v2.close()
  }, 10000)
})
