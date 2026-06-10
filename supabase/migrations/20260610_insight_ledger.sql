-- Frontier Alpha Insight Provenance Ledger
-- Migration: 20260610_insight_ledger
-- Created: 2026-06-10
-- Purpose: Persist a provenance receipt for every Cognitive Insight generated
--          for a user (IDEA-CIN-2). Closes the trust gap: each insight comes
--          with model / substrate / cost / latency provenance and an optional
--          user rating, so the user can replay or dispute a past explanation.
--
-- APPLY DISCIPLINE: this file is tracked but NOT applied automatically. The
-- server (src/insights/InsightLedger.ts) no-ops cleanly when the table is
-- absent, so production behavior is unchanged until Dico runs the migration.

-- ============================================================================
-- INSIGHT LEDGER
-- ============================================================================

CREATE TABLE IF NOT EXISTS frontier_insight_ledger (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  prompt_hash VARCHAR(64) NOT NULL,
  factors_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  model VARCHAR(120),
  substrate VARCHAR(60),
  escaped BOOLEAN NOT NULL DEFAULT false,
  escape_reason TEXT,
  output TEXT,
  cost_cents DECIMAL(12, 4),
  latency_ms INTEGER,
  user_rating SMALLINT CHECK (user_rating IS NULL OR user_rating BETWEEN -1 AND 5),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for per-user history queries (paginated, newest first)
CREATE INDEX IF NOT EXISTS idx_insight_ledger_user_id ON frontier_insight_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_insight_ledger_generated_at ON frontier_insight_ledger(user_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_insight_ledger_prompt_hash ON frontier_insight_ledger(user_id, prompt_hash);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE frontier_insight_ledger ENABLE ROW LEVEL SECURITY;

-- Users can only see/modify their own ledger entries
CREATE POLICY insight_ledger_user_policy ON frontier_insight_ledger
  FOR ALL USING (auth.uid() = user_id);
