-- Reconcile the readiness contract with migrations 001 through 005.
-- Existing indexes and foreign keys are accepted by their definitions, not
-- by generated names. No client-facing policies or grants are introduced.

revoke all on table
  public.customers,
  public.visitor_links,
  public.orders,
  public.notifications,
  public.notification_attempts,
  public.bundle_catalog
from public, anon, authenticated;

grant select, insert, update on table
  public.customers,
  public.visitor_links,
  public.orders,
  public.notifications,
  public.notification_attempts,
  public.bundle_catalog
to service_role;
grant usage on schema public to service_role;

do $$
declare
  col record;
begin
  for col in
    select c.oid::regclass as table_name, a.attname
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'public'
      and c.relname = any(array['customers','visitor_links','orders','notifications','notification_attempts','bundle_catalog'])
      and a.attnum > 0 and not a.attisdropped
  loop
    execute format('revoke all (%I) on table %s from public, anon, authenticated', col.attname, col.table_name);
  end loop;
end;
$$;

alter table public.customers enable row level security;
alter table public.visitor_links enable row level security;
alter table public.orders enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_attempts enable row level security;
alter table public.bundle_catalog enable row level security;

do $$
declare
  fk record;
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid = 'public.orders'::regclass
      and c.contype = 'c'
      and c.conkey = array[(select attnum::smallint from pg_catalog.pg_attribute where attrelid = 'public.orders'::regclass and attname = 'order_code')]::smallint[]
      and pg_catalog.pg_get_constraintdef(c.oid) like '%order_code IS NULL%'
      and pg_catalog.pg_get_constraintdef(c.oid) like '%^[0-9]{4}$%'
  ) then
    alter table public.orders add constraint schema_ready_orders_order_code_format
      check (order_code is null or order_code ~ '^[0-9]{4}$');
  end if;
  for fk in
    select c.conname
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.orders'::regclass
      and c.contype = 'c'
      and c.convalidated = false
      and c.conkey = array[(select attnum::smallint from pg_catalog.pg_attribute where attrelid = 'public.orders'::regclass and attname = 'order_code')]::smallint[]
      and pg_catalog.pg_get_constraintdef(c.oid) like '%order_code IS NULL%'
      and pg_catalog.pg_get_constraintdef(c.oid) like '%^[0-9]{4}$%'
  loop
    execute format('alter table public.orders validate constraint %I', fk.conname);
  end loop;
  if not exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid = 'public.visitor_links'::regclass
      and c.contype = 'f' and c.confrelid = 'public.customers'::regclass
      and c.conkey = array[(select attnum::smallint from pg_catalog.pg_attribute where attrelid = 'public.visitor_links'::regclass and attname = 'customer_id')]::smallint[]
      and c.confkey = array[(select attnum::smallint from pg_catalog.pg_attribute where attrelid = 'public.customers'::regclass and attname = 'id')]::smallint[]
      and c.confdeltype = 'r'
  ) then
    alter table public.visitor_links add constraint schema_ready_visitor_links_customer_fk
      foreign key (customer_id) references public.customers(id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid = 'public.orders'::regclass
      and c.contype = 'f' and c.confrelid = 'public.customers'::regclass
      and c.conkey = array[(select attnum::smallint from pg_catalog.pg_attribute where attrelid = 'public.orders'::regclass and attname = 'customer_id')]::smallint[]
      and c.confkey = array[(select attnum::smallint from pg_catalog.pg_attribute where attrelid = 'public.customers'::regclass and attname = 'id')]::smallint[]
      and c.confdeltype = 'r'
  ) then
    alter table public.orders add constraint schema_ready_orders_customer_fk
      foreign key (customer_id) references public.customers(id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid = 'public.orders'::regclass
      and c.contype = 'f' and c.confrelid = 'public.visitor_links'::regclass
      and c.conkey = array[(select attnum::smallint from pg_catalog.pg_attribute where attrelid = 'public.orders'::regclass and attname = 'link_id')]::smallint[]
      and c.confkey = array[(select attnum::smallint from pg_catalog.pg_attribute where attrelid = 'public.visitor_links'::regclass and attname = 'id')]::smallint[]
      and c.confdeltype = 'r'
  ) then
    alter table public.orders add constraint schema_ready_orders_link_fk
      foreign key (link_id) references public.visitor_links(id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid = 'public.notifications'::regclass
      and c.contype = 'f' and c.confrelid = 'public.orders'::regclass
      and c.conkey = array[(select attnum::smallint from pg_catalog.pg_attribute where attrelid = 'public.notifications'::regclass and attname = 'order_id')]::smallint[]
      and c.confkey = array[(select attnum::smallint from pg_catalog.pg_attribute where attrelid = 'public.orders'::regclass and attname = 'id')]::smallint[]
      and c.confdeltype = 'n'
  ) then
    alter table public.notifications add constraint schema_ready_notifications_order_fk
      foreign key (order_id) references public.orders(id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid = 'public.notifications'::regclass
      and c.contype = 'f' and c.confrelid = 'public.customers'::regclass
      and c.conkey = array[(select attnum::smallint from pg_catalog.pg_attribute where attrelid = 'public.notifications'::regclass and attname = 'customer_id')]::smallint[]
      and c.confkey = array[(select attnum::smallint from pg_catalog.pg_attribute where attrelid = 'public.customers'::regclass and attname = 'id')]::smallint[]
      and c.confdeltype = 'r'
  ) then
    alter table public.notifications add constraint schema_ready_notifications_customer_fk
      foreign key (customer_id) references public.customers(id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid = 'public.notifications'::regclass
      and c.contype = 'f' and c.confrelid = 'public.visitor_links'::regclass
      and c.conkey = array[(select attnum::smallint from pg_catalog.pg_attribute where attrelid = 'public.notifications'::regclass and attname = 'link_id')]::smallint[]
      and c.confkey = array[(select attnum::smallint from pg_catalog.pg_attribute where attrelid = 'public.visitor_links'::regclass and attname = 'id')]::smallint[]
      and c.confdeltype = 'r'
  ) then
    alter table public.notifications add constraint schema_ready_notifications_link_fk
      foreign key (link_id) references public.visitor_links(id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid = 'public.notification_attempts'::regclass
      and c.contype = 'f' and c.confrelid = 'public.notifications'::regclass
      and c.conkey = array[(select attnum::smallint from pg_catalog.pg_attribute where attrelid = 'public.notification_attempts'::regclass and attname = 'notification_id')]::smallint[]
      and c.confkey = array[(select attnum::smallint from pg_catalog.pg_attribute where attrelid = 'public.notifications'::regclass and attname = 'id')]::smallint[]
      and c.confdeltype = 'c'
  ) then
    alter table public.notification_attempts add constraint schema_ready_notification_attempts_notification_fk
      foreign key (notification_id) references public.notifications(id) on delete cascade;
  end if;

  for fk in
    select c.conrelid::regclass as table_name, c.conname
    from pg_catalog.pg_constraint c
    where c.contype = 'f'
      and c.convalidated = false
      and (
        (c.conrelid = 'public.visitor_links'::regclass and c.confrelid = 'public.customers'::regclass and c.conkey = array[(select attnum::smallint from pg_catalog.pg_attribute where attrelid = 'public.visitor_links'::regclass and attname = 'customer_id')]::smallint[] and c.confkey = array[(select attnum::smallint from pg_catalog.pg_attribute where attrelid = 'public.customers'::regclass and attname = 'id')]::smallint[] and c.confdeltype = 'r')
        or (c.conrelid = 'public.orders'::regclass and c.confrelid = 'public.customers'::regclass and c.conkey = array[(select attnum::smallint from pg_catalog.pg_attribute where attrelid = 'public.orders'::regclass and attname = 'customer_id')]::smallint[] and c.confkey = array[(select attnum::smallint from pg_catalog.pg_attribute where attrelid = 'public.customers'::regclass and attname = 'id')]::smallint[] and c.confdeltype = 'r')
        or (c.conrelid = 'public.orders'::regclass and c.confrelid = 'public.visitor_links'::regclass and c.conkey = array[(select attnum::smallint from pg_catalog.pg_attribute where attrelid = 'public.orders'::regclass and attname = 'link_id')]::smallint[] and c.confkey = array[(select attnum::smallint from pg_catalog.pg_attribute where attrelid = 'public.visitor_links'::regclass and attname = 'id')]::smallint[] and c.confdeltype = 'r')
        or (c.conrelid = 'public.notifications'::regclass and c.confrelid = 'public.orders'::regclass and c.conkey = array[(select attnum::smallint from pg_catalog.pg_attribute where attrelid = 'public.notifications'::regclass and attname = 'order_id')]::smallint[] and c.confkey = array[(select attnum::smallint from pg_catalog.pg_attribute where attrelid = 'public.orders'::regclass and attname = 'id')]::smallint[] and c.confdeltype = 'n')
        or (c.conrelid = 'public.notifications'::regclass and c.confrelid = 'public.customers'::regclass and c.conkey = array[(select attnum::smallint from pg_catalog.pg_attribute where attrelid = 'public.notifications'::regclass and attname = 'customer_id')]::smallint[] and c.confkey = array[(select attnum::smallint from pg_catalog.pg_attribute where attrelid = 'public.customers'::regclass and attname = 'id')]::smallint[] and c.confdeltype = 'r')
        or (c.conrelid = 'public.notifications'::regclass and c.confrelid = 'public.visitor_links'::regclass and c.conkey = array[(select attnum::smallint from pg_catalog.pg_attribute where attrelid = 'public.notifications'::regclass and attname = 'link_id')]::smallint[] and c.confkey = array[(select attnum::smallint from pg_catalog.pg_attribute where attrelid = 'public.visitor_links'::regclass and attname = 'id')]::smallint[] and c.confdeltype = 'r')
        or (c.conrelid = 'public.notification_attempts'::regclass and c.confrelid = 'public.notifications'::regclass and c.conkey = array[(select attnum::smallint from pg_catalog.pg_attribute where attrelid = 'public.notification_attempts'::regclass and attname = 'notification_id')]::smallint[] and c.confkey = array[(select attnum::smallint from pg_catalog.pg_attribute where attrelid = 'public.notifications'::regclass and attname = 'id')]::smallint[] and c.confdeltype = 'c')
      )
  loop
    execute format('alter table %s validate constraint %I', fk.table_name, fk.conname);
  end loop;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_index i
    join pg_catalog.pg_class t on t.oid = i.indexrelid
    join pg_catalog.pg_am am on am.oid = t.relam
    where i.indrelid = 'public.visitor_links'::regclass and i.indisvalid and i.indisready and i.indpred is null and am.amname = 'btree' and i.indnkeyatts = 1
      and (select array_agg(pg_catalog.pg_get_indexdef(i.indexrelid, n, true) order by n) from generate_series(1, i.indnkeyatts) n) = array['customer_id']::text[]
  ) then create index schema_ready_visitor_links_customer_idx on public.visitor_links(customer_id); end if;
  if not exists (
    select 1 from pg_catalog.pg_index i
    join pg_catalog.pg_class t on t.oid = i.indexrelid
    join pg_catalog.pg_am am on am.oid = t.relam
    where i.indrelid = 'public.visitor_links'::regclass and i.indisvalid and i.indisready and i.indpred is null and am.amname = 'btree' and i.indnkeyatts = 1
      and (select array_agg(pg_catalog.pg_get_indexdef(i.indexrelid, n, true) order by n) from generate_series(1, i.indnkeyatts) n) = array['status']::text[]
  ) then create index schema_ready_visitor_links_status_idx on public.visitor_links(status); end if;
  if not exists (
    select 1 from pg_catalog.pg_index i
    join pg_catalog.pg_class t on t.oid = i.indexrelid
    join pg_catalog.pg_am am on am.oid = t.relam
    where i.indrelid = 'public.orders'::regclass and i.indisvalid and i.indisready and i.indpred is null and am.amname = 'btree' and i.indnkeyatts = 1
      and (select array_agg(pg_catalog.pg_get_indexdef(i.indexrelid, n, true) order by n) from generate_series(1, i.indnkeyatts) n) = array['customer_id']::text[]
  ) then create index schema_ready_orders_customer_idx on public.orders(customer_id); end if;
  if not exists (
    select 1 from pg_catalog.pg_index i
    join pg_catalog.pg_class t on t.oid = i.indexrelid
    join pg_catalog.pg_am am on am.oid = t.relam
    where i.indrelid = 'public.orders'::regclass and i.indisvalid and i.indisready and i.indpred is null and am.amname = 'btree' and i.indnkeyatts = 1
      and (select array_agg(pg_catalog.pg_get_indexdef(i.indexrelid, n, true) order by n) from generate_series(1, i.indnkeyatts) n) = array['link_id']::text[]
  ) then create index schema_ready_orders_link_idx on public.orders(link_id); end if;
  if not exists (
    select 1 from pg_catalog.pg_index i
    join pg_catalog.pg_class t on t.oid = i.indexrelid
    join pg_catalog.pg_am am on am.oid = t.relam
    where i.indrelid = 'public.orders'::regclass and i.indisvalid and i.indisready and i.indpred is null and am.amname = 'btree' and i.indnkeyatts = 1
      and (select array_agg(pg_catalog.pg_get_indexdef(i.indexrelid, n, true) order by n) from generate_series(1, i.indnkeyatts) n) = array['created_at']::text[]
  ) then create index schema_ready_orders_created_idx on public.orders(created_at desc); end if;
  if not exists (
    select 1 from pg_catalog.pg_index i
    join pg_catalog.pg_class t on t.oid = i.indexrelid
    join pg_catalog.pg_am am on am.oid = t.relam
    where i.indrelid = 'public.notifications'::regclass and i.indisvalid and i.indisready and i.indpred is null and am.amname = 'btree' and i.indnkeyatts = 2
      and (select array_agg(pg_catalog.pg_get_indexdef(i.indexrelid, n, true) order by n) from generate_series(1, i.indnkeyatts) n) = array['status','next_attempt_at']::text[]
  ) then create index schema_ready_notifications_status_next_idx on public.notifications(status, next_attempt_at); end if;
  if not exists (
    select 1 from pg_catalog.pg_index i
    join pg_catalog.pg_class t on t.oid = i.indexrelid
    join pg_catalog.pg_am am on am.oid = t.relam
    where i.indrelid = 'public.notifications'::regclass and i.indisvalid and i.indisready and i.indpred is null and am.amname = 'btree' and i.indnkeyatts = 1
      and (select array_agg(pg_catalog.pg_get_indexdef(i.indexrelid, n, true) order by n) from generate_series(1, i.indnkeyatts) n) = array['customer_id']::text[]
  ) then create index schema_ready_notifications_customer_idx on public.notifications(customer_id); end if;
  if not exists (
    select 1 from pg_catalog.pg_index i
    join pg_catalog.pg_class t on t.oid = i.indexrelid
    join pg_catalog.pg_am am on am.oid = t.relam
    where i.indrelid = 'public.notification_attempts'::regclass and i.indisvalid and i.indisready and i.indpred is null and am.amname = 'btree' and i.indnkeyatts = 2
      and (select array_agg(pg_catalog.pg_get_indexdef(i.indexrelid, n, true) order by n) from generate_series(1, i.indnkeyatts) n) = array['notification_id','attempted_at']::text[]
  ) then create index schema_ready_notification_attempts_notification_idx on public.notification_attempts(notification_id, attempted_at desc); end if;
