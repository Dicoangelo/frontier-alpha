-- Frontier Alpha — Internal Paper-Trading Broker
-- Migration: 20260508_paper_trading
-- Created: 2026-05-08
-- Purpose: Persist accounts, orders, and positions for the SimulatedBroker
--          (used when ALPACA_API_KEY is not configured — Canadian users, MVP demo).
--          All tables are RLS-gated against auth.uid().

-- ============================================================================
-- PAPER ACCOUNTS — one row per user, lazy-created on first trade
-- ============================================================================

CREATE TABLE IF NOT EXISTS paper_accounts (
  user_id        UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  cash_usd       NUMERIC(18, 2) NOT NULL DEFAULT 100000,
  starting_cash  NUMERIC(18, 2) NOT NULL DEFAULT 100000,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- PAPER ORDERS — append-only history of submitted orders
-- ============================================================================

CREATE TABLE IF NOT EXISTS paper_orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol           TEXT NOT NULL,
  side             TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  qty              NUMERIC(18, 6) NOT NULL,
  type             TEXT NOT NULL CHECK (type IN ('market', 'limit', 'stop', 'stop_limit')),
  limit_price      NUMERIC(18, 4),
  stop_price       NUMERIC(18, 4),
  time_in_force    TEXT DEFAULT 'day',
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'filled', 'partially_filled', 'canceled', 'rejected', 'expired')),
  filled_qty       NUMERIC(18, 6) DEFAULT 0,
  filled_avg_price NUMERIC(18, 4),
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  filled_at        TIMESTAMPTZ,
  canceled_at      TIMESTAMPTZ,
  reject_reason    TEXT,
  client_order_id  TEXT
);

CREATE INDEX IF NOT EXISTS paper_orders_user_status_idx
  ON paper_orders (user_id, status, submitted_at DESC);

CREATE INDEX IF NOT EXISTS paper_orders_user_symbol_idx
  ON paper_orders (user_id, symbol, submitted_at DESC);

-- ============================================================================
-- PAPER POSITIONS — current open positions, upserted on fills
-- ============================================================================

CREATE TABLE IF NOT EXISTS paper_positions (
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol           TEXT NOT NULL,
  qty              NUMERIC(18, 6) NOT NULL,
  avg_entry_price  NUMERIC(18, 4) NOT NULL,
  cost_basis       NUMERIC(18, 2) NOT NULL,
  opened_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, symbol)
);

-- ============================================================================
-- ROW LEVEL SECURITY
-- All client-facing reads must use auth.uid(); service-role bypass is reserved
-- for the SimulatedBroker server itself (which scopes by user_id explicitly).
-- ============================================================================

ALTER TABLE paper_accounts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_orders    ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_positions ENABLE ROW LEVEL SECURITY;

-- paper_accounts ------------------------------------------------------------
-- Note: CREATE POLICY does not support IF NOT EXISTS in stable Postgres.
-- Drop-then-create keeps this migration safely re-runnable.

DROP POLICY IF EXISTS "users can read own paper account"  ON paper_accounts;
DROP POLICY IF EXISTS "users can write own paper account" ON paper_accounts;

CREATE POLICY "users can read own paper account"
  ON paper_accounts
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users can write own paper account"
  ON paper_accounts
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- paper_orders --------------------------------------------------------------

DROP POLICY IF EXISTS "users can read own paper orders"   ON paper_orders;
DROP POLICY IF EXISTS "users can insert own paper orders" ON paper_orders;
DROP POLICY IF EXISTS "users can update own paper orders" ON paper_orders;

CREATE POLICY "users can read own paper orders"
  ON paper_orders
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users can insert own paper orders"
  ON paper_orders
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users can update own paper orders"
  ON paper_orders
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- paper_positions -----------------------------------------------------------

DROP POLICY IF EXISTS "users can read own paper positions"  ON paper_positions;
DROP POLICY IF EXISTS "users can write own paper positions" ON paper_positions;

CREATE POLICY "users can read own paper positions"
  ON paper_positions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users can write own paper positions"
  ON paper_positions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
