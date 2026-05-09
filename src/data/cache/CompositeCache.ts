/**
 * CompositeCache — Memory in front of Supabase for historical prices.
 *
 * The third class in US-006's extracted cache module. Purpose is to give
 * `MarketDataProvider.getHistoricalPrices` a single object to delegate to
 * instead of hand-rolling Memory + Supabase logic inline.
 *
 * Read order:
 *   1. Memory hit -> return immediately
 *   2. Memory miss -> Supabase read; if hit, write-through into Memory
 *   3. Both miss -> return null; caller fetches from upstream then calls
 *      `setPrices()` to populate both layers
 *
 * Why not generic? The price-shaped methods (`getPrices`, `setPrices`)
 * mirror the underlying `SupabaseCache` API. A fully-generic K/V variant
 * would require a second durable backing table (`frontier_cache_kv`) that
 * has no consumer today; we'd be building dead code. The class shape can
 * grow generic methods later without breaking the price methods.
 *
 * Counter telemetry rolls up Memory + Supabase counters. Each layer keeps
 * its own counters so the operator can see WHERE hits land:
 *   - Memory hit ratio = hot path (no DB round-trip)
 *   - Supabase hit ratio = warm path (DB round-trip, no upstream call)
 *   - Total miss = cold path (upstream call required)
 */

import type { Price } from '../../types/index.js';
import { MemoryCache, type MemoryCacheOptions } from './MemoryCache.js';
import { SupabaseCache, type SupabaseCacheOptions } from './SupabaseCache.js';

export interface CompositeCacheOptions {
  memory?: MemoryCacheOptions;
  supabase?: SupabaseCacheOptions;
  /** Inject pre-built layers (used in tests for tight control). */
  memoryLayer?: MemoryCache<Price[]>;
  supabaseLayer?: SupabaseCache;
}

export class CompositeCache {
  readonly memory: MemoryCache<Price[]>;
  readonly supabase: SupabaseCache;

  constructor(opts: CompositeCacheOptions = {}) {
    this.memory = opts.memoryLayer ?? new MemoryCache<Price[]>(opts.memory);
    this.supabase = opts.supabaseLayer ?? new SupabaseCache(opts.supabase);
  }

  /**
   * Read prices for `symbol` covering at least `days` data points.
   *
   * Memory keys embed `days` to keep the size-coverage check honest: a
   * request for 252 days should not be served from a 60-day memory entry.
   */
  async getPrices(symbol: string, days: number): Promise<Price[] | null> {
    const upper = symbol.toUpperCase();
    const memKey = `${upper}:${days}`;

    const cached = this.memory.get(memKey);
    if (cached && cached.length >= days) {
      return cached.slice(-days);
    }

    const fromSupabase = await this.supabase.getPrices(upper, days);
    if (fromSupabase && fromSupabase.length >= days * 0.9) {
      // Write-through into memory so the next caller skips the DB.
      this.memory.set(memKey, fromSupabase);
      return fromSupabase;
    }

    return null;
  }

  /**
   * Persist prices to BOTH layers. Memory write is synchronous; Supabase
   * write is awaited so callers can rely on durability before returning to
   * end users (matters for the cache warmer cron).
   */
  async setPrices(symbol: string, prices: Price[], days?: number): Promise<void> {
    if (prices.length === 0) return;
    const upper = symbol.toUpperCase();
    const memKey = `${upper}:${days ?? prices.length}`;
    this.memory.set(memKey, prices);
    await this.supabase.setPrices(upper, prices);
  }

  /**
   * Memory-only set (used when the upstream returned a smaller window than
   * what's cached durably and we just want to refresh the in-process copy).
   */
  setMemoryOnly(symbol: string, prices: Price[], days: number): void {
    const memKey = `${symbol.toUpperCase()}:${days}`;
    this.memory.set(memKey, prices);
  }

  /** Roll-up telemetry, consumed by `getCacheTelemetry()`. */
  telemetry(): {
    memory: { hits: number; misses: number; stales: number; size: number };
    supabase: { hits: number; misses: number; stales: number };
    total: { hits: number; misses: number; stales: number };
  } {
    const m = this.memory.telemetry();
    const s = this.supabase.telemetry();
    return {
      memory: m,
      supabase: s,
      total: {
        hits: m.hits + s.hits,
        misses: m.misses + s.misses,
        stales: m.stales + s.stales,
      },
    };
  }

  resetCounters(): void {
    this.memory.resetCounters();
    this.supabase.resetCounters();
  }
}
