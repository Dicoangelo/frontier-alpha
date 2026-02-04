-- Frontier Alpha Production Database Schema
-- Migration: 001_initial_schema
-- Created: 2024-01-26

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For text search

-- ============================================================================
-- PORTFOLIOS
-- ============================================================================

CREATE TABLE IF NOT EXISTS frontier_portfolios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL DEFAULT 'Main Portfolio',
  cash_balance DECIMAL(18, 2) NOT NULL DEFAULT 0,
  benchmark VARCHAR(10) NOT NULL DEFAULT 'SPY',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT unique_portfolio_per_user UNIQUE (user_id, name)
);

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_portfolios_user_id ON frontier_portfolios(user_id);

-- ============================================================================
-- POSITIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS frontier_positions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  portfolio_id UUID NOT NULL REFERENCES frontier_portfolios(id) ON DELETE CASCADE,
  symbol VARCHAR(10) NOT NULL,
  shares DECIMAL(18, 8) NOT NULL CHECK (shares > 0),
  avg_cost DECIMAL(18, 4) NOT NULL CHECK (avg_cost > 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT unique_position_per_portfolio UNIQUE (portfolio_id, symbol)
);

-- Indexes for position queries
CREATE INDEX IF NOT EXISTS idx_positions_portfolio_id ON frontier_positions(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_positions_symbol ON frontier_positions(symbol);

-- ============================================================================
-- USER SETTINGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS frontier_user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name VARCHAR(100),
  risk_tolerance VARCHAR(20) NOT NULL DEFAULT 'moderate' CHECK (risk_tolerance IN ('conservative', 'moderate', 'aggressive')),
  notifications_enabled BOOLEAN NOT NULL DEFAULT true,
  email_alerts BOOLEAN NOT NULL DEFAULT true,
  max_position_pct DECIMAL(5, 2) NOT NULL DEFAULT 25.00 CHECK (max_position_pct BETWEEN 1 AND 100),
  stop_loss_pct DECIMAL(5, 2) NOT NULL DEFAULT 20.00 CHECK (stop_loss_pct BETWEEN 1 AND 100),
  take_profit_pct DECIMAL(5, 2) NOT NULL DEFAULT 50.00 CHECK (take_profit_pct BETWEEN 1 AND 500),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- RISK ALERTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS frontier_risk_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_id UUID REFERENCES frontier_portfolios(id) ON DELETE SET NULL,
  alert_type VARCHAR(30) NOT NULL CHECK (alert_type IN (
    'drawdown', 'volatility', 'concentration', 'correlation',
    'factor_drift', 'liquidity', 'earnings_risk', 'stop_loss',
    'take_profit', 'price_movement'
  )),
  severity VARCHAR(10) NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for alert queries
CREATE INDEX IF NOT EXISTS idx_alerts_user_id ON frontier_risk_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON frontier_risk_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON frontier_risk_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_unacknowledged ON frontier_risk_alerts(user_id, acknowledged_at) WHERE acknowledged_at IS NULL;

-- ============================================================================
-- QUOTE CACHE
-- ============================================================================

CREATE TABLE IF NOT EXISTS frontier_quote_cache (
  symbol VARCHAR(10) PRIMARY KEY,
  price DECIMAL(18, 4) NOT NULL,
  change DECIMAL(18, 4) NOT NULL DEFAULT 0,
  change_percent DECIMAL(10, 4) NOT NULL DEFAULT 0,
  volume BIGINT DEFAULT 0,
  market_cap BIGINT,
  pe_ratio DECIMAL(10, 2),
  high_52w DECIMAL(18, 4),
  low_52w DECIMAL(18, 4),
  cached_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for cache expiration checks
CREATE INDEX IF NOT EXISTS idx_quote_cache_cached_at ON frontier_quote_cache(cached_at);

-- ============================================================================
-- FACTOR EXPOSURES
-- ============================================================================

CREATE TABLE IF NOT EXISTS frontier_factor_exposures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  portfolio_id UUID NOT NULL REFERENCES frontier_portfolios(id) ON DELETE CASCADE,
  position_id UUID REFERENCES frontier_positions(id) ON DELETE SET NULL,
  symbol VARCHAR(10) NOT NULL,
  factor_name VARCHAR(50) NOT NULL,
  factor_category VARCHAR(20) NOT NULL CHECK (factor_category IN ('style', 'macro', 'sector', 'volatility', 'sentiment', 'quality')),
  exposure DECIMAL(10, 6) NOT NULL,
  t_stat DECIMAL(10, 4),
  confidence DECIMAL(5, 4) CHECK (confidence BETWEEN 0 AND 1),
  contribution DECIMAL(10, 6),
  calculation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '1 day'),

  CONSTRAINT unique_factor_per_position UNIQUE (portfolio_id, symbol, factor_name, calculation_date)
);

