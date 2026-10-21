create or replace function public.notification_schema_status()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'customers', to_regclass('public.customers') is not null,
    'visitor_links', to_regclass('public.visitor_links') is not null,
    'orders', to_regclass('public.orders') is not null,
    'notifications', to_regclass('public.notifications') is not null,
    'notification_attempts', to_regclass('public.notification_attempts') is not null,
    'bundle_catalog', to_regclass('public.bundle_catalog') is not null,
    'claim_notifications', to_regprocedure('public.claim_notifications(integer)') is not null,
    'complete_notification_attempt', to_regprocedure('public.complete_notification_attempt(uuid,integer,boolean,text,timestamptz)') is not null
  );
$$;

revoke all on function public.notification_schema_status() from public, anon, authenticated;
grant execute on function public.notification_schema_status() to service_role;

notify pgrst, 'reload schema';