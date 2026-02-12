-- Frontier Alpha Shared Portfolios Schema
-- Migration: 20260209_shared_portfolios
-- Created: 2026-02-09
-- US-016: Portfolio sharing with visibility settings and share links

-- ============================================================================
-- SHARED PORTFOLIOS
-- ============================================================================

CREATE TABLE IF NOT EXISTS frontier_shared_portfolios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_data JSONB NOT NULL DEFAULT '{}',
  visibility VARCHAR(20) NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('public', 'followers', 'private')),
  share_token VARCHAR(64) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT unique_share_token UNIQUE (share_token)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_shared_portfolios_user_id ON frontier_shared_portfolios(user_id);
CREATE INDEX IF NOT EXISTS idx_shared_portfolios_share_token ON frontier_shared_portfolios(share_token);
CREATE INDEX IF NOT EXISTS idx_shared_portfolios_visibility ON frontier_shared_portfolios(visibility) WHERE visibility = 'public';

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

ALTER TABLE frontier_shared_portfolios ENABLE ROW LEVEL SECURITY;

-- Public shares are readable by anyone
CREATE POLICY "Anyone can view public shared portfolios" ON frontier_shared_portfolios
  FOR SELECT USING (visibility = 'public');

-- Users can always view their own shared portfolios
CREATE POLICY "Users can view own shared portfolios" ON frontier_shared_portfolios
  FOR SELECT USING (auth.uid() = user_id);

-- Users can create shared portfolios
CREATE POLICY "Users can create shared portfolios" ON frontier_shared_portfolios
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own shared portfolios
CREATE POLICY "Users can update own shared portfolios" ON frontier_shared_portfolios
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own shared portfolios
CREATE POLICY "Users can delete own shared portfolios" ON frontier_shared_portfolios
  FOR DELETE USING (auth.uid() = user_id);

-- Service role full access
CREATE POLICY "Service role full access to shared portfolios" ON frontier_shared_portfolios
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
