/**
 * Integration auth helper (US-007).
 *
 * Reusable test infrastructure shared by:
 *   - `tests/integration/protected-routes.test.ts` (CI smoke tests)
 *   - `src/routes/synthetic-monitor.ts` (production cron-driven smoke)
 *   - Manual support repro / sales screenshot seeders
 *
 * Pattern (P2): one canonical golden-state fixture, one canonical test user,
 * one canonical session-mint flow. Tests + monitor + screenshots all key off
 * the same record so a regression that breaks any of them shows up everywhere.
 *
 * The dedicated test user is `dicoangelo+test@metaventionsai.com` — distinct
 * from `dicoangelo+dev@metaventionsai.com` (manual walkthroughs) so seeded
 * fixture data never collides with the operator's hand-curated dev account.
 *
 * Module is intentionally side-effect free (no top-level Supabase client
 * construction) so importing it does not throw when env is incomplete; the
 * Supabase admin client is lazily built per call.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// ─── Constants ───────────────────────────────────────────────────────────────

export const TEST_USER_EMAIL = 'dicoangelo+test@metaventionsai.com';
export const TEST_USER_PASSWORD = 'frontier-alpha-test-2026!';

/** Stripe sentinel IDs that protect the comp subscription from webhook clobber. */
export const TEST_COMP_CUSTOMER_ID = 'comp_test_user';
export const TEST_COMP_SUBSCRIPTION_ID = 'comp_test_user_sub';

/** Holdings the golden state fixture seeds — top mega-cap names with realistic prices. */
export const GOLDEN_POSITIONS: ReadonlyArray<{ symbol: string; shares: number; avgCost: number }> = [
  { symbol: 'NVDA', shares: 25, avgCost: 480.5 },
  { symbol: 'AAPL', shares: 50, avgCost: 175.25 },
  { symbol: 'MSFT', shares: 30, avgCost: 378.1 },
  { symbol: 'GOOGL', shares: 40, avgCost: 140.75 },
  { symbol: 'AMZN', shares: 35, avgCost: 178.4 },
];

export const GOLDEN_CASH_BALANCE = 25000;

/** Three alert rules the fixture seeds — one per severity tier. */
export const GOLDEN_ALERT_COUNT = 3;

/** Two realized lots seeded into frontier_tax_events as 'realized_gain' / 'realized_loss'. */
export const GOLDEN_REALIZED_LOT_COUNT = 2;

// ─── Supabase admin (lazy) ───────────────────────────────────────────────────

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) {
    throw new Error(
      `[auth-helper] Missing required env var: ${name}. ` +
        `Integration tests require SUPABASE_URL + SUPABASE_SERVICE_KEY ` +
        `and (for synthetic monitor) CRON_SECRET. ` +
        `Run \`vercel env pull .env\` or set them inline.`,
    );
  }
  return v;
}

function getAdmin(): SupabaseClient {
  const url = requireEnv('SUPABASE_URL');
  const key = requireEnv('SUPABASE_SERVICE_KEY');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ─── User provisioning ───────────────────────────────────────────────────────

export interface TestSession {
  /** Auth user id (UUID). */
  userId: string;
  /** Email of the test user. */
  email: string;
  /** Bearer JWT, valid for ~1h, signed by Supabase. */
  accessToken: string;
  /** Long-lived refresh token (issued by signInWithPassword). */
  refreshToken: string;
}

/**
 * Create-or-fetch the dedicated integration test user, then sign in with
 * password to mint a fresh JWT. Idempotent: subsequent calls return a new
 * JWT for the same user.
 *
 * Implementation:
 *   1. Try `auth.admin.createUser` — succeeds first time, fails with
 *      "already registered" on every subsequent call.
 *   2. If exists, look up by email and reset the password (so the second
 *      call still works after manual password rotations).
 *   3. Sign in with password against the public auth endpoint to get a JWT
 *      that the auth middleware will accept (service-role keys are NOT
 *      accepted by `authMiddleware` — it requires a real user JWT).
 */
export async function mintTestSession(): Promise<TestSession> {
  const admin = getAdmin();

  // 1. Provision the user (idempotent: tolerate "already registered").
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
    email_confirm: true,
    user_metadata: {
      full_name: 'Integration Test User',
      role: 'integration_test',
    },
  });

  let userId: string;
  if (createErr) {
    if (!/already registered|already been registered|email_exists/i.test(createErr.message)) {
      throw new Error(`[auth-helper] createUser failed: ${createErr.message}`);
    }
    // Lookup existing user; reset password so signIn is deterministic.
    const list = await admin.auth.admin.listUsers();
    const existing = list.data.users.find((u) => u.email === TEST_USER_EMAIL);
    if (!existing) {
      throw new Error(
        `[auth-helper] User ${TEST_USER_EMAIL} reported as existing but not found in listUsers`,
      );
    }
    userId = existing.id;
    await admin.auth.admin.updateUserById(userId, {
      password: TEST_USER_PASSWORD,
      email_confirm: true,
    });
  } else {
    userId = created.user.id;
  }

  // 2. Sign in to mint a real JWT (service-role keys can't authenticate as a user).
  const url = requireEnv('SUPABASE_URL');
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!anonKey) {
    throw new Error(
      '[auth-helper] SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY) is required to mint a user JWT',
    );
  }
  const userClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: signIn, error: signInErr } = await userClient.auth.signInWithPassword({
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
  });
  if (signInErr || !signIn.session) {
    throw new Error(
      `[auth-helper] signInWithPassword failed: ${signInErr?.message ?? 'no session returned'}`,
    );
  }

  return {
    userId,
    email: TEST_USER_EMAIL,
    accessToken: signIn.session.access_token,
    refreshToken: signIn.session.refresh_token,
  };
}

