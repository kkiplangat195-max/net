import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { queueErrorLogDue, safeQueueErrorDetails } from '../src/queue-diagnostics.js';
import { inspectDatabaseSchema } from '../src/database-health.js';

const directory = dirname(fileURLToPath(import.meta.url));
const migration001 = readFileSync(resolve(directory, '../supabase/migrations/001_initial.sql'), 'utf8');
const migration002 = readFileSync(resolve(directory, '../supabase/migrations/002_notification_attempt_history.sql'), 'utf8');
const migration003 = readFileSync(resolve(directory, '../supabase/migrations/003_schema_contract.sql'), 'utf8');
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
  assert.doesNotMatch(`${migration001}\n${migration002}\n${migration003}`, /\bdrop\s+(table|schema|function)\b/i);
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
});

test('database readiness detects missing objects and unavailable schema RPC', async () => {
  const complete = Object.fromEntries(['customers', 'visitor_links', 'orders', 'notifications', 'notification_attempts', 'bundle_catalog', 'claim_notifications', 'complete_notification_attempt'].map((name) => [name, true]));
  assert.deepEqual(await inspectDatabaseSchema({ rpc: async () => ({ data: complete, error: null }) }), {
    databaseConfigured: true, databaseReady: true, missingObjects: []
  });
  const missing = await inspectDatabaseSchema({ rpc: async () => ({ data: { customers: true }, error: null }) });
  assert.equal(missing.databaseReady, false);
  assert.ok(missing.missingObjects.includes('claim_notifications'));
  assert.deepEqual(await inspectDatabaseSchema({ rpc: async () => ({ data: null, error: { code: 'PGRST202' } }) }), {
    databaseConfigured: true, databaseReady: false, missingObjects: [], schemaCheckError: 'PGRST202'
  });
});