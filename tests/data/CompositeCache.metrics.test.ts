/**
 * WIRING tests: CompositeCache -> Prometheus cache counters.
 *
 * `cache_hits_total` and `cache_misses_total` were registered on
 * /api/v1/metrics but never incremented — `recordCacheHit` / `recordCacheMiss`
 * had no call site anywhere in src/. Production served HELP/TYPE headers with
 * zero samples while the cache layers tracked real hit/miss counts internally,
 * so every cache dashboard and the weekly digest's hit-ratio read as no
 * activity rather than as broken.
 *
 * These assert the counters actually move, not that the cache works.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// supabase.ts throws on import without these — set before importing the SUT.
vi.hoisted(() => {
  process.env.SUPABASE_URL ??= 'http://localhost:54321';
  process.env.SUPABASE_SERVICE_KEY ??= 'test-service-key';
});

import { CompositeCache } from '../../src/data/cache/CompositeCache.js';
import { MemoryCache } from '../../src/data/cache/MemoryCache.js';
import type { SupabaseCache } from '../../src/data/cache/SupabaseCache.js';
import { metrics } from '../../src/observability/metrics.js';
import type { Price } from '../../src/types/index.js';

function bars(symbol: string, n: number): Price[] {
  return Array.from({ length: n }, (_, i) => ({
    symbol,
    timestamp: new Date(Date.UTC(2026, 5, i + 1)),
    open: 1,
    high: 2,
    low: 1,
    close: 1.5,
    volume: 100,
  }));
}

/** Supabase layer stub — controls whether the durable read hits or misses. */
function supabaseStub(rows: Price[] | null): SupabaseCache {
  return {
    getPrices: vi.fn().mockResolvedValue(rows),
    setPrices: vi.fn().mockResolvedValue(undefined),
    getStalePrices: vi.fn().mockResolvedValue(null),
    telemetry: () => ({ hits: 0, misses: 0, stales: 0 }),
    resetCounters: vi.fn(),
  } as unknown as SupabaseCache;
}

const hits = (layer: string) => metrics.getCounter('cache_hits_total', { cache: layer });
const misses = (layer: string) => metrics.getCounter('cache_misses_total', { cache: layer });

describe('CompositeCache → Prometheus counters', () => {
  beforeEach(() => {
    metrics.reset();
  });

  it('records a memory hit when the in-process layer serves the read', async () => {
    const memory = new MemoryCache<Price[]>();
    const cache = new CompositeCache({ memoryLayer: memory, supabaseLayer: supabaseStub(null) });

    await cache.setPrices('AAPL', bars('AAPL', 10), 10);
    const got = await cache.getPrices('AAPL', 10);

    expect(got).toHaveLength(10);
    expect(hits('memory')).toBe(1);
    expect(misses('memory')).toBe(0);
  });

  it('records a memory miss + supabase hit when the durable layer serves it', async () => {
    const cache = new CompositeCache({
      memoryLayer: new MemoryCache<Price[]>(),
      supabaseLayer: supabaseStub(bars('MSFT', 10)),
    });

    const got = await cache.getPrices('MSFT', 10);

    expect(got).toHaveLength(10);
    expect(misses('memory')).toBe(1);
    expect(hits('supabase')).toBe(1);
    expect(misses('supabase')).toBe(0);
  });

  it('records a miss on both layers when nothing is cached', async () => {
    const cache = new CompositeCache({
      memoryLayer: new MemoryCache<Price[]>(),
      supabaseLayer: supabaseStub(null),
    });

    const got = await cache.getPrices('NVDA', 10);

    expect(got).toBeNull();
    expect(misses('memory')).toBe(1);
    expect(misses('supabase')).toBe(1);
    expect(hits('memory') + hits('supabase')).toBe(0);
  });

  it('surfaces the counters in the Prometheus render with real samples', async () => {
    const cache = new CompositeCache({
      memoryLayer: new MemoryCache<Price[]>(),
      supabaseLayer: supabaseStub(null),
    });
    await cache.getPrices('AAPL', 5);

    const rendered = metrics.toPrometheus();
    // The production bug was HELP/TYPE present with no sample lines.
    expect(rendered).toMatch(/cache_misses_total\{[^}]*cache="memory"[^}]*\}\s+1/);
  });
});
