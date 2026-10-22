import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { apiFailureStatus } from './api-errors.js';
import { assertPublishableLink, formatOrderNotification, normalizeLinkBundles, notificationOutcome, permittedNotificationPreferences } from './domain.js';
import { inspectDatabaseSchema } from './database-health.js';
import { getAllowedOrigins } from './cors-origins.js';
import { escapeLikePattern, orderFiltersSchema, orderRange } from './order-filters.js';
import { createQueueBackoff, queueErrorLogDue, runQueueWhenReady, safeQueueErrorDetails } from './queue-diagnostics.js';

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ADMIN_EMAIL', 'ADMIN_PASSWORD_HASH', 'JWT_SECRET'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) console.warn(`Missing required environment variables: ${missing.join(', ')}`);
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
const app = express();
app.set('trust proxy', 1);
app.use(helmet());
const allowedOrigins = getAllowedOrigins(process.env.FRONTEND_URL || '');
app.use(cors({ origin(origin, cb) { if (!origin || allowedOrigins.has(origin)) return cb(null, true); const error = new Error('Origin not allowed by CORS'); error.status = 403; return cb(error); }, credentials: false }));
app.use(express.json({ limit: '32kb' }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false }));
app.use('/api/public', rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }));

const USD_BUNDLES = [
  { id: '5gb-trial', name: '5GB Data', validity: '2-Day Trial', price: 0, currency: 'USD', description: 'A free 2-day trial' },
  { id: '15gb-7d', name: '15GB Data', validity: '7-Day Plan', price: 0.99, currency: 'USD', description: '15GB for 7 days' },
  { id: '35gb-14d', name: '35GB Data', validity: '14-Day Plan', price: 1.99, currency: 'USD', description: '35GB for 14 days' },
  { id: '50gb-21d', name: '50GB Data', validity: '21-Day Plan', price: 2.99, currency: 'USD', description: '50GB for 21 days' },
  { id: 'unlimited-30d', name: 'Unlimited', validity: '30-Day Plan', price: 3.99, currency: 'USD', description: 'Unlimited data for 30 days' }
];
const dbReady = (req, res, next) => { if (!supabase) return res.status(503).json({ error: 'Database is not configured. Set Supabase environment variables.' }); next(); };
const admin = (req, res, next) => {
  const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : '';
  try { req.admin = jwt.verify(token, process.env.JWT_SECRET); if (req.admin.role !== 'admin') throw new Error('not admin'); next(); }
  catch { return res.status(401).json({ error: 'Authentication required' }); }
};
const adminRoute = [dbReady, admin];
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const makeToken = () => randomBytes(24).toString('base64url');
const money = (n) => Math.round(Number(n) * 100) / 100;
const notificationPreferencesSchema = z.object({ newOrder: z.boolean().default(true), phone: z.boolean().default(false), amount: z.boolean().default(true) }).strict();
const bundleSchema = z.object({ id: z.string().min(1), name: z.string().min(1).max(80), validity: z.string().min(1).max(80), price: z.number().finite().min(0).max(10000), currency: z.literal('USD'), description: z.string().max(300).optional().default(''), enabled: z.boolean().default(true), promotionalLabel: z.string().max(80).optional().default('') });
const customerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  notes: z.string().max(2000).optional().default(''),
  telegramChatId: z.string().trim().max(100).optional().default(''),
  notificationsEnabled: z.boolean().optional().default(false),
  notificationPreferences: notificationPreferencesSchema.optional().default({})
});

app.get('/health/live', (_req, res) => {
  res.status(200).json({ ok: true });
});


