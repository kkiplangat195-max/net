# Reconstructed later-change summary

From the saved development session, the later workspace was reported to have:

1. Replaced Supabase client use with direct PostgreSQL access using Render `DATABASE_URL`.
2. Added repeatable database migrations.
3. Made order creation and notification enqueueing transactional.
4. Added a dedicated notification worker with row locking, delivery-attempt history, exponential retry scheduling, and stale-processing recovery.
5. Added Render Blueprint services for PostgreSQL, API, and worker.
6. Required `VITE_API_URL` in production and kept a localhost API default only for development.
7. Added restricted CORS, database-aware health checks, authentication/request validation, deployment docs, and a smoke test.

These are reconstructed notes, not source code for the missing changed files. EcoCash provider processing was not implemented and orders were still pending. Original visitor-site files were not in the starter archive.
