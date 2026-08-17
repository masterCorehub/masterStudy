-- Live note collaboration and attributed comments.
-- Safe to apply after 004_realtime_and_limits.sql.

begin;

alter table public.shared_comments
  add column if not exists author_name text not null default 'Participante';

alter table public.shared_comments
  drop constraint if exists shared_comments_author_name_length_check,
  add constraint shared_comments_author_name_length_check
    check (char_length(author_name) between 1 and 120) not valid;

alter table public.shared_comments replica identity full;

create or replace function public.set_shared_comment_author()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_name text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  new.user_id := auth.uid();
  select nullif(trim(profile.display_name), '')
    into resolved_name
    from public.profiles profile
   where profile.id = auth.uid();
  new.author_name := left(coalesce(
    resolved_name,
    nullif(trim(auth.jwt() -> 'user_metadata' ->> 'display_name'), ''),
    split_part(coalesce(auth.jwt() ->> 'email', 'Participante'), '@', 1),
    'Participante'
  ), 120);
  return new;
end;
$$;

drop trigger if exists shared_comment_author on public.shared_comments;
create trigger shared_comment_author
  before insert or update on public.shared_comments
  for each row execute function public.set_shared_comment_author();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'shared_comments'
     ) then
    execute 'alter publication supabase_realtime add table public.shared_comments';
  end if;
end;
$$;

create index if not exists shared_comments_entity_created_idx
  on public.shared_comments(shared_entity_id, created_at);

revoke all on function public.set_shared_comment_author() from public, anon, authenticated;

commit;
