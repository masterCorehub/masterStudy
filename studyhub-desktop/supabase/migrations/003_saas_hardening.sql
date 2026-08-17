-- StudyHub SaaS hardening.
--
-- This migration is intentionally additive. It keeps account_state compatible
-- with installed desktop clients while adding optimistic concurrency, snapshot
-- history, private file storage and server-side collaboration operations.

begin;

-- ---------------------------------------------------------------------------
-- Shared content and membership security
-- ---------------------------------------------------------------------------

drop policy if exists profiles_self_insert on public.profiles;
create policy profiles_self_insert on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

-- Account deletion must not be blocked by content owned by the user. Owned
-- workspaces and shared rows are removed with the account; accepted invitations
-- from other users continue to keep only a null accepted_by reference.
alter table public.workspaces
  drop constraint if exists workspaces_owner_id_fkey;
alter table public.workspaces
  add constraint workspaces_owner_id_fkey
  foreign key (owner_id) references auth.users(id) on delete cascade;

alter table public.shared_entities
  drop constraint if exists shared_entities_created_by_fkey;
alter table public.shared_entities
  add constraint shared_entities_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete cascade;

alter table public.share_invitations
  drop constraint if exists share_invitations_invited_by_fkey;
alter table public.share_invitations
  add constraint share_invitations_invited_by_fkey
  foreign key (invited_by) references auth.users(id) on delete cascade;

alter table public.shared_entities
  drop constraint if exists shared_entities_entity_type_check;
alter table public.shared_entities
  add constraint shared_entities_entity_type_check
  check (entity_type in (
    'note', 'whiteboard', 'resource', 'subject', 'project', 'task',
    'course', 'lesson'
  ));

alter table public.share_invitations
  drop constraint if exists share_invitations_status_check;
alter table public.share_invitations
  add constraint share_invitations_status_check
  check (status in ('pending', 'accepted', 'declined', 'revoked', 'expired'));

drop policy if exists members_owner_insert on public.workspace_members;
drop policy if exists members_owner_update on public.workspace_members;
drop policy if exists members_owner_delete on public.workspace_members;

-- A user may create only the owner membership for a workspace they actually
-- own. Existing owners may add non-owner members. Invitation acceptance uses
-- the server-side function below and never trusts a role supplied by the app.
create policy members_secure_insert on public.workspace_members
  for insert to authenticated
  with check (
    (
      user_id = (select auth.uid())
      and role = 'owner'
      and status = 'active'
      and exists (
        select 1
        from public.workspaces workspace
        where workspace.id = workspace_id
          and workspace.owner_id = (select auth.uid())
      )
    )
    or (
      public.workspace_role(workspace_id) = 'owner'
      and role in ('editor', 'commenter', 'viewer')
    )
  );

create policy members_owner_update on public.workspace_members
  for update to authenticated
  using (public.workspace_role(workspace_id) = 'owner')
  with check (public.workspace_role(workspace_id) = 'owner');

create policy members_owner_or_self_delete on public.workspace_members
  for delete to authenticated
  using (
    public.workspace_role(workspace_id) = 'owner'
    or user_id = (select auth.uid())
  );

drop policy if exists invitations_editor_update on public.share_invitations;
create policy invitations_owner_update on public.share_invitations
  for update to authenticated
  using (public.workspace_role(workspace_id) = 'owner')
  with check (public.workspace_role(workspace_id) = 'owner');

drop policy if exists comments_member_insert on public.shared_comments;
create policy comments_contributor_insert on public.shared_comments
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.shared_entities entity
      where entity.id = shared_entity_id
        and public.workspace_role(entity.workspace_id) in ('owner', 'editor', 'commenter')
    )
  );

