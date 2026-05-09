/**
 * Cache module entry point (US-006).
 *
 * Exports:
 *   - `MemoryCache<T>` — in-process generic K/V with TTL + counters
 *   - `SupabaseCache` — durable price cache backed by frontier_historical_prices
 *   - `CompositeCache` — composes Memory in front of Supabase
 *   - `getCacheTelemetry()` — global telemetry roll-up consumed by US-008
 *     `/api/v1/health/errors` and the weekly digest
 *
 * Process-singleton: `marketDataCache` is the canonical CompositeCache
 * instance used by `MarketDataProvider`. The CacheWarmer and the cron
 * route share the same instance so warm-cache calls populate the same
 * layers a request hit would read from.
 */

export { MemoryCache } from './MemoryCache.js';
export type { MemoryCacheOptions } from './MemoryCache.js';
export { SupabaseCache } from './SupabaseCache.js';
export type { SupabaseCacheOptions } from './SupabaseCache.js';
export { CompositeCache } from './CompositeCache.js';
export type { CompositeCacheOptions } from './CompositeCache.js';

import { CompositeCache } from './CompositeCache.js';

/**
 * Process-wide CompositeCache instance for historical prices. Wired into
 * MarketDataProvider so every getHistoricalPrices() call funnels through
 * one set of counters.
 */
export const marketDataCache = new CompositeCache({
  memory: {
    // 1-hour TTL on memory matches the prior MarketDataProvider.priceCache
    // staleness window — preserves observed behavior of the v1.2.6 layer.
    defaultTtlMs: 60 * 60 * 1000,
    maxEntries: 500,
  },
});

/**
 * Telemetry surface consumed by US-008 (`/api/v1/health/errors` summary
 * and weekly digest). Returned shape is documented in the PRD US-006
 * acceptance: `{ memory: {...}, supabase: {...}, total: {...} }`.
 */
export function getCacheTelemetry(): ReturnType<CompositeCache['telemetry']> {
  return marketDataCache.telemetry();
}
