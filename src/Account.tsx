import { useEffect, useState } from 'react'
import { LogOut, RefreshCw, ChevronUp } from 'lucide-react'
import { supabase, type SyncEngine } from './sync'

const label: Record<string, string> = { 'local-only': 'Local only', 'signed-out': 'Not syncing', syncing: 'Syncing…', synced: 'Synced', offline: 'Offline — changes queued', error: 'Sync error' }
export default function Account({ engine }: { engine: SyncEngine }) {
  const [, force] = useState(0)
  useEffect(() => engine.subscribe(() => force(x => x + 1)), [engine])
  const [open, setOpen] = useState(false); const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [msg, setMsg] = useState('')
  const st = engine.status
  const em = engine.session?.user.email ?? ''
  const name = em ? em.split('@')[0] : 'Notekeep'
  const initials = (em ? name.split(/[._-]/).map(x => x[0]).join('').slice(0, 2) : 'NK').toUpperCase()
  const run = async (f: () => Promise<{ error: { message: string } | null }>, ok: string) => { setMsg('…'); const { error } = await f(); setMsg(error ? error.message : ok) }
  const redirect = window.location.origin + window.location.pathname
  return <div className="account">
    {open && <div className="acct-menu" onClick={e => e.stopPropagation()}>
      <div className="acct-status"><span className={'dot ' + st} />{label[st]}{engine.lastError && <div className="msg">{engine.lastError}</div>}</div>
      {!supabase && <div className="msg">Sync is off. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable it.</div>}
      {supabase && engine.session && <>
        <div className="who">{em}</div>
        <button className="mi" onClick={() => engine.sync()}><RefreshCw size={14} /> Sync now</button>
        <button className="mi" onClick={() => { supabase!.auth.signOut(); setOpen(false) }}><LogOut size={14} /> Sign out</button>
      </>}
      {supabase && !engine.session && <form className="auth" onSubmit={e => e.preventDefault()}>
        <div className="who">Sign in to sync your notes</div>
        <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} aria-label="Email" />
        <button onClick={() => run(() => supabase!.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } }), 'Check your email for a magic link.')}>Email me a magic link</button>
        <input type="password" placeholder="Password (optional)" value={pw} onChange={e => setPw(e.target.value)} aria-label="Password" />
        <div className="row">
          <button onClick={() => run(() => supabase!.auth.signInWithPassword({ email, password: pw }), 'Signed in.')}>Sign in</button>
          <button onClick={() => run(() => supabase!.auth.signUp({ email, password: pw, options: { emailRedirectTo: redirect } }), 'Account created. Check your email to confirm.')}>Sign up</button>
        </div>
        {msg && <div className="msg">{msg}</div>}
      </form>}
    </div>}
    <button className="user" onClick={e => { e.stopPropagation(); setOpen(!open) }} title={label[st]} aria-label="Account and sync">
      <span className="avatar">{initials}</span><span className="uname">{em ? name : supabase ? 'Sign in to sync' : 'Notekeep'}</span>
      <span className={'dot ' + st} /><ChevronUp size={14} />
    </button>
  </div>
}
