-- Frontier Alpha Push Subscriptions Schema
-- Migration: 004_push_subscriptions
-- Created: 2026-02-08
-- Purpose: Store Web Push API subscriptions for push notification delivery

-- ============================================================================
-- PUSH SUBSCRIPTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  auth_key TEXT NOT NULL,
  p256dh_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for user lookups (most common query: get all subs for a user)
CREATE INDEX idx_push_subs_user ON push_subscriptions(user_id);

-- Index for endpoint lookups (used during unsubscribe)
CREATE INDEX idx_push_subs_endpoint ON push_subscriptions(endpoint);

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Service role has full access (used by server-side PushService)
CREATE POLICY "Service role full access to push_subscriptions" ON push_subscriptions
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Users can view their own subscriptions
CREATE POLICY "Users can view own push subscriptions" ON push_subscriptions
  FOR SELECT USING (user_id = auth.uid());

-- Users can insert their own subscriptions
CREATE POLICY "Users can create own push subscriptions" ON push_subscriptions
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Users can update their own subscriptions (e.g., refresh last_used_at)
CREATE POLICY "Users can update own push subscriptions" ON push_subscriptions
  FOR UPDATE USING (user_id = auth.uid());

-- Users can delete their own subscriptions (unsubscribe)
CREATE POLICY "Users can delete own push subscriptions" ON push_subscriptions
  FOR DELETE USING (user_id = auth.uid());

-- ============================================================================
-- HELPER FUNCTION: Update last_used_at on notification send
-- ============================================================================

CREATE OR REPLACE FUNCTION update_push_subscription_last_used(p_endpoint TEXT)
RETURNS void AS $$
BEGIN
  UPDATE push_subscriptions
  SET last_used_at = NOW()
  WHERE endpoint = p_endpoint;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- CLEANUP: Remove stale subscriptions (no activity in 90 days)
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_stale_push_subscriptions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM push_subscriptions
  WHERE last_used_at < NOW() - INTERVAL '90 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
