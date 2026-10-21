# Implementation Audit

Audit scope: source inspection of the extracted archive at `Starlink-Project-Inspection/starlink-admin-starter`, followed by the changes described below. The ZIP integrity test passed before extraction. Dependencies were installed after source review. Unit/build checks were run; no Supabase migration, production database, Telegram destination, EcoCash provider, or deployment was available for live testing.

## Stack and architecture

- Frontend: JavaScript/JSX, React 19, React Router 7, Vite 7, Lucide icons, and CSS (`frontend/src/main.jsx`, `frontend/src/style.css`, `frontend/package.json`).
- Backend: JavaScript ES modules, Node.js 20+, Express 5, Zod, JWT, bcryptjs, Helmet, CORS, and express-rate-limit (`backend/src/index.js`, `backend/package.json`).
- Database: Supabase-hosted PostgreSQL accessed through `@supabase/supabase-js`; no ORM is present. Schema and RPC functions are in `backend/supabase/migrations/001_initial.sql` and `backend/supabase/migrations/002_notification_attempt_history.sql`.
- Deployment: Render web service (`render.yaml`) and Vercel SPA rewrite (`frontend/vercel.json`). A separate PostgreSQL/worker blueprint is only a reconstructed artifact and does not match the Supabase backend (`reconstructed-deployment/README.md`).

## Implemented in source (not runtime-verified)

- Admin login compares the configured email and bcrypt password hash, then issues an eight-hour JWT. `/api/admin/*` routes use the `adminRoute` middleware (`backend/src/index.js`).
- Bundle catalog CRUD reads and updates the USD catalog; the frontend has bundle editing (`backend/src/index.js`, `backend/supabase/migrations/001_initial.sql`, `frontend/src/main.jsx`).
- Customer records persist notes, Chat ID, and notification preferences. New links receive a cryptographically random URL-safe token and are inserted as `draft`; the database stores both the token and its hash (`backend/src/index.js`, `backend/supabase/migrations/001_initial.sql`).
- Publish checks for an enabled bundle, Telegram configuration when enabled, and `PUBLIC_APP_URL`. The public link endpoint only returns published links; order submission also checks published status (`backend/src/index.js`).
- Orders are inserted by a database function with payment status forced to `pending`; when enabled, notification enqueueing happens in the same transaction. The database has a unique idempotency key (`backend/src/index.js`, `backend/supabase/migrations/001_initial.sql`).
- Telegram order sends use a backend-only bot token and stored link Chat ID. Customer/link connection tests call Telegram `sendMessage` and report success/failure. A background polling loop claims queued records and retries failures (`backend/src/index.js`).
- Link disable changes status without deleting orders; order foreign keys use `ON DELETE RESTRICT` (`backend/supabase/migrations/001_initial.sql`).
- No EcoCash API adapter or payment callback is present. The order response says initiation is false and payment stays pending; the UI warns against entering a PIN or OTP (`backend/src/index.js`, `frontend/src/main.jsx`, `ECOCASH_AND_TELEGRAM_SETUP.md`).
- Settings calls Telegram `getMe` for a real bot-token check. Customer/link test routes call Telegram `sendMessage` using the saved destination; those external calls were not run because credentials/database are unavailable.
- Link edits now normalize bundles against the server catalog and revalidate published configuration. The shared publication validator requires an enabled bundle, valid Telegram configuration when enabled, a valid public URL, and HTTPS in production (`backend/src/domain.js`, `backend/src/index.js`).
- Customer notification settings cap link permissions. Phone and amount fields are configurable; phone sharing defaults off for existing preferences after migration 002. Customer-level notification disablement prevents new order notifications.
- Migration 002 adds attempt history, processing timestamps, stale-claim recovery, and guarded atomic completion. Manual retries are restricted to failed notifications, whose history is displayed in the Admin UI.
- Migration 003 adds a service-role-only schema readiness RPC and requests a PostgREST cache reload. `/health` now checks the required tables/RPCs and returns 503 when unavailable instead of treating configured credentials as database readiness.
- Migration 004 extends readiness to expected columns, foreign keys, indexes, RLS, service-role table/RPC grants, and applies additive/rerunnable permission/index/FK/search-path repairs without row updates. Queue processing checks readiness before claiming and backs off exponentially on schema/RPC failures. Production Vercel origin is explicitly allowlisted; configured origins must be exact HTTP(S) origins.
- Unchanged visitor submissions reuse one idempotency key while the page remains mounted; duplicate responses are only returned for a matching link, bundle, and phone. Order references now contain 64 random bits.
- The Admin has a saved-configuration preview and filters the latest 200 orders by customer, link, reference, bundle, payment/notification status, and date.
- Queue claim/completion errors are throttled to one log per minute and redact common token/bearer/PIN-like patterns; notification text is built from an explicit allowlist. API errors log sanitized details and return generic status-specific messages.

