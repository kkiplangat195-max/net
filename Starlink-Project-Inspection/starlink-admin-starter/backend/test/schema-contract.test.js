import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { queueErrorLogDue, safeQueueErrorDetails } from '../src/queue-diagnostics.js';
import { inspectDatabaseSchema, REQUIRED_SCHEMA_OBJECTS } from '../src/database-health.js';
import { apiFailureStatus } from '../src/api-errors.js';
import { getAllowedOrigins } from '../src/cors-origins.js';
import { createQueueBackoff, queueRetryDelayMs, runQueueWhenReady } from '../src/queue-diagnostics.js';

const directory = dirname(fileURLToPath(import.meta.url));
const migration001 = readFileSync(resolve(directory, '../supabase/migrations/001_initial.sql'), 'utf8');
const migration002 = readFileSync(resolve(directory, '../supabase/migrations/002_notification_attempt_history.sql'), 'utf8');
const migration003 = readFileSync(resolve(directory, '../supabase/migrations/003_schema_contract.sql'), 'utf8');
const migration004 = readFileSync(resolve(directory, '../supabase/migrations/004_schema_readiness_and_api_grants.sql'), 'utf8');
const migration005 = readFileSync(resolve(directory, '../supabase/migrations/005_visitor_order_code.sql'), 'utf8');
const migration006 = readFileSync(resolve(directory, '../supabase/migrations/006_schema_readiness_contract.sql'), 'utf8');
const verificationSql = readFileSync(resolve(directory, '../supabase/verify_schema.sql'), 'utf8');
const apiSource = readFileSync(resolve(directory, '../src/index.js'), 'utf8');
const healthSource = readFileSync(resolve(directory, '../src/database-health.js'), 'utf8');
const frontendSource = readFileSync(resolve(directory, '../../frontend/src/main.jsx'), 'utf8');

