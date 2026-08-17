-- One private, versioned snapshot per account. The client keeps the same
-- shape as the local Zustand store, so desktop and web use the same data.
create table if not exists public.account_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.account_state enable row level security;

drop policy if exists "account_state_select_own" on public.account_state;
create policy "account_state_select_own" on public.account_state
  for select using (auth.uid() = user_id);

drop policy if exists "account_state_insert_own" on public.account_state;
create policy "account_state_insert_own" on public.account_state
  for insert with check (auth.uid() = user_id);

drop policy if exists "account_state_update_own" on public.account_state;
create policy "account_state_update_own" on public.account_state
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Required for the web app to receive changes made in another browser or
-- desktop session immediately.
alter table public.account_state replica identity full;
alter publication supabase_realtime add table public.account_state;
