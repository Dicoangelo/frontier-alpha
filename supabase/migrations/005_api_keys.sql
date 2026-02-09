-- Frontier Alpha API Keys Schema
-- Migration: 005_api_keys
-- Created: 2026-02-08

-- ============================================================================
-- API KEYS
-- ============================================================================

CREATE TABLE IF NOT EXISTS frontier_api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  permissions JSONB NOT NULL DEFAULT '{"read": true, "write": false}'::jsonb,
  rate_limit INTEGER NOT NULL DEFAULT 1000,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_used_at TIMESTAMP WITH TIME ZONE,
  revoked_at TIMESTAMP WITH TIME ZONE,

  CONSTRAINT valid_rate_limit CHECK (rate_limit > 0 AND rate_limit <= 10000)
);

-- Index on key_hash for fast lookup during authentication
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON frontier_api_keys(key_hash);

-- Index for user lookups (list my keys)
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON frontier_api_keys(user_id);

-- Index for active (non-revoked) keys
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON frontier_api_keys(user_id) WHERE revoked_at IS NULL;

-- ============================================================================
-- API KEY USAGE TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS frontier_api_key_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  api_key_id UUID NOT NULL REFERENCES frontier_api_keys(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  method VARCHAR(10) NOT NULL,
  status_code INTEGER NOT NULL,
  response_time_ms INTEGER,
  ip_address INET,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for usage queries per key
CREATE INDEX IF NOT EXISTS idx_api_key_usage_key_id ON frontier_api_key_usage(api_key_id, created_at DESC);

-- Partition-friendly index for time-range queries
CREATE INDEX IF NOT EXISTS idx_api_key_usage_created ON frontier_api_key_usage(created_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE frontier_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE frontier_api_key_usage ENABLE ROW LEVEL SECURITY;

-- Users can only see their own API keys
CREATE POLICY api_keys_select_own ON frontier_api_keys
  FOR SELECT USING (auth.uid() = user_id);

-- Users can only insert their own API keys
CREATE POLICY api_keys_insert_own ON frontier_api_keys
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can only update their own API keys (for revoking)
CREATE POLICY api_keys_update_own ON frontier_api_keys
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can only delete their own API keys
CREATE POLICY api_keys_delete_own ON frontier_api_keys
  FOR DELETE USING (auth.uid() = user_id);

-- Users can see usage for their own keys
CREATE POLICY api_key_usage_select_own ON frontier_api_key_usage
  FOR SELECT USING (
    api_key_id IN (
      SELECT id FROM frontier_api_keys WHERE user_id = auth.uid()
    )
  );

-- Usage records are inserted by the service role (server-side), not directly by users
-- No INSERT policy for users on usage table - server uses service role key
