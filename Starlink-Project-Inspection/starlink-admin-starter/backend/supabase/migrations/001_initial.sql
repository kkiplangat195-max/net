create extension if not exists pgcrypto;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  notes text not null default '',
  telegram_chat_id text,
  notifications_enabled boolean not null default false,
  notification_preferences jsonb not null default '{"newOrder":true,"phone":true,"amount":true}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.visitor_links (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 120),
  token text not null unique,
  token_hash text not null unique,
  status text not null default 'draft' check (status in ('draft','published','unpublished','disabled')),
  bundles jsonb not null default '[]'::jsonb,
  form_config jsonb not null default '{"phoneRequired":true}'::jsonb,
  payment_instructions text not null default '',
  telegram_chat_id text,
  notifications_enabled boolean not null default false,
  notification_preferences jsonb not null default '{"newOrder":true,"phone":true,"amount":true}'::jsonb,
  config_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists visitor_links_customer_id_idx on public.visitor_links(customer_id);
create index if not exists visitor_links_status_idx on public.visitor_links(status);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_ref text not null unique,
  idempotency_key uuid not null unique,
  customer_id uuid not null references public.customers(id) on delete restrict,
  link_id uuid not null references public.visitor_links(id) on delete restrict,
  bundle_id text not null,
  bundle_name text not null,
  amount numeric(10,2) not null check (amount >= 0),
  currency text not null default 'USD' check (currency = 'USD'),
  phone text not null,
  payment_status text not null default 'pending' check (payment_status in ('pending','paid','failed','cancelled','refunded')),
  payment_provider_reference text,
  created_at timestamptz not null default now()
);
create index if not exists orders_customer_id_idx on public.orders(customer_id);
create index if not exists orders_link_id_idx on public.orders(link_id);
create index if not exists orders_created_at_idx on public.orders(created_at desc);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  customer_id uuid not null references public.customers(id) on delete restrict,
  link_id uuid not null references public.visitor_links(id) on delete restrict,
  intended_chat_id text not null,
  event_type text not null default 'new_order',
  config_version integer not null,
  message_fields jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','processing','sent','failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz default now(),
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists notifications_status_next_idx on public.notifications(status, next_attempt_at);
create index if not exists notifications_customer_idx on public.notifications(customer_id);

-- All access to these tables is through the server using the Supabase service role.
-- Never ship the service-role key to the browser.
alter table public.customers enable row level security;
alter table public.visitor_links enable row level security;
alter table public.orders enable row level security;
alter table public.notifications enable row level security;

create or replace function public.create_order_with_notification(
  p_order_ref text, p_customer_id uuid, p_link_id uuid, p_bundle_id text, p_bundle_name text,
  p_amount numeric, p_currency text, p_phone text, p_idempotency_key uuid, p_payment_status text,
  p_notification_enabled boolean, p_chat_id text, p_config_version integer, p_notification_preferences jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare new_order public.orders; new_notification_id uuid;
begin
  insert into public.orders(order_ref, customer_id, link_id, bundle_id, bundle_name, amount, currency, phone, idempotency_key, payment_status)
  values (p_order_ref, p_customer_id, p_link_id, p_bundle_id, p_bundle_name, p_amount, p_currency, p_phone, p_idempotency_key, 'pending')
  returning * into new_order;
  if p_notification_enabled and coalesce(p_chat_id, '') <> '' then
    insert into public.notifications(order_id, customer_id, link_id, intended_chat_id, event_type, config_version, message_fields)
    values (new_order.id, p_customer_id, p_link_id, p_chat_id, 'new_order', p_config_version, coalesce(p_notification_preferences, '{}'::jsonb))
    returning id into new_notification_id;
  end if;
  return jsonb_build_object('id', new_order.id, 'order_ref', new_order.order_ref, 'payment_status', new_order.payment_status, 'amount', new_order.amount, 'currency', new_order.currency, 'created_at', new_order.created_at, 'notification_queued', new_notification_id is not null);
end; $$;

create or replace function public.claim_notifications(p_limit integer default 10)
returns table(id uuid, order_ref text, bundle_name text, amount numeric, payment_status text, phone text, order_created_at timestamptz, intended_chat_id text, message_fields jsonb, attempts integer)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with picked as (
    select n.id from public.notifications n
    where n.status = 'queued' and (n.next_attempt_at is null or n.next_attempt_at <= now())
    order by n.created_at asc
    limit greatest(1, least(p_limit, 50))
    for update skip locked
  ), updated as (
    update public.notifications n set status = 'processing', attempts = n.attempts + 1
    from picked where n.id = picked.id
    returning n.*
  )
  select u.id, o.order_ref, o.bundle_name, o.amount, o.payment_status, o.phone, o.created_at, u.intended_chat_id, u.message_fields, u.attempts
  from updated u left join public.orders o on o.id = u.order_id;
end; $$;

-- Restrict RPC execution to the service role; API requests must never call these anonymously.
revoke all on function public.create_order_with_notification(text,uuid,uuid,text,text,numeric,text,text,uuid,text,boolean,text,integer,jsonb) from public, anon, authenticated;
grant execute on function public.create_order_with_notification(text,uuid,uuid,text,text,numeric,text,text,uuid,text,boolean,text,integer,jsonb) to service_role;
revoke all on function public.claim_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_notifications(integer) to service_role;

create table if not exists public.bundle_catalog (
  bundle_id text primary key,
  name text not null,
  validity text not null,
  price numeric(10,2) not null check (price >= 0),
  currency text not null default 'USD' check (currency = 'USD'),
  description text not null default '',
  enabled boolean not null default true,
  promotional_label text not null default '',
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.bundle_catalog enable row level security;
insert into public.bundle_catalog (
  bundle_id,
  name,
  validity,
  price,
  currency,
  description,
  enabled,
  promotional_label,
  sort_order
)
values
  ('5gb-trial', '5GB Data', '2-Day Trial', 0, 'USD', 'A free 2-day trial', true, 'FREE TRIAL', 1),
  ('15gb-7d', '15GB Data', '7-Day Plan', 0.99, 'USD', '15GB for 7 days', true, '', 2),
  ('35gb-14d', '35GB Data', '14-Day Plan', 1.99, 'USD', '35GB for 14 days', true, '', 3),
  ('50gb-21d', '50GB Data', '21-Day Plan', 2.99, 'USD', '50GB for 21 days', true, '', 4),
  ('unlimited-30d', 'Unlimited', '30-Day Plan', 3.99, 'USD', 'Unlimited data for 30 days', true, 'POPULAR', 5)
on conflict (bundle_id) do nothing;