-- Indexes for factor queries
CREATE INDEX IF NOT EXISTS idx_factor_exposures_portfolio ON frontier_factor_exposures(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_factor_exposures_symbol ON frontier_factor_exposures(symbol);
CREATE INDEX IF NOT EXISTS idx_factor_exposures_expires ON frontier_factor_exposures(expires_at);

-- ============================================================================
-- EARNINGS EVENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS frontier_earnings_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  symbol VARCHAR(10) NOT NULL,
  report_date DATE NOT NULL,
  report_time VARCHAR(20) CHECK (report_time IN ('pre_market', 'post_market', 'during_market', 'unknown')),
  fiscal_quarter VARCHAR(10) NOT NULL,  -- e.g., "Q1 2024"
  estimated_eps DECIMAL(10, 4),
  actual_eps DECIMAL(10, 4),
  estimated_revenue DECIMAL(18, 2),
  actual_revenue DECIMAL(18, 2),
  status VARCHAR(20) NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'confirmed', 'reported')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT unique_earnings_event UNIQUE (symbol, report_date)
);

-- Indexes for earnings queries
CREATE INDEX IF NOT EXISTS idx_earnings_symbol ON frontier_earnings_events(symbol);
CREATE INDEX IF NOT EXISTS idx_earnings_date ON frontier_earnings_events(report_date);
CREATE INDEX IF NOT EXISTS idx_earnings_upcoming ON frontier_earnings_events(report_date, status) WHERE status IN ('upcoming', 'confirmed');

-- ============================================================================
-- EARNINGS FORECASTS (User-specific predictions)
-- ============================================================================

CREATE TABLE IF NOT EXISTS frontier_earnings_forecasts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol VARCHAR(10) NOT NULL,
  report_date DATE NOT NULL,
  expected_move DECIMAL(5, 4) NOT NULL,  -- As percentage (0.05 = 5%)
  expected_direction VARCHAR(10) NOT NULL CHECK (expected_direction IN ('up', 'down', 'neutral')),
  confidence DECIMAL(5, 4) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  historical_avg_move DECIMAL(5, 4),
  recommendation VARCHAR(10) NOT NULL CHECK (recommendation IN ('hold', 'reduce', 'hedge', 'add')),
  explanation TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days'),

  CONSTRAINT unique_forecast UNIQUE (user_id, symbol, report_date)
);

-- Indexes for forecast queries
CREATE INDEX IF NOT EXISTS idx_forecasts_user ON frontier_earnings_forecasts(user_id);
CREATE INDEX IF NOT EXISTS idx_forecasts_symbol ON frontier_earnings_forecasts(symbol);
CREATE INDEX IF NOT EXISTS idx_forecasts_expires ON frontier_earnings_forecasts(expires_at);

-- ============================================================================
-- EARNINGS HISTORY (Historical reactions for pattern analysis)
-- ============================================================================

CREATE TABLE IF NOT EXISTS frontier_earnings_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  symbol VARCHAR(10) NOT NULL,
  report_date DATE NOT NULL,
  fiscal_quarter VARCHAR(10) NOT NULL,
  price_before DECIMAL(18, 4) NOT NULL,
  price_after DECIMAL(18, 4) NOT NULL,
  price_change_post DECIMAL(10, 4) NOT NULL,  -- As percentage
  volume_ratio DECIMAL(10, 4),  -- Volume vs average
  actual_move DECIMAL(10, 4) NOT NULL,  -- Absolute move
  surprise_pct DECIMAL(10, 4),  -- EPS surprise
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT unique_history UNIQUE (symbol, report_date)
);

-- Indexes for history queries
CREATE INDEX IF NOT EXISTS idx_earnings_history_symbol ON frontier_earnings_history(symbol);
CREATE INDEX IF NOT EXISTS idx_earnings_history_date ON frontier_earnings_history(report_date DESC);

-- ============================================================================
-- HISTORICAL PRICES (Time series data for analysis)
-- ============================================================================

CREATE TABLE IF NOT EXISTS frontier_historical_prices (
  symbol VARCHAR(10) NOT NULL,
  date DATE NOT NULL,
  open DECIMAL(18, 4) NOT NULL,
  high DECIMAL(18, 4) NOT NULL,
  low DECIMAL(18, 4) NOT NULL,
  close DECIMAL(18, 4) NOT NULL,
  adjusted_close DECIMAL(18, 4) NOT NULL,
  volume BIGINT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  PRIMARY KEY (symbol, date)
);

