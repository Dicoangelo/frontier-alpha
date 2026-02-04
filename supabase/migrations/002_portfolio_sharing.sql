-- Frontier Alpha Portfolio Sharing Schema
-- Migration: 002_portfolio_sharing
-- Created: 2024-02-04

-- ============================================================================
-- PORTFOLIO SHARES
-- ============================================================================

CREATE TABLE IF NOT EXISTS frontier_portfolio_shares (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  portfolio_id UUID NOT NULL REFERENCES frontier_portfolios(id) ON DELETE CASCADE,
  shared_with_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  share_token VARCHAR(64) UNIQUE,
  permissions VARCHAR(10) NOT NULL DEFAULT 'view' CHECK (permissions IN ('view', 'edit')),
  shared_by_email VARCHAR(255),
  shared_with_email VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  accessed_at TIMESTAMP WITH TIME ZONE,
  access_count INTEGER DEFAULT 0,

  -- Either shared_with_user_id OR share_token must be set (for user shares or public links)
  CONSTRAINT share_target_required CHECK (
    shared_with_user_id IS NOT NULL OR share_token IS NOT NULL
  ),

  -- Unique constraint: one share per user per portfolio
  CONSTRAINT unique_user_share UNIQUE (portfolio_id, shared_with_user_id)
);

-- Indexes for share queries
CREATE INDEX IF NOT EXISTS idx_shares_portfolio_id ON frontier_portfolio_shares(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_shares_token ON frontier_portfolio_shares(share_token) WHERE share_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shares_user ON frontier_portfolio_shares(shared_with_user_id) WHERE shared_with_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shares_expires ON frontier_portfolio_shares(expires_at) WHERE expires_at IS NOT NULL;

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

ALTER TABLE frontier_portfolio_shares ENABLE ROW LEVEL SECURITY;

-- Portfolio owners can manage shares for their portfolios
CREATE POLICY "Portfolio owners can view their shares" ON frontier_portfolio_shares
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM frontier_portfolios p
      WHERE p.id = portfolio_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Portfolio owners can create shares" ON frontier_portfolio_shares
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM frontier_portfolios p
      WHERE p.id = portfolio_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Portfolio owners can update shares" ON frontier_portfolio_shares
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM frontier_portfolios p
      WHERE p.id = portfolio_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Portfolio owners can delete shares" ON frontier_portfolio_shares
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM frontier_portfolios p
      WHERE p.id = portfolio_id AND p.user_id = auth.uid()
    )
  );

-- Users can view shares they received
CREATE POLICY "Users can view shares received" ON frontier_portfolio_shares
  FOR SELECT USING (shared_with_user_id = auth.uid());

-- Service role full access
CREATE POLICY "Service role full access to shares" ON frontier_portfolio_shares
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================================
-- FUNCTIONS FOR SHARE ACCESS
-- ============================================================================

-- Function to validate share token and get portfolio (used for public links)
CREATE OR REPLACE FUNCTION get_shared_portfolio_by_token(p_token VARCHAR)
RETURNS TABLE (
  portfolio_id UUID,
  portfolio_name VARCHAR,
  permissions VARCHAR,
  owner_name VARCHAR,
  is_expired BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ps.portfolio_id,
    p.name AS portfolio_name,
    ps.permissions,
    COALESCE(us.display_name, 'Anonymous') AS owner_name,
    CASE
      WHEN ps.expires_at IS NOT NULL AND ps.expires_at < NOW() THEN true
      ELSE false
    END AS is_expired
  FROM frontier_portfolio_shares ps
  JOIN frontier_portfolios p ON p.id = ps.portfolio_id
  LEFT JOIN frontier_user_settings us ON us.user_id = p.user_id
  WHERE ps.share_token = p_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to increment access count
CREATE OR REPLACE FUNCTION increment_share_access(p_share_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE frontier_portfolio_shares
  SET
    access_count = access_count + 1,
    accessed_at = NOW()
  WHERE id = p_share_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- CLEANUP FUNCTION
-- ============================================================================

-- Update cleanup function to include expired shares
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS void AS $$
BEGIN
  -- Delete factor exposures older than 24 hours
  DELETE FROM frontier_factor_exposures
  WHERE expires_at < NOW();

  -- Delete earnings forecasts past their report date + 1 day
  DELETE FROM frontier_earnings_forecasts
  WHERE expires_at < NOW();

  -- Delete quote cache older than 1 hour (handled by app logic, this is backup)
  DELETE FROM frontier_quote_cache
  WHERE cached_at < NOW() - INTERVAL '1 hour';

  -- Delete expired portfolio shares
  DELETE FROM frontier_portfolio_shares
  WHERE expires_at IS NOT NULL AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGER FOR UPDATED ACCESS
-- ============================================================================

-- Add updated_at trigger (optional, for tracking modifications)
CREATE TRIGGER update_shares_accessed_at
  BEFORE UPDATE ON frontier_portfolio_shares
  FOR EACH ROW
  WHEN (OLD.access_count IS DISTINCT FROM NEW.access_count)
  EXECUTE FUNCTION update_updated_at_column();
