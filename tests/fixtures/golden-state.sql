-- Golden-state fixture for Frontier Alpha integration tests (US-007)
--
-- Idempotent seed for the dedicated test user
-- `dicoangelo+test@metaventionsai.com`. This SQL is the documented manual
-- fallback for `tests/integration/auth-helper.ts::seedGoldenState()` —
-- piping it through `psql` produces the same on-disk state. Keep the two
-- in sync; if you change the test user's data shape, update both.
--
-- Operator usage (manual screenshot/repro):
--   1. Have the test user's UUID:
--        select id from auth.users where email='dicoangelo+test@metaventionsai.com';
--   2. Set it as a psql variable:
--        psql ... -v test_user_id='THE-UUID-HERE' < tests/fixtures/golden-state.sql
--
-- The `auth-helper.ts` integration path uses supabase-js inserts and reads
-- this file only for the documentation contract: every entity below must
-- match exactly what `seedGoldenState()` writes via the JS client.
--
-- Idempotency: every block is delete-then-insert keyed on user_id so a
-- partial run from a prior session never leaks. Run twice, get the same
-- state.

-- ─── Resolve the user id once (psql variable) ──────────────────────────
\set test_user_email 'dicoangelo+test@metaventionsai.com'

-- The test user must already exist in auth.users — auth-helper.ts handles
-- provisioning via supabase.auth.admin.createUser. This fixture assumes
-- the user is present; it will silently no-op when they aren't (the
-- subselect resolves to NULL and the inserts trip RLS / FK).

-- ─── 1. Clear prior fixture state for this user ────────────────────────
DELETE FROM frontier_positions
  WHERE portfolio_id IN (
    SELECT id FROM frontier_portfolios
    WHERE user_id = (SELECT id FROM auth.users WHERE email = :'test_user_email')
  );

DELETE FROM frontier_portfolios
  WHERE user_id = (SELECT id FROM auth.users WHERE email = :'test_user_email');

DELETE FROM frontier_tax_events
  WHERE user_id = (SELECT id FROM auth.users WHERE email = :'test_user_email');

DELETE FROM frontier_risk_alerts
  WHERE user_id = (SELECT id FROM auth.users WHERE email = :'test_user_email');

-- ─── 2. Portfolio (1 row, $25K cash) ───────────────────────────────────
INSERT INTO frontier_portfolios (user_id, name, cash_balance, benchmark)
SELECT id, 'Main Portfolio', 25000, 'SPY'
FROM auth.users
WHERE email = :'test_user_email';

-- ─── 3. Five positions (NVDA / AAPL / MSFT / GOOGL / AMZN) ─────────────
WITH p AS (
  SELECT id FROM frontier_portfolios
  WHERE user_id = (SELECT id FROM auth.users WHERE email = :'test_user_email')
)
INSERT INTO frontier_positions (portfolio_id, symbol, shares, avg_cost)
SELECT p.id, sym, shares, avg_cost FROM p, (VALUES
  ('NVDA',  25, 480.50),
  ('AAPL',  50, 175.25),
  ('MSFT',  30, 378.10),
  ('GOOGL', 40, 140.75),
  ('AMZN',  35, 178.40)
) AS v(sym, shares, avg_cost);

-- ─── 4. Two realized lots (1 gain on NVDA, 1 loss on AAPL) ─────────────
INSERT INTO frontier_tax_events (
  user_id, tax_year, event_type, symbol, realized_gain,
  shares, sale_price, cost_basis, sale_date
)
SELECT
  u.id,
  EXTRACT(YEAR FROM CURRENT_DATE)::int,
  v.event_type,
  v.symbol,
  v.realized_gain,
  v.shares,
  v.sale_price,
  v.cost_basis,
  v.sale_date
FROM auth.users u, (VALUES
  ('realized_gain', 'NVDA',  1250.50,  5, 730.00, 480.50,
    DATE_TRUNC('year', CURRENT_DATE) + INTERVAL '14 days'),
  ('realized_loss', 'AAPL',  -425.75, 10, 132.70, 175.25,
    DATE_TRUNC('year', CURRENT_DATE) + INTERVAL '52 days')
) AS v(event_type, symbol, realized_gain, shares, sale_price, cost_basis, sale_date)
WHERE u.email = :'test_user_email';

-- ─── 5. Three risk-alert rules (high / medium / info) ──────────────────
WITH p AS (
  SELECT id FROM frontier_portfolios
  WHERE user_id = (SELECT id FROM auth.users WHERE email = :'test_user_email')
)
INSERT INTO frontier_risk_alerts (
  user_id, portfolio_id, alert_type, severity, title, message, metadata
)
SELECT
  (SELECT id FROM auth.users WHERE email = :'test_user_email'),
  p.id,
  v.alert_type,
  v.severity,
  v.title,
  v.message,
  v.metadata::jsonb
FROM p, (VALUES
  ('concentration', 'high',
    'NVDA concentration > 20%',
    'Top holding exceeds the configured 20% concentration ceiling.',
    '{"symbol":"NVDA","threshold":0.2}'),
  ('drawdown', 'medium',
    'Portfolio 7d drawdown > 5%',
    'Portfolio is down 6.2% over the last 7 trading days.',
    '{"drawdownPct":0.062}'),
  ('earnings_risk', 'info',
    'NVDA earnings in 5 days',
    'Next NVDA earnings call is scheduled for next week.',
    '{"symbol":"NVDA","daysUntil":5}')
) AS v(alert_type, severity, title, message, metadata);

-- ─── 6. Enterprise comp subscription (idempotent upsert) ───────────────
-- Sentinel `comp_test_user` IDs match the comp-customer pattern in
-- src/routes/billing.ts so webhooks and checkout refuse to clobber.
INSERT INTO frontier_subscriptions (
  user_id, plan, status,
  stripe_customer_id, stripe_subscription_id,
  current_period_end
)
SELECT
  id,
  'enterprise',
  'active',
  'comp_test_user',
  'comp_test_user_sub',
  '2099-12-31T23:59:59Z'::timestamptz
FROM auth.users
WHERE email = :'test_user_email'
ON CONFLICT (user_id) DO UPDATE
SET
  plan = EXCLUDED.plan,
  status = EXCLUDED.status,
  stripe_customer_id = EXCLUDED.stripe_customer_id,
  stripe_subscription_id = EXCLUDED.stripe_subscription_id,
  current_period_end = EXCLUDED.current_period_end;
