-- Store only the visitor-created four-digit order reference.
-- This is not a payment PIN, OTP, or payment-verification credential.
alter table public.orders
  add column if not exists order_code text;

alter table public.orders
  add constraint orders_order_code_format
  check (order_code is null or order_code ~ '^[0-9]{4}$');

-- Update the existing order-creation RPC while preserving its
-- service-role-only execution permissions.
drop function if exists public.create_order_with_notification(
  text, uuid, uuid, text, text, numeric, text, text, uuid, text,
  boolean, text, integer, jsonb
);

create function public.create_order_with_notification(
  p_order_ref text,
  p_customer_id uuid,
  p_link_id uuid,
  p_bundle_id text,
  p_bundle_name text,
  p_amount numeric,
  p_currency text,
  p_phone text,
  p_order_code text,
  p_idempotency_key uuid,
  p_payment_status text,
  p_notification_enabled boolean,
  p_chat_id text,
  p_config_version integer,
  p_notification_preferences jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  new_order public.orders;
  new_notification_id uuid;
begin
  if p_order_code is null or p_order_code !~ '^[0-9]{4}$' then
    raise exception 'Invalid visitor order code';
  end if;

  insert into public.orders(
    order_ref, customer_id, link_id, bundle_id, bundle_name,
    amount, currency, phone, order_code, idempotency_key, payment_status
  )
  values (
    p_order_ref, p_customer_id, p_link_id, p_bundle_id, p_bundle_name,
    p_amount, p_currency, p_phone, p_order_code, p_idempotency_key, 'pending'
  )
  returning * into new_order;

  if p_notification_enabled and coalesce(p_chat_id, '') <> '' then
    insert into public.notifications(
      order_id, customer_id, link_id, intended_chat_id, event_type,
      config_version, message_fields
    )
    values (
      new_order.id, p_customer_id, p_link_id, p_chat_id, 'new_order',
      p_config_version, coalesce(p_notification_preferences, '{}'::jsonb)
    )
    returning id into new_notification_id;
  end if;

  return jsonb_build_object(
    'id', new_order.id,
    'order_ref', new_order.order_ref,
    'order_code', new_order.order_code,
    'payment_status', new_order.payment_status,
    'amount', new_order.amount,
    'currency', new_order.currency,
    'created_at', new_order.created_at,
    'notification_queued', new_notification_id is not null
  );
end;
$$;

revoke all on function public.create_order_with_notification(
  text, uuid, uuid, text, text, numeric, text, text, uuid, text,
  boolean, text, integer, jsonb
) from public, anon, authenticated;

revoke all on function public.create_order_with_notification(
  text, uuid, uuid, text, text, numeric, text, text, text, uuid, text,
  boolean, text, integer, jsonb
) from public, anon, authenticated;

grant execute on function public.create_order_with_notification(
  text, uuid, uuid, text, text, numeric, text, text, text, uuid, text,
  boolean, text, integer, jsonb
) to service_role;

-- Include the saved code in queued jobs for the Telegram worker.
drop function if exists public.claim_notifications(integer);

create function public.claim_notifications(p_limit integer default 10)
returns table(
  id uuid,
  order_ref text,
  bundle_name text,
  amount numeric,
  payment_status text,
  phone text,
  order_code text,
  order_created_at timestamptz,
  intended_chat_id text,
  message_fields jsonb,
  attempts integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  return query
  with picked as (
    select n.id
    from public.notifications n
    where (
      n.status = 'queued'
      and (n.next_attempt_at is null or n.next_attempt_at <= now())
    ) or (
      n.status = 'processing'
      and (
        n.processing_started_at is null
        or n.processing_started_at < now() - interval '2 minutes'
      )
    )
    order by n.created_at asc
    limit greatest(1, least(p_limit, 50))
    for update skip locked
  ), updated as (
    update public.notifications n
    set status = 'processing',
        attempts = n.attempts + 1,
        processing_started_at = now()
    from picked
    where n.id = picked.id
    returning n.*
  )
  select
    u.id, o.order_ref, o.bundle_name, o.amount, o.payment_status,
    o.phone, o.order_code, o.created_at, u.intended_chat_id,
    u.message_fields, u.attempts
  from updated u
  left join public.orders o on o.id = u.order_id;
end;
$$;

revoke all on function public.claim_notifications(integer)
  from public, anon, authenticated;
grant execute on function public.claim_notifications(integer)
  to service_role;
