const REQUIRED_SCHEMA_OBJECTS = [
  'customers',
  'visitor_links',
  'orders',
  'notifications',
  'notification_attempts',
  'bundle_catalog',
  'claim_notifications',
  'complete_notification_attempt'
];

export async function inspectDatabaseSchema(client) {
  if (!client) {
    return { databaseConfigured: false, databaseReady: false, missingObjects: REQUIRED_SCHEMA_OBJECTS };
  }

  const { data, error } = await client.rpc('notification_schema_status');
  if (error) {
    const code = /^[A-Z0-9_-]{1,32}$/i.test(String(error.code || '')) ? error.code : 'unknown';
    return { databaseConfigured: true, databaseReady: false, missingObjects: [], schemaCheckError: code };
  }

  const missingObjects = REQUIRED_SCHEMA_OBJECTS.filter((objectName) => data?.[objectName] !== true);
  return { databaseConfigured: true, databaseReady: missingObjects.length === 0, missingObjects };
}