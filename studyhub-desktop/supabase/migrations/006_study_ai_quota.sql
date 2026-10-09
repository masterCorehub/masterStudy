create table if not exists public.study_ai_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  minute_started_at timestamptz not null,
  minute_count integer not null default 0,
  usage_day date not null,
  day_count integer not null default 0
);

alter table public.study_ai_usage enable row level security;
revoke all on table public.study_ai_usage from public, anon, authenticated;
grant all on table public.study_ai_usage to service_role;

create or replace function public.consume_study_ai_quota(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed boolean := false;
  request_time timestamptz := now();
  current_minute timestamptz := date_trunc('minute', request_time);
  current_day date := (request_time at time zone 'utc')::date;
begin
  insert into public.study_ai_usage as usage (user_id, minute_started_at, minute_count, usage_day, day_count)
  values (p_user_id, current_minute, 1, current_day, 1)
  on conflict (user_id) do update
    set minute_count = case
          when usage.minute_started_at < current_minute then 1
          else usage.minute_count + 1
        end,
        minute_started_at = current_minute,
        day_count = case
          when usage.usage_day < current_day then 1
          else usage.day_count + 1
        end,
        usage_day = current_day
    where (usage.minute_started_at < current_minute or usage.minute_count < 5)
      and (usage.usage_day < current_day or usage.day_count < 60)
  returning true into allowed;

  return coalesce(allowed, false);
end;
$$;

revoke all on function public.consume_study_ai_quota(uuid) from public, anon, authenticated;
grant execute on function public.consume_study_ai_quota(uuid) to service_role;
