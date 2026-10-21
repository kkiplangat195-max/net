# Starlink to Cell — Admin + visitor starter

This repository is a from-scratch starter for the requested architecture:

- **Frontend:** React + Vite (deploy to Vercel)
- **Backend:** Express API (deploy to Render)
- **Database:** Supabase PostgreSQL
- **Notifications:** Telegram Bot API, with per-link destination snapshots and a database-backed retry queue

## Important scope and payment caveat

The original production repository, original page assets, and working EcoCash integration were not included in the provided workspace. Therefore this starter contains a newly implemented visitor page based on the written requirements; it is **not a pixel-identical preservation** of the original screenshots. It also does **not** initiate or verify real EcoCash payments. Orders stay `pending`; only a verified payment-provider integration should change that status. Do not deploy this as a replacement for the live visitor experience until the original visitor components and authorized payment integration have been merged and regression-tested.

The implementation never requests or stores an EcoCash wallet PIN. It includes the 5GB free / 15GB USD 0.99 / 35GB USD 1.99 / 50GB USD 2.99 / Unlimited USD 3.99 defaults, and lets an admin edit the bundle catalog. Link configurations save a bundle snapshot, Telegram Chat ID, notification preferences, and a config version.

## Repository layout

```text
backend/
  src/index.js                         Express API and Telegram queue worker
  supabase/migrations/001_initial.sql  Database schema and atomic order RPCs
  test/helpers.test.js                 Basic unit tests
  package.json
frontend/
  src/main.jsx                         Admin panel and public visitor route
  src/style.css                        Responsive UI
  package.json
  vite.config.js
.env.example
```

## 1. Create Supabase database

1. Create a Supabase project.
2. There is no migration runner in this repository or Render Blueprint. In Supabase SQL Editor, first inspect the current schema and migration history, back up the database, and apply only missing migrations in this order: `001_initial.sql`, `002_notification_attempt_history.sql`, `003_schema_contract.sql`, `004_schema_readiness_and_api_grants.sql`.
3. In Project Settings → API, copy the project URL and the **service-role key**. The service-role key is server-only and must never be added to Vercel or any `VITE_` variable.
4. The migrations create customers, visitor links, orders, notifications, a bundle catalog, notification attempt history, RLS, and RPC functions for idempotent order creation, notification claiming, guarded attempt completion, and schema readiness. Migration 003 and 004 request a PostgREST schema reload. Migration 002 sets existing customer/link `phone` notification preferences to false; it is not safe to rerun after customers have changed those preferences. Inspect migration state and preference data first; do not rerun an applied 002.

The backend uses the service role and enforces admin authentication at the API layer. Do not add a permissive RLS policy for anonymous access. `/health` returns HTTP 503 until expected tables, columns, foreign keys, indexes, RLS flags, service-role grants, and RPCs are visible. After applying SQL, wait briefly for PostgREST's reload and verify HTTP 200 with `databaseReady: true`.

Read-only preflight (run before applying migrations):

```sql
select current_database(), current_schema();
select to_regclass('public.customers') as customers,
       to_regclass('public.visitor_links') as visitor_links,
       to_regclass('public.orders') as orders,
       to_regclass('public.notifications') as notifications,
       to_regclass('public.notification_attempts') as notification_attempts,
       to_regclass('public.bundle_catalog') as bundle_catalog,
       to_regprocedure('public.claim_notifications(integer)') as claim_notifications,
       to_regprocedure('public.complete_notification_attempt(uuid,integer,boolean,text,timestamptz)') as complete_notification_attempt,
      to_regprocedure('public.notification_schema_status()') as notification_schema_status;
select schemaname, tablename from pg_catalog.pg_tables
where schemaname = 'public' order by tablename;
```

    No migration-history row alone proves whether an older migration ran. Compare catalog objects and definitions before deciding which files are missing. If `notification_schema_status()` is not yet installed, the `to_regprocedure` result will be `NULL`; do not run it in the preflight query. After applying migration 003 or 004, run `select public.notification_schema_status();` and verify `https://net-a5jw.onrender.com/health` returns `databaseReady: true`.

## 2. Configure and run the backend locally

Requirements: Node.js 20+.

```bash
cd backend
npm install
cp ../.env.example .env
```

