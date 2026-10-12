# Notekeep
An Evernote-style three-pane notes app (Vite + React 19 + TypeScript + TipTap 3 + IndexedDB) with **optional** Supabase sync. See ANALYSIS.md for the reverse-engineering notes.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build
npm test           # unit tests (LWW merge logic)
npm run smoke      # Playwright smoke test, needs the dev server running (npx playwright install chromium once)
```

Without Supabase env vars the app is **local-only** (IndexedDB in your browser), exactly as before.

## Optional: Supabase sync (free tier friendly)

How it works: IndexedDB stays the source of truth. Every local write is marked dirty. The sync engine pulls rows changed since its last cursor (`server_updated_at`, set by a DB trigger), merges by **last-write-wins on `updated_at`**, and upserts dirty local rows. It runs on sign-in, ~1.5 s after local edits, on window focus/visibility, when the browser comes back online, every 60 s, and on Supabase Realtime change events. Offline edits stay dirty and sync on reconnect. Deletes are tombstones (`purged` for notes, `deleted_at` for notebooks) so they propagate. Status and sign-in/out live at the bottom of the sidebar.

### 1. Create the database
1. Create a project at https://supabase.com (Free plan is fine).
2. Dashboard → **SQL Editor** → **New query** → paste all of [`supabase/schema.sql`](supabase/schema.sql) → **Run**. It creates `notebooks` and `notes` (tags are a `text[]` column), triggers, Row Level Security policies (each user sees only rows where `user_id = auth.uid()`), and adds both tables to the `supabase_realtime` publication. You can safely run it again.

### 2. Get the keys
Dashboard → **Project Settings → API**: copy the **Project URL** and the **anon / public** key (the publishable key also works). Never use the `service_role` key in the browser.

### 3. Env vars
Local: create `.env.local` (git-ignored):
```
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```
Vercel: Project → **Settings → Environment Variables** → add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for Production (and Preview if wanted) → **redeploy** (Vite inlines them at build time). Vercel settings: Framework preset Vite, build `npm run build`, output `dist`.

### 4. Auth settings (magic link + email/password)
Dashboard → **Authentication → URL Configuration**:
- **Site URL**: `https://YOUR-APP.vercel.app` (or your custom domain)
- **Redirect URLs** (add each): `https://YOUR-APP.vercel.app/**`, `http://localhost:5173/**`, and for preview deploys `https://*-YOUR-VERCEL-TEAM.vercel.app/**`

Authentication → **Sign In / Providers → Email**: keep Email enabled. "Confirm email" on means password sign-ups must click the email link before signing in.
Free-tier note: the built-in mailer is heavily rate-limited (a few emails per hour). For real use, set up custom SMTP under Authentication → Emails → SMTP settings.

### Settings sync (font defaults)
Settings → Preferences → Notes → Default font settings are stored locally in IndexedDB (`settings` store) and, when signed in, in `public.user_settings` (one row per user, last-write-wins). If you set up Supabase before this table existed, re-run `supabase/schema.sql` (it's idempotent) — until then the app keeps settings local and logs one info message.

Font size unit: toolbar and settings sizes use one scale where 15 = normal text; rendered px = value × 16/15 (15 → 16px, H1 25 → 26.67px).

### Known limitations
- Conflicts are whole-row last-write-wins using client clocks, with no field-level merge. A device with a badly skewed clock can win incorrectly.
- Every fresh browser seeds its own "Welcome" note and "First Notebook", which then sync. Delete the duplicates if you sign in on several devices.
- Signing out keeps the local copy. Signing in as a different user on the same browser pushes the local notes into that account.
