import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPublishableLink, normalizeLinkBundles, notificationOutcome, permittedNotificationPreferences } from '../src/domain.js';

const catalog = [
  { bundle_id: '15gb-7d', name: '15GB Data', validity: '7-Day Plan', price: '0.99', description: '15GB for 7 days', enabled: true, promotional_label: '' },
  { bundle_id: '35gb-14d', name: '35GB Data', validity: '14-Day Plan', price: '1.99', description: '35GB for 14 days', enabled: false, promotional_label: '' }
];

test('link bundles always use current server catalog values', () => {
  const [bundle] = normalizeLinkBundles([{ id: '15gb-7d', name: 'tampered', price: 0.01, enabled: true }], catalog);
  assert.equal(bundle.name, '15GB Data');
  assert.equal(bundle.price, 0.99);
  assert.equal(bundle.currency, 'USD');
});

test('link bundle normalization rejects duplicates, unknown IDs, and enabled unavailable bundles', () => {
  assert.throws(() => normalizeLinkBundles([{ id: '15gb-7d' }, { id: '15gb-7d' }], catalog), /only be selected once/);
  assert.throws(() => normalizeLinkBundles([{ id: 'unknown' }], catalog), /Unknown bundle/);
  assert.throws(() => normalizeLinkBundles([{ id: '35gb-14d', enabled: true }], catalog), /disabled in the bundle catalog/);
  assert.equal(normalizeLinkBundles([{ id: '35gb-14d', enabled: false }], catalog)[0].enabled, false);
});

test('publishing requires valid bundles, Telegram configuration, and a secure production URL', () => {
  const link = { bundles: [{ enabled: true }], notifications_enabled: true, telegram_chat_id: '123' };
  const config = { botToken: 'test-token', publicAppUrl: 'https://example.test', nodeEnv: 'production' };
  assert.doesNotThrow(() => assertPublishableLink(link, config));
  assert.throws(() => assertPublishableLink({ ...link, telegram_chat_id: null }, config), /Chat ID/);
  assert.throws(() => assertPublishableLink(link, { ...config, botToken: '' }), /TELEGRAM_BOT_TOKEN/);
  assert.throws(() => assertPublishableLink(link, { ...config, publicAppUrl: 'http://example.test' }), /HTTPS/);
  assert.throws(() => assertPublishableLink({ ...link, bundles: [{ enabled: false }] }, config), /at least one bundle/);
});

test('notification outcomes retry transient failures and stop after eight attempts', () => {
  assert.deepEqual(notificationOutcome({ sent: false, attempt: 1, now: 0 }), {
    status: 'queued', sentAt: null, nextAttemptAt: new Date(2000).toISOString()
  });
  assert.deepEqual(notificationOutcome({ sent: false, attempt: 8, now: 0 }), {
    status: 'failed', sentAt: null, nextAttemptAt: null
  });
  assert.deepEqual(notificationOutcome({ sent: true, attempt: 1, now: 0 }), {
    status: 'sent', sentAt: new Date(0).toISOString(), nextAttemptAt: null
  });
});

test('customer preferences cap per-link notification fields and phone sharing is opt-in', () => {
  assert.deepEqual(permittedNotificationPreferences({ phone: true }, {}), {
    newOrder: true, phone: false, amount: true
  });
  assert.deepEqual(permittedNotificationPreferences(
    { newOrder: true, phone: true, amount: false },
    { newOrder: true, phone: false, amount: true }
  ), { newOrder: true, phone: false, amount: false });
  assert.equal(permittedNotificationPreferences({ newOrder: true }, { newOrder: false }).newOrder, false);
});