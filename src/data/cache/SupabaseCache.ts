/**
 * SupabaseCache — durable cache backed by `frontier_historical_prices`.
 *
 * One half of US-006's extracted cache module. Reads/writes price arrays
 * to the existing `frontier_historical_prices` table. We deliberately do
 * NOT add a generic `frontier_cache_kv` table in this story — every current
 * caller (MarketDataProvider) only caches prices, and the K/V abstraction
 * would be unused dead code on day one. The class shape is generic enough
 * to accommodate future K/V methods without an API break.
 *
 * Counter telemetry (`hitCount`, `missCount`, `staleCount`) follows the
 * same contract as `MemoryCache<T>`:
 *   - `hitCount` — successful read with sufficient row coverage
 *   - `missCount` — no row OR insufficient coverage
 *   - `staleCount` — reserved; this layer has no TTL today (rows are
 *     persisted indefinitely; staleness is enforced by the upper Memory
 *     layer in CompositeCache). Kept on the interface so US-008 telemetry
 *     can roll it up uniformly.
 *
 * Failure mode:
 *   - All Supabase errors are swallowed and logged. The caller receives a
 *     miss so the next layer (network upstream) takes over. The original
 *     MarketDataProvider behavior was identical — we preserve it.
 */

import type { Price } from '../../types/index.js';
import { supabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';

export interface SupabaseCacheOptions {
  /**
   * Coverage threshold: a read with `coverage * days` rows or more is
   * considered a hit. Below the threshold we treat as a miss so the caller
   * refreshes from the upstream.
   */
  coverage?: number;
  /** Override the supabase client (used in tests). */
  client?: typeof supabaseAdmin;
  /** Disable cache entirely (used when service key isn't wired). */
  enabled?: boolean;
}

const DEFAULT_COVERAGE = 0.9;

export class SupabaseCache {
  private client: typeof supabaseAdmin | null;
  private coverage: number;
  private enabled: boolean;

  hitCount = 0;
  missCount = 0;
  staleCount = 0;

  constructor(opts: SupabaseCacheOptions = {}) {
    // Default-enable when SUPABASE_SERVICE_KEY is wired. Tests can override
    // via the `enabled` flag + a stub client.
    this.enabled = opts.enabled ?? Boolean(process.env.SUPABASE_SERVICE_KEY);
    this.client = opts.client ?? (this.enabled ? supabaseAdmin : null);
    this.coverage = opts.coverage ?? DEFAULT_COVERAGE;
  }

  /**
   * Fetch up to `days` rows of historical prices for `symbol`, oldest first.
   * Returns `null` on miss (no rows OR insufficient coverage); the caller
   * should fall through to the network.
   */
  async getPrices(symbol: string, days: number): Promise<Price[] | null> {
    if (!this.enabled || !this.client) {
      this.missCount += 1;
      return null;
    }

    try {
      const { data, error } = await this.client
        .from('frontier_historical_prices')
        .select('*')
        .eq('symbol', symbol)
        .order('date', { ascending: true })
        .limit(days);

      if (error) {
        logger.warn({ err: error, symbol }, 'SupabaseCache.getPrices error');
        this.missCount += 1;
        return null;
      }

      const rows = (data ?? []) as Array<{
        date: string;
        open: number;
        high: number;
        low: number;
        close: number;
        adjusted_close: number;
        volume: number;
      }>;

      if (rows.length < days * this.coverage) {
        this.missCount += 1;
        return null;
      }

      this.hitCount += 1;
      return rows.map((r) => ({
        symbol,
        timestamp: new Date(r.date),
        open: r.open,
        high: r.high,
        low: r.low,
        // Use adjusted close for downstream factor math, matching the
        // historical MarketDataProvider behavior.
        close: r.adjusted_close,
        volume: r.volume,
      }));
    } catch (err) {
      logger.warn({ err, symbol }, 'SupabaseCache.getPrices threw');
      this.missCount += 1;
      return null;
    }
  }

  /**
   * Upsert price rows for `symbol`. Batches at 100 rows per call to keep
   * upsert payloads small. Errors are logged and swallowed.
   */
  async setPrices(symbol: string, prices: Price[]): Promise<void> {
    if (!this.enabled || !this.client || prices.length === 0) return;

    try {
      const batchSize = 100;
      for (let i = 0; i < prices.length; i += batchSize) {
        const batch = prices.slice(i, i + batchSize).map((p) => ({
          symbol,
          date: p.timestamp.toISOString().split('T')[0],
          open: p.open,
          high: p.high,
          low: p.low,
          close: p.close,
          adjusted_close: p.close,
          volume: p.volume,
        }));

        await this.client
          .from('frontier_historical_prices')
          .upsert(batch, { onConflict: 'symbol,date' });
      }
    } catch (err) {
      logger.warn({ err, symbol }, 'SupabaseCache.setPrices error');
    }
  }

  /** Snapshot of telemetry counters. */
  telemetry(): { hits: number; misses: number; stales: number } {
    return {
      hits: this.hitCount,
      misses: this.missCount,
      stales: this.staleCount,
    };
  }

  /** Reset counters (used in tests). */
  resetCounters(): void {
    this.hitCount = 0;
    this.missCount = 0;
    this.staleCount = 0;
  }
}
