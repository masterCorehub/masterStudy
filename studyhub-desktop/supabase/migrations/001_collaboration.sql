-- StudyHub collaboration backend.
-- Run this migration in the Supabase SQL editor before enabling online sharing.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  avatar_url text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'shared' check (kind in ('personal', 'shared')),
  owner_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('owner', 'editor', 'commenter', 'viewer')),
  status text not null default 'active' check (status in ('active', 'pending', 'removed')),
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.shared_entities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_type text not null check (entity_type in ('note', 'whiteboard', 'resource', 'subject', 'project', 'task')),
  entity_id text not null,
  title text not null default '',
  payload jsonb not null default '{}'::jsonb,
  revision integer not null default 1,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, entity_type, entity_id)
);

create table if not exists public.share_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  shared_entity_id uuid not null references public.shared_entities(id) on delete cascade,
  email text not null,
  permission text not null default 'viewer' check (permission in ('viewer', 'commenter', 'editor')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  token uuid not null default gen_random_uuid(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  invited_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  accepted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (shared_entity_id, email)
);

create table if not exists public.shared_comments (
  id uuid primary key default gen_random_uuid(),
  shared_entity_id uuid not null references public.shared_entities(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workspace_members_user_idx on public.workspace_members(user_id);
create index if not exists shared_entities_workspace_idx on public.shared_entities(workspace_id, updated_at desc);
create index if not exists share_invitations_email_idx on public.share_invitations(lower(email));

create or replace function public.is_workspace_member(target_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace
      and user_id = auth.uid()
      and status = 'active'
  );
$$;

create or replace function public.workspace_role(target_workspace uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.workspace_members
  where workspace_id = target_workspace
    and user_id = auth.uid()
    and status = 'active'
  limit 1;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.shared_entities enable row level security;
alter table public.share_invitations enable row level security;
alter table public.shared_comments enable row level security;

create policy profiles_self_select on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy workspaces_member_select on public.workspaces for select to authenticated
  using (public.is_workspace_member(id) or owner_id = (select auth.uid()));
create policy workspaces_owner_insert on public.workspaces for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy workspaces_owner_update on public.workspaces for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy workspaces_owner_delete on public.workspaces for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy members_member_select on public.workspace_members for select to authenticated
  using (public.is_workspace_member(workspace_id) or user_id = (select auth.uid()));
create policy members_owner_insert on public.workspace_members for insert to authenticated
  with check (public.workspace_role(workspace_id) = 'owner' or user_id = (select auth.uid()));
create policy members_owner_update on public.workspace_members for update to authenticated
  using (public.workspace_role(workspace_id) = 'owner' or user_id = (select auth.uid()));
create policy members_owner_delete on public.workspace_members for delete to authenticated
  using (public.workspace_role(workspace_id) = 'owner' or user_id = (select auth.uid()));

create policy shared_entities_member_select on public.shared_entities for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy shared_entities_editor_insert on public.shared_entities for insert to authenticated
  with check (public.workspace_role(workspace_id) in ('owner', 'editor'));
create policy shared_entities_editor_update on public.shared_entities for update to authenticated
  using (public.workspace_role(workspace_id) in ('owner', 'editor'))
  with check (public.workspace_role(workspace_id) in ('owner', 'editor'));
create policy shared_entities_owner_delete on public.shared_entities for delete to authenticated
  using (public.workspace_role(workspace_id) = 'owner');

create policy invitations_member_select on public.share_invitations for select to authenticated
  using (public.is_workspace_member(workspace_id) or lower(email) = lower((select auth.jwt() ->> 'email')));
create policy invitations_editor_insert on public.share_invitations for insert to authenticated
  with check (public.workspace_role(workspace_id) in ('owner', 'editor'));
create policy invitations_editor_update on public.share_invitations for update to authenticated
  using (public.workspace_role(workspace_id) in ('owner', 'editor') or lower(email) = lower((select auth.jwt() ->> 'email')));

create policy comments_member_select on public.shared_comments for select to authenticated
  using (exists (select 1 from public.shared_entities e where e.id = shared_entity_id and public.is_workspace_member(e.workspace_id)));
create policy comments_member_insert on public.shared_comments for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.shared_entities e where e.id = shared_entity_id and public.is_workspace_member(e.workspace_id)));
create policy comments_author_update on public.shared_comments for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy comments_author_delete on public.shared_comments for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on all tables in schema public to authenticated;