create or replace function public.ensure_default_workspace(workspace_name text default 'Meu StudyHub')
returns public.workspaces
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  result public.workspaces;
begin
  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 0));

  select workspace.*
    into result
    from public.workspaces workspace
   where workspace.owner_id = current_user_id
     and workspace.kind = 'personal'
   order by workspace.created_at
   limit 1;

  if result.id is null then
    insert into public.workspaces (name, kind, owner_id)
    values (
      left(coalesce(nullif(trim(workspace_name), ''), 'Meu StudyHub'), 120),
      'personal',
      current_user_id
    )
    returning * into result;
  end if;

  insert into public.workspace_members (workspace_id, user_id, role, status)
  values (result.id, current_user_id, 'owner', 'active')
  on conflict (workspace_id, user_id) do update
    set role = 'owner', status = 'active';

  return result;
end;
$$;

create or replace function public.respond_to_share_invitation(
  target_invitation_id uuid,
  accept_invitation boolean
)
returns public.share_invitations
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  invitation public.share_invitations;
begin
  if current_user_id is null or current_email = '' then
    raise exception 'AUTH_REQUIRED';
  end if;

  select item.*
    into invitation
    from public.share_invitations item
   where item.id = target_invitation_id
     and lower(item.email) = current_email
   for update;

  if invitation.id is null then
    raise exception 'INVITATION_NOT_FOUND';
  end if;

  if invitation.status <> 'pending' then
    raise exception 'INVITATION_NOT_PENDING';
  end if;

  if invitation.expires_at <= now() then
    update public.share_invitations
       set status = 'expired'
     where id = invitation.id
     returning * into invitation;
    return invitation;
  end if;

  if not accept_invitation then
    update public.share_invitations
       set status = 'declined'
     where id = invitation.id
     returning * into invitation;
    return invitation;
  end if;

  update public.share_invitations
     set status = 'accepted',
         accepted_by = current_user_id,
         accepted_at = now()
   where id = invitation.id
   returning * into invitation;

  return invitation;
end;
$$;

-- Invitations grant access to one entity, never to every entity in the
-- workspace. Remove memberships created by the legacy invitation flow from
-- personal workspaces; accepted invitation rows preserve item-level access.
delete from public.workspace_members member
using public.workspaces workspace
where member.workspace_id = workspace.id
  and workspace.kind = 'personal'
  and member.role <> 'owner';

create or replace function public.can_view_invited_entity(
  target_entity_id uuid,
  include_pending boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.share_invitations invitation
     where invitation.shared_entity_id = target_entity_id
       and lower(invitation.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
       and (
         invitation.status = 'accepted'
         or (
           include_pending
           and invitation.status = 'pending'
           and invitation.expires_at > now()
         )
       )
  );
$$;

create or replace function public.can_edit_invited_entity(target_entity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.share_invitations invitation
     where invitation.shared_entity_id = target_entity_id
       and invitation.accepted_by = auth.uid()
       and lower(invitation.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
       and invitation.status = 'accepted'
       and invitation.permission = 'editor'
  );
$$;

create or replace function public.can_comment_invited_entity(target_entity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.share_invitations invitation
     where invitation.shared_entity_id = target_entity_id
       and invitation.accepted_by = auth.uid()
       and lower(invitation.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
       and invitation.status = 'accepted'
       and invitation.permission in ('commenter', 'editor')
  );
$$;

drop policy if exists shared_entities_invitee_select on public.shared_entities;
create policy shared_entities_invitee_select on public.shared_entities
  for select to authenticated
  using (public.can_view_invited_entity(id, true));

drop policy if exists shared_entities_invitee_update on public.shared_entities;
create policy shared_entities_invitee_update on public.shared_entities
  for update to authenticated
  using (public.can_edit_invited_entity(id))
  with check (public.can_edit_invited_entity(id));

drop policy if exists comments_contributor_insert on public.shared_comments;
create policy comments_contributor_insert on public.shared_comments
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.shared_entities entity
      where entity.id = shared_entity_id
        and (
          public.workspace_role(entity.workspace_id) in ('owner', 'editor', 'commenter')
          or public.can_comment_invited_entity(entity.id)
        )
    )
  );

drop policy if exists comments_invitee_select on public.shared_comments;
create policy comments_invitee_select on public.shared_comments
  for select to authenticated
  using (public.can_view_invited_entity(shared_entity_id, false));

create or replace function public.revoke_share_invitation(target_invitation_id uuid)
returns public.share_invitations
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation public.share_invitations;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select item.*
    into invitation
    from public.share_invitations item
   where item.id = target_invitation_id
   for update;

  if invitation.id is null then
    raise exception 'INVITATION_NOT_FOUND';
  end if;

  if public.workspace_role(invitation.workspace_id) not in ('owner', 'editor') then
    raise exception 'INVITATION_FORBIDDEN';
  end if;

  update public.share_invitations
     set status = 'revoked'
   where id = invitation.id
   returning * into invitation;

  return invitation;
end;
$$;

create or replace function public.touch_shared_entity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.revision := old.revision + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists shared_entity_touch on public.shared_entities;
create trigger shared_entity_touch
  before update on public.shared_entities
  for each row execute function public.touch_shared_entity();

-- ---------------------------------------------------------------------------
-- Conflict-safe account snapshots and recoverable history
-- ---------------------------------------------------------------------------

alter table public.account_state
  add column if not exists revision bigint not null default 1,
  add column if not exists schema_version integer not null default 13,
  add column if not exists device_id text,
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

create table if not exists public.account_state_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  revision bigint not null,
  state jsonb not null,
  schema_version integer not null default 13,
  device_id text,
  archived_at timestamptz not null default now(),
  unique (user_id, revision)
);

