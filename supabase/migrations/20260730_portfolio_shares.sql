-- ============================================================================
-- portfolio_shares — token-based portfolio SNAPSHOT sharing
-- ============================================================================
--
-- WHY THIS EXISTS: src/services/SharingService.ts::createPortfolioShare and
-- ::getPortfolioShareByToken query a bare `portfolio_shares` table that had no
-- CREATE TABLE in ANY migration. Those two functions are the LIVE sharing path
-- — routes/social.ts imports them for POST /api/v1/portfolio/share and
-- GET /api/v1/portfolio/shared/:token — so portfolio sharing has never worked
-- in production. It failed silently because both functions swallow the error
-- and return null, which the routes render as "share not found".
--
-- Found 2026-07-30 by the `databaseSchema` probe on /api/v1/health/integrations.
--
-- WHY NOT REUSE AN EXISTING TABLE: this repo has three share tables, and
-- neither of the other two fits this path.
--   frontier_portfolio_shares (002_portfolio_sharing.sql)
--     requires portfolio_id UUID NOT NULL REFERENCES frontier_portfolios(id).
--     This path shares an arbitrary JSON snapshot and has no portfolio row.
--   frontier_shared_portfolios (20260209_shared_portfolios.sql)
--     has user_id + portfolio_data + share_token but NO expires_at, and this
--     path's contract is a 30-day expiring link.
-- Retargeting the code at either would mean changing the feature. The table
-- the code already describes is the smaller, honest change.
--
-- Columns mirror the insert/select in SharingService exactly:
--   insert: token, user_id, snapshot_json, expires_at
--   select: token, expires_at | snapshot_json, expires_at

CREATE TABLE IF NOT EXISTS portfolio_shares (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  token VARCHAR(64) NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,

  CONSTRAINT unique_portfolio_share_token UNIQUE (token)
);

-- Token lookup is the read path (GET /portfolio/shared/:token); user_id is the
-- "my shares" path. expires_at supports the TTL sweep below.
CREATE INDEX IF NOT EXISTS idx_portfolio_shares_token ON portfolio_shares(token);
CREATE INDEX IF NOT EXISTS idx_portfolio_shares_user_id ON portfolio_shares(user_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_shares_expires_at ON portfolio_shares(expires_at);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
--
-- Deliberately service-role only. Both SharingService functions go through
-- supabaseAdmin, and the public read path resolves the token SERVER-SIDE before
-- returning a snapshot — the anon key never touches this table. Granting anon
-- SELECT would expose every shared snapshot to anyone able to enumerate tokens.
-- Expiry is enforced in getPortfolioShareByToken, not by RLS.

ALTER TABLE portfolio_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to portfolio shares" ON portfolio_shares;
CREATE POLICY "Service role full access to portfolio shares" ON portfolio_shares
  FOR ALL USING (auth.role() = 'service_role');

-- Owners may read their own shares directly should a client-side path ever be
-- added. No anon policy: an unauthenticated reader must go through the server.
DROP POLICY IF EXISTS "Users can view own portfolio shares" ON portfolio_shares;
CREATE POLICY "Users can view own portfolio shares" ON portfolio_shares
  FOR SELECT USING (auth.uid() = user_id);

-- ============================================================================
-- TTL SWEEP
-- ============================================================================
-- Mirrors cleanup_expired_cache() in 002_portfolio_sharing.sql. Runs only when
-- called; never at migration time.

CREATE OR REPLACE FUNCTION cleanup_expired_portfolio_shares()
RETURNS void AS $$
BEGIN
  DELETE FROM portfolio_shares WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;
