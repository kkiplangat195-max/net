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
const verificationSql = readFileSync(resolve(directory, '../supabase/verify_schema.sql'), 'utf8');
const apiSource = readFileSync(resolve(directory, '../src/index.js'), 'utf8');
const healthSource = readFileSync(resolve(directory, '../src/database-health.js'), 'utf8');

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
  assert.match(migration004, /create or replace function public\.notification_schema_status\(\)/i);
  assert.match(migration004, /grant select, insert, update on table[\s\S]*to service_role/i);
  assert.match(migration004, /grant execute on function public\.claim_notifications\(integer\) to service_role/i);
  assert.match(migration004, /client_rls_policies_restricted/i);
  assert.match(migration004, /notify pgrst, 'reload schema'/i);
  assert.doesNotMatch(`${migration001}\n${migration002}\n${migration003}\n${migration004}`, /\bdrop\s+(table|schema|function)\b/i);
  assert.doesNotMatch(migration004, /\b(update|delete|truncate)\s+(public\.)?(customers|visitor_links|orders|notifications|bundle_catalog)\b/i);
  for (const objectName of REQUIRED_SCHEMA_OBJECTS) {
    assert.ok(migration004.includes(`'${objectName}'`), `readiness migration omits ${objectName}`);
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

test('API claim RPC matches the SQL parameter and consumes a row array', () => {
  assert.match(apiSource, /rpc\('claim_notifications',\s*\{\s*p_limit:\s*10\s*\}\)/);
  assert.match(apiSource, /for\s*\(const job of jobs \|\| \[\]\)/);
  assert.match(healthSource, /rpc\('notification_schema_status'\)/);
});

test('queue diagnostics throttle repeats and redact credentials and PIN-like values', () => {
  assert.equal(queueErrorLogDue(null, 1000), true);
  assert.equal(queueErrorLogDue(1000, 60_999), false);
  assert.equal(queueErrorLogDue(1000, 61_000), true);
  assert.deepEqual(safeQueueErrorDetails({ code: 'PGRST202', message: 'Missing bot123456:secret Bearer abc PIN:1234' }), {
    code: 'PGRST202', message: 'Missing [redacted bot token] Bearer [redacted] PIN=[redacted]'
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
    databaseConfigured: true, databaseReady: false, missingObjects: [], schemaCheckError: 'PGRST202'
  });
  assert.deepEqual(await inspectDatabaseSchema(null), {
    databaseConfigured: false, databaseReady: false, missingObjects: REQUIRED_SCHEMA_OBJECTS
  });
  assert.equal((await inspectDatabaseSchema({ rpc: async () => { throw Object.assign(new Error('offline'), { code: 'fetch_failed' }); } })).schemaCheckError, 'fetch_failed');
});