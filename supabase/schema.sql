-- Notekeep schema. Paste into Supabase Dashboard → SQL Editor → New query → Run. Safe to re-run.
-- Timestamps used for last-write-wins (created_at/updated_at/deleted_at) are client epoch milliseconds.
-- server_updated_at is set by the database and used only as the incremental pull cursor.

create table if not exists public.notebooks (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  stack text,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,                      -- set = notebook deleted (tombstone)
  server_updated_at timestamptz not null default now()
);

create table if not exists public.notes (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  notebook_id text not null,
  title text not null default '',
  html text not null default '',
  text text not null default '',          -- plain text for search
  tags text[] not null default '{}',
  pinned boolean not null default false,
  deleted_at bigint,                      -- set = in Trash
  purged boolean not null default false,  -- true = permanently deleted (tombstone)
  created_at bigint not null,
  updated_at bigint not null,
  server_updated_at timestamptz not null default now()
);

create index if not exists notes_user_sync on public.notes (user_id, server_updated_at);
create index if not exists notebooks_user_sync on public.notebooks (user_id, server_updated_at);

create or replace function public.touch_server_updated_at() returns trigger language plpgsql as $$
begin new.server_updated_at = now(); return new; end $$;
drop trigger if exists notes_touch on public.notes;
create trigger notes_touch before insert or update on public.notes for each row execute function public.touch_server_updated_at();
drop trigger if exists notebooks_touch on public.notebooks;
create trigger notebooks_touch before insert or update on public.notebooks for each row execute function public.touch_server_updated_at();

-- Row Level Security: each user sees and writes only their own rows.
alter table public.notes enable row level security;
alter table public.notebooks enable row level security;
do $$ declare t text; begin
  foreach t in array array['notes','notebooks'] loop
    execute format('drop policy if exists "own select" on public.%I', t);
    execute format('drop policy if exists "own insert" on public.%I', t);
    execute format('drop policy if exists "own update" on public.%I', t);
    execute format('drop policy if exists "own delete" on public.%I', t);
    execute format('create policy "own select" on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('create policy "own insert" on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "own update" on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "own delete" on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

-- Realtime (optional; used to pull changes from other devices instantly).
do $$ begin
  begin alter publication supabase_realtime add table public.notes; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.notebooks; exception when duplicate_object then null; end;
end $$;
