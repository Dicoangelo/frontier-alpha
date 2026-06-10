-- 20260510_enable_rls_public_read.sql
-- Security fix applied directly to prod 2026-05-10 via Supabase MCP.
--
-- frontier_historical_prices and frontier_factor_returns had RLS
-- DISABLED entirely. Reading was intentional (public price/factor
-- reference data, no auth required) but with RLS off, anon could
-- ALSO insert, update, or delete arbitrary rows. Flagged as ERROR by
-- Supabase's rls_disabled_in_public advisor.
--
-- Pre-fix state (anon API call via public anon key):
--   frontier_historical_prices: 1400 rows readable AND writable
--   frontier_factor_returns: 0 rows but writable
--
-- Post-fix:
--   - RLS enabled
--   - Explicit public-read policy keeps current SELECT behavior
--   - anon INSERT/UPDATE/DELETE now return 42501 RLS policy violation
--   - service_role bypasses RLS via role attribute (cron writers unaffected)
--
-- Idempotent: ENABLE RLS is no-op if already on; CREATE POLICY drops first.

ALTER TABLE frontier_historical_prices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS frontier_historical_prices_public_read ON frontier_historical_prices;
CREATE POLICY frontier_historical_prices_public_read
  ON frontier_historical_prices
  FOR SELECT
  TO anon, authenticated
  USING (true);

ALTER TABLE frontier_factor_returns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS frontier_factor_returns_public_read ON frontier_factor_returns;
CREATE POLICY frontier_factor_returns_public_read
  ON frontier_factor_returns
  FOR SELECT
  TO anon, authenticated
  USING (true);