create index if not exists account_state_history_user_idx
  on public.account_state_history(user_id, revision desc);

alter table public.account_state_history enable row level security;
drop policy if exists account_state_history_select_own on public.account_state_history;
create policy account_state_history_select_own on public.account_state_history
  for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.archive_account_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.account_state_history (
    user_id, revision, state, schema_version, device_id, archived_at
  ) values (
    old.user_id, old.revision, old.state, old.schema_version, old.device_id, now()
  ) on conflict (user_id, revision) do nothing;

  delete from public.account_state_history history
   where history.user_id = old.user_id
     and history.id not in (
       select recent.id
         from public.account_state_history recent
        where recent.user_id = old.user_id
        order by recent.revision desc
        limit 30
     );

  new.revision := old.revision + 1;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by, old.updated_by);
  return new;
end;
$$;

drop trigger if exists account_state_archive_before_update on public.account_state;
create trigger account_state_archive_before_update
  before update on public.account_state
  for each row execute function public.archive_account_state();

create or replace function public.save_account_state(
  next_state jsonb,
  expected_revision bigint default null,
  client_device_id text default null,
  client_schema_version integer default 13
)
returns table (
  applied boolean,
  conflict boolean,
  revision bigint,
  state jsonb,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_row public.account_state;
begin
  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if next_state is null or jsonb_typeof(next_state) <> 'object' then
    raise exception 'INVALID_ACCOUNT_STATE';
  end if;
  if pg_column_size(next_state) > 8388608 then
    raise exception 'ACCOUNT_STATE_TOO_LARGE';
  end if;

  select account.*
    into current_row
    from public.account_state account
   where account.user_id = current_user_id
   for update;

  if current_row.user_id is null then
    if expected_revision is not null and expected_revision not in (0, 1) then
      return query select false, true, 0::bigint, '{}'::jsonb, now();
      return;
    end if;

    insert into public.account_state (
      user_id, state, revision, schema_version, device_id, updated_by, updated_at
    ) values (
      current_user_id,
      next_state,
      1,
      greatest(coalesce(client_schema_version, 13), 1),
      left(nullif(client_device_id, ''), 160),
      current_user_id,
      now()
    )
    returning * into current_row;

    return query
      select true, false, current_row.revision, current_row.state, current_row.updated_at;
    return;
  end if;

  if expected_revision is not null and expected_revision <> current_row.revision then
    return query
      select false, true, current_row.revision, current_row.state, current_row.updated_at;
    return;
  end if;

  update public.account_state account
     set state = next_state,
         schema_version = greatest(coalesce(client_schema_version, 13), 1),
         device_id = left(nullif(client_device_id, ''), 160),
         updated_by = current_user_id
   where account.user_id = current_user_id
   returning account.* into current_row;

  return query
    select true, false, current_row.revision, current_row.state, current_row.updated_at;
end;
$$;

create or replace function public.restore_account_state(target_revision bigint)
returns public.account_state
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  history_row public.account_state_history;
  restored public.account_state;
begin
  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select history.*
    into history_row
    from public.account_state_history history
   where history.user_id = current_user_id
     and history.revision = target_revision;

  if history_row.id is null then
    raise exception 'BACKUP_NOT_FOUND';
  end if;

  update public.account_state account
     set state = history_row.state,
         schema_version = history_row.schema_version,
         device_id = 'restore',
         updated_by = current_user_id
   where account.user_id = current_user_id
   returning account.* into restored;

  return restored;
end;
$$;

-- ---------------------------------------------------------------------------
-- Private cloud files
-- ---------------------------------------------------------------------------

create or replace function public.safe_uuid(value text)
returns uuid
language plpgsql
immutable
strict
set search_path = public
as $$
begin
  return value::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
values (
  'studyhub-files',
  'studyhub-files',
  false,
  52428800,
  array[
    'application/pdf',
    'application/epub+zip',
    'application/zip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/markdown',
    'text/csv',
    'image/png',
    'image/jpeg',
    'image/webp',
    'audio/mpeg',
    'audio/wav',
    'video/mp4',
    'video/webm'
  ]::text[]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.file_objects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  shared_entity_id uuid references public.shared_entities(id) on delete set null,
  bucket_id text not null default 'studyhub-files',
  object_path text not null unique,
  original_name text not null,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0 check (size_bytes >= 0 and size_bytes <= 52428800),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.file_objects
  add column if not exists shared_entity_id uuid
  references public.shared_entities(id) on delete set null;

create index if not exists file_objects_owner_idx
  on public.file_objects(owner_id, created_at desc);
create index if not exists file_objects_workspace_idx
  on public.file_objects(workspace_id, created_at desc)
  where workspace_id is not null;
create index if not exists file_objects_shared_entity_idx
  on public.file_objects(shared_entity_id)
  where shared_entity_id is not null;

alter table public.file_objects enable row level security;

create or replace function public.can_access_file_object(
  target_object_path text,
  write_access boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = public, storage
as $$
  select exists (
    select 1
      from public.file_objects file
     where file.object_path = target_object_path
       and file.deleted_at is null
       and (
         file.owner_id = auth.uid()
         or (
           file.workspace_id is not null
           and (
             (not write_access and public.is_workspace_member(file.workspace_id))
             or public.workspace_role(file.workspace_id) in ('owner', 'editor')
           )
         )
         or (
           not write_access
           and file.shared_entity_id is not null
           and public.can_view_invited_entity(file.shared_entity_id, false)
         )
       )
  );
$$;

create policy file_objects_select_allowed on public.file_objects
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    or (workspace_id is not null and public.is_workspace_member(workspace_id))
    or (
      shared_entity_id is not null
      and public.can_view_invited_entity(shared_entity_id, false)
    )
  );
create policy file_objects_insert_allowed on public.file_objects
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and bucket_id = 'studyhub-files'
    and (
      workspace_id is null
      or public.workspace_role(workspace_id) in ('owner', 'editor')
    )
  );
create policy file_objects_update_allowed on public.file_objects
  for update to authenticated
  using (
    owner_id = (select auth.uid())
    or public.workspace_role(workspace_id) in ('owner', 'editor')
  )
  with check (
    owner_id = (select auth.uid())
    or public.workspace_role(workspace_id) in ('owner', 'editor')
  );
create policy file_objects_delete_allowed on public.file_objects
  for delete to authenticated
  using (
    owner_id = (select auth.uid())
    or public.workspace_role(workspace_id) in ('owner', 'editor')
  );

drop policy if exists studyhub_files_select on storage.objects;
drop policy if exists studyhub_files_insert on storage.objects;
drop policy if exists studyhub_files_update on storage.objects;
drop policy if exists studyhub_files_delete on storage.objects;

create policy studyhub_files_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'studyhub-files'
    and (
      (
        (storage.foldername(name))[1] = 'users'
        and (storage.foldername(name))[2] = (select auth.uid())::text
      )
      or (
        (storage.foldername(name))[1] = 'workspaces'
        and public.is_workspace_member(public.safe_uuid((storage.foldername(name))[2]))
      )
      or public.can_access_file_object(name, false)
    )
  );