test('ordered migrations define all queried tables and queue RPC signatures', () => {
  for (const table of ['customers', 'visitor_links', 'orders', 'notifications', 'bundle_catalog']) {
    assert.match(migration001, new RegExp(`create table if not exists public\\.${table}\\b`, 'i'));
  }
  assert.match(migration001, /create or replace function public\.claim_notifications\(p_limit integer default 10\)/i);
  assert.match(migration002, /create or replace function public\.claim_notifications\(p_limit integer default 10\)/i);
  for (const migration of [migration001, migration002]) {
    assert.match(migration, /returns table\(id uuid, order_ref text, bundle_name text, amount numeric, payment_status text, phone text, order_created_at timestamptz, intended_chat_id text, message_fields jsonb, attempts integer\)/i);
    assert.match(migration, /for update skip locked/i);
    assert.match(migration, /revoke all on function public\.claim_notifications\(integer\) from public, anon, authenticated/i);
    assert.match(migration, /grant execute on function public\.claim_notifications\(integer\) to service_role/i);
  }
  assert.match(migration002, /create table if not exists public\.notification_attempts/i);
  assert.match(migration002, /create or replace function public\.complete_notification_attempt\(/i);
  assert.match(migration003, /notification_schema_status\(\)/i);
  assert.match(migration003, /notify pgrst, 'reload schema'/i);
  assert.equal(migration002.trimEnd().endsWith(';'), true);
  assert.equal(migration003.trimEnd().endsWith(';'), true);
  assert.equal(migration004.trimEnd().endsWith(';'), true);
  assert.equal(migration006.trimEnd().endsWith(';'), true);
  assert.match(migration004, /create or replace function public\.notification_schema_status\(\)/i);
  assert.match(migration004, /grant select, insert, update on table[\s\S]*to service_role/i);
  assert.match(migration004, /grant execute on function public\.claim_notifications\(integer\) to service_role/i);
  assert.match(migration004, /client_rls_policies_restricted/i);
  assert.equal((migration004.match(/pg_catalog\.jsonb_build_object\(/g) || []).length, 4);
  assert.equal((migration004.match(/\) \|\| pg_catalog\.jsonb_build_object\(/g) || []).length, 3);
  assert.match(migration004, /notify pgrst, 'reload schema'/i);
  for (const malformedToken of [/\bisnot\b/i, /\bnullthen\b/i, /'public'and/i, /'public'\s+andindexname/i, /\belsefalse\b/i, /\bandpg_catalog\b/i]) {
    assert.doesNotMatch(migration004, malformedToken);
  }
  assert.doesNotMatch(`${migration001}\n${migration002}\n${migration003}\n${migration004}`, /\bdrop\s+(table|schema|function)\b/i);
  assert.doesNotMatch(migration004, /\b(update|delete|truncate)\s+(public\.)?(customers|visitor_links|orders|notifications|bundle_catalog)\b/i);
  for (const objectName of REQUIRED_SCHEMA_OBJECTS) {
    assert.ok(migration006.includes(`'${objectName}'`), `latest readiness migration omits ${objectName}`);
  }
  const readinessFunction = migration006.match(/create or replace function public\.notification_schema_status\(\)[\s\S]*?as \$\$([\s\S]*?)\$\$;/i)?.[1] || '';
  const sqlFlags = [...readinessFunction.matchAll(/^\s+'([a-z_]+)',/gm)].map((match) => match[1]);
  assert.deepEqual([...sqlFlags].sort(), [...REQUIRED_SCHEMA_OBJECTS].sort());
  assert.equal(new Set(sqlFlags).size, REQUIRED_SCHEMA_OBJECTS.length);
  assert.doesNotMatch(readinessFunction, /^\s+'[a-z_]+',\s*true\s*[,)]/gim);
  for (const objectName of REQUIRED_SCHEMA_OBJECTS) {
    assert.match(verificationSql, new RegExp(`\\('${objectName}'\\)`), `read-only verifier omits ${objectName}`);
  }
  assert.match(migration006, /pg_catalog\.pg_get_indexdef\(i\.indexrelid,\s*n,\s*true\)/i);
  assert.match(migration006, /c\.confdeltype\s*=\s*'r'/i);
  assert.match(migration006, /'client_rls_policies_restricted',\s*not exists/i);
  assert.match(migration006, /has_table_privilege\('service_role',\s*'public\.orders',\s*'SELECT'\)/i);
  assert.match(migration006, /public\.create_order_with_notification\(text, uuid, uuid, text, text, numeric, text, text, text, uuid, text, boolean, text, integer, jsonb\)/i);
  assert.match(migration006, /revoke all \(%\w\) on table/i);
  assert.doesNotMatch(migration006, /\bcreate\s+policy\b|\bgrant\s+all\b|\bgrant\s+.*\b(anon|authenticated)\b/i);
});

test('order-code migration and readiness contract use the same protected 15-argument RPC', () => {
  assert.match(migration005, /add column if not exists order_code text/i);
  assert.match(migration005, /order_code IS NULL[\s\S]*order_code ~ '\^\[0-9\]\{4\}\$'/i);
  assert.match(migration005, /create function public\.create_order_with_notification\([\s\S]*?p_order_code text/i);
  assert.match(migration005, /o\.phone, o\.order_code, o\.created_at/i);
  assert.match(migration005, /grant execute on function public\.create_order_with_notification\([\s\S]*?to service_role/i);
  assert.match(migration006, /to_regprocedure\('public\.create_order_with_notification\(text,uuid,uuid,text,text,numeric,text,text,text,uuid,text,boolean,text,integer,jsonb\)'\)/i);
  assert.match(verificationSql, /public\.create_order_with_notification\(text,uuid,uuid,text,text,numeric,text,text,text,uuid,text,boolean,text,integer,jsonb\)/i);
});

test('migration 004 contains no reported token-joining syntax defects', () => {
  const malformedPatterns = [
    /\)else\s+false/i,
    /\bfalseend\b/i,
    /\bis\s+not\s+nullthen\b/i,
    /\)'\)is\s+not\s+null/i,
    /\)'\)\s+is\s+notnull/i,
    /'public'and/i,
    /'public'\s+andindexname/i,
    /\bandpg_catalog\b/i,
    /\belsefalse\b/i
  ];
  for (const pattern of malformedPatterns) {
    assert.doesNotMatch(migration004, pattern);
  }
});

