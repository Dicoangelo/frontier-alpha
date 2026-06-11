-- Frontier Alpha Provenance DAG
-- Migration: 20260611_provenance_nodes
-- Created: 2026-06-11
-- Purpose: PROV-O-style decision lineage (IDEA-FF-3). Every pipeline stage —
--          market_data → factor_compute → optimizer_run → recommendation →
--          insight → user_action — becomes a DAG node pointing at its
--          parents, so "why this trade?" is a graph traversal instead of a
--          black box.
--
-- APPLY DISCIPLINE: tracked but NOT applied automatically. The server
-- (src/forensics/ProvenanceDag.ts) no-ops cleanly when the table is absent.
-- Apply via scripts/apply-pending-migrations.sh — NEVER `supabase db push`
-- (shared project; foreign migration history).

-- ============================================================================
-- PROVENANCE NODES
-- ============================================================================

CREATE TABLE IF NOT EXISTS frontier_provenance_nodes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- NULL for system-level (pre-auth) pipeline stages
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  node_type VARCHAR(40) NOT NULL,
  label TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Parent node ids (PROV-O wasDerivedFrom). Empty for root nodes.
  parents UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Newest-first listing per user (optionally filtered by node_type)
CREATE INDEX IF NOT EXISTS idx_provenance_user_created
  ON frontier_provenance_nodes (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_provenance_user_type
  ON frontier_provenance_nodes (user_id, node_type, created_at DESC);
-- Child lookups ("what was derived from this node?")
CREATE INDEX IF NOT EXISTS idx_provenance_parents
  ON frontier_provenance_nodes USING GIN (parents);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE frontier_provenance_nodes ENABLE ROW LEVEL SECURITY;

-- Users read their own lineage. Writes are service-role only (append-only by
-- convention: no UPDATE/DELETE policies).
CREATE POLICY provenance_nodes_read_own ON frontier_provenance_nodes
  FOR SELECT USING (auth.uid() = user_id);