app.get('/health', asyncRoute(async (_req, res) => {
  const database = await inspectDatabaseSchema(supabase);
  const ready = database.databaseReady;
  res.status(ready ? 200 : 503).json({ ok: ready, ...database });
}));
app.post('/api/auth/login', dbReady, asyncRoute(async (req, res) => {
  const parsed = z.object({ email: z.string().email(), password: z.string().min(1).max(300) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid email and password.' });
  const emailOk = parsed.data.email.toLowerCase() === process.env.ADMIN_EMAIL.toLowerCase();
  const passwordOk = await bcrypt.compare(parsed.data.password, process.env.ADMIN_PASSWORD_HASH).catch(() => false);
  if (!emailOk || !passwordOk) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ role: 'admin', email: process.env.ADMIN_EMAIL }, process.env.JWT_SECRET, { expiresIn: '8h', issuer: 'starlink-admin' });
  res.json({ token, email: process.env.ADMIN_EMAIL, expiresIn: 28800 });
}));
app.get('/api/admin/bundles', ...adminRoute, asyncRoute(async (_req, res) => {
  const { data, error } = await supabase.from('bundle_catalog').select('*').order('sort_order', { ascending: true });
  if (error) throw error; res.json({ bundles: (data || []).map((b) => ({ id: b.bundle_id, name: b.name, validity: b.validity, price: Number(b.price), currency: 'USD', description: b.description, enabled: b.enabled, promotionalLabel: b.promotional_label || '' })) });
}));
app.put('/api/admin/bundles/:id', ...adminRoute, asyncRoute(async (req, res) => {
  const p = bundleSchema.safeParse({ ...req.body, id: req.params.id }); if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  const b = p.data; const { data, error } = await supabase.from('bundle_catalog').update({ name: b.name, validity: b.validity, price: money(b.price), description: b.description, enabled: b.enabled, promotional_label: b.promotionalLabel }).eq('bundle_id', b.id).select().single();
  if (error) throw error; res.json({ bundle: { id: data.bundle_id, name: data.name, validity: data.validity, price: Number(data.price), currency: 'USD', description: data.description, enabled: data.enabled, promotionalLabel: data.promotional_label || '' } });
}));
app.get('/api/admin/dashboard', ...adminRoute, asyncRoute(async (_req, res) => {
  const [customers, links, orders, notifications] = await Promise.all([
    supabase.from('customers').select('id', { count: 'exact', head: true }),
    supabase.from('visitor_links').select('status', { count: 'exact' }),
    supabase.from('orders').select('id', { count: 'exact', head: true }),
    supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('status', 'failed')
  ]);
  for (const r of [customers, links, orders, notifications]) if (r.error) throw r.error;
  const statuses = { draft: 0, published: 0, disabled: 0, unpublished: 0 };
  for (const row of links.data || []) statuses[row.status] = (statuses[row.status] || 0) + 1;
  res.json({ customers: customers.count || 0, links: links.count || 0, linkStatuses: statuses, orders: orders.count || 0, failedNotifications: notifications.count || 0 });
}));
app.get('/api/admin/customers', ...adminRoute, asyncRoute(async (_req, res) => {
  const { data, error } = await supabase.from('customers').select('*').order('created_at', { ascending: false });
  if (error) throw error; res.json({ customers: data });
}));
app.post('/api/admin/customers', ...adminRoute, asyncRoute(async (req, res) => {
  const p = customerSchema.safeParse(req.body); if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  const { data, error } = await supabase.from('customers').insert({ name: p.data.name, notes: p.data.notes, telegram_chat_id: p.data.telegramChatId || null, notifications_enabled: p.data.notificationsEnabled, notification_preferences: p.data.notificationPreferences }).select().single();
  if (error) throw error; res.status(201).json({ customer: data });
}));
app.put('/api/admin/customers/:id', ...adminRoute, asyncRoute(async (req, res) => {
  const p = customerSchema.partial().safeParse(req.body); if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  const v = p.data; const row = {};
  if (v.name !== undefined) row.name = v.name; if (v.notes !== undefined) row.notes = v.notes; if (v.telegramChatId !== undefined) row.telegram_chat_id = v.telegramChatId || null;
  if (v.notificationsEnabled !== undefined) row.notifications_enabled = v.notificationsEnabled; if (v.notificationPreferences !== undefined) row.notification_preferences = v.notificationPreferences;
  const { data, error } = await supabase.from('customers').update(row).eq('id', req.params.id).select().single();
  if (error) throw error; res.json({ customer: data });
}));
app.get('/api/admin/links', ...adminRoute, asyncRoute(async (req, res) => {
  let q = supabase.from('visitor_links').select('id,customer_id,name,token,status,bundles,form_config,payment_instructions,telegram_chat_id,notifications_enabled,notification_preferences,created_at,updated_at,customers(name)').order('created_at', { ascending: false });
  if (req.query.customerId) q = q.eq('customer_id', req.query.customerId);
  const { data, error } = await q; if (error) throw error;
  const origin = (process.env.PUBLIC_APP_URL || '').replace(/\/$/, '');
  res.json({ links: (data || []).map((l) => ({ ...l, url: origin ? `${origin}/l/${l.token}` : null })) });
}));
app.post('/api/admin/links', ...adminRoute, asyncRoute(async (req, res) => {
  const p = linkSchema.safeParse(req.body); if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  const v = p.data;
  const { data: customer, error: customerError } = await supabase.from('customers').select('id,telegram_chat_id,notifications_enabled,notification_preferences').eq('id', v.customerId).single();
  if (customerError || !customer) return res.status(400).json({ error: 'Selected customer does not exist.' });
  if (v.notificationsEnabled && !customer.notifications_enabled) return res.status(400).json({ error: 'Enable notifications in the customer settings before enabling them for this link.' });
  const { data: catalogRows, error: catalogError } = await supabase.from('bundle_catalog').select('*').in('bundle_id', v.bundles.map((b) => b.id));
  if (catalogError) throw catalogError;
  let savedBundles;
  try { savedBundles = normalizeLinkBundles(v.bundles, catalogRows || []); }
  catch (error) { return res.status(400).json({ error: error.message }); }
  if (v.notificationsEnabled && !(v.telegramChatId || customer.telegram_chat_id)) return res.status(400).json({ error: 'A Telegram Chat ID is required when notifications are enabled.' });
  const preferences = permittedNotificationPreferences(v.notificationPreferences, customer.notification_preferences);
  const token = makeToken();
  const { data, error } = await supabase.from('visitor_links').insert({ customer_id: v.customerId, name: v.name, token, token_hash: sha256(token), status: 'draft', bundles: savedBundles, form_config: v.formConfig, payment_instructions: v.paymentInstructions, telegram_chat_id: v.telegramChatId || customer.telegram_chat_id || null, notifications_enabled: v.notificationsEnabled, notification_preferences: preferences, config_version: 1 }).select('id,customer_id,name,token,status,bundles,created_at').single();
  if (error) throw error;
  const origin = (process.env.PUBLIC_APP_URL || '').replace(/\/$/, '');
  res.status(201).json({ link: { ...data, url: origin ? `${origin}/l/${token}` : null } });
}));
app.put('/api/admin/links/:id', ...adminRoute, asyncRoute(async (req, res) => {
  const p = linkSchema.partial().omit({ customerId: true }).safeParse(req.body); if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  const v = p.data;
  const { data: existing, error: e } = await supabase.from('visitor_links').select('*').eq('id', req.params.id).single();
  if (e || !existing) return res.status(404).json({ error: 'Link not found' });
  const patch = {};
  if (v.name !== undefined) patch.name = v.name;
  if (v.formConfig !== undefined) patch.form_config = v.formConfig;
  if (v.paymentInstructions !== undefined) patch.payment_instructions = v.paymentInstructions;
  if (v.telegramChatId !== undefined) patch.telegram_chat_id = v.telegramChatId || null;
  if (v.notificationsEnabled !== undefined) patch.notifications_enabled = v.notificationsEnabled;
  if (v.notificationPreferences !== undefined) patch.notification_preferences = v.notificationPreferences;
  if (v.bundles !== undefined) {
    const { data: catalogRows, error: catalogError } = await supabase.from('bundle_catalog').select('*').in('bundle_id', v.bundles.map((bundle) => bundle.id));
    if (catalogError) throw catalogError;
    try { patch.bundles = normalizeLinkBundles(v.bundles, catalogRows || []); }
    catch (error) { return res.status(400).json({ error: error.message }); }
  }
  const effective = { ...existing, ...patch };
  const { data: customer, error: customerError } = await supabase.from('customers').select('notifications_enabled,notification_preferences').eq('id', existing.customer_id).single();
  if (customerError) throw customerError;
  if (effective.notifications_enabled && !customer.notifications_enabled) return res.status(400).json({ error: 'Enable notifications in the customer settings before enabling them for this link.' });
  patch.notification_preferences = permittedNotificationPreferences(effective.notification_preferences, customer.notification_preferences || {});
  effective.notification_preferences = patch.notification_preferences;
  if (existing.status === 'published') {
    try {
      assertPublishableLink(effective, { botToken: process.env.TELEGRAM_BOT_TOKEN, publicAppUrl: process.env.PUBLIC_APP_URL, nodeEnv: process.env.NODE_ENV });
    } catch (error) { return res.status(400).json({ error: error.message }); }
  }
  patch.config_version = (existing.config_version || 1) + 1;
  const { data, error } = await supabase.from('visitor_links').update(patch).eq('id', req.params.id).select('id,customer_id,name,token,status,bundles,config_version').single();
  if (error) throw error; res.json({ link: { ...data, url: `${(process.env.PUBLIC_APP_URL || '').replace(/\/$/, '')}/l/${data.token}` } });
}));
app.post('/api/admin/links/:id/telegram-test', ...adminRoute, asyncRoute(async (req, res) => {
  const { data: link, error } = await supabase.from('visitor_links').select('id,name,telegram_chat_id').eq('id', req.params.id).single();
  if (error || !link) return res.status(404).json({ error: 'Link not found.' });
  if (!link.telegram_chat_id) return res.status(400).json({ error: 'This link has no saved Telegram Chat ID.' });
  if (!process.env.TELEGRAM_BOT_TOKEN) return res.status(503).json({ error: 'Telegram bot token is not configured on the server.' });
  const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: link.telegram_chat_id, text: `Test notification for visitor link: ${link.name}. This exact link destination is reachable.` }), signal: AbortSignal.timeout(10000) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) return res.status(502).json({ connected: false, error: result.description || 'Telegram delivery failed.' });
  res.json({ connected: true, message: 'Test message sent to the link-specific destination.' });
}));
app.post('/api/admin/links/:id/:action', ...adminRoute, asyncRoute(async (req, res) => {
  if (!['publish', 'unpublish', 'disable'].includes(req.params.action)) return res.status(404).json({ error: 'Unknown link action' });
  const { data: link, error: e } = await supabase.from('visitor_links').select('*').eq('id', req.params.id).single();
  if (e || !link) return res.status(404).json({ error: 'Link not found' });
  const status = req.params.action === 'publish' ? 'published' : req.params.action === 'disable' ? 'disabled' : 'unpublished';
  if (status === 'published') {
    try {
      assertPublishableLink(link, { botToken: process.env.TELEGRAM_BOT_TOKEN, publicAppUrl: process.env.PUBLIC_APP_URL, nodeEnv: process.env.NODE_ENV });
    } catch (error) { return res.status(400).json({ error: error.message }); }
  }
  const { data, error } = await supabase.from('visitor_links').update({ status, updated_at: new Date().toISOString() }).eq('id', link.id).select('id,status').single();
  if (error) throw error; res.json({ link: data });
}));
app.get('/api/admin/telegram/status', ...adminRoute, asyncRoute(async (_req, res) => {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return res.json({ configured: false, connected: false, error: 'Telegram bot token is not configured on the backend.' });
  }
  try {
    const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`, { signal: AbortSignal.timeout(10000) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) {
      return res.status(502).json({ configured: true, connected: false, error: result.description || 'Telegram bot verification failed.' });
    }
    return res.json({ configured: true, connected: true, bot: { id: result.result.id, username: result.result.username || null } });
  } catch {
    return res.status(502).json({ configured: true, connected: false, error: 'Telegram could not be reached. Check the backend network and bot configuration.' });
  }
}));

app.get('/api/public/links/:token', dbReady, asyncRoute(async (req, res) => {
  const { data: link, error } = await supabase.from('visitor_links').select('id,name,status,bundles,form_config,payment_instructions,customer_id').eq('token_hash', sha256(req.params.token)).single();
  if (error || !link || link.status !== 'published') return res.status(404).json({ error: 'This visitor link is unavailable.' });
  res.set('Cache-Control', 'no-store'); res.json({ link: { id: link.id, name: link.name, bundles: (link.bundles || []).filter((b) => b.enabled !== false), formConfig: link.form_config, paymentInstructions: link.payment_instructions } });
}));

const submitSchema = z.object({
  bundleId: z.string().min(1).max(100),
  phone: z.string().trim().min(7).max(25).regex(/^[+0-9()\s-]+$/, 'Enter a valid phone number.'),
  orderCode: z.string().regex(/^\d{4}$/, 'Enter your pin.'),
  idempotencyKey: z.string().uuid()
});

app.post('/api/public/links/:token/submissions', dbReady, asyncRoute(async (req, res) => {
  const p = submitSchema.safeParse(req.body); if (!p.success) return res.status(400).json({ error: 'Provide a valid bundle, phone number and submission key.' });
  const { data: link, error: le } = await supabase.from('visitor_links').select('*').eq('token_hash', sha256(req.params.token)).single();
  if (le || !link || link.status !== 'published') return res.status(404).json({ error: 'This visitor link is unavailable.' });
  const bundle = (link.bundles || []).find((b) => b.id === p.data.bundleId && b.enabled !== false);
  if (!bundle) return res.status(400).json({ error: 'That bundle is not available for this link.' });
  const orderRef = `ORD-${randomBytes(8).toString('hex').toUpperCase()}`;
  const { data: customer, error: customerError } = await supabase.from('customers').select('notifications_enabled,notification_preferences').eq('id', link.customer_id).single();
  if (customerError) throw customerError;
  const notificationPreferences = permittedNotificationPreferences(link.notification_preferences, customer.notification_preferences);
  const notificationEnabled = Boolean(link.notifications_enabled && customer.notifications_enabled && link.telegram_chat_id && notificationPreferences.newOrder);
  
  const { data, error } = await supabase.rpc('create_order_with_notification', {
    p_order_ref: orderRef,
    p_customer_id: link.customer_id,
    p_link_id: link.id,
    p_bundle_id: bundle.id,
    p_bundle_name: bundle.name,
    p_amount: money(bundle.price),
    p_currency: 'USD',
    p_phone: p.data.phone,
    p_order_code: p.data.orderCode,
    p_idempotency_key: p.data.idempotencyKey,
    p_payment_status: 'pending',
    p_notification_enabled: notificationEnabled,
    p_chat_id: notificationEnabled ? link.telegram_chat_id : null,
    p_config_version: link.config_version,
    p_notification_preferences: notificationPreferences
  });

  if (error) {
    if (error.code === '23505') {
      const { data: old } = await supabase
        .from('orders')
        
.select('order_ref,bundle_name,payment_status,amount,currency,link_id,bundle_id,phone,order_code,notifications(status)')
        .eq('idempotency_key', p.data.idempotencyKey)
        .maybeSingle();

      if (
       
old?.link_id === link.id &&
old.bundle_id === bundle.id &&
old.phone === p.data.phone &&
old.order_code === p.data.orderCode

      ) {
        return res.status(200).json({
          order: {
            ...old,
            notification_queued: Boolean(old.notifications?.length)
          },
          duplicate: true
        });
      }

      return res.status(409).json({
        error: 'This submission key was already used. Refresh the page and submit again.'
      });
    }

    throw error;
  }

  return res.status(201).json({
    order: data,
    paymentInstructions: link.payment_instructions,
    payment: {
      provider: 'ecocash',
      initiated: false,
      reason: 'provider_not_configured'
    },
        message: 'Order received. No automated EcoCash payment request was initiated because an authorized provider integration is not configured. Payment remains pending until independently verified.'
  });
}));
app.get('/api/admin/orders', ...adminRoute, asyncRoute(async (req, res) => {
  const filters = orderFiltersSchema.safeParse(req.query);
  if (!filters.success) return res.status(400).json({ error: 'Invalid order filters.' });

  const { page, pageSize } = filters.data;
  const notificationJoin = filters.data.notificationStatus && filters.data.notificationStatus !== 'not queued'
    ? 'notifications!inner(id,status)'
    : 'notifications(id,status)';
  let q = supabase.from('orders').select(`*,customers(name),visitor_links(name),${notificationJoin}`, { count: 'exact' }).order('created_at', { ascending: false });
  if (filters.data.customerId) q = q.eq('customer_id', filters.data.customerId);
  if (filters.data.linkId) q = q.eq('link_id', filters.data.linkId);
  if (filters.data.orderRef) q = q.ilike('order_ref', `%${escapeLikePattern(filters.data.orderRef)}%`);
  if (filters.data.bundleId) q = q.eq('bundle_id', filters.data.bundleId);
  if (filters.data.paymentStatus) q = q.eq('payment_status', filters.data.paymentStatus);
  if (filters.data.notificationStatus === 'not queued') q = q.is('notifications.id', null);
  else if (filters.data.notificationStatus) q = q.eq('notifications.status', filters.data.notificationStatus);
  if (filters.data.from) q = q.gte('created_at', `${filters.data.from}T00:00:00.000Z`);
  if (filters.data.to) {
    const exclusiveEnd = new Date(`${filters.data.to}T00:00:00.000Z`);
    exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
    q = q.lt('created_at', exclusiveEnd.toISOString());
  }
  const { from, to } = orderRange(page, pageSize);
  const { data, error, count } = await q.range(from, to);
  if (error) throw error;
  res.json({
    orders: data || [],
    pagination: { page, pageSize, total: count || 0, totalPages: Math.ceil((count || 0) / pageSize) }
  });
}));
app.get('/api/admin/notifications', ...adminRoute, asyncRoute(async (_req, res) => {
  const { data, error } = await supabase.from('notifications').select('*,orders(order_ref),customers(name),visitor_links(name),delivery_attempts:notification_attempts(id,attempt_number,status,error,attempted_at)').order('created_at', { ascending: false }).limit(300);
  if (error) throw error; res.json({ notifications: data });
}));
app.post('/api/admin/notifications/:id/retry', ...adminRoute, asyncRoute(async (req, res) => {
  const { data: n, error: e } = await supabase.from('notifications').select('id,status,attempts,link_id,customer_id').eq('id', req.params.id).single();
  if (e || !n) return res.status(404).json({ error: 'Notification not found' });
  if (n.status !== 'failed') return res.status(409).json({ error: 'Only failed notifications can be retried.' });

  let destination = null;
  if (n.link_id) {
    const { data: link, error: linkError } = await supabase.from('visitor_links').select('telegram_chat_id').eq('id', n.link_id).maybeSingle();
    if (linkError) throw linkError;
    destination = link?.telegram_chat_id || null;
  }
  if (!destination && n.customer_id) {
    const { data: customer, error: customerError } = await supabase.from('customers').select('telegram_chat_id').eq('id', n.customer_id).maybeSingle();
    if (customerError) throw customerError;
    destination = customer?.telegram_chat_id || null;
  }
  if (!destination) return res.status(400).json({ error: 'No Telegram Chat ID is configured for this notification. Update the visitor link or customer settings first.' });

  const { data, error } = await supabase.from('notifications').update({
    status: 'queued',
    attempts: 0,
    intended_chat_id: destination,
    next_attempt_at: new Date().toISOString(),
    processing_started_at: null,
    sent_at: null,
    last_error: null
  }).eq('id', n.id).eq('status', 'failed').select().maybeSingle();
  if (error) throw error;
  if (!data) return res.status(409).json({ error: 'Notification state changed. Refresh and try again.' });
  res.json({ notification: data, message: 'Retry queued.' });
}));
app.post('/api/admin/customers/:id/telegram-test', ...adminRoute, asyncRoute(async (req, res) => {
  const { data: customer, error } = await supabase.from('customers').select('id,name,telegram_chat_id').eq('id', req.params.id).single();
  if (error || !customer) return res.status(404).json({ error: 'Customer not found.' });
  const chatId = customer.telegram_chat_id; if (!chatId) return res.status(400).json({ error: 'Save a Telegram Chat ID first.' });
  if (!process.env.TELEGRAM_BOT_TOKEN) return res.status(503).json({ error: 'Telegram bot token is not configured on the server.' });
  const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: `Test notification for ${customer.name}. Your Telegram destination is reachable.` }), signal: AbortSignal.timeout(10000) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) return res.status(502).json({ connected: false, error: result.description || 'Telegram delivery failed.' });
  res.json({ connected: true, message: 'Telegram test message sent successfully.' });
}));
app.use((err, _req, res, _next) => {
  console.error('API request failed:', safeQueueErrorDetails(err));
  const status = apiFailureStatus(err);
  res.status(status).json({ error: status === 403 ? 'Origin not allowed by CORS.' : 'The request could not be completed.' });
});

// DB-backed queue worker. Run one Render worker instance for simple deployments.
let workerBusy = false;
let lastQueueErrorLogAt = null;
const queueBackoff = createQueueBackoff();
function logQueueError(label, error) {
  const now = Date.now();
  if (!queueErrorLogDue(lastQueueErrorLogAt, now)) return;
  lastQueueErrorLogAt = now;
  console.error(label, safeQueueErrorDetails(error));
}
function pauseQueue(label, error) {
  queueBackoff.failed();
  logQueueError(label, error);
}
async function processNotifications() {
  if (!supabase || !process.env.TELEGRAM_BOT_TOKEN || workerBusy || !queueBackoff.canRun()) return;
  workerBusy = true;
  try {
    const queue = await runQueueWhenReady(
      () => inspectDatabaseSchema(supabase),
      () => supabase.rpc('claim_notifications', { p_limit: 10 })
    );
    if (!queue.claimed) {
      const missingObjects = queue.readiness.missingObjects || [];
      const message = missingObjects.length
        ? `Schema not ready; ${missingObjects.length} required checks failed.`
        : 'Schema readiness check is unavailable.';
      pauseQueue('Notification queue paused:', {
        code: queue.readiness.schemaCheckError || 'schema_not_ready',
        message,
        missingObjects
      });
      return;
    }
    const { data: jobs, error } = queue.result;
    if (error) { pauseQueue('Notification queue claim failed:', error); return; }
    queueBackoff.succeeded();
    for (const job of jobs || []) {
      let status = 'failed'; let errorText = null;
      try {
        const prefs = job.message_fields || {};
        const text = formatOrderNotification(job, prefs);
        if (!text) throw new Error('Order notification is disabled for this event.');
        let response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: job.intended_chat_id, text }), signal: AbortSignal.timeout(10000) });
        let result = await response.json().catch(() => ({}));
        if ((!response.ok || !result.ok) && /chat not found/i.test(String(result.description || ''))) {
          // A link may contain a stale Chat ID. Fall back to the customer's verified destination.
          const { data: notification, error: notificationLookupError } = await supabase.from('notifications').select('customer_id,link_id').eq('id', job.id).maybeSingle();
          if (notificationLookupError) throw notificationLookupError;
          if (notification?.customer_id) {
            const { data: customer, error: customerLookupError } = await supabase.from('customers').select('telegram_chat_id').eq('id', notification.customer_id).maybeSingle();
            if (customerLookupError) throw customerLookupError;
            const fallbackChatId = customer?.telegram_chat_id || null;
            if (fallbackChatId && String(fallbackChatId) !== String(job.intended_chat_id)) {
              const fallbackResponse = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: fallbackChatId, text }), signal: AbortSignal.timeout(10000) });
              const fallbackResult = await fallbackResponse.json().catch(() => ({}));
              if (fallbackResponse.ok && fallbackResult.ok) {
                response = fallbackResponse;
                result = fallbackResult;
                const { error: destinationError } = await supabase.from('notifications').update({ intended_chat_id: fallbackChatId }).eq('id', job.id);
                if (destinationError) console.warn('Notification sent, but fallback destination could not be saved:', safeQueueErrorDetails(destinationError));
                if (notification.link_id) {
                  const { data: link, error: linkLookupError } = await supabase.from('visitor_links').select('telegram_chat_id,config_version').eq('id', notification.link_id).maybeSingle();
                  if (linkLookupError) console.warn('Notification sent, but link destination could not be checked for repair:', safeQueueErrorDetails(linkLookupError));
                  else if (link && String(link.telegram_chat_id || '') === String(job.intended_chat_id || '')) {
                    const { error: linkRepairError } = await supabase.from('visitor_links').update({
                      telegram_chat_id: fallbackChatId,
                      config_version: (link.config_version || 1) + 1,
                      updated_at: new Date().toISOString()
                    }).eq('id', notification.link_id).eq('telegram_chat_id', job.intended_chat_id);
                    if (linkRepairError) console.warn('Notification sent, but stale link Chat ID could not be repaired:', safeQueueErrorDetails(linkRepairError));
                    else console.warn('Repaired stale visitor-link Telegram destination using the customer Chat ID.');
                  }
                }
              } else {
                result = fallbackResult;
                response = fallbackResponse;
              }
            }
          }
        }
        if (!response.ok || !result.ok) throw new Error(result.description || `Telegram HTTP ${response.status}`);
        status = 'sent';
      } catch (err) { errorText = String(err?.message || 'Delivery failed').slice(0, 500); }
      const attempts = Number(job.attempts || 0);
      const outcome = notificationOutcome({ sent: status === 'sent', attempt: attempts });
      const { error: completionError } = await supabase.rpc('complete_notification_attempt', {
        p_id: job.id,
        p_attempt: attempts,
        p_sent: status === 'sent',
        p_error: errorText,
        p_next_attempt_at: outcome.nextAttemptAt
      });
      if (completionError) {
        pauseQueue('Notification result could not be persisted:', completionError);
        return;
      }
    }
  } catch (err) { logQueueError('Notification worker error:', err); }
  finally { workerBusy = false; }
}
if (process.env.RUN_NOTIFICATION_WORKER !== 'false') setInterval(processNotifications, Math.max(3000, Number(process.env.NOTIFICATION_POLL_MS || 5000))).unref();
const port = Number(process.env.PORT || 8080);
app.listen(port, () => console.log(`Starlink admin API listening on ${port}`));
