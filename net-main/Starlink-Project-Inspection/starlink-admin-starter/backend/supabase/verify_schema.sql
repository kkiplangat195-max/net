-- Read-only verification. Run after migrations 001 through 006.
with required_objects(object_name, object_kind, present) as (
  values
    ('public.customers', 'table', pg_catalog.to_regclass('public.customers') is not null),
    ('public.visitor_links', 'table', pg_catalog.to_regclass('public.visitor_links') is not null),
    ('public.orders', 'table', pg_catalog.to_regclass('public.orders') is not null),
    ('public.notifications', 'table', pg_catalog.to_regclass('public.notifications') is not null),
    ('public.notification_attempts', 'table', pg_catalog.to_regclass('public.notification_attempts') is not null),
    ('public.bundle_catalog', 'table', pg_catalog.to_regclass('public.bundle_catalog') is not null),
    ('public.create_order_with_notification(text,uuid,uuid,text,text,numeric,text,text,text,uuid,text,boolean,text,integer,jsonb)', 'function', pg_catalog.to_regprocedure('public.create_order_with_notification(text,uuid,uuid,text,text,numeric,text,text,text,uuid,text,boolean,text,integer,jsonb)') is not null),
    ('public.claim_notifications(integer)', 'function', pg_catalog.to_regprocedure('public.claim_notifications(integer)') is not null),
    ('public.complete_notification_attempt(uuid,integer,boolean,text,timestamptz)', 'function', pg_catalog.to_regprocedure('public.complete_notification_attempt(uuid,integer,boolean,text,timestamptz)') is not null),
    ('public.notification_schema_status()', 'function', pg_catalog.to_regprocedure('public.notification_schema_status()') is not null)
)
select object_name, object_kind, present
from required_objects
order by object_kind, object_name;

with required_flags(flag) as (
  values
    ('customers'),
    ('customers_columns'),
    ('customers_rls'),
    ('customers_service_role_read'),
    ('customers_service_role_write'),
    ('visitor_links'),
    ('visitor_links_columns'),
    ('visitor_links_customer_fk'),
    ('visitor_links_customer_index'),
    ('visitor_links_status_index'),
    ('visitor_links_rls'),
    ('visitor_links_service_role_read'),
    ('visitor_links_service_role_write'),
    ('orders'),
    ('orders_columns'),
    ('orders_order_code_format'),
    ('orders_customer_fk'),
    ('orders_link_fk'),
    ('orders_customer_index'),
    ('orders_link_index'),
    ('orders_created_index'),
    ('orders_rls'),
    ('orders_service_role_read'),
    ('orders_service_role_write'),
    ('notifications'),
    ('notifications_columns'),
    ('notifications_order_fk'),
    ('notifications_customer_fk'),
    ('notifications_link_fk'),
    ('notifications_status_index'),
    ('notifications_customer_index'),
    ('notifications_rls'),
    ('notifications_service_role_read'),
    ('notifications_service_role_write'),
    ('notification_attempts'),
    ('notification_attempts_columns'),
    ('notification_attempts_notification_fk'),
    ('notification_attempts_notification_index'),
    ('notification_attempts_rls'),
    ('notification_attempts_service_role_read'),
    ('notification_attempts_service_role_write'),
    ('bundle_catalog'),
    ('bundle_catalog_columns'),
    ('bundle_catalog_rls'),
    ('bundle_catalog_service_role_read'),
    ('bundle_catalog_service_role_write'),
    ('client_rls_policies_restricted'),
    ('claim_notifications'),
    ('claim_notifications_service_role_execute'),
    ('create_order_with_notification'),
    ('create_order_with_notification_service_role_execute'),
    ('complete_notification_attempt'),
    ('complete_notification_attempt_service_role_execute'),
    ('notification_schema_status'),
    ('notification_schema_status_service_role_execute'),
    ('service_role_schema_usage')
), schema_status as (
  select public.notification_schema_status() as flags
)
select required_flags.flag,
       jsonb_typeof(schema_status.flags -> required_flags.flag) as json_type,
       case
         when jsonb_typeof(schema_status.flags -> required_flags.flag) = 'boolean'
           then schema_status.flags -> required_flags.flag = 'true'::jsonb
         else false
       end as passed
from required_flags
cross join schema_status
order by required_flags.flag;