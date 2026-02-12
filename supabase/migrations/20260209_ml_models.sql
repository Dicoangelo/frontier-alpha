-- Frontier Alpha ML Model Versions
-- Migration: 20260209_ml_models
-- Created: 2026-02-09
-- Purpose: Store trained ML model versions (regime detector, neural factor models)

-- ============================================================================
-- MODEL VERSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS frontier_model_versions (
  id VARCHAR(50) PRIMARY KEY,
  model_type VARCHAR(30) NOT NULL CHECK (model_type IN ('regime_detector', 'neural_factor')),
  version VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'training' CHECK (status IN ('training', 'validated', 'deployed', 'archived')),
  config JSONB NOT NULL DEFAULT '{}',
  metrics JSONB NOT NULL DEFAULT '{}',
  parameters JSONB NOT NULL DEFAULT '{}',
  data_points INTEGER NOT NULL DEFAULT 0,
  data_range_start TIMESTAMP WITH TIME ZONE,
  data_range_end TIMESTAMP WITH TIME ZONE,
  trained_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for model version queries
CREATE INDEX IF NOT EXISTS idx_model_versions_type ON frontier_model_versions(model_type);
CREATE INDEX IF NOT EXISTS idx_model_versions_status ON frontier_model_versions(status);
CREATE INDEX IF NOT EXISTS idx_model_versions_trained_at ON frontier_model_versions(trained_at DESC);
CREATE INDEX IF NOT EXISTS idx_model_versions_deployed ON frontier_model_versions(model_type, status) WHERE status = 'deployed';

-- Updated_at trigger
CREATE TRIGGER update_model_versions_updated_at
  BEFORE UPDATE ON frontier_model_versions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SERVICE ROLE ACCESS
-- ============================================================================

-- Model versions are server-side only (no user RLS needed)
-- Service role has full access via default permissions
