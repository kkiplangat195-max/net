import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPublishableLink, formatOrderNotification, normalizeLinkBundles, notificationOutcome, permittedNotificationPreferences } from '../src/domain.js';
import { escapeLikePattern, orderFiltersSchema, orderRange } from '../src/order-filters.js';

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

test('order notification fields remain independent and never contain an authentication PIN', () => {
  const job = {
    order_ref: 'ORD-123', bundle_name: '15GB Data', amount: 0.99,
    payment_status: 'pending', phone: '+263771234567', order_created_at: '2026-10-21T00:00:00Z',
    pin: '1234'
  };
  const minimal = formatOrderNotification(job, { phone: false, amount: false, bundleValidity: '7-Day Plan' });
  assert.doesNotMatch(minimal, /Phone:|Amount:|\b1234\b/);
  assert.match(minimal, /Validity: 7-Day Plan/);
  const phoneOnly = formatOrderNotification(job, { phone: true, amount: false });
  assert.match(phoneOnly, /Phone: \+263771234567/);
  assert.doesNotMatch(phoneOnly, /Amount:|\b1234\b/);
  const amountOnly = formatOrderNotification(job, { phone: false, amount: true });
  assert.match(amountOnly, /Amount: USD 0\.99/);
  assert.doesNotMatch(amountOnly, /Phone:|\b1234\b/);
  assert.equal(formatOrderNotification(job, { newOrder: false }), null);
  assert.equal(formatOrderNotification(job, {}, false), null);
});

test('order filters validate dates and statuses and produce bounded server ranges', () => {
  assert.equal(orderFiltersSchema.safeParse({ page: '2', pageSize: '25', from: '2026-02-01', to: '2026-02-28' }).success, true);
  assert.equal(orderFiltersSchema.safeParse({ from: '2026-02-30' }).success, false);
  assert.equal(orderFiltersSchema.safeParse({ from: '2026-03-02', to: '2026-03-01' }).success, false);
  assert.equal(orderFiltersSchema.safeParse({ pageSize: '101' }).success, false);
  assert.deepEqual(orderRange(3, 50), { from: 100, to: 149 });
  assert.equal(escapeLikePattern('a%_b'), String.raw`a\%\_b`);
});