## Partial, missing, or broken behavior

- **Notification delivery remains at-least-once:** Telegram send and database completion cannot be transactional; a crash after a successful send but before recording success can cause a duplicate after stale-claim recovery.
- **Idempotency is page-session scoped:** a full browser reload after an ambiguous response creates a new key; durable recovery across reloads would need a scoped client persistence policy (`frontend/src/main.jsx`).
- **Order filtering covers only the latest 200 records** returned by the API; older matching orders may not be found (`backend/src/index.js`, `frontend/src/main.jsx`).
- **Visitor form configuration remains phone-only.** The preview shows stored bundles and payment instructions but does not submit an order; no full form schema editor exists (`frontend/src/main.jsx`).
- **Payment and original visitor site are still absent:** no EcoCash initiation, verified provider callback, payment-confirmed notification, original site assets, or screenshot-based regression tests exist.
- **No separate order PIN exists in the current source.** There is no PIN column, generation, visitor input, or validation. The only PIN context is the EcoCash wallet authentication PIN, explicitly prohibited from website collection/Telegram forwarding, so no four-digit-PIN notification option was added.
- **Tests are unit/build scoped:** no route authorization, Supabase RPC, SQL migration, queue concurrency, or external Telegram/payment test was run. There is no lint script or automated database migration runner.
- **Original site not present:** README states the archive is a newly implemented starter, not a pixel-identical export of the original visitor site; original production assets and authorized EcoCash integration are missing (`README.md`, `RECOVERY_STATUS.md`).

## Security and reliability findings

1. **High: production application is not present.** This is a recovered starter, not a verified production website or payment system. Back up and reconcile it with the real repository before deployment.
2. **High: notification delivery is at-least-once.** A crash between Telegram send and database completion can duplicate a message.
3. **Medium: Admin JWT is stored in `localStorage`**, increasing the impact of frontend XSS; no refresh/revocation mechanism exists.
4. **Operational:** live Render health/CORS requests timed out during this run, so deployment state remains unverified. Verify Render proxy topology against the hardcoded `trust proxy` setting.
5. **Operational:** dependency lockfiles were absent from the archive; `npm install` generated lockfiles in this extracted copy. Review and keep them under version control.

## Database and configuration required

- Existing baseline migration: `backend/supabase/migrations/001_initial.sql` creates customers, links, orders, notifications, bundle catalog, RLS, and core RPCs.
- Added forward-only migration: `backend/supabase/migrations/002_notification_attempt_history.sql` adds attempt records, processing timestamps/recovery, a completion RPC, and opts phone sharing out for existing preference rows. Apply it after 001 and review the preference update before production.
- Added forward-only migration: `backend/supabase/migrations/003_schema_contract.sql` adds a read-only required-object status RPC and asks PostgREST to reload its schema cache. Apply it after 002.
- Added forward-only migration: `backend/supabase/migrations/004_schema_readiness_and_api_grants.sql` verifies columns/FKs/indexes/RLS/grants and repairs missing grants, RLS flags, indexes, and foreign keys without altering rows. Apply it after 003. Migration 002 updates existing phone-notification preferences; do not rerun it if already applied or after settings have been changed.
- Required backend settings: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `JWT_SECRET`, `FRONTEND_URL`, and verified `PUBLIC_APP_URL`; `TELEGRAM_BOT_TOKEN` is needed for Telegram. Values are only examples in `.env.example`.
- No EcoCash provider credentials, merchant API contract, signature scheme, or callback URL is included. A safe pending-order workflow is the only supportable payment behavior.

## Prioritized implementation plan

1. Obtain the actual production repository and reconcile its visitor/payment components before integrating this recovered starter.
2. Back up Supabase, inspect catalog objects and migration history, apply only missing migrations in order (001, 002, 003, 004), then verify `/health` is 200 and test claims/retries with concurrent workers and simulated crashes.
3. Add API integration tests for authentication, cross-customer access, link publication, price tampering, idempotency, and database failures.
4. Obtain official EcoCash merchant documentation and credentials before implementing payment initiation and authenticated callback verification.
5. Configure Telegram credentials and real destinations; run `getMe` and destination `sendMessage` tests before deployment.
