-- Frontier Alpha CVRF (Conceptual Verbal Reinforcement Framework) Schema
-- Migration: 003_cvrf_tables
-- Created: 2026-02-08
--
-- CVRF implements textual gradient descent for belief optimization.
-- These tables persist episode state, decisions, beliefs, and cycle history
-- across serverless invocations.

-- ============================================================================
-- CVRF EPISODES
-- ============================================================================
-- Tracks episodic trading periods and their performance metrics.
-- Each episode contains a set of decisions and produces performance results
-- that feed into the belief optimization cycle.

CREATE TABLE IF NOT EXISTS cvrf_episodes (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  episode_number INTEGER NOT NULL,
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE,
  portfolio_return DECIMAL(10, 4),
  sharpe_ratio DECIMAL(10, 4),
  max_drawdown DECIMAL(10, 4),
  volatility DECIMAL(10, 4),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for episode queries
CREATE INDEX IF NOT EXISTS idx_cvrf_episodes_user_date ON cvrf_episodes(user_id, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_cvrf_episodes_status ON cvrf_episodes(status);
CREATE INDEX IF NOT EXISTS idx_cvrf_episodes_active ON cvrf_episodes(user_id) WHERE status = 'active';

-- ============================================================================
-- CVRF DECISIONS
-- ============================================================================
-- Logs individual trading decisions within episodes.
-- Each decision captures the action, rationale, factor exposures,
-- and subsequent outcome for learning.

CREATE TABLE IF NOT EXISTS cvrf_decisions (
  id TEXT PRIMARY KEY,
  episode_id TEXT NOT NULL REFERENCES cvrf_episodes(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  symbol VARCHAR(10) NOT NULL,
  action VARCHAR(20) NOT NULL CHECK (action IN ('buy', 'sell', 'hold', 'rebalance')),
  weight_before DECIMAL(10, 4) NOT NULL,
  weight_after DECIMAL(10, 4) NOT NULL,
  reason TEXT,
  confidence DECIMAL(5, 4) CHECK (confidence BETWEEN 0 AND 1),
  factors JSONB DEFAULT '[]',
  outcome_return DECIMAL(10, 6),
  outcome_attribution JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for decision queries
CREATE INDEX IF NOT EXISTS idx_cvrf_decisions_episode ON cvrf_decisions(episode_id);
CREATE INDEX IF NOT EXISTS idx_cvrf_decisions_timestamp ON cvrf_decisions(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_cvrf_decisions_symbol ON cvrf_decisions(symbol);

-- ============================================================================
-- CVRF BELIEFS
-- ============================================================================
-- Persists the belief state (investment hypothesis) across episodes.
-- One belief record per user (upserted on each update).
-- Contains factor weights, risk parameters, regime detection, and conceptual priors.

CREATE TABLE IF NOT EXISTS cvrf_beliefs (
  id TEXT PRIMARY KEY,
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  factor_weights JSONB NOT NULL DEFAULT '{"momentum": 0.2, "value": 0.2, "quality": 0.2, "volatility": 0.2, "sentiment": 0.2}',
  factor_confidences JSONB NOT NULL DEFAULT '{"momentum": 0.5, "value": 0.5, "quality": 0.5, "volatility": 0.5, "sentiment": 0.5}',
  risk_tolerance DECIMAL(5, 4) NOT NULL DEFAULT 0.15,
  max_drawdown_threshold DECIMAL(5, 4) NOT NULL DEFAULT 0.20,
  volatility_target DECIMAL(5, 4) NOT NULL DEFAULT 0.15,
  momentum_horizon INTEGER NOT NULL DEFAULT 63,
  mean_reversion_threshold DECIMAL(10, 4) NOT NULL DEFAULT 2.0,
  concentration_limit DECIMAL(5, 4) NOT NULL DEFAULT 0.25,
  min_position_size DECIMAL(5, 4) NOT NULL DEFAULT 0.02,
  rebalance_threshold DECIMAL(5, 4) NOT NULL DEFAULT 0.05,
  current_regime VARCHAR(20) NOT NULL DEFAULT 'sideways' CHECK (current_regime IN ('bull', 'bear', 'sideways', 'volatile', 'recovery')),
  regime_confidence DECIMAL(5, 4) NOT NULL DEFAULT 0.5 CHECK (regime_confidence BETWEEN 0 AND 1),
  conceptual_priors JSONB DEFAULT '[]',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- CVRF CYCLE HISTORY
-- ============================================================================
-- Logs all CVRF optimization cycles and their results.
-- Each cycle compares consecutive episodes, extracts insights,
-- generates a meta-prompt, and updates beliefs.

CREATE TABLE IF NOT EXISTS cvrf_cycle_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  cycle_number INTEGER NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  previous_episode_id TEXT REFERENCES cvrf_episodes(id),
  current_episode_id TEXT REFERENCES cvrf_episodes(id),
  previous_episode_return DECIMAL(10, 4),
  current_episode_return DECIMAL(10, 4),
  performance_delta DECIMAL(10, 4) NOT NULL,
  decision_overlap DECIMAL(5, 4) NOT NULL,
  extracted_insights JSONB NOT NULL DEFAULT '[]',
  meta_prompt JSONB NOT NULL DEFAULT '{}',
  belief_updates JSONB NOT NULL DEFAULT '[]',
  new_belief_state JSONB NOT NULL DEFAULT '{}',
  explanation TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for cycle history queries
CREATE INDEX IF NOT EXISTS idx_cvrf_cycle_user ON cvrf_cycle_history(user_id);
CREATE INDEX IF NOT EXISTS idx_cvrf_cycle_timestamp ON cvrf_cycle_history(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_cvrf_cycle_performance ON cvrf_cycle_history(performance_delta DESC);

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

ALTER TABLE cvrf_episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE cvrf_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cvrf_beliefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cvrf_cycle_history ENABLE ROW LEVEL SECURITY;

-- Episodes: Users can only access their own episodes
CREATE POLICY "Users can view own episodes" ON cvrf_episodes
  FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can create own episodes" ON cvrf_episodes
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can update own episodes" ON cvrf_episodes
  FOR UPDATE USING (auth.uid() = user_id OR user_id IS NULL);

-- Decisions: Users can access decisions in their episodes
CREATE POLICY "Users can view own decisions" ON cvrf_decisions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM cvrf_episodes e
      WHERE e.id = episode_id AND (e.user_id = auth.uid() OR e.user_id IS NULL)
    )
  );

CREATE POLICY "Users can create own decisions" ON cvrf_decisions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM cvrf_episodes e
      WHERE e.id = episode_id AND (e.user_id = auth.uid() OR e.user_id IS NULL)
    )
  );

-- Beliefs: Users can only access their own beliefs
CREATE POLICY "Users can view own beliefs" ON cvrf_beliefs
  FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can upsert own beliefs" ON cvrf_beliefs
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can update own beliefs" ON cvrf_beliefs
  FOR UPDATE USING (auth.uid() = user_id OR user_id IS NULL);

-- Cycle History: Users can only access their own cycles
CREATE POLICY "Users can view own cycles" ON cvrf_cycle_history
  FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can create own cycles" ON cvrf_cycle_history
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- ============================================================================
-- SERVICE ROLE BYPASS
-- ============================================================================

CREATE POLICY "Service role full access to episodes" ON cvrf_episodes
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access to decisions" ON cvrf_decisions
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access to beliefs" ON cvrf_beliefs
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access to cycles" ON cvrf_cycle_history
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER update_beliefs_updated_at
  BEFORE UPDATE ON cvrf_beliefs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