Set these values in `backend/.env`:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD_HASH`
- `JWT_SECRET` (at least 32 random bytes)
- `FRONTEND_URL=http://localhost:5173`
- `PUBLIC_APP_URL=http://localhost:5173`
- `TELEGRAM_BOT_TOKEN` (from BotFather; keep private)

Generate a bcrypt password hash after installing dependencies:

```bash
node -e "console.log(require('bcryptjs').hashSync('replace-with-a-long-unique-password', 12))"
```

Generate a strong JWT secret:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Run:

```bash
npm run dev
```

Health check: `http://localhost:8080/health`.

## 3. Configure and run the frontend locally

```bash
cd frontend
npm install
```

Create `frontend/.env.local`:

```env
VITE_API_URL=http://localhost:8080
```

Then:

```bash
npm run dev
```

Open `http://localhost:5173`. Sign in using the `ADMIN_EMAIL` and password whose hash you configured in the backend. The visitor route pattern is `/l/:token`.

## 4. Telegram setup

1. Create a Telegram bot with BotFather and store its token as `TELEGRAM_BOT_TOKEN` on Render only.
2. Each customer must start the bot in a private chat, or add the bot to a group where it can send messages.
3. Save that customer's destination Chat ID in Customer Management. For links with a separate destination, save the Chat ID on that link when generating it.
4. Use **Test Telegram** for the customer or link. The endpoint sends a real test message and reports the actual API response.
5. Publish only after the correct destination is saved and tested.

When an order is submitted, its notification record captures the intended Chat ID and config version. Later Chat ID changes do not reroute queued notifications. The worker retries transient failures up to eight attempts and records the outcome. Use one worker instance unless you have reviewed queue scaling and monitoring.

## 5. Deploy backend to Render

Create a **Web Service** pointing at the `backend` directory (or set the root directory to `backend`). Build command: `npm install`; start command: `npm start`.

Add the environment variables listed in `.env.example` to Render. Set:

```env
NODE_ENV=production
FRONTEND_URL=https://YOUR-VERCEL-DOMAIN
PUBLIC_APP_URL=https://YOUR-VERCEL-DOMAIN
```

Use your actual deployed Vercel URL, not the placeholders. For the simplest setup, the API process also runs the notification worker. For larger production use, separate queue processing into a dedicated Render Background Worker and set `RUN_NOTIFICATION_WORKER=false` on the web service; monitor worker health and add a recovery policy for jobs left in `processing` after a crash.

## 6. Deploy frontend to Vercel

Import the repository into Vercel and set the project root directory to `frontend`. Build command: `npm run build`; output directory: `dist`.

Set this Vercel environment variable:

```env
VITE_API_URL=https://YOUR-RENDER-SERVICE.onrender.com
```

Redeploy after changing environment variables. Then update Render's `FRONTEND_URL` and `PUBLIC_APP_URL` to the actual frontend origin and redeploy the backend. `PUBLIC_APP_URL` is required before publishing links.

## 7. API behavior and safety notes

- Admin API routes require a signed, expiring JWT created by `/api/auth/login`.
- Link tokens use cryptographically secure random bytes. Public endpoints expose only the published link's visitor configuration.
- Draft, unpublished, and disabled links reject submissions.
- Bundle price and currency are taken from the saved link bundle snapshot, never from a visitor's request body.
- Duplicate submission keys are unique in the database; order creation and notification enqueueing run in one PostgreSQL function.
- Payment status remains pending. No order submission or redirect is treated as proof of payment.
- The backend never collects an EcoCash wallet PIN.
- Set strict CORS origins. Do not use `*` in production.
- Add a real admin account lifecycle, audit-log retention, backup/restore test, alerting, and security review before production use.

## 8. Tests and limitations

Run backend checks:

```bash
cd backend
npm test
npm run check
```

Run frontend production build:

```bash
cd frontend
npm run build
```

The included tests cover token characteristics and money rounding only; they are not a substitute for end-to-end integration tests. Before production, test two customers with distinct Chat IDs, link publish/disable, cross-customer isolation, duplicate submissions, Telegram failures/retries, authorization, database restore, and the actual EcoCash payment lifecycle. Live Telegram tests require real bot credentials and destination Chat IDs. No production domain, Supabase project, Telegram token, or EcoCash provider credentials are included.
