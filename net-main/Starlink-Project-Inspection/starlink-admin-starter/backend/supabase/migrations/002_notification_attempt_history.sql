alter table public.notifications
  add column if not exists processing_started_at timestamptz;

alter table public.customers
  alter column notification_preferences set default '{"newOrder":true,"phone":false,"amount":true}'::jsonb;
alter table public.visitor_links
  alter column notification_preferences set default '{"newOrder":true,"phone":false,"amount":true}'::jsonb;
update public.customers
  set notification_preferences = jsonb_set(notification_preferences, '{phone}', 'false'::jsonb, true);
update public.visitor_links
  set notification_preferences = jsonb_set(notification_preferences, '{phone}', 'false'::jsonb, true);

create table if not exists public.notification_attempts (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  attempt_number integer not null check (attempt_number > 0),
  status text not null check (status in ('sent', 'failed')),
  error text,
  attempted_at timestamptz not null default now()
);
create index if not exists notification_attempts_notification_idx
  on public.notification_attempts(notification_id, attempted_at desc);
alter table public.notification_attempts enable row level security;

create or replace function public.claim_notifications(p_limit integer default 10)
returns table(id uuid, order_ref text, bundle_name text, amount numeric, payment_status text, phone text, order_created_at timestamptz, intended_chat_id text, message_fields jsonb, attempts integer)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with picked as (
    select n.id from public.notifications n
    where (n.status = 'queued' and (n.next_attempt_at is null or n.next_attempt_at <= now()))
      or (n.status = 'processing' and (n.processing_started_at is null or n.processing_started_at < now() - interval '2 minutes'))
    order by n.created_at asc
    limit greatest(1, least(p_limit, 50))
    for update skip locked
  ), updated as (
    update public.notifications n
      set status = 'processing', attempts = n.attempts + 1, processing_started_at = now()
    from picked where n.id = picked.id
    returning n.*
  )
  select u.id, o.order_ref, o.bundle_name, o.amount, o.payment_status, o.phone, o.created_at, u.intended_chat_id, u.message_fields, u.attempts
  from updated u left join public.orders o on o.id = u.order_id;
end; $$;

create or replace function public.complete_notification_attempt(
  p_id uuid, p_attempt integer, p_sent boolean, p_error text, p_next_attempt_at timestamptz
) returns boolean language plpgsql security definer set search_path = public as $$
declare current_status text; current_attempt integer;
begin
  select n.status, n.attempts into current_status, current_attempt
    from public.notifications n where n.id = p_id for update;
  if not found or current_status <> 'processing' or current_attempt <> p_attempt then
    return false;
  end if;

  insert into public.notification_attempts(notification_id, attempt_number, status, error)
    values (p_id, p_attempt, case when p_sent then 'sent' else 'failed' end, left(p_error, 500));
  update public.notifications
    set status = case when p_sent then 'sent' when p_attempt >= 8 then 'failed' else 'queued' end,
        last_error = case when p_sent then null else left(p_error, 500) end,
        sent_at = case when p_sent then now() else null end,
        next_attempt_at = case when p_sent or p_attempt >= 8 then null else p_next_attempt_at end,
        processing_started_at = null
    where id = p_id;
  return true;
end; $$;

revoke all on function public.claim_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_notifications(integer) to service_role;
revoke all on function public.complete_notification_attempt(uuid,integer,boolean,text,timestamptz) from public, anon, authenticated;
grant execute on function public.complete_notification_attempt(uuid,integer,boolean,text,timestamptz) to service_role;