test('schema readiness column counts and lists match the table definitions', () => {
  const expected = {
    customers: ['id', 'name', 'notes', 'telegram_chat_id', 'notifications_enabled', 'notification_preferences', 'created_at', 'updated_at'],
    visitor_links: ['id', 'customer_id', 'name', 'token', 'token_hash', 'status', 'bundles', 'form_config', 'payment_instructions', 'telegram_chat_id', 'notifications_enabled', 'notification_preferences', 'config_version', 'created_at', 'updated_at'],
    orders: ['id', 'order_ref', 'idempotency_key', 'customer_id', 'link_id', 'bundle_id', 'bundle_name', 'amount', 'currency', 'phone', 'order_code', 'payment_status', 'payment_provider_reference', 'created_at'],
    notifications: ['id', 'order_id', 'customer_id', 'link_id', 'intended_chat_id', 'event_type', 'config_version', 'message_fields', 'status', 'attempts', 'next_attempt_at', 'last_error', 'created_at', 'sent_at', 'processing_started_at'],
    notification_attempts: ['id', 'notification_id', 'attempt_number', 'status', 'error', 'attempted_at'],
    bundle_catalog: ['bundle_id', 'name', 'validity', 'price', 'currency', 'description', 'enabled', 'promotional_label', 'sort_order', 'updated_at']
  };
  const counts = { customers: 8, visitor_links: 15, orders: 14, notifications: 15, notification_attempts: 6, bundle_catalog: 10 };
  for (const [table, columns] of Object.entries(expected)) {
    assert.equal(columns.length, counts[table]);
    const marker = `'${table}_columns'`;
    const start = migration004.indexOf(marker);
    assert.notEqual(start, -1, `${table} readiness flag is missing`);
    const end = migration004.indexOf('),', start);
    const clause = migration004.slice(start, end);
    assert.match(clause, new RegExp(`count\\(distinct column_name\\) = ${counts[table]}`));
    for (const column of columns) assert.ok(clause.includes(`'${column}'`), `${table}.${column} readiness check is missing`);
  }
});

test('read-only verification SQL lists every required public table and function', () => {
  for (const objectName of [
    'public.customers',
    'public.visitor_links',
    'public.orders',
    'public.notifications',
    'public.notification_attempts',
    'public.bundle_catalog',
    'public.claim_notifications(integer)',
    'public.complete_notification_attempt(uuid,integer,boolean,text,timestamptz)',
    'public.notification_schema_status()'
  ]) {
    assert.ok(verificationSql.includes(objectName), `verification SQL omits ${objectName}`);
  }
  assert.match(verificationSql, /jsonb_typeof\(schema_status\.flags -> required_flags\.flag\)/);
  assert.match(verificationSql, /as passed/);
  assert.doesNotMatch(verificationSql, /\b(insert|update|delete|truncate|drop)\b/i);
});