create policy studyhub_files_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'studyhub-files'
    and (
      (
        (storage.foldername(name))[1] = 'users'
        and (storage.foldername(name))[2] = (select auth.uid())::text
      )
      or (
        (storage.foldername(name))[1] = 'workspaces'
        and public.workspace_role(public.safe_uuid((storage.foldername(name))[2])) in ('owner', 'editor')
      )
    )
  );

create policy studyhub_files_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'studyhub-files'
    and (
      (
        (storage.foldername(name))[1] = 'users'
        and (storage.foldername(name))[2] = (select auth.uid())::text
      )
      or (
        (storage.foldername(name))[1] = 'workspaces'
        and public.workspace_role(public.safe_uuid((storage.foldername(name))[2])) in ('owner', 'editor')
      )
    )
  )
  with check (
    bucket_id = 'studyhub-files'
    and (
      (
        (storage.foldername(name))[1] = 'users'
        and (storage.foldername(name))[2] = (select auth.uid())::text
      )
      or (
        (storage.foldername(name))[1] = 'workspaces'
        and public.workspace_role(public.safe_uuid((storage.foldername(name))[2])) in ('owner', 'editor')
      )
    )
  );

create policy studyhub_files_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'studyhub-files'
    and (
      (
        (storage.foldername(name))[1] = 'users'
        and (storage.foldername(name))[2] = (select auth.uid())::text
      )
      or (
        (storage.foldername(name))[1] = 'workspaces'
        and public.workspace_role(public.safe_uuid((storage.foldername(name))[2])) in ('owner', 'editor')
      )
      or public.can_access_file_object(name, true)
    )
  );

