-- Realtime channels and bounded collaboration payloads.
-- Safe to apply after 003_saas_hardening.sql.

begin;

alter table public.shared_entities replica identity full;
alter table public.share_invitations replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'shared_entities'
    ) then
      execute 'alter publication supabase_realtime add table public.shared_entities';
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'share_invitations'
    ) then
      execute 'alter publication supabase_realtime add table public.share_invitations';
    end if;
  end if;
end;
$$;

create index if not exists share_invitations_email_status_idx
  on public.share_invitations(email, status, created_at desc);

alter table public.shared_entities
  drop constraint if exists shared_entities_title_length_check,
  add constraint shared_entities_title_length_check
    check (char_length(title) <= 240) not valid,
  drop constraint if exists shared_entities_payload_size_check,
  add constraint shared_entities_payload_size_check
    check (pg_column_size(payload) <= 2097152) not valid;

alter table public.share_invitations
  drop constraint if exists share_invitations_email_length_check,
  add constraint share_invitations_email_length_check
    check (char_length(email) between 3 and 320) not valid;

alter table public.shared_comments
  drop constraint if exists shared_comments_body_length_check,
  add constraint shared_comments_body_length_check
    check (char_length(trim(body)) between 1 and 10000) not valid;

commit;
