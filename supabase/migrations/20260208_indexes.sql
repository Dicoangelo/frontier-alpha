-- Frontier Alpha Performance Indexes
-- Migration: 20260208_indexes
-- Created: 2026-02-08
--
-- Adds composite, partial, and covering indexes for common query patterns.
-- Each index includes an EXPLAIN comment describing the query it optimizes.

-- ============================================================================
-- CVRF INDEXES
-- ============================================================================

-- EXPLAIN: Active episode lookup — WHERE status = 'active' AND start_date < $1
-- Used by CVRF engine to find the current active episode for a user.
-- Partial index avoids bloating with completed/archived episodes.
CREATE INDEX IF NOT EXISTS idx_cvrf_episodes_status_start
  ON cvrf_episodes(status, start_date DESC)
  WHERE status = 'active';

-- EXPLAIN: Decision timeline for an episode — WHERE episode_id = $1 ORDER BY timestamp
-- Used to reconstruct the decision sequence during CVRF cycle evaluation.
-- Composite (episode_id, timestamp) lets Postgres do an index-only scan + sort.
CREATE INDEX IF NOT EXISTS idx_cvrf_decisions_episode_timestamp
  ON cvrf_decisions(episode_id, timestamp DESC);

-- EXPLAIN: Decision lookup by user and symbol — WHERE user_id = $1 AND symbol = $2
-- Used for per-symbol decision history in the CVRF dashboard.
CREATE INDEX IF NOT EXISTS idx_cvrf_decisions_user_symbol
  ON cvrf_decisions(user_id, symbol);

-- EXPLAIN: Cycle history per user sorted by time — WHERE user_id = $1 ORDER BY timestamp
-- Used to display the optimization history timeline and performance trends.
CREATE INDEX IF NOT EXISTS idx_cvrf_cycle_user_timestamp
  ON cvrf_cycle_history(user_id, timestamp DESC);

-- EXPLAIN: Latest cycle lookup — WHERE user_id = $1 ORDER BY cycle_number DESC LIMIT 1
-- Used to get the most recent cycle number when starting a new cycle.
CREATE INDEX IF NOT EXISTS idx_cvrf_cycle_user_number
  ON cvrf_cycle_history(user_id, cycle_number DESC);

-- ============================================================================
-- PORTFOLIO & POSITIONS INDEXES
-- ============================================================================

-- EXPLAIN: Portfolio list for a user — WHERE user_id = $1 ORDER BY created_at
-- The existing idx_portfolios_user_id covers the simple lookup.
-- This composite index adds created_at for sorted listing without a secondary sort.
CREATE INDEX IF NOT EXISTS idx_portfolios_user_created
  ON frontier_portfolios(user_id, created_at DESC);

-- EXPLAIN: All positions for a portfolio with symbol sorting — WHERE portfolio_id = $1 ORDER BY symbol
-- Used by portfolio value calculations and position display.
-- Covers the FK lookup + sort.
CREATE INDEX IF NOT EXISTS idx_positions_portfolio_symbol
  ON frontier_positions(portfolio_id, symbol);

-- EXPLAIN: Position value lookup — WHERE portfolio_id = $1
-- Covering index includes shares and avg_cost for index-only scans on
-- get_portfolio_value() calls, avoiding heap fetches.
CREATE INDEX IF NOT EXISTS idx_positions_portfolio_covering
  ON frontier_positions(portfolio_id)
  INCLUDE (symbol, shares, avg_cost);

-- ============================================================================
-- RISK ALERTS INDEXES
-- ============================================================================

-- EXPLAIN: Unacknowledged alerts by type — WHERE user_id = $1 AND acknowledged_at IS NULL AND alert_type = $2
-- Used by the alert dashboard to filter active alerts by type.
CREATE INDEX IF NOT EXISTS idx_alerts_user_type_active
  ON frontier_risk_alerts(user_id, alert_type, created_at DESC)
  WHERE acknowledged_at IS NULL;

-- ============================================================================
-- FACTOR EXPOSURES INDEXES
-- ============================================================================

-- EXPLAIN: Factor analysis for a portfolio — WHERE portfolio_id = $1 AND calculation_date = $2
-- Used by the factors page to load all exposures for a given date.
CREATE INDEX IF NOT EXISTS idx_factor_exposures_portfolio_date
  ON frontier_factor_exposures(portfolio_id, calculation_date DESC);

-- EXPLAIN: Non-expired factor exposures — WHERE portfolio_id = $1 AND expires_at > NOW()
-- Partial index filters out expired rows for active factor queries.
CREATE INDEX IF NOT EXISTS idx_factor_exposures_active
  ON frontier_factor_exposures(portfolio_id, factor_category)
  WHERE expires_at > NOW();

-- ============================================================================
-- EARNINGS INDEXES
-- ============================================================================

-- EXPLAIN: Upcoming earnings for portfolio symbols — WHERE symbol = ANY($1) AND status IN ('upcoming', 'confirmed') ORDER BY report_date
-- Used by the earnings calendar to show upcoming events for held symbols.
CREATE INDEX IF NOT EXISTS idx_earnings_symbol_upcoming
  ON frontier_earnings_events(symbol, report_date)
  WHERE status IN ('upcoming', 'confirmed');

-- EXPLAIN: User forecasts for a date range — WHERE user_id = $1 AND report_date BETWEEN $2 AND $3
-- Used by the earnings forecast dashboard.
CREATE INDEX IF NOT EXISTS idx_forecasts_user_date
  ON frontier_earnings_forecasts(user_id, report_date DESC);

-- ============================================================================
-- HISTORICAL PRICES INDEXES
-- ============================================================================

-- EXPLAIN: Price range query — WHERE symbol = $1 AND date BETWEEN $2 AND $3
-- The composite PK (symbol, date) already covers this.
-- This additional index adds adjusted_close for covering index-only scans
-- in return calculation queries.
CREATE INDEX IF NOT EXISTS idx_prices_symbol_date_covering
  ON frontier_historical_prices(symbol, date DESC)
  INCLUDE (adjusted_close, close, volume);

-- ============================================================================
-- PORTFOLIO SHARING INDEXES
-- ============================================================================

-- EXPLAIN: Active shares for a portfolio — WHERE portfolio_id = $1 AND (expires_at IS NULL OR expires_at > NOW())
-- Used by the sharing modal to list current shares.
CREATE INDEX IF NOT EXISTS idx_shares_portfolio_active
  ON frontier_portfolio_shares(portfolio_id)
  WHERE expires_at IS NULL OR expires_at > NOW();

-- ============================================================================
-- PUSH SUBSCRIPTIONS INDEXES
-- ============================================================================

-- EXPLAIN: Active subscriptions for a user — WHERE user_id = $1 ORDER BY last_used_at DESC
-- Used when sending push notifications to a user.
CREATE INDEX IF NOT EXISTS idx_push_subs_user_active
  ON push_subscriptions(user_id, last_used_at DESC);

-- ============================================================================
-- QUOTE CACHE INDEXES
-- ============================================================================

-- EXPLAIN: Batch quote lookup — WHERE symbol = ANY($1) AND cached_at > NOW() - interval '5 minutes'
-- Used by the edge function fallback and portfolio value calculations.
CREATE INDEX IF NOT EXISTS idx_quote_cache_fresh
  ON frontier_quote_cache(symbol, cached_at DESC);