revoke all on function public.ensure_default_workspace(text) from public, anon;
revoke all on function public.respond_to_share_invitation(uuid, boolean) from public, anon;
revoke all on function public.revoke_share_invitation(uuid) from public, anon;
revoke all on function public.save_account_state(jsonb, bigint, text, integer) from public, anon;
revoke all on function public.restore_account_state(bigint) from public, anon;
revoke all on function public.can_view_invited_entity(uuid, boolean) from public, anon;
revoke all on function public.can_edit_invited_entity(uuid) from public, anon;
revoke all on function public.can_comment_invited_entity(uuid) from public, anon;
revoke all on function public.can_access_file_object(text, boolean) from public, anon;

grant execute on function public.ensure_default_workspace(text) to authenticated;
grant execute on function public.respond_to_share_invitation(uuid, boolean) to authenticated;
grant execute on function public.revoke_share_invitation(uuid) to authenticated;
grant execute on function public.save_account_state(jsonb, bigint, text, integer) to authenticated;
grant execute on function public.restore_account_state(bigint) to authenticated;
grant execute on function public.can_view_invited_entity(uuid, boolean) to authenticated;
grant execute on function public.can_edit_invited_entity(uuid) to authenticated;
grant execute on function public.can_comment_invited_entity(uuid) to authenticated;
grant execute on function public.can_access_file_object(text, boolean) to authenticated;
grant select on public.account_state_history to authenticated;
grant select, insert, update, delete on public.file_objects to authenticated;

commit;
