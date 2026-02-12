-- Frontier Alpha Tax Lot Tracking
-- Migration: 20260209_tax_lots
-- Created: 2026-02-09
-- Purpose: Track cost basis, holding periods, and tax events for portfolio positions

-- ============================================================================
-- TAX LOTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS frontier_tax_lots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol VARCHAR(10) NOT NULL,
  shares DECIMAL(18, 8) NOT NULL CHECK (shares > 0),
  cost_basis DECIMAL(18, 4) NOT NULL CHECK (cost_basis > 0),
  purchase_date TIMESTAMP WITH TIME ZONE NOT NULL,
  sold_date TIMESTAMP WITH TIME ZONE,
  is_short_term BOOLEAN NOT NULL GENERATED ALWAYS AS (
    sold_date IS NULL AND (NOW() - purchase_date) < INTERVAL '1 year'
    OR sold_date IS NOT NULL AND (sold_date - purchase_date) < INTERVAL '1 year'
  ) STORED,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for tax lot queries
CREATE INDEX IF NOT EXISTS idx_tax_lots_user_id ON frontier_tax_lots(user_id);
CREATE INDEX IF NOT EXISTS idx_tax_lots_symbol ON frontier_tax_lots(user_id, symbol);
CREATE INDEX IF NOT EXISTS idx_tax_lots_purchase_date ON frontier_tax_lots(purchase_date DESC);
CREATE INDEX IF NOT EXISTS idx_tax_lots_open ON frontier_tax_lots(user_id, symbol) WHERE sold_date IS NULL;

-- Updated_at trigger
CREATE TRIGGER update_tax_lots_updated_at
  BEFORE UPDATE ON frontier_tax_lots
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TAX EVENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS frontier_tax_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tax_year INTEGER NOT NULL CHECK (tax_year >= 2020 AND tax_year <= 2100),
  event_type VARCHAR(30) NOT NULL CHECK (event_type IN (
    'realized_gain', 'realized_loss', 'wash_sale', 'dividend', 'return_of_capital'
  )),
  symbol VARCHAR(10) NOT NULL,
  realized_gain DECIMAL(18, 4) NOT NULL,
  is_wash_sale BOOLEAN NOT NULL DEFAULT false,
  tax_lot_id UUID REFERENCES frontier_tax_lots(id) ON DELETE SET NULL,
  shares DECIMAL(18, 8),
  sale_price DECIMAL(18, 4),
  cost_basis DECIMAL(18, 4),
  sale_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for tax event queries
CREATE INDEX IF NOT EXISTS idx_tax_events_user_id ON frontier_tax_events(user_id);
CREATE INDEX IF NOT EXISTS idx_tax_events_year ON frontier_tax_events(user_id, tax_year);
CREATE INDEX IF NOT EXISTS idx_tax_events_symbol ON frontier_tax_events(user_id, symbol);
CREATE INDEX IF NOT EXISTS idx_tax_events_wash ON frontier_tax_events(user_id, tax_year) WHERE is_wash_sale = true;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE frontier_tax_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE frontier_tax_events ENABLE ROW LEVEL SECURITY;

-- Users can only see/modify their own tax lots
CREATE POLICY tax_lots_user_policy ON frontier_tax_lots
  FOR ALL USING (auth.uid() = user_id);

-- Users can only see/modify their own tax events
CREATE POLICY tax_events_user_policy ON frontier_tax_events
  FOR ALL USING (auth.uid() = user_id);