test('customer and link schemas retain API columns, foreign keys, indexes, and RLS', () => {
  assert.match(migration001, /create table if not exists public\.customers\s*\([\s\S]*?telegram_chat_id text[\s\S]*?notifications_enabled boolean[\s\S]*?notification_preferences jsonb/i);
  assert.match(migration001, /create table if not exists public\.visitor_links\s*\([\s\S]*?customer_id uuid not null references public\.customers\(id\) on delete restrict[\s\S]*?token_hash text not null unique[\s\S]*?status text not null/i);
  assert.match(migration001, /visitor_links_customer_id_idx/i);
  assert.match(migration001, /alter table public\.customers enable row level security/i);
  assert.match(migration001, /alter table public\.visitor_links enable row level security/i);
  assert.match(apiSource, /from\('customers'\)\.select\('\*'\)/);
  assert.match(apiSource, /from\('customers'\)\.insert\(\{ name: p\.data\.name/);
});

test('bundle seed is a complete insert statement and preserves configured prices on rerun', () => {
  assert.match(migration001, /insert into public\.bundle_catalog\s*\([\s\S]*?\)\s*values\s*\([\s\S]*?'15gb-7d'[\s\S]*?\)\s*on conflict \(bundle_id\) do nothing;/i);
  assert.match(migration001, /'15gb-7d', '15GB Data', '7-Day Plan', 0\.99, 'USD'/);
  assert.match(migration001, /'35gb-14d', '35GB Data', '14-Day Plan', 1\.99, 'USD'/);
  assert.match(migration001, /'50gb-21d', '50GB Data', '21-Day Plan', 2\.99, 'USD'/);
});

test('API claim RPC matches the SQL parameter and consumes a row array', () => {
  assert.match(apiSource, /rpc\('claim_notifications',\s*\{\s*p_limit:\s*10\s*\}\)/);
  assert.match(apiSource, /for\s*\(const job of jobs \|\| \[\]\)/);
  assert.match(healthSource, /rpc\('notification_schema_status'\)/);
});

test('order API validates filters and paginates the real database result', () => {
  assert.match(apiSource, /orderFiltersSchema\.safeParse\(req\.query\)/);
  assert.match(apiSource, /\.range\(from, to\)/);
  assert.match(apiSource, /count: 'exact'/);
  assert.match(frontendSource, /\/api\/admin\/orders\?\$\{params\.toString\(\)\}/);
  assert.match(frontendSource, /ordersPagination\.totalPages/);
});

test('production frontend requires VITE_API_URL and has no mock bundle fallback', () => {
  assert.match(frontendSource, /import\.meta\.env\.VITE_API_URL/);
  assert.match(frontendSource, /import\.meta\.env\.DEV \? "http:\/\/localhost:8080" : ""/);
  assert.match(frontendSource, /Backend URL is not configured/);
  assert.doesNotMatch(frontendSource, /DEFAULT_BUNDLES/);
});

test('EcoCash popup submit is handled without collecting a wallet PIN or OTP', () => {
  assert.match(frontendSource, /function submitPayment\(event\)\s*\{\s*event\.preventDefault\(\);\s*setPaymentError\("Payment verification is not connected yet\. No payment has been made\."\);/);
  assert.match(frontendSource, /onClick=\{submitPayment\}/);
  assert.match(frontendSource, /id="payment-phone"[\s\S]*?value=\{phone\}/);
  assert.doesNotMatch(frontendSource, /verificationCode|verification-code|Enter 4 digits/);
  assert.match(frontendSource, /Do not enter an EcoCash PIN or one-time code here/);
});

test('frontend link editing sends the independently edited notification preferences', () => {
  assert.match(frontendSource, /notificationPreferences:\s*\{\s*newOrder:\s*link\.notification_preferences\?\.newOrder\s*!==\s*false,\s*phone:\s*includePhone,\s*amount:\s*includeAmount/s);
  assert.match(frontendSource, /\{!loading && !error && !filteredCustomers\.length/);
  assert.match(frontendSource, /\{!loading && !error && !orders\.length/);
});

test('queue diagnostics throttle repeats and redact credentials and PIN-like values', () => {
  assert.equal(queueErrorLogDue(null, 1000), true);
  assert.equal(queueErrorLogDue(1000, 60_999), false);
  assert.equal(queueErrorLogDue(1000, 61_000), true);
  assert.deepEqual(safeQueueErrorDetails({ code: 'PGRST202', message: 'Missing bot123456:secret Bearer abc PIN:1234' }), {
    code: 'PGRST202', message: 'Missing [redacted bot token] Bearer [redacted] PIN=[redacted]'
  });
  const failedChecks = ['customers_service_role_read', 'visitor_links_customer_fk'];
  assert.deepEqual(safeQueueErrorDetails({ code: 'schema_not_ready', message: '2 required checks failed.', missingObjects: failedChecks }), {
    code: 'schema_not_ready', message: '2 required checks failed.', missingObjects: failedChecks
  });
  assert.deepEqual(safeQueueErrorDetails({ code: 'schema_not_ready', message: 'not ready', missingObjects: ['bad name', 42] }), {
    code: 'schema_not_ready', message: 'not ready', missingObjects: []
  });
  assert.equal(queueRetryDelayMs(1), 5_000);
  assert.equal(queueRetryDelayMs(2), 10_000);
  assert.equal(queueRetryDelayMs(20), 300_000);
  let now = 100;
  const backoff = createQueueBackoff({ now: () => now });
  assert.equal(backoff.canRun(), true);
  const firstFailure = backoff.failed();
  assert.deepEqual(firstFailure, { failures: 1, retryAt: 5_100 });
  assert.equal(backoff.canRun(), false);
  now = firstFailure.retryAt;
  assert.equal(backoff.canRun(), true);
  backoff.succeeded();
  assert.equal(backoff.canRun(), true);
});

test('notification claiming is skipped until schema readiness succeeds', async () => {
  let claimCalls = 0;
  const unavailable = await runQueueWhenReady(
    async () => ({ databaseReady: false, missingObjects: ['claim_notifications'] }),
    async () => { claimCalls += 1; return []; }
  );
  assert.equal(unavailable.claimed, false);
  assert.equal(claimCalls, 0);
  const available = await runQueueWhenReady(
    async () => ({ databaseReady: true, missingObjects: [] }),
    async () => { claimCalls += 1; return [{ id: 'job-1' }]; }
  );
  assert.equal(available.claimed, true);
  assert.equal(available.result[0].id, 'job-1');
  assert.equal(claimCalls, 1);
});

test('CORS includes the configured production frontend and only exact HTTP origins', () => {
  const allowed = getAllowedOrigins('http://localhost:5173,https://preview.example.test/path,https://other.example.test');
  assert.equal(allowed.has('https://net-omega-black.vercel.app'), true);
  assert.equal(allowed.has('http://localhost:5173'), true);
  assert.equal(allowed.has('https://other.example.test'), true);
  assert.equal(allowed.has('https://preview.example.test'), false);
  assert.equal(allowed.has('https://attacker.example.test'), false);
});

test('database API failures return service-unavailable without leaking diagnostics', () => {
  assert.equal(apiFailureStatus({ code: 'PGRST202' }), 503);
  assert.equal(apiFailureStatus({ code: '42P01' }), 503);
  assert.equal(apiFailureStatus({ code: '42703' }), 503);
  assert.equal(apiFailureStatus({ code: '42501' }), 503);
  assert.equal(apiFailureStatus({ code: '08006' }), 503);
  assert.equal(apiFailureStatus({ code: 'fetch_failed' }), 503);
  assert.equal(apiFailureStatus({ code: 'ETIMEDOUT' }), 503);
  assert.equal(apiFailureStatus({ name: 'AbortError' }), 503);
  assert.equal(apiFailureStatus({ code: '23505' }), 500);
  assert.equal(apiFailureStatus({ status: 403 }), 403);
  assert.equal(apiFailureStatus(new Error('internal')), 500);
});

test('database readiness detects missing objects and unavailable schema RPC', async () => {
  const complete = Object.fromEntries(REQUIRED_SCHEMA_OBJECTS.map((name) => [name, true]));
  assert.deepEqual(await inspectDatabaseSchema({ rpc: async () => ({ data: complete, error: null }) }), {
    databaseConfigured: true, databaseReady: true, missingObjects: []
  });
  const missing = await inspectDatabaseSchema({ rpc: async () => ({ data: { customers: true }, error: null }) });
  assert.equal(missing.databaseReady, false);
  assert.ok(missing.missingObjects.includes('claim_notifications'));
  assert.deepEqual(await inspectDatabaseSchema({ rpc: async () => ({ data: null, error: { code: 'PGRST202' } }) }), {
    databaseConfigured: true, databaseReady: false, missingObjects: REQUIRED_SCHEMA_OBJECTS, schemaCheckError: 'PGRST202'
  });
  assert.deepEqual(await inspectDatabaseSchema(null), {
    databaseConfigured: false, databaseReady: false, missingObjects: REQUIRED_SCHEMA_OBJECTS
  });
  const thrownFailure = await inspectDatabaseSchema({ rpc: async () => { throw Object.assign(new Error('offline'), { code: 'fetch_failed' }); } });
  assert.equal(thrownFailure.schemaCheckError, 'fetch_failed');
  assert.deepEqual(thrownFailure.missingObjects, REQUIRED_SCHEMA_OBJECTS);
});

test('health and notification worker use the same fail-closed schema result', async () => {
  assert.match(apiSource, /app\.get\('\/health',[\s\S]*?const database = await inspectDatabaseSchema\(supabase\);[\s\S]*?const ready = database\.databaseReady;/);
  assert.match(apiSource, /runQueueWhenReady\(\s*\(\) => inspectDatabaseSchema\(supabase\)/);
  const partialStatus = { customers: true, notifications: true };
  const client = { rpc: async () => ({ data: partialStatus, error: null }) };
  const health = await inspectDatabaseSchema(client);
  let claimCalls = 0;
  const queue = await runQueueWhenReady(
    () => inspectDatabaseSchema(client),
    async () => { claimCalls += 1; return []; }
  );
  assert.deepEqual(queue.readiness, health);
  assert.equal(health.databaseReady, false);
  assert.deepEqual(health.missingObjects, REQUIRED_SCHEMA_OBJECTS.filter((name) => partialStatus[name] !== true));
  assert.equal(queue.claimed, false);
  assert.equal(claimCalls, 0);
});