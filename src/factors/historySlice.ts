/**
 * As-of price slicer for the factor history endpoint
 * (`GET /api/v1/portfolio/factors/history/:symbols`).
 *
 * The factor engine computes every price-driven exposure (momentum, beta,
 * volatility, low-vol, idiosyncratic vol) from trailing windows that read
 * off the END of each Price[] series. So a "snapshot as of N days ago" is a
 * pure transform: take the same series and chop the last N entries off.
 *
 * That sidesteps the obvious alternative — a `frontier_factor_snapshots`
 * table written by a daily cron — for the v1 of factor deltas. The price
 * series is already the source of truth; deriving the prior snapshot from
 * it is stateless, retroactive, and works for any user/portfolio without
 * waiting for the snapshot table to accumulate history.
 *
 * Caveats encoded by the function shape:
 *   - Macro and fundamental data are NOT sliced. Those are fetched live by
 *     `FactorEngine.calculateExposures` and reflect the latest reads only.
 *     For a 1d / 5d window that's an acceptable simplification — the bulk
 *     of day-to-day exposure motion is price-driven anyway.
 *   - SPY (the market benchmark for beta) MUST be sliced symmetrically with
 *     the symbol prices, otherwise beta vs. spot SPY would smear the as-of
 *     read. The benchmark key 'SPY' is included in the slice when present.
 */

import type { Price } from '../types/index.js';

/** Maximum supported lookback. Matches FactorEngine's 252-day momentum need
 *  plus the 21-day skip buffer plus headroom for the as-of slice. The route
 *  layer requests `BASE_HISTORY_DAYS + window` days from the data provider. */
export const BASE_HISTORY_DAYS = 300;

export type HistoryWindow = '1d' | '5d';

export const SUPPORTED_WINDOWS: readonly HistoryWindow[] = ['1d', '5d'];

export function windowToDays(window: HistoryWindow): number {
  return window === '5d' ? 5 : 1;
}

/**
 * Truncate every Price[] in the map by `daysBack` entries from the end. The
 * returned map shares the symbol keys but holds new (sliced) arrays — the
 * input is not mutated. Symbols whose price series is shorter than
 * `daysBack` are dropped from the prior-snapshot map; the route layer treats
 * a missing symbol the same way it treats a failed live fetch (skipped).
 */
export function sliceAsOf(
  prices: Map<string, Price[]>,
  daysBack: number,
): Map<string, Price[]> {
  if (daysBack < 0) {
    throw new Error(`sliceAsOf: daysBack must be >= 0, got ${daysBack}`);
  }
  const out = new Map<string, Price[]>();
  if (daysBack === 0) {
    for (const [symbol, series] of prices) {
      out.set(symbol, series.slice());
    }
    return out;
  }
  for (const [symbol, series] of prices) {
    if (series.length <= daysBack) continue;
    out.set(symbol, series.slice(0, series.length - daysBack));
  }
  return out;
}

/**
 * Resolve the ISO date (YYYY-MM-DD) of the last bar in a sliced series for a
 * given symbol. Used to stamp `asOfDate` and `priorDate` on the response so
 * the client can show the user which trading day the snapshot represents.
 */
export function lastBarDate(prices: Price[]): string {
  if (prices.length === 0) return '';
  const last = prices[prices.length - 1];
  const ts = last.timestamp instanceof Date ? last.timestamp : new Date(last.timestamp);
  return ts.toISOString().slice(0, 10);
}