// ─── Golden-state fixture ────────────────────────────────────────────────────

/**
 * Path to the canonical SQL fixture. Same file is used by:
 *   - This helper's seedGoldenState() (via supabase-js)
 *   - Manual psql piping (`psql ... < tests/fixtures/golden-state.sql`)
 *   - Sales-screenshot pipeline (run via supabase CLI exec)
 */
export function goldenStateSqlPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', 'fixtures', 'golden-state.sql');
}

/**
 * Read the golden-state SQL fixture. Splits the file into individual
 * statements so we can run each through PostgREST `rpc('exec', ...)`-style
 * fallbacks if needed; for now the seeder uses native supabase-js inserts
 * and the .sql file is the documented manual fallback.
 */
export function readGoldenStateSql(): string {
  return readFileSync(goldenStateSqlPath(), 'utf8');
}

/**
 * Idempotent seed of the golden-state fixture for the test user.
 *
 * Performs delete-then-insert for every fixture table so a partial run from
 * a prior session never leaks. Uses supabase-js (not raw SQL) so it works
 * against both local and remote Supabase without requiring `psql`.
 *
 * Tables touched (all keyed on the test user's userId):
 *   - frontier_portfolios            (1 row, $25K cash)
 *   - frontier_positions             (5 rows: NVDA/AAPL/MSFT/GOOGL/AMZN)
 *   - frontier_tax_events            (2 rows: 1 realized gain, 1 realized loss)
 *   - frontier_risk_alerts           (3 rows: critical/medium/info)
 *   - frontier_subscriptions         (1 row: enterprise comp)
 */
export async function seedGoldenState(userId?: string): Promise<{ userId: string; portfolioId: string }> {
  const admin = getAdmin();
  const id = userId ?? (await mintTestSession()).userId;

  // ── 0. Wipe prior fixture rows for this user ──────────────────────────
  await clearGoldenState(id);

  // ── 1. Portfolio ──────────────────────────────────────────────────────
  const { data: portfolio, error: portfolioErr } = await admin
    .from('frontier_portfolios')
    .insert({
      user_id: id,
      name: 'Main Portfolio',
      cash_balance: GOLDEN_CASH_BALANCE,
      benchmark: 'SPY',
    })
    .select('id')
    .single();
  if (portfolioErr || !portfolio) {
    throw new Error(`[auth-helper] portfolio insert failed: ${portfolioErr?.message ?? 'no row'}`);
  }
  const portfolioId = (portfolio as { id: string }).id;

  // ── 2. Positions ──────────────────────────────────────────────────────
  const positionRows = GOLDEN_POSITIONS.map((p) => ({
    portfolio_id: portfolioId,
    symbol: p.symbol,
    shares: p.shares,
    avg_cost: p.avgCost,
  }));
  const { error: posErr } = await admin.from('frontier_positions').insert(positionRows);
  if (posErr) {
    throw new Error(`[auth-helper] positions insert failed: ${posErr.message}`);
  }

  // ── 3. Realized lots → frontier_tax_events ────────────────────────────
  // Two events: one realized_gain on NVDA, one realized_loss on AAPL.
  const taxYear = new Date().getUTCFullYear();
  const { error: taxErr } = await admin.from('frontier_tax_events').insert([
    {
      user_id: id,
      tax_year: taxYear,
      event_type: 'realized_gain',
      symbol: 'NVDA',
      realized_gain: 1250.5,
      shares: 5,
      sale_price: 730,
      cost_basis: 480.5,
      sale_date: new Date(Date.UTC(taxYear, 0, 15)).toISOString(),
    },
    {
      user_id: id,
      tax_year: taxYear,
      event_type: 'realized_loss',
      symbol: 'AAPL',
      realized_gain: -425.75,
      shares: 10,
      sale_price: 132.7,
      cost_basis: 175.25,
      sale_date: new Date(Date.UTC(taxYear, 1, 22)).toISOString(),
    },
  ]);
  if (taxErr) {
    throw new Error(`[auth-helper] tax events insert failed: ${taxErr.message}`);
  }

  // ── 4. Risk alerts (3 rules) ──────────────────────────────────────────
  const { error: alertsErr } = await admin.from('frontier_risk_alerts').insert([
    {
      user_id: id,
      portfolio_id: portfolioId,
      alert_type: 'concentration',
      severity: 'high',
      title: 'NVDA concentration > 20%',
      message: 'Top holding exceeds the configured 20% concentration ceiling.',
      metadata: { symbol: 'NVDA', threshold: 0.2 },
    },
    {
      user_id: id,
      portfolio_id: portfolioId,
      alert_type: 'drawdown',
      severity: 'medium',
      title: 'Portfolio 7d drawdown > 5%',
      message: 'Portfolio is down 6.2% over the last 7 trading days.',
      metadata: { drawdownPct: 0.062 },
    },
    {
      user_id: id,
      portfolio_id: portfolioId,
      alert_type: 'earnings_risk',
      severity: 'info',
      title: 'NVDA earnings in 5 days',
      message: 'Next NVDA earnings call is scheduled for next week.',
      metadata: { symbol: 'NVDA', daysUntil: 5 },
    },
  ]);
  if (alertsErr) {
    throw new Error(`[auth-helper] alerts insert failed: ${alertsErr.message}`);
  }

  // ── 5. Subscription (enterprise comp) ─────────────────────────────────
  // Upsert because the auth.users insert trigger may have already created
  // a free row when the user was provisioned.
  const { error: subErr } = await admin
    .from('frontier_subscriptions')
    .upsert(
      {
        user_id: id,
        plan: 'enterprise',
        status: 'active',
        stripe_customer_id: TEST_COMP_CUSTOMER_ID,
        stripe_subscription_id: TEST_COMP_SUBSCRIPTION_ID,
        current_period_end: '2099-12-31T23:59:59Z',
      },
      { onConflict: 'user_id' },
    );
  if (subErr) {
    throw new Error(`[auth-helper] subscription upsert failed: ${subErr.message}`);
  }

  return { userId: id, portfolioId };
}

