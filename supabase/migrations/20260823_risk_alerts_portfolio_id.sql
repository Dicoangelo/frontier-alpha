-- Restore frontier_risk_alerts.portfolio_id in production.
--
-- 001_initial_schema.sql:72 has always declared this column. Production does
-- not have it: the Supabase project is shared across metaventionsai apps and
-- its migration history does not match this repo (see CLAUDE.md), so the table
-- was created without it and drifted.
--
-- Discovered 2026-08-23. RiskAlertSystem.persistAlert inserts portfolio_id, so
-- PostgREST rejects EVERY alert insert with
--
--   Could not find the 'portfolio_id' column of 'frontier_risk_alerts'
--   in the schema cache
--
-- and the caller swallows it twice — an inner try/catch that logs, wrapped in a
-- .catch() that logs a warning. Alert persistence has been silently dead.
--
-- No index. Nothing reads alerts by portfolio_id today (RiskAlertSystem and
-- routes/alerts.ts both filter on user_id, or on id for a single row), so the
-- column is write-only and an index would be speculative. Add one when a query
-- actually needs it.
--
-- Idempotent: safe to re-run, per the contract in
-- scripts/apply-pending-migrations.sh.

ALTER TABLE frontier_risk_alerts
  ADD COLUMN IF NOT EXISTS portfolio_id UUID
  REFERENCES frontier_portfolios(id) ON DELETE SET NULL;

-- PostgREST caches the schema. Without this the column exists in Postgres but
-- the API keeps rejecting writes until the cache happens to refresh, which
-- looks exactly like the migration not having worked.
NOTIFY pgrst, 'reload schema';
