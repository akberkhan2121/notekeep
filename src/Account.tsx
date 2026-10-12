import { useEffect, useState } from 'react'
import { supabase, type SyncEngine } from './sync'

const label: Record<string, string> = { 'local-only': 'Local only', 'signed-out': 'Not syncing', syncing: 'Syncing…', synced: 'Synced', offline: 'Offline — changes queued', error: 'Sync error' }
export default function Account({ engine }: { engine: SyncEngine }) {
  const [, force] = useState(0)
  useEffect(() => engine.subscribe(() => force(x => x + 1)), [engine])
  const [open, setOpen] = useState(false); const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [msg, setMsg] = useState('')
  const st = engine.status
  const dot = <span className={'dot ' + st} />
  if (!supabase) return <div className="account" title="Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable sync">{dot}{label[st]}</div>
  if (engine.session) return <div className="account">
    <div title={engine.lastError}>{dot}{label[st]} <button className="link" onClick={() => engine.sync()}>Sync now</button></div>
    <div className="who">{engine.session.user.email} · <button className="link" onClick={() => supabase!.auth.signOut()}>Sign out</button></div>
  </div>
  const run = async (f: () => Promise<{ error: { message: string } | null }>, ok: string) => { setMsg('…'); const { error } = await f(); setMsg(error ? error.message : ok) }
  const redirect = window.location.origin + window.location.pathname
  return <div className="account">
    <div>{dot}{label[st]} <button className="link" onClick={() => setOpen(!open)}>{open ? 'Close' : 'Sign in to sync'}</button></div>
    {open && <form className="auth" onSubmit={e => e.preventDefault()}>
      <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} aria-label="Email" />
      <button onClick={() => run(() => supabase!.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } }), 'Check your email for a magic link.')}>Email me a magic link</button>
      <input type="password" placeholder="Password (optional)" value={pw} onChange={e => setPw(e.target.value)} aria-label="Password" />
      <div className="row">
        <button onClick={() => run(() => supabase!.auth.signInWithPassword({ email, password: pw }), 'Signed in.')}>Sign in</button>
        <button onClick={() => run(() => supabase!.auth.signUp({ email, password: pw, options: { emailRedirectTo: redirect } }), 'Account created. Check your email to confirm.')}>Sign up</button>
      </div>
      {msg && <div className="msg">{msg}</div>}
    </form>}
  </div>
}