-- Index for date range queries
CREATE INDEX IF NOT EXISTS idx_prices_date ON frontier_historical_prices(date DESC);

-- ============================================================================
-- KEN FRENCH FACTOR RETURNS
-- ============================================================================

CREATE TABLE IF NOT EXISTS frontier_factor_returns (
  date DATE NOT NULL,
  factor_name VARCHAR(20) NOT NULL,  -- Mkt-RF, SMB, HML, RMW, CMA, Mom
  return_value DECIMAL(10, 6) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  PRIMARY KEY (date, factor_name)
);

-- Index for date range queries
CREATE INDEX IF NOT EXISTS idx_factor_returns_date ON frontier_factor_returns(date DESC);

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS on all user-scoped tables
ALTER TABLE frontier_portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE frontier_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE frontier_user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE frontier_risk_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE frontier_factor_exposures ENABLE ROW LEVEL SECURITY;
ALTER TABLE frontier_earnings_forecasts ENABLE ROW LEVEL SECURITY;

-- Portfolios: Users can only access their own portfolios
CREATE POLICY "Users can view own portfolios" ON frontier_portfolios
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own portfolios" ON frontier_portfolios
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own portfolios" ON frontier_portfolios
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own portfolios" ON frontier_portfolios
  FOR DELETE USING (auth.uid() = user_id);

-- Positions: Users can only access positions in their portfolios
CREATE POLICY "Users can view own positions" ON frontier_positions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM frontier_portfolios p
      WHERE p.id = portfolio_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create positions in own portfolios" ON frontier_positions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM frontier_portfolios p
      WHERE p.id = portfolio_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update positions in own portfolios" ON frontier_positions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM frontier_portfolios p
      WHERE p.id = portfolio_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete positions in own portfolios" ON frontier_positions
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM frontier_portfolios p
      WHERE p.id = portfolio_id AND p.user_id = auth.uid()
    )
  );

-- User Settings: Users can only access their own settings
CREATE POLICY "Users can view own settings" ON frontier_user_settings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own settings" ON frontier_user_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings" ON frontier_user_settings
  FOR UPDATE USING (auth.uid() = user_id);

-- Risk Alerts: Users can only access their own alerts
CREATE POLICY "Users can view own alerts" ON frontier_risk_alerts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own alerts" ON frontier_risk_alerts
  FOR UPDATE USING (auth.uid() = user_id);

-- Factor Exposures: Users can only access factors for their portfolios
CREATE POLICY "Users can view own factor exposures" ON frontier_factor_exposures
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM frontier_portfolios p
      WHERE p.id = portfolio_id AND p.user_id = auth.uid()
    )
  );

-- Earnings Forecasts: Users can only access their own forecasts
CREATE POLICY "Users can view own forecasts" ON frontier_earnings_forecasts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own forecasts" ON frontier_earnings_forecasts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- SERVICE ROLE BYPASS (for server-side operations)
-- ============================================================================

-- Allow service role to bypass RLS for administrative operations
CREATE POLICY "Service role full access to portfolios" ON frontier_portfolios
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access to positions" ON frontier_positions
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access to settings" ON frontier_user_settings
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access to alerts" ON frontier_risk_alerts
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access to factor exposures" ON frontier_factor_exposures
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access to forecasts" ON frontier_earnings_forecasts
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_portfolios_updated_at
  BEFORE UPDATE ON frontier_portfolios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_positions_updated_at
  BEFORE UPDATE ON frontier_positions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_settings_updated_at
  BEFORE UPDATE ON frontier_user_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_earnings_events_updated_at
  BEFORE UPDATE ON frontier_earnings_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- FUNCTIONS FOR COMMON OPERATIONS
-- ============================================================================

-- Calculate portfolio total value
CREATE OR REPLACE FUNCTION get_portfolio_value(p_portfolio_id UUID)
RETURNS DECIMAL AS $$
DECLARE
  total_value DECIMAL := 0;
  cash DECIMAL := 0;
BEGIN
  -- Get cash balance
  SELECT cash_balance INTO cash
  FROM frontier_portfolios
  WHERE id = p_portfolio_id;

  -- Calculate position values (requires current prices)
  SELECT COALESCE(SUM(
    pos.shares * COALESCE(
      (SELECT price FROM frontier_quote_cache WHERE symbol = pos.symbol),
      pos.avg_cost
    )
  ), 0) INTO total_value
  FROM frontier_positions pos
  WHERE pos.portfolio_id = p_portfolio_id;

  RETURN total_value + COALESCE(cash, 0);
END;
$$ LANGUAGE plpgsql STABLE;

-- Cleanup expired cache entries
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
END;
$$ LANGUAGE plpgsql;