/**
 * Wipe every fixture table for the given user. Safe to call before AND
 * after the suite. `frontier_subscriptions` is downgraded to free rather
 * than deleted, so the auth.users → free trigger contract is preserved.
 */
export async function clearGoldenState(userId?: string): Promise<void> {
  const admin = getAdmin();

  let id = userId;
  if (!id) {
    const list = await admin.auth.admin.listUsers();
    const existing = list.data.users.find((u) => u.email === TEST_USER_EMAIL);
    if (!existing) return; // nothing to clear
    id = existing.id;
  }

  // Look up the portfolio first so we can cascade its positions even if
  // the FK on portfolios doesn't fire (RLS is bypassed by service role).
  const { data: portfolios } = await admin
    .from('frontier_portfolios')
    .select('id')
    .eq('user_id', id);
  const portfolioIds = ((portfolios as { id: string }[] | null) ?? []).map((p) => p.id);

  if (portfolioIds.length > 0) {
    await admin.from('frontier_positions').delete().in('portfolio_id', portfolioIds);
  }
  await admin.from('frontier_portfolios').delete().eq('user_id', id);
  await admin.from('frontier_tax_events').delete().eq('user_id', id);
  await admin.from('frontier_risk_alerts').delete().eq('user_id', id);

  // Reset subscription to free rather than deleting (auth trigger writes a
  // 'free' row on user creation, so deleting would re-fire constraints).
  await admin
    .from('frontier_subscriptions')
    .upsert(
      {
        user_id: id,
        plan: 'free',
        status: 'active',
        stripe_customer_id: null,
        stripe_subscription_id: null,
        current_period_end: null,
      },
      { onConflict: 'user_id' },
    );
}

// ─── Fetch helper ────────────────────────────────────────────────────────────

export interface FetchOptions {
  baseUrl?: string;
  accessToken: string;
  signal?: AbortSignal;
}

/**
 * Resolve the API base URL: env override → default localhost.
 * The synthetic monitor passes `baseUrl: 'https://frontier-alpha.metaventionsai.com'`;
 * smoke tests default to localhost dev server.
 */
export function resolveBaseUrl(override?: string): string {
  return (
    override ??
    process.env.INTEGRATION_BASE_URL ??
    process.env.TEST_API_URL ??
    'http://localhost:3000'
  );
}

/**
 * Authenticated fetch wrapper. Adds Bearer header, JSON content-type,
 * and a 10s default timeout. Returns the raw Response so each test
 * can inspect status, headers, and body separately.
 */
export async function authedFetch(
  pathname: string,
  opts: FetchOptions,
): Promise<{ response: Response; latencyMs: number }> {
  const baseUrl = resolveBaseUrl(opts.baseUrl);
  const url = pathname.startsWith('http') ? pathname : `${baseUrl.replace(/\/$/, '')}${pathname}`;
  const start = Date.now();
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      'Content-Type': 'application/json',
      'X-Integration-Test': 'frontier-alpha-us-007',
    },
    signal: opts.signal,
  });
  return { response, latencyMs: Date.now() - start };
}
