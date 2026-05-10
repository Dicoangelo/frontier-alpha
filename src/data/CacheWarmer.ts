/**
 * CacheWarmer — proactive prefetch for top-held symbols (US-006, P5).
 *
 * Hits `frontier_positions` joined through `frontier_portfolios.user_id` to
 * find the most-held symbols across all users, then pre-fetches their
 * historical prices into `marketDataCache`. The warmer is called:
 *   - On server boot (non-blocking) from `src/index.ts`
 *   - On hourly Vercel cron via `/api/v1/cron/warm-cache`
 *   - On boot for the dev account's portfolio symbols (solo-user mode)
 *
 * Per-process bottleneck:
 *   - We hand-roll a small p-queue-style limiter (no `p-queue` dep) capped
 *     at 4 concurrent Polygon calls. The same limiter wraps every
 *     warmTopHeldSymbols() call so background warming doesn't starve
 *     synchronous user requests.
 *
 * Failure mode:
 *   - Per-symbol errors are caught and logged; the run continues.
 *   - Boot warming is fire-and-forget so a slow Polygon does not gate
 *     server startup.
 */

import { supabaseAdmin } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { MarketDataProvider } from './MarketDataProvider.js';

/**
 * Dico's dev account user_id. Used by `warmDevUserPortfolio()` so a fresh
 * cold-start always populates HIS dashboard symbols even when the global
 * top-held query returns nothing (the most likely state in solo-user mode).
 */
export const DEV_USER_ID = '3ea07211-a7a6-43cd-ae10-0dc112d03ce5';

/**
 * Max concurrent upstream Polygon calls in flight. Polygon free tier is
 * 5 req/min — 4 leaves a 1-req cushion for synchronous user traffic. Any
 * higher and a burst from the warmer can starve a paying user.
 */
const MAX_CONCURRENT_UPSTREAM = 4;

/**
 * Hand-rolled FIFO concurrency limiter. We avoid the `p-queue` dependency
 * so this single file owns the bottleneck and tests can reason about it
 * without mocking.
 */
class ConcurrencyLimiter {
  private active = 0;
  private queue: Array<() => void> = [];

