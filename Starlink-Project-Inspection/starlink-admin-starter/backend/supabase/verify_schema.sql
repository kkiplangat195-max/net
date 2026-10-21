-- Read-only verification. Run after migrations 001 through 004.
with required_objects(object_name, object_kind, present) as (
  values
    ('public.customers', 'table', pg_catalog.to_regclass('public.customers') is not null),
    ('public.visitor_links', 'table', pg_catalog.to_regclass('public.visitor_links') is not null),
    ('public.orders', 'table', pg_catalog.to_regclass('public.orders') is not null),
    ('public.notifications', 'table', pg_catalog.to_regclass('public.notifications') is not null),
    ('public.notification_attempts', 'table', pg_catalog.to_regclass('public.notification_attempts') is not null),
    ('public.bundle_catalog', 'table', pg_catalog.to_regclass('public.bundle_catalog') is not null),
    ('public.claim_notifications(integer)', 'function', pg_catalog.to_regprocedure('public.claim_notifications(integer)') is not null),
    ('public.complete_notification_attempt(uuid,integer,boolean,text,timestamptz)', 'function', pg_catalog.to_regprocedure('public.complete_notification_attempt(uuid,integer,boolean,text,timestamptz)') is not null),
    ('public.notification_schema_status()', 'function', pg_catalog.to_regprocedure('public.notification_schema_status()') is not null)
)
select object_name, object_kind, present
from required_objects
order by object_kind, object_name;

select public.notification_schema_status() as schema_status;