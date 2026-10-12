import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js'
import { allRaw, putClean, getMeta, setMeta, onLocalWrite, getSetting, putSettingClean, type Note, type Notebook, type Store } from './db'
import { merge } from './merge'
import { KEY as FONTS_KEY, setFontsFromRemote } from './settings'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null
export type SyncStatus = 'local-only' | 'signed-out' | 'syncing' | 'synced' | 'offline' | 'error'

const toRemote: Record<Store, (r: any) => object> = {
  notes: (n: Note) => ({ id: n.id, notebook_id: n.notebookId, title: n.title, html: n.html, text: n.text, tags: n.tags, pinned: n.pinned, deleted_at: n.deletedAt, purged: !!n.purged, created_at: n.createdAt, updated_at: n.updatedAt }),
  notebooks: (b: Notebook) => ({ id: b.id, name: b.name, stack: b.stack ?? null, created_at: b.createdAt, updated_at: b.updatedAt, deleted_at: b.deletedAt ?? null }),
}
const fromRemote: Record<Store, (r: any) => object & { id: string; updatedAt: number }> = {
  notes: r => ({ id: r.id, notebookId: r.notebook_id, title: r.title, html: r.html, text: r.text, tags: r.tags ?? [], pinned: r.pinned, deletedAt: r.deleted_at, purged: r.purged, createdAt: Number(r.created_at), updatedAt: Number(r.updated_at) }),
  notebooks: r => ({ id: r.id, name: r.name, stack: r.stack ?? undefined, createdAt: Number(r.created_at), updatedAt: Number(r.updated_at), deletedAt: r.deleted_at }),
}

export class SyncEngine {
  status: SyncStatus = supabase ? 'signed-out' : 'local-only'
  session: Session | null = null
  lastError = ''
  private listeners = new Set<() => void>()
  private running = false; private again = false; private timer?: number; private debounce?: number
  private onRemoteChange: () => void
  constructor(onRemoteChange: () => void) { this.onRemoteChange = onRemoteChange }
  subscribe(f: () => void) { this.listeners.add(f); return () => { this.listeners.delete(f) } }
  private set(s: SyncStatus, err = '') { this.status = s; this.lastError = err; this.listeners.forEach(f => f()) }

  start() {
    if (!supabase) return () => {}
    let channel: ReturnType<SupabaseClient['channel']> | null = null
    const onSession = (s: Session | null) => {
      this.session = s
      if (channel) { supabase.removeChannel(channel); channel = null }
      if (!s) return this.set('signed-out')
      channel = supabase.channel('notekeep-' + s.user.id)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notes', filter: `user_id=eq.${s.user.id}` }, () => this.soon(500))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notebooks', filter: `user_id=eq.${s.user.id}` }, () => this.soon(500))
        .subscribe()
      this.sync()
    }
    supabase.auth.getSession().then(({ data }) => onSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((ev, s) => { if (ev !== 'INITIAL_SESSION' && ev !== 'TOKEN_REFRESHED') onSession(s) })
    const kick = () => this.sync()
    const vis = () => { if (document.visibilityState === 'visible') kick() }
    window.addEventListener('online', kick); window.addEventListener('focus', kick); document.addEventListener('visibilitychange', vis)
    window.addEventListener('offline', () => this.session && this.set('offline'))
    const offWrite = onLocalWrite(() => this.soon(1500))       // push local edits shortly after they happen
    this.timer = window.setInterval(kick, 60_000)                // free-tier friendly: once a minute
    return () => { sub.subscription.unsubscribe(); offWrite(); clearInterval(this.timer); window.removeEventListener('online', kick); window.removeEventListener('focus', kick); document.removeEventListener('visibilitychange', vis); if (channel) supabase.removeChannel(channel) }
  }
  private soon(ms: number) { clearTimeout(this.debounce); this.debounce = window.setTimeout(() => this.sync(), ms) }

  async sync() {
    if (!supabase || !this.session) return
    if (!navigator.onLine) return this.set('offline')
    if (this.running) { this.again = true; return }
    this.running = true; this.set('syncing')
    try {
      let changed = false
      for (const s of ['notebooks', 'notes'] as Store[]) changed = (await this.syncStore(s)) || changed
      if (changed) this.onRemoteChange()
      await this.syncSettings()
      this.set('synced')
    } catch (e: any) {
      this.set(navigator.onLine ? 'error' : 'offline', e?.message ?? String(e))
    } finally {
      this.running = false
      if (this.again) { this.again = false; this.soon(200) }
    }
  }

  private settingsTableMissing = false
  /** Font defaults ↔ public.user_settings (one row per user). Silently skipped if the table doesn't exist yet. */
  private async syncSettings() {
    if (this.settingsTableMissing) return
    const uidv = this.session!.user.id
    const { data, error } = await supabase!.from('user_settings').select('font_defaults, updated_at').eq('user_id', uidv).maybeSingle()
    if (error) {
      if (['42P01', 'PGRST205', 'PGRST106'].includes(error.code) || /does not exist|schema cache/i.test(error.message)) { this.settingsTableMissing = true; console.info('Notekeep: user_settings table missing; settings stay local. Run supabase/schema.sql to enable.'); return }
      throw error
    }
    const local = await getSetting<unknown>(FONTS_KEY)
    const remoteAt = data ? Number(data.updated_at) : 0
    if (data && (!local || remoteAt > local.updatedAt || (remoteAt === local.updatedAt && local.dirty === 0))) {
      if (!local || remoteAt !== local.updatedAt) { await putSettingClean(FONTS_KEY, { value: data.font_defaults, updatedAt: remoteAt, dirty: 0 }); setFontsFromRemote(data.font_defaults) }
    } else if (local && local.dirty !== 0) {
      const { error: e2 } = await supabase!.from('user_settings').upsert({ user_id: uidv, font_defaults: local.value, updated_at: local.updatedAt })
      if (e2) throw e2
      const now = await getSetting<unknown>(FONTS_KEY)
      if (now && now.updatedAt === local.updatedAt) await putSettingClean(FONTS_KEY, now)
    }
  }

  private async syncStore(s: Store): Promise<boolean> {
    const uidv = this.session!.user.id
    const cursorKey = `cursor:${uidv}:${s}`
    const since = (await getMeta<string>(cursorKey)) ?? '1970-01-01T00:00:00Z'
    const remoteRaw: any[] = []
    for (let from = 0; ; from += 1000) {                          // paginate the delta
      const { data, error } = await supabase!.from(s).select('*').gt('server_updated_at', since).order('server_updated_at').range(from, from + 999)
      if (error) throw error
      remoteRaw.push(...data); if (data.length < 1000) break
    }
    const remote = remoteRaw.map(fromRemote[s])
    const local = (await allRaw<any>(s)).map(r => ({ ...r, dirty: r.dirty === 0 ? 0 : 1 })) // pre-sync rows count as dirty
    const { toLocal, toRemote: push } = merge(local, remote)
    for (const r of toLocal) await putClean(s, r)
    if (push.length) {
      const { error } = await supabase!.from(s).upsert(push.map(toRemote[s]))
      if (error) throw error
      const now = new Map((await allRaw<any>(s)).map(r => [r.id, r]))
      for (const p of push) { const cur = now.get(p.id); if (cur && cur.updatedAt === p.updatedAt) await putClean(s, cur) } // keep dirty if edited mid-sync
    }
    const maxCursor = remoteRaw.reduce((m, r) => (r.server_updated_at > m ? r.server_updated_at : m), since)
    if (maxCursor !== since) await setMeta(cursorKey, maxCursor)
    return toLocal.length > 0
  }
}
