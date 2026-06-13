-- The Grand Buffet · Supabase setup
-- Run in SQL Editor. Then enable Anonymous Sign-ins:
--   Dashboard → Authentication → Providers → Anonymous → Enable
-- (Email magic link is enabled by default.)

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null default 'Line Cook',
  best_haul int not null default 0,
  level int not null default 1,
  extractions int not null default 0,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Owners read/write their own row
create policy "own row select" on public.profiles for select using (auth.uid() = id);
create policy "own row insert" on public.profiles for insert with check (auth.uid() = id);
create policy "own row update" on public.profiles for update using (auth.uid() = id);

-- Public leaderboard: anyone signed-in may read the ranking columns.
-- (Simplest approach: allow select to all authenticated users.)
create policy "leaderboard read" on public.profiles for select to authenticated using (true);

create index if not exists profiles_best_haul_idx on public.profiles (best_haul desc);
