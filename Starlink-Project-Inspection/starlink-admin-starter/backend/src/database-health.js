export const REQUIRED_SCHEMA_OBJECTS = [
  'customers',
  'customers_columns',
  'customers_rls',
  'customers_service_role_read',
  'customers_service_role_write',
  'visitor_links',
  'visitor_links_columns',
  'visitor_links_customer_fk',
  'visitor_links_customer_index',
  'visitor_links_status_index',
  'visitor_links_rls',
  'visitor_links_service_role_read',
  'visitor_links_service_role_write',
  'orders',
  'orders_columns',
  'orders_customer_fk',
  'orders_link_fk',
  'orders_customer_index',
  'orders_link_index',
  'orders_created_index',
  'orders_rls',
  'orders_service_role_read',
  'orders_service_role_write',
  'notifications',
  'notifications_columns',
  'notifications_order_fk',
  'notifications_customer_fk',
  'notifications_link_fk',
  'notifications_status_index',
  'notifications_customer_index',
  'notifications_rls',
  'notifications_service_role_read',
  'notifications_service_role_write',
  'notification_attempts',
  'notification_attempts_columns',
  'notification_attempts_notification_fk',
  'notification_attempts_notification_index',
  'notification_attempts_rls',
  'notification_attempts_service_role_read',
  'notification_attempts_service_role_write',
  'bundle_catalog',
  'bundle_catalog_columns',
  'bundle_catalog_rls',
  'bundle_catalog_service_role_read',
  'bundle_catalog_service_role_write',
  'client_rls_policies_restricted',
  'claim_notifications',
  'claim_notifications_service_role_execute',
  'create_order_with_notification',
  'create_order_with_notification_service_role_execute',
  'complete_notification_attempt',
  'complete_notification_attempt_service_role_execute',
  'notification_schema_status',
  'notification_schema_status_service_role_execute',
  'service_role_schema_usage'
];

export async function inspectDatabaseSchema(client) {
  if (!client) {
    return { databaseConfigured: false, databaseReady: false, missingObjects: REQUIRED_SCHEMA_OBJECTS };
  }

  let response;
  try {
    response = await client.rpc('notification_schema_status');
  } catch (error) {
    return schemaCheckFailure(error);
  }

  const { data, error } = response || {};
  if (error) {
    return schemaCheckFailure(error);
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { databaseConfigured: true, databaseReady: false, missingObjects: REQUIRED_SCHEMA_OBJECTS, schemaCheckError: 'invalid_schema_status' };
  }
  const missingObjects = REQUIRED_SCHEMA_OBJECTS.filter((objectName) => data?.[objectName] !== true);
  return { databaseConfigured: true, databaseReady: missingObjects.length === 0, missingObjects };
}

function schemaCheckFailure(error) {
  const code = /^[A-Z0-9_-]{1,32}$/i.test(String(error?.code || '')) ? error.code : 'unknown';
  return { databaseConfigured: true, databaseReady: false, missingObjects: REQUIRED_SCHEMA_OBJECTS, schemaCheckError: code };
}