end;
$$;

alter function public.claim_notifications(integer) set search_path = pg_catalog, public;
alter function public.complete_notification_attempt(uuid, integer, boolean, text, timestamptz) set search_path = pg_catalog, public;
alter function public.create_order_with_notification(text, uuid, uuid, text, text, numeric, text, text, text, uuid, text, boolean, text, integer, jsonb) set search_path = pg_catalog, public;

revoke all on function public.claim_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_notifications(integer) to service_role;
revoke all on function public.complete_notification_attempt(uuid, integer, boolean, text, timestamptz) from public, anon, authenticated;
grant execute on function public.complete_notification_attempt(uuid, integer, boolean, text, timestamptz) to service_role;
revoke all on function public.create_order_with_notification(text, uuid, uuid, text, text, numeric, text, text, text, uuid, text, boolean, text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.create_order_with_notification(text, uuid, uuid, text, text, numeric, text, text, text, uuid, text, boolean, text, integer, jsonb) to service_role;

create or replace function public.notification_schema_status()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select pg_catalog.jsonb_build_object(
    'customers', pg_catalog.to_regclass('public.customers') is not null,
    'customers_columns', (select count(distinct column_name) = 8 from information_schema.columns where table_schema = 'public' and table_name = 'customers' and column_name = any(array['id','name','notes','telegram_chat_id','notifications_enabled','notification_preferences','created_at','updated_at'])),
    'customers_rls', coalesce((select relrowsecurity from pg_catalog.pg_class where oid = pg_catalog.to_regclass('public.customers')), false),
    'customers_service_role_read', case when pg_catalog.to_regclass('public.customers') is not null then pg_catalog.has_table_privilege('service_role', 'public.customers', 'SELECT') else false end,
    'customers_service_role_write', case when pg_catalog.to_regclass('public.customers') is not null then pg_catalog.has_table_privilege('service_role', 'public.customers', 'INSERT') and pg_catalog.has_table_privilege('service_role', 'public.customers', 'UPDATE') else false end,
    'visitor_links', pg_catalog.to_regclass('public.visitor_links') is not null,
    'visitor_links_columns', (select count(distinct column_name) = 15 from information_schema.columns where table_schema = 'public' and table_name = 'visitor_links' and column_name = any(array['id','customer_id','name','token','token_hash','status','bundles','form_config','payment_instructions','telegram_chat_id','notifications_enabled','notification_preferences','config_version','created_at','updated_at'])),
    'visitor_links_customer_fk', exists (select 1 from pg_catalog.pg_constraint c where c.conrelid = pg_catalog.to_regclass('public.visitor_links') and c.contype = 'f' and c.confrelid = pg_catalog.to_regclass('public.customers') and c.conkey = array[(select attnum::smallint from pg_catalog.pg_attribute where attrelid = pg_catalog.to_regclass('public.visitor_links') and attname = 'customer_id')]::smallint[] and c.confkey = array[(select attnum::smallint from pg_catalog.pg_attribute where attrelid = pg_catalog.to_regclass('public.customers') and attname = 'id')]::smallint[] and c.confdeltype = 'r' and c.convalidated),
    'visitor_links_customer_index', exists (select 1 from pg_catalog.pg_index i join pg_catalog.pg_am am on am.oid = (select relam from pg_catalog.pg_class where oid = i.indexrelid) where i.indrelid = pg_catalog.to_regclass('public.visitor_links') and i.indisvalid and i.indisready and i.indpred is null and am.amname = 'btree' and i.indnkeyatts = 1 and (select array_agg(pg_catalog.pg_get_indexdef(i.indexrelid, n, true) order by n) from generate_series(1, i.indnkeyatts) n) = array['customer_id']::text[]),
    'visitor_links_status_index', exists (select 1 from pg_catalog.pg_index i join pg_catalog.pg_am am on am.oid = (select relam from pg_catalog.pg_class where oid = i.indexrelid) where i.indrelid = pg_catalog.to_regclass('public.visitor_links') and i.indisvalid and i.indisready and i.indpred is null and am.amname = 'btree' and i.indnkeyatts = 1 and (select array_agg(pg_catalog.pg_get_indexdef(i.indexrelid, n, true) order by n) from generate_series(1, i.indnkeyatts) n) = array['status']::text[]),
    'visitor_links_rls', coalesce((select relrowsecurity from pg_catalog.pg_class where oid = pg_catalog.to_regclass('public.visitor_links')), false),
    'visitor_links_service_role_read', case when pg_catalog.to_regclass('public.visitor_links') is not null then pg_catalog.has_table_privilege('service_role', 'public.visitor_links', 'SELECT') else false end,
    'visitor_links_service_role_write', case when pg_catalog.to_regclass('public.visitor_links') is not null then pg_catalog.has_table_privilege('service_role', 'public.visitor_links', 'INSERT') and pg_catalog.has_table_privilege('service_role', 'public.visitor_links', 'UPDATE') else false end,
    'orders', pg_catalog.to_regclass('public.orders') is not null,
    'orders_columns', (select count(distinct column_name) = 14 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = any(array['id','order_ref','idempotency_key','customer_id','link_id','bundle_id','bundle_name','amount','currency','phone','order_code','payment_status','payment_provider_reference','created_at'])),
    'orders_order_code_format', exists (select 1 from pg_catalog.pg_constraint c where c.conrelid = pg_catalog.to_regclass('public.orders') and c.contype = 'c' and c.conkey = array[(select attnum::smallint from pg_catalog.pg_attribute where attrelid = pg_catalog.to_regclass('public.orders') and attname = 'order_code')]::smallint[] and pg_catalog.pg_get_constraintdef(c.oid) like '%order_code IS NULL%' and pg_catalog.pg_get_constraintdef(c.oid) like '%^[0-9]{4}$%' and c.convalidated),
    'orders_customer_fk', exists (select 1 from pg_catalog.pg_constraint c where c.conrelid = pg_catalog.to_regclass('public.orders') and c.contype = 'f' and c.confrelid = pg_catalog.to_regclass('public.customers') and c.conkey = array[(select attnum::smallint from pg_catalog.pg_attribute where attrelid = pg_catalog.to_regclass('public.orders') and attname = 'customer_id')]::smallint[] and c.confkey = array[(select attnum::smallint from pg_catalog.pg_attribute where attrelid = pg_catalog.to_regclass('public.customers') and attname = 'id')]::smallint[] and c.confdeltype = 'r' and c.convalidated),
    'orders_link_fk', exists (select 1 from pg_catalog.pg_constraint c where c.conrelid = pg_catalog.to_regclass('public.orders') and c.contype = 'f' and c.confrelid = pg_catalog.to_regclass('public.visitor_links') and c.conkey = array[(select attnum::smallint from pg_catalog.pg_attribute where attrelid = pg_catalog.to_regclass('public.orders') and attname = 'link_id')]::smallint[] and c.confkey = array[(select attnum::smallint from pg_catalog.pg_attribute where attrelid = pg_catalog.to_regclass('public.visitor_links') and attname = 'id')]::smallint[] and c.confdeltype = 'r' and c.convalidated),
    'orders_customer_index', exists (select 1 from pg_catalog.pg_index i join pg_catalog.pg_am am on am.oid = (select relam from pg_catalog.pg_class where oid = i.indexrelid) where i.indrelid = pg_catalog.to_regclass('public.orders') and i.indisvalid and i.indisready and i.indpred is null and am.amname = 'btree' and i.indnkeyatts = 1 and (select array_agg(pg_catalog.pg_get_indexdef(i.indexrelid, n, true) order by n) from generate_series(1, i.indnkeyatts) n) = array['customer_id']::text[]),
    'orders_link_index', exists (select 1 from pg_catalog.pg_index i join pg_catalog.pg_am am on am.oid = (select relam from pg_catalog.pg_class where oid = i.indexrelid) where i.indrelid = pg_catalog.to_regclass('public.orders') and i.indisvalid and i.indisready and i.indpred is null and am.amname = 'btree' and i.indnkeyatts = 1 and (select array_agg(pg_catalog.pg_get_indexdef(i.indexrelid, n, true) order by n) from generate_series(1, i.indnkeyatts) n) = array['link_id']::text[]),
    'orders_created_index', exists (select 1 from pg_catalog.pg_index i join pg_catalog.pg_am am on am.oid = (select relam from pg_catalog.pg_class where oid = i.indexrelid) where i.indrelid = pg_catalog.to_regclass('public.orders') and i.indisvalid and i.indisready and i.indpred is null and am.amname = 'btree' and i.indnkeyatts = 1 and (select array_agg(pg_catalog.pg_get_indexdef(i.indexrelid, n, true) order by n) from generate_series(1, i.indnkeyatts) n) = array['created_at']::text[]),
    'orders_rls', coalesce((select relrowsecurity from pg_catalog.pg_class where oid = pg_catalog.to_regclass('public.orders')), false),
    'orders_service_role_read', case when pg_catalog.to_regclass('public.orders') is not null then pg_catalog.has_table_privilege('service_role', 'public.orders', 'SELECT') else false end,
    'orders_service_role_write', case when pg_catalog.to_regclass('public.orders') is not null then pg_catalog.has_table_privilege('service_role', 'public.orders', 'INSERT') and pg_catalog.has_table_privilege('service_role', 'public.orders', 'UPDATE') else false end
  ) || pg_catalog.jsonb_build_object(
    'notifications', pg_catalog.to_regclass('public.notifications') is not null,
    'notifications_columns', (select count(distinct column_name) = 15 from information_schema.columns where table_schema = 'public' and table_name = 'notifications' and column_name = any(array['id','order_id','customer_id','link_id','intended_chat_id','event_type','config_version','message_fields','status','attempts','next_attempt_at','last_error','created_at','sent_at','processing_started_at'])),
    'notifications_order_fk', exists (select 1 from pg_catalog.pg_constraint c where c.conrelid = pg_catalog.to_regclass('public.notifications') and c.contype = 'f' and c.confrelid = pg_catalog.to_regclass('public.orders') and c.conkey = array[(select attnum::smallint from pg_catalog.pg_attribute where attrelid = pg_catalog.to_regclass('public.notifications') and attname = 'order_id')]::smallint[] and c.confkey = array[(select attnum::smallint from pg_catalog.pg_attribute where attrelid = pg_catalog.to_regclass('public.orders') and attname = 'id')]::smallint[] and c.confdeltype = 'n' and c.convalidated),
    'notifications_customer_fk', exists (select 1 from pg_catalog.pg_constraint c where c.conrelid = pg_catalog.to_regclass('public.notifications') and c.contype = 'f' and c.confrelid = pg_catalog.to_regclass('public.customers') and c.conkey = array[(select attnum::smallint from pg_catalog.pg_attribute where attrelid = pg_catalog.to_regclass('public.notifications') and attname = 'customer_id')]::smallint[] and c.confkey = array[(select attnum::smallint from pg_catalog.pg_attribute where attrelid = pg_catalog.to_regclass('public.customers') and attname = 'id')]::smallint[] and c.confdeltype = 'r' and c.convalidated),
    'notifications_link_fk', exists (select 1 from pg_catalog.pg_constraint c where c.conrelid = pg_catalog.to_regclass('public.notifications') and c.contype = 'f' and c.confrelid = pg_catalog.to_regclass('public.visitor_links') and c.conkey = array[(select attnum::smallint from pg_catalog.pg_attribute where attrelid = pg_catalog.to_regclass('public.notifications') and attname = 'link_id')]::smallint[] and c.confkey = array[(select attnum::smallint from pg_catalog.pg_attribute where attrelid = pg_catalog.to_regclass('public.visitor_links') and attname = 'id')]::smallint[] and c.confdeltype = 'r' and c.convalidated),
    'notifications_status_index', exists (select 1 from pg_catalog.pg_index i join pg_catalog.pg_am am on am.oid = (select relam from pg_catalog.pg_class where oid = i.indexrelid) where i.indrelid = pg_catalog.to_regclass('public.notifications') and i.indisvalid and i.indisready and i.indpred is null and am.amname = 'btree' and i.indnkeyatts = 2 and (select array_agg(pg_catalog.pg_get_indexdef(i.indexrelid, n, true) order by n) from generate_series(1, i.indnkeyatts) n) = array['status','next_attempt_at']::text[]),
    'notifications_customer_index', exists (select 1 from pg_catalog.pg_index i join pg_catalog.pg_am am on am.oid = (select relam from pg_catalog.pg_class where oid = i.indexrelid) where i.indrelid = pg_catalog.to_regclass('public.notifications') and i.indisvalid and i.indisready and i.indpred is null and am.amname = 'btree' and i.indnkeyatts = 1 and (select array_agg(pg_catalog.pg_get_indexdef(i.indexrelid, n, true) order by n) from generate_series(1, i.indnkeyatts) n) = array['customer_id']::text[]),
    'notifications_rls', coalesce((select relrowsecurity from pg_catalog.pg_class where oid = pg_catalog.to_regclass('public.notifications')), false),
    'notifications_service_role_read', case when pg_catalog.to_regclass('public.notifications') is not null then pg_catalog.has_table_privilege('service_role', 'public.notifications', 'SELECT') else false end,
    'notifications_service_role_write', case when pg_catalog.to_regclass('public.notifications') is not null then pg_catalog.has_table_privilege('service_role', 'public.notifications', 'INSERT') and pg_catalog.has_table_privilege('service_role', 'public.notifications', 'UPDATE') else false end,
    'notification_attempts', pg_catalog.to_regclass('public.notification_attempts') is not null,
    'notification_attempts_columns', (select count(distinct column_name) = 6 from information_schema.columns where table_schema = 'public' and table_name = 'notification_attempts' and column_name = any(array['id','notification_id','attempt_number','status','error','attempted_at'])),
    'notification_attempts_notification_fk', exists (select 1 from pg_catalog.pg_constraint c where c.conrelid = pg_catalog.to_regclass('public.notification_attempts') and c.contype = 'f' and c.confrelid = pg_catalog.to_regclass('public.notifications') and c.conkey = array[(select attnum::smallint from pg_catalog.pg_attribute where attrelid = pg_catalog.to_regclass('public.notification_attempts') and attname = 'notification_id')]::smallint[] and c.confkey = array[(select attnum::smallint from pg_catalog.pg_attribute where attrelid = pg_catalog.to_regclass('public.notifications') and attname = 'id')]::smallint[] and c.confdeltype = 'c' and c.convalidated),
    'notification_attempts_notification_index', exists (select 1 from pg_catalog.pg_index i join pg_catalog.pg_am am on am.oid = (select relam from pg_catalog.pg_class where oid = i.indexrelid) where i.indrelid = pg_catalog.to_regclass('public.notification_attempts') and i.indisvalid and i.indisready and i.indpred is null and am.amname = 'btree' and i.indnkeyatts = 2 and (select array_agg(pg_catalog.pg_get_indexdef(i.indexrelid, n, true) order by n) from generate_series(1, i.indnkeyatts) n) = array['notification_id','attempted_at']::text[]),
    'notification_attempts_rls', coalesce((select relrowsecurity from pg_catalog.pg_class where oid = pg_catalog.to_regclass('public.notification_attempts')), false),
    'notification_attempts_service_role_read', case when pg_catalog.to_regclass('public.notification_attempts') is not null then pg_catalog.has_table_privilege('service_role', 'public.notification_attempts', 'SELECT') else false end,
    'notification_attempts_service_role_write', case when pg_catalog.to_regclass('public.notification_attempts') is not null then pg_catalog.has_table_privilege('service_role', 'public.notification_attempts', 'INSERT') and pg_catalog.has_table_privilege('service_role', 'public.notification_attempts', 'UPDATE') else false end,
    'bundle_catalog', pg_catalog.to_regclass('public.bundle_catalog') is not null,
    'bundle_catalog_columns', (select count(distinct column_name) = 10 from information_schema.columns where table_schema = 'public' and table_name = 'bundle_catalog' and column_name = any(array['bundle_id','name','validity','price','currency','description','enabled','promotional_label','sort_order','updated_at'])),
    'bundle_catalog_rls', coalesce((select relrowsecurity from pg_catalog.pg_class where oid = pg_catalog.to_regclass('public.bundle_catalog')), false),
    'bundle_catalog_service_role_read', case when pg_catalog.to_regclass('public.bundle_catalog') is not null then pg_catalog.has_table_privilege('service_role', 'public.bundle_catalog', 'SELECT') else false end,
    'bundle_catalog_service_role_write', case when pg_catalog.to_regclass('public.bundle_catalog') is not null then pg_catalog.has_table_privilege('service_role', 'public.bundle_catalog', 'INSERT') and pg_catalog.has_table_privilege('service_role', 'public.bundle_catalog', 'UPDATE') else false end
  ) || pg_catalog.jsonb_build_object(
    'client_rls_policies_restricted', not exists (
      select 1 from pg_catalog.pg_policy p
      where p.polrelid = any(array[
        pg_catalog.to_regclass('public.customers')::oid, pg_catalog.to_regclass('public.visitor_links')::oid,
        pg_catalog.to_regclass('public.orders')::oid, pg_catalog.to_regclass('public.notifications')::oid,
        pg_catalog.to_regclass('public.notification_attempts')::oid, pg_catalog.to_regclass('public.bundle_catalog')::oid
      ])
      and p.polroles && array[0::oid, (select oid from pg_catalog.pg_roles where rolname = 'anon'), (select oid from pg_catalog.pg_roles where rolname = 'authenticated')]
    ) and not exists (
      select 1 from pg_catalog.pg_class t
      where t.oid = any(array[
        pg_catalog.to_regclass('public.customers')::oid, pg_catalog.to_regclass('public.visitor_links')::oid,
        pg_catalog.to_regclass('public.orders')::oid, pg_catalog.to_regclass('public.notifications')::oid,
        pg_catalog.to_regclass('public.notification_attempts')::oid, pg_catalog.to_regclass('public.bundle_catalog')::oid
      ])
      and (
        pg_catalog.has_table_privilege('anon', t.oid, 'SELECT') or pg_catalog.has_table_privilege('anon', t.oid, 'INSERT') or pg_catalog.has_table_privilege('anon', t.oid, 'UPDATE') or pg_catalog.has_table_privilege('anon', t.oid, 'DELETE') or pg_catalog.has_table_privilege('anon', t.oid, 'TRUNCATE') or pg_catalog.has_table_privilege('anon', t.oid, 'REFERENCES') or pg_catalog.has_table_privilege('anon', t.oid, 'TRIGGER')
        or pg_catalog.has_table_privilege('authenticated', t.oid, 'SELECT') or pg_catalog.has_table_privilege('authenticated', t.oid, 'INSERT') or pg_catalog.has_table_privilege('authenticated', t.oid, 'UPDATE') or pg_catalog.has_table_privilege('authenticated', t.oid, 'DELETE') or pg_catalog.has_table_privilege('authenticated', t.oid, 'TRUNCATE') or pg_catalog.has_table_privilege('authenticated', t.oid, 'REFERENCES') or pg_catalog.has_table_privilege('authenticated', t.oid, 'TRIGGER')
        or exists (select 1 from pg_catalog.aclexplode(coalesce(t.relacl, pg_catalog.acldefault('r', t.relowner))) a where a.grantee = 0 and a.privilege_type in ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'))
      )
    ) and not exists (
      select 1 from information_schema.column_privileges p
      where p.table_schema = 'public'
        and p.table_name = any(array['customers','visitor_links','orders','notifications','notification_attempts','bundle_catalog'])
        and p.grantee in ('PUBLIC','anon','authenticated')
    ),
    'claim_notifications', pg_catalog.to_regprocedure('public.claim_notifications(integer)') is not null,
    'claim_notifications_service_role_execute', coalesce(pg_catalog.has_function_privilege('service_role', pg_catalog.to_regprocedure('public.claim_notifications(integer)'), 'EXECUTE'), false) and not coalesce(pg_catalog.has_function_privilege('anon', pg_catalog.to_regprocedure('public.claim_notifications(integer)'), 'EXECUTE'), true) and not coalesce(pg_catalog.has_function_privilege('authenticated', pg_catalog.to_regprocedure('public.claim_notifications(integer)'), 'EXECUTE'), true),
    'create_order_with_notification', pg_catalog.to_regprocedure('public.create_order_with_notification(text,uuid,uuid,text,text,numeric,text,text,text,uuid,text,boolean,text,integer,jsonb)') is not null,
    'create_order_with_notification_service_role_execute', coalesce(pg_catalog.has_function_privilege('service_role', pg_catalog.to_regprocedure('public.create_order_with_notification(text,uuid,uuid,text,text,numeric,text,text,text,uuid,text,boolean,text,integer,jsonb)'), 'EXECUTE'), false) and not coalesce(pg_catalog.has_function_privilege('anon', pg_catalog.to_regprocedure('public.create_order_with_notification(text,uuid,uuid,text,text,numeric,text,text,text,uuid,text,boolean,text,integer,jsonb)'), 'EXECUTE'), true) and not coalesce(pg_catalog.has_function_privilege('authenticated', pg_catalog.to_regprocedure('public.create_order_with_notification(text,uuid,uuid,text,text,numeric,text,text,text,uuid,text,boolean,text,integer,jsonb)'), 'EXECUTE'), true),
    'complete_notification_attempt', pg_catalog.to_regprocedure('public.complete_notification_attempt(uuid,integer,boolean,text,timestamptz)') is not null,
    'complete_notification_attempt_service_role_execute', coalesce(pg_catalog.has_function_privilege('service_role', pg_catalog.to_regprocedure('public.complete_notification_attempt(uuid,integer,boolean,text,timestamptz)'), 'EXECUTE'), false) and not coalesce(pg_catalog.has_function_privilege('anon', pg_catalog.to_regprocedure('public.complete_notification_attempt(uuid,integer,boolean,text,timestamptz)'), 'EXECUTE'), true) and not coalesce(pg_catalog.has_function_privilege('authenticated', pg_catalog.to_regprocedure('public.complete_notification_attempt(uuid,integer,boolean,text,timestamptz)'), 'EXECUTE'), true),
    'notification_schema_status', pg_catalog.to_regprocedure('public.notification_schema_status()') is not null,
    'notification_schema_status_service_role_execute', coalesce(pg_catalog.has_function_privilege('service_role', pg_catalog.to_regprocedure('public.notification_schema_status()'), 'EXECUTE'), false) and not coalesce(pg_catalog.has_function_privilege('anon', pg_catalog.to_regprocedure('public.notification_schema_status()'), 'EXECUTE'), true) and not coalesce(pg_catalog.has_function_privilege('authenticated', pg_catalog.to_regprocedure('public.notification_schema_status()'), 'EXECUTE'), true),
    'service_role_schema_usage', pg_catalog.has_schema_privilege('service_role', 'public', 'USAGE')
  );
$$;

revoke all on function public.notification_schema_status() from public, anon, authenticated;
grant execute on function public.notification_schema_status() to service_role;

notify pgrst, 'reload schema';
