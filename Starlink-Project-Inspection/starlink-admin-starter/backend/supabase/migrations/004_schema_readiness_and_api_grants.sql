-- Safe to rerun: this only changes grants, RLS flags, indexes, and function
-- definitions. It does not modify or delete customer/order/notification rows.
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

create index if not exists visitor_links_customer_id_idx on public.visitor_links(customer_id);
create index if not exists visitor_links_status_idx on public.visitor_links(status);
create index if not exists orders_customer_id_idx on public.orders(customer_id);
create index if not exists orders_link_id_idx on public.orders(link_id);
create index if not exists orders_created_at_idx on public.orders(created_at desc);
create index if not exists notifications_status_next_idx on public.notifications(status, next_attempt_at);
create index if not exists notifications_customer_idx on public.notifications(customer_id);
create index if not exists notification_attempts_notification_idx on public.notification_attempts(notification_id, attempted_at desc);

do $$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.visitor_links'::regclass and conname = 'visitor_links_customer_id_fkey') then
    alter table public.visitor_links add constraint visitor_links_customer_id_fkey foreign key (customer_id) references public.customers(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.orders'::regclass and conname = 'orders_customer_id_fkey') then
    alter table public.orders add constraint orders_customer_id_fkey foreign key (customer_id) references public.customers(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.orders'::regclass and conname = 'orders_link_id_fkey') then
    alter table public.orders add constraint orders_link_id_fkey foreign key (link_id) references public.visitor_links(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.notifications'::regclass and conname = 'notifications_order_id_fkey') then
    alter table public.notifications add constraint notifications_order_id_fkey foreign key (order_id) references public.orders(id) on delete set null;
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.notifications'::regclass and conname = 'notifications_customer_id_fkey') then
    alter table public.notifications add constraint notifications_customer_id_fkey foreign key (customer_id) references public.customers(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.notifications'::regclass and conname = 'notifications_link_id_fkey') then
    alter table public.notifications add constraint notifications_link_id_fkey foreign key (link_id) references public.visitor_links(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.notification_attempts'::regclass and conname = 'notification_attempts_notification_id_fkey') then
    alter table public.notification_attempts add constraint notification_attempts_notification_id_fkey foreign key (notification_id) references public.notifications(id) on delete cascade;
  end if;
end;
$$;

alter table public.customers enable row level security;
alter table public.visitor_links enable row level security;
alter table public.orders enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_attempts enable row level security;
alter table public.bundle_catalog enable row level security;

alter function public.create_order_with_notification(text,uuid,uuid,text,text,numeric,text,text,uuid,text,boolean,text,integer,jsonb) set search_path = pg_catalog, public;
alter function public.claim_notifications(integer) set search_path = pg_catalog, public;
alter function public.complete_notification_attempt(uuid,integer,boolean,text,timestamptz) set search_path = pg_catalog, public;

revoke all on function public.create_order_with_notification(text,uuid,uuid,text,text,numeric,text,text,uuid,text,boolean,text,integer,jsonb) from public, anon, authenticated;
grant execute on function public.create_order_with_notification(text,uuid,uuid,text,text,numeric,text,text,uuid,text,boolean,text,integer,jsonb) to service_role;
revoke all on function public.claim_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_notifications(integer) to service_role;
revoke all on function public.complete_notification_attempt(uuid,integer,boolean,text,timestamptz) from public, anon, authenticated;
grant execute on function public.complete_notification_attempt(uuid,integer,boolean,text,timestamptz) to service_role;
revoke all on function public.notification_schema_status() from public, anon, authenticated;
grant execute on function public.notification_schema_status() to service_role;

create or replace function public.notification_schema_status()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select pg_catalog.jsonb_build_object(
    'customers', pg_catalog.to_regclass('public.customers') is not null,
    'customers_columns', (
      select count(distinct column_name) = 8
      from information_schema.columns
      where table_schema = 'public' and table_name = 'customers'
        and column_name = any(array['id','name','notes','telegram_chat_id','notifications_enabled','notification_preferences','created_at','updated_at'])
    ),
    'customers_rls', coalesce((select relrowsecurity from pg_catalog.pg_class where oid = pg_catalog.to_regclass('public.customers')), false),
    'customers_service_role_read', case when pg_catalog.to_regclass('public.customers') is not null then pg_catalog.has_table_privilege('service_role', 'public.customers', 'SELECT') else false end,
    'customers_service_role_write', case when pg_catalog.to_regclass('public.customers') is not null then pg_catalog.has_table_privilege('service_role', 'public.customers', 'INSERT') and pg_catalog.has_table_privilege('service_role', 'public.customers', 'UPDATE') else false end
  ) || pg_catalog.jsonb_build_object(
    'visitor_links', pg_catalog.to_regclass('public.visitor_links') is not null,
    'visitor_links_columns', (
      select count(distinct column_name) = 15
      from information_schema.columns
      where table_schema = 'public' and table_name = 'visitor_links'
        and column_name = any(array['id','customer_id','name','token','token_hash','status','bundles','form_config','payment_instructions','telegram_chat_id','notifications_enabled','notification_preferences','config_version','created_at','updated_at'])
    ),
    'visitor_links_customer_fk', exists (select 1 from pg_catalog.pg_constraint where conrelid = pg_catalog.to_regclass('public.visitor_links') and conname = 'visitor_links_customer_id_fkey' and contype = 'f' and confrelid = pg_catalog.to_regclass('public.customers') and confdeltype = 'r'),
    'visitor_links_customer_index', exists (select 1 from pg_catalog.pg_indexes where schemaname = 'public' and indexname = 'visitor_links_customer_id_idx' and indexdef ilike '%(customer_id)%'),
    'visitor_links_status_index', exists (select 1 from pg_catalog.pg_indexes where schemaname = 'public' and indexname = 'visitor_links_status_idx' and indexdef ilike '%(status)%'),
    'visitor_links_rls', coalesce((select relrowsecurity from pg_catalog.pg_class where oid = pg_catalog.to_regclass('public.visitor_links')), false),
    'visitor_links_service_role_read', case when pg_catalog.to_regclass('public.visitor_links') is not null then pg_catalog.has_table_privilege('service_role', 'public.visitor_links', 'SELECT') else false end,
    'visitor_links_service_role_write', case when pg_catalog.to_regclass('public.visitor_links') is not null then pg_catalog.has_table_privilege('service_role', 'public.visitor_links', 'INSERT') and pg_catalog.has_table_privilege('service_role', 'public.visitor_links', 'UPDATE') else false end,
    'orders', pg_catalog.to_regclass('public.orders') is not null,
    'orders_columns', (
      select count(distinct column_name) = 14
      from information_schema.columns
      where table_schema = 'public' and table_name = 'orders'
        and column_name = any(array['id','order_ref','idempotency_key','customer_id','link_id','bundle_id','bundle_name','amount','currency','phone','order_code','payment_status','payment_provider_reference','created_at'])
    ),
    'orders_customer_fk', exists (select 1 from pg_catalog.pg_constraint where conrelid = pg_catalog.to_regclass('public.orders') and conname = 'orders_customer_id_fkey' and contype = 'f' and confrelid = pg_catalog.to_regclass('public.customers') and confdeltype = 'r'),
    'orders_link_fk', exists (select 1 from pg_catalog.pg_constraint where conrelid = pg_catalog.to_regclass('public.orders') and conname = 'orders_link_id_fkey' and contype = 'f' and confrelid = pg_catalog.to_regclass('public.visitor_links') and confdeltype = 'r'),
    'orders_customer_index', exists (select 1 from pg_catalog.pg_indexes where schemaname = 'public' and indexname = 'orders_customer_id_idx' and indexdef ilike '%(customer_id)%'),
    'orders_link_index', exists (select 1 from pg_catalog.pg_indexes where schemaname = 'public' and indexname = 'orders_link_id_idx' and indexdef ilike '%(link_id)%'),
    'orders_created_index', exists (select 1 from pg_catalog.pg_indexes where schemaname = 'public' and indexname = 'orders_created_at_idx' and indexdef ilike '%(created_at DESC)%'),
    'orders_rls', coalesce((select relrowsecurity from pg_catalog.pg_class where oid = pg_catalog.to_regclass('public.orders')), false),
    'orders_service_role_read', case when pg_catalog.to_regclass('public.orders') is not null then pg_catalog.has_table_privilege('service_role', 'public.orders', 'SELECT') else false end,
    'orders_service_role_write', case when pg_catalog.to_regclass('public.orders') is not null then pg_catalog.has_table_privilege('service_role', 'public.orders', 'INSERT') and pg_catalog.has_table_privilege('service_role', 'public.orders', 'UPDATE') else false end
  ) || pg_catalog.jsonb_build_object(
    'notifications', pg_catalog.to_regclass('public.notifications') is not null,
    'notifications_columns', (
      select count(distinct column_name) = 15
      from information_schema.columns
      where table_schema = 'public' and table_name = 'notifications'
        and column_name = any(array['id','order_id','customer_id','link_id','intended_chat_id','event_type','config_version','message_fields','status','attempts','next_attempt_at','last_error','created_at','sent_at','processing_started_at'])
    ),
    'notifications_order_fk', exists (select 1 from pg_catalog.pg_constraint where conrelid = pg_catalog.to_regclass('public.notifications') and conname = 'notifications_order_id_fkey' and contype = 'f' and confrelid = pg_catalog.to_regclass('public.orders') and confdeltype = 'n'),
    'notifications_customer_fk', exists (select 1 from pg_catalog.pg_constraint where conrelid = pg_catalog.to_regclass('public.notifications') and conname = 'notifications_customer_id_fkey' and contype = 'f' and confrelid = pg_catalog.to_regclass('public.customers') and confdeltype = 'r'),
    'notifications_link_fk', exists (select 1 from pg_catalog.pg_constraint where conrelid = pg_catalog.to_regclass('public.notifications') and conname = 'notifications_link_id_fkey' and contype = 'f' and confrelid = pg_catalog.to_regclass('public.visitor_links') and confdeltype = 'r'),
    'notifications_status_index', exists (select 1 from pg_catalog.pg_indexes where schemaname = 'public' and indexname = 'notifications_status_next_idx' and indexdef ilike '%(status, next_attempt_at)%'),
    'notifications_customer_index', exists (select 1 from pg_catalog.pg_indexes where schemaname = 'public' and indexname = 'notifications_customer_idx' and indexdef ilike '%(customer_id)%'),
    'notifications_rls', coalesce((select relrowsecurity from pg_catalog.pg_class where oid = pg_catalog.to_regclass('public.notifications')), false),
    'notifications_service_role_read', case when pg_catalog.to_regclass('public.notifications') is not null then pg_catalog.has_table_privilege('service_role', 'public.notifications', 'SELECT') else false end,
    'notifications_service_role_write', case when pg_catalog.to_regclass('public.notifications') is not null then pg_catalog.has_table_privilege('service_role', 'public.notifications', 'INSERT') and pg_catalog.has_table_privilege('service_role', 'public.notifications', 'UPDATE') else false end,
    'notification_attempts', pg_catalog.to_regclass('public.notification_attempts') is not null,
    'notification_attempts_columns', (
      select count(distinct column_name) = 6
      from information_schema.columns
      where table_schema = 'public' and table_name = 'notification_attempts'
        and column_name = any(array['id','notification_id','attempt_number','status','error','attempted_at'])
    ),
    'notification_attempts_notification_fk', exists (select 1 from pg_catalog.pg_constraint where conrelid = pg_catalog.to_regclass('public.notification_attempts') and conname = 'notification_attempts_notification_id_fkey' and contype = 'f' and confrelid = pg_catalog.to_regclass('public.notifications') and confdeltype = 'c'),
    'notification_attempts_notification_index', exists (select 1 from pg_catalog.pg_indexes where schemaname = 'public' and indexname = 'notification_attempts_notification_idx' and indexdef ilike '%(notification_id, attempted_at DESC)%'),
    'notification_attempts_rls', coalesce((select relrowsecurity from pg_catalog.pg_class where oid = pg_catalog.to_regclass('public.notification_attempts')), false),
    'notification_attempts_service_role_read', case when pg_catalog.to_regclass('public.notification_attempts') is not null then pg_catalog.has_table_privilege('service_role', 'public.notification_attempts', 'SELECT') else false end,
    'notification_attempts_service_role_write', case when pg_catalog.to_regclass('public.notification_attempts') is not null then pg_catalog.has_table_privilege('service_role', 'public.notification_attempts', 'INSERT') and pg_catalog.has_table_privilege('service_role', 'public.notification_attempts', 'UPDATE') else false end
  ) || pg_catalog.jsonb_build_object(
    'bundle_catalog', pg_catalog.to_regclass('public.bundle_catalog') is not null,
    'bundle_catalog_columns', (
      select count(distinct column_name) = 10
      from information_schema.columns
      where table_schema = 'public' and table_name = 'bundle_catalog'
        and column_name = any(array['bundle_id','name','validity','price','currency','description','enabled','promotional_label','sort_order','updated_at'])
    ),
    'bundle_catalog_rls', coalesce((select relrowsecurity from pg_catalog.pg_class where oid = pg_catalog.to_regclass('public.bundle_catalog')), false),
    'bundle_catalog_service_role_read', case when pg_catalog.to_regclass('public.bundle_catalog') is not null then pg_catalog.has_table_privilege('service_role', 'public.bundle_catalog', 'SELECT') else false end,
    'bundle_catalog_service_role_write', case when pg_catalog.to_regclass('public.bundle_catalog') is not null then pg_catalog.has_table_privilege('service_role', 'public.bundle_catalog', 'INSERT') and pg_catalog.has_table_privilege('service_role', 'public.bundle_catalog', 'UPDATE') else false end,
    'client_rls_policies_restricted', not exists (
      select 1 from pg_catalog.pg_policy
      where polrelid = any(array[
        pg_catalog.to_regclass('public.customers')::oid, pg_catalog.to_regclass('public.visitor_links')::oid,
        pg_catalog.to_regclass('public.orders')::oid, pg_catalog.to_regclass('public.notifications')::oid,
        pg_catalog.to_regclass('public.notification_attempts')::oid, pg_catalog.to_regclass('public.bundle_catalog')::oid
      ])
      and polroles && array[0::oid, (select oid from pg_catalog.pg_roles where rolname = 'anon'), (select oid from pg_catalog.pg_roles where rolname = 'authenticated')]
    ),
    'claim_notifications', pg_catalog.to_regprocedure('public.claim_notifications(integer)') is not null,
    'claim_notifications_service_role_execute', coalesce(pg_catalog.has_function_privilege('service_role', pg_catalog.to_regprocedure('public.claim_notifications(integer)'), 'EXECUTE'), false),
    'create_order_with_notification', pg_catalog.to_regprocedure('public.create_order_with_notification(text,uuid,uuid,text,text,numeric,text,text,uuid,text,boolean,text,integer,jsonb)') is not null,
    'create_order_with_notification_service_role_execute', coalesce(pg_catalog.has_function_privilege('service_role', pg_catalog.to_regprocedure('public.create_order_with_notification(text,uuid,uuid,text,text,numeric,text,text,uuid,text,boolean,text,integer,jsonb)'), 'EXECUTE'), false),
    'complete_notification_attempt', pg_catalog.to_regprocedure('public.complete_notification_attempt(uuid,integer,boolean,text,timestamptz)') is not null,
    'complete_notification_attempt_service_role_execute', coalesce(pg_catalog.has_function_privilege('service_role', pg_catalog.to_regprocedure('public.complete_notification_attempt(uuid,integer,boolean,text,timestamptz)'), 'EXECUTE'), false),
    'notification_schema_status', pg_catalog.to_regprocedure('public.notification_schema_status()') is not null,
    'notification_schema_status_service_role_execute', coalesce(pg_catalog.has_function_privilege('service_role', pg_catalog.to_regprocedure('public.notification_schema_status()'), 'EXECUTE'), false),
    'service_role_schema_usage', pg_catalog.has_schema_privilege('service_role', 'public', 'USAGE')
  );
$$;

revoke all on function public.notification_schema_status() from public, anon, authenticated;
grant execute on function public.notification_schema_status() to service_role;

notify pgrst, 'reload schema';