  constructor(private readonly max: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active += 1;
    try {
      return await task();
    } finally {
      this.active -= 1;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

/** Process-wide bottleneck shared by every warmer invocation. */
const upstreamLimiter = new ConcurrencyLimiter(MAX_CONCURRENT_UPSTREAM);

interface PositionRow {
  symbol: string;
}

interface PortfolioRow {
  id: string;
  user_id: string;
}

/**
 * Resolve the top N most-held symbols across ALL users, ordered by
 * holding count desc. We tally portfolios per symbol (not shares) so a
 * single whale doesn't dominate the warm list — this approximates "which
 * symbols are most popular across the user base."
 */
async function getTopHeldSymbols(limit: number): Promise<string[]> {
  if (!process.env.SUPABASE_SERVICE_KEY) {
    return [];
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('frontier_positions')
      .select('symbol');

    if (error) {
      logger.warn({ err: error }, 'CacheWarmer: failed to load positions');
      return [];
    }

    const counts = new Map<string, number>();
    for (const row of (data ?? []) as PositionRow[]) {
      const sym = row.symbol?.toUpperCase();
      if (!sym) continue;
      counts.set(sym, (counts.get(sym) ?? 0) + 1);
    }

    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([sym]) => sym);
  } catch (err) {
    logger.warn({ err }, 'CacheWarmer: getTopHeldSymbols threw');
    return [];
  }
}

/**
 * Resolve the dev account's currently-held symbols. Used as a solo-user
 * mode optimization: even when the global top-held query is empty (e.g.
 * test environment, brand new users), we still pre-warm Dico's dashboard.
 */
async function getDevUserSymbols(): Promise<string[]> {
  if (!process.env.SUPABASE_SERVICE_KEY) {
    return [];
  }

  try {
    const { data: portfolios, error: portErr } = await supabaseAdmin
      .from('frontier_portfolios')
      .select('id, user_id')
      .eq('user_id', DEV_USER_ID);

    if (portErr || !portfolios || portfolios.length === 0) {
      if (portErr) {
        logger.warn({ err: portErr }, 'CacheWarmer: dev portfolio lookup failed');
      }
      return [];
    }

    const portfolioIds = (portfolios as PortfolioRow[]).map((p) => p.id);

    const { data: positions, error: posErr } = await supabaseAdmin
      .from('frontier_positions')
      .select('symbol')
      .in('portfolio_id', portfolioIds);

    if (posErr) {
      logger.warn({ err: posErr }, 'CacheWarmer: dev positions lookup failed');
      return [];
    }

    const symbols = new Set<string>();
    for (const row of (positions ?? []) as PositionRow[]) {
      const sym = row.symbol?.toUpperCase();
      if (sym) symbols.add(sym);
    }
    return [...symbols];
  } catch (err) {
    logger.warn({ err }, 'CacheWarmer: getDevUserSymbols threw');
    return [];
  }
}

export interface WarmResult {
  attempted: number;
  succeeded: number;
  failed: number;
  symbols: string[];
}

/**
 * Pre-fetch historical prices for the given symbols through the bottleneck.
 * Each call goes via `MarketDataProvider.getHistoricalPrices`, which in
 * turn flows through the CompositeCache so we automatically populate both
 * memory and Supabase layers.
 *
 * 300 days matches the depth that `/portfolio/factors/:symbols` and
 * `/portfolio/factors/history/:symbols` request. Aligning the warmer to
 * the same `days` value ensures the Supabase cache check
 * (`rows.length >= days * coverage`) passes for both endpoints — a
 * mismatch was causing the FactorDeltas card to fall back to its empty
 * state in production because the new history endpoint always missed
 * cache and got rate-limited by Polygon's free tier (2026-05-09
 * incident, see CHANGELOG v1.3.6).
 */
async function warmSymbols(
  provider: MarketDataProvider,
  symbols: string[],
  days = 300,
): Promise<WarmResult> {
  let succeeded = 0;
  let failed = 0;

  await Promise.all(
    symbols.map((symbol) =>
      upstreamLimiter.run(async () => {
        try {
          const prices = await provider.getHistoricalPrices(symbol, days);
          if (prices.length > 0) {
            succeeded += 1;
          } else {
            failed += 1;
          }
        } catch (err) {
          failed += 1;
          logger.warn({ err, symbol }, 'CacheWarmer: per-symbol error');
        }
      }),
    ),
  );

  return {
    attempted: symbols.length,
    succeeded,
    failed,
    symbols,
  };
}

/**
 * Public entry: warm the top-N most-held symbols across all users, plus
 * the dev account's portfolio symbols (solo-user mode optimization). The
 * two sets are union'd so we don't pay the upstream cost twice for the
 * overlap.
 */
export async function warmTopHeldSymbols(
  provider: MarketDataProvider,
  limit = 20,
): Promise<WarmResult> {
  logger.info({ limit }, 'CacheWarmer: starting warm');

  const [topHeld, devSymbols] = await Promise.all([
    getTopHeldSymbols(limit),
    getDevUserSymbols(),
  ]);

  const merged = Array.from(new Set([...topHeld, ...devSymbols]));
  if (merged.length === 0) {
    logger.info('CacheWarmer: no symbols to warm (empty positions table)');
    return { attempted: 0, succeeded: 0, failed: 0, symbols: [] };
  }

  const result = await warmSymbols(provider, merged);
  logger.info(
    {
      attempted: result.attempted,
      succeeded: result.succeeded,
      failed: result.failed,
      topHeldCount: topHeld.length,
      devSymbolsCount: devSymbols.length,
    },
    'CacheWarmer: complete',
  );
  return result;
}

/**
 * Test-only export so unit tests can inspect the limiter without exposing
 * it as part of the production API.
 */
export const __testHooks = {
  ConcurrencyLimiter,
  MAX_CONCURRENT_UPSTREAM,
  upstreamLimiter,
};
