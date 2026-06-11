-- Frontier Alpha Forensic Event Chain
-- Migration: 20260610_forensic_events
-- Created: 2026-06-10
-- Purpose: Tamper-evident, append-only audit trail (IDEA-FF-1 / IDEA-FF-5).
--          Every CVRF belief update, episode transition, and trading order
--          becomes a SHA-256 hash-chained event. Verifiable by recomputing
--          the chain — "trust the math, not the database."
--
-- APPLY DISCIPLINE: this file is tracked but NOT applied automatically. The
-- server (src/forensics/ForensicChain.ts) no-ops cleanly when the table is
-- absent, so production behavior is unchanged until Dico runs the migration.
-- Do NOT apply via `supabase db push` — the shared project's migration
-- history doesn't match this repo. Paste into the dashboard SQL editor or
-- use the Management API (scripts/apply-pending-migrations.sh).

-- ============================================================================
-- FORENSIC EVENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS frontier_forensic_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- NULL for the global (pre-auth) CVRF belief chain
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  stream VARCHAR(40) NOT NULL,
  sequence BIGINT NOT NULL CHECK (sequence >= 1),
  event_type VARCHAR(60) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload_hash VARCHAR(64) NOT NULL,
  prev_hash VARCHAR(64) NOT NULL,
  hash VARCHAR(64) NOT NULL,
  occurred_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- One chain per (user, stream): sequence numbers are dense and unique.
-- COALESCE folds the nullable user_id so the global chain is also protected.
CREATE UNIQUE INDEX IF NOT EXISTS idx_forensic_chain_seq
  ON frontier_forensic_events (COALESCE(user_id::text, 'global'), stream, sequence);

-- Newest-first listing per user/stream
CREATE INDEX IF NOT EXISTS idx_forensic_user_stream
  ON frontier_forensic_events (user_id, stream, sequence DESC);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE frontier_forensic_events ENABLE ROW LEVEL SECURITY;

-- Users can read their own chain. No INSERT/UPDATE/DELETE policies: writes go
-- through the service role only, and the chain is append-only by design.
CREATE POLICY forensic_events_read_own ON frontier_forensic_events
  FOR SELECT USING (auth.uid() = user_id);
