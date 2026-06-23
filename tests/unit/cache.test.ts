/**
 * Unit test: cache module (US-006).
 *
 * Locks in the contract for the extracted `src/data/cache/` primitives:
 *   - MemoryCache<T>: hit, miss, stale (TTL expiry), eviction, counters
 *   - SupabaseCache: hit/miss against a stubbed supabase client, coverage gate
 *   - CompositeCache: memory-then-supabase semantics, write-through on miss,
 *     telemetry roll-up
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.hoisted(() => {
  process.env.SUPABASE_URL ??= 'http://localhost:54321';
  process.env.SUPABASE_SERVICE_KEY ??= 'test-service-key';
});

vi.mock('../../src/lib/logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import type { Price } from '../../src/types/index.js';
import { MemoryCache } from '../../src/data/cache/MemoryCache.js';
import { SupabaseCache } from '../../src/data/cache/SupabaseCache.js';
import { CompositeCache } from '../../src/data/cache/CompositeCache.js';

// ────────────────────────────────────────────────────────────────────────
// MemoryCache
// ────────────────────────────────────────────────────────────────────────

describe('MemoryCache<T> — in-process key/value with TTL', () => {
  let cache: MemoryCache<string>;

  beforeEach(() => {
    cache = new MemoryCache<string>({ defaultTtlMs: 1000, maxEntries: 3 });
  });

  // The TTL tests below `vi.spyOn(Date, 'now')`; restore it after each so the
  // mocked clock doesn't leak into the SupabaseCache freshness-gate tests.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null on miss and increments missCount', () => {
    expect(cache.get('foo')).toBeNull();
    expect(cache.missCount).toBe(1);
    expect(cache.hitCount).toBe(0);
    expect(cache.staleCount).toBe(0);
  });

  it('returns stored value on hit and increments hitCount', () => {
    cache.set('foo', 'bar');
    expect(cache.get('foo')).toBe('bar');
    expect(cache.hitCount).toBe(1);
    expect(cache.missCount).toBe(0);
  });

  it('expires entries past TTL, returns null, bumps staleCount and missCount', () => {
    const now = 10_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    cache.set('foo', 'bar', 100);
    vi.spyOn(Date, 'now').mockReturnValue(now + 200); // past TTL
    expect(cache.get('foo')).toBeNull();
    expect(cache.staleCount).toBe(1);
    expect(cache.missCount).toBe(1);
    expect(cache.hitCount).toBe(0);
    // Entry should be removed after a stale read.
    expect(cache.size()).toBe(0);
  });

  it('per-call ttl overrides default', () => {
    const now = 10_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    cache.set('long', 'x', 5000);
    cache.set('short', 'y', 50);
    vi.spyOn(Date, 'now').mockReturnValue(now + 100);
    expect(cache.get('long')).toBe('x');
    expect(cache.get('short')).toBeNull(); // expired
  });

  it('evicts oldest entry when at maxEntries', () => {
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3');
    expect(cache.size()).toBe(3);
    cache.set('d', '4'); // evicts 'a'
    expect(cache.size()).toBe(3);
    expect(cache.get('a')).toBeNull();
    expect(cache.get('d')).toBe('4');
    expect(cache.get('b')).toBe('2');
  });

  it('delete() removes a single entry; clear() wipes all', () => {
    cache.set('a', '1');
    cache.set('b', '2');
    expect(cache.delete('a')).toBe(true);
    expect(cache.delete('a')).toBe(false);
    expect(cache.get('b')).toBe('2');
    cache.clear();
    expect(cache.size()).toBe(0);
  });

  it('telemetry() returns the counter snapshot', () => {
    cache.set('a', '1');
    cache.get('a'); // hit
    cache.get('b'); // miss
    const t = cache.telemetry();
    expect(t.hits).toBe(1);
    expect(t.misses).toBe(1);
    expect(t.size).toBe(1);
  });

  it('getStale() returns expired values with stale flag and bumps staleCount', () => {
    const now = 10_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    cache.set('foo', 'bar', 100);
    vi.spyOn(Date, 'now').mockReturnValue(now + 200);
    const result = cache.getStale('foo');
    expect(result).toEqual({ value: 'bar', stale: true });
    expect(cache.staleCount).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────────
// SupabaseCache
// ────────────────────────────────────────────────────────────────────────

function makePrice(symbol: string, dateIso: string, close: number): Price {
  return {
    symbol,
    timestamp: new Date(dateIso),
    open: close,
    high: close,
    low: close,
    close,
    volume: 1_000_000,
  };
}

function makeStubClient(rows: Array<Record<string, unknown>> | null, error: unknown = null) {
  // We mimic the supabase chain: from(...).select(...).eq(...).order(...).limit(...) → { data, error }
  // and from(...).upsert(rows, opts) → resolves
  const upsertCalls: Array<{ rows: unknown; opts: unknown }> = [];
  const from = vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        order: vi.fn(() => ({
          limit: vi.fn(async () => ({ data: rows, error })),
        })),
      })),
    })),
    upsert: vi.fn(async (r: unknown, opts: unknown) => {
      upsertCalls.push({ rows: r, opts });
      return { data: null, error: null };
    }),
  }));
  return { from, upsertCalls };
}

describe('SupabaseCache — durable price cache', () => {
  it('returns null and bumps missCount when client is disabled', async () => {
    const cache = new SupabaseCache({ enabled: false });
    const result = await cache.getPrices('AAPL', 60);
    expect(result).toBeNull();
    expect(cache.missCount).toBe(1);
    expect(cache.hitCount).toBe(0);
  });

  it('returns null and bumps missCount when row coverage is below threshold', async () => {
    const stub = makeStubClient([
      { date: '2026-01-01', open: 1, high: 1, low: 1, close: 1, adjusted_close: 1, volume: 100 },
    ]);
    const cache = new SupabaseCache({
      enabled: true,
      // Cast through unknown to fit the stubbed shape into the SupabaseClient slot.
      client: stub as unknown as Parameters<typeof SupabaseCache>[0] extends infer _ ? any : never,
      coverage: 0.9,
    });
    const result = await cache.getPrices('AAPL', 60);
    expect(result).toBeNull();
    expect(cache.missCount).toBe(1);
  });

  it('returns rows oldest-first and bumps hitCount on coverage hit', async () => {
    const days = 5;
    // The real query orders DESCENDING, so the stub returns newest-first.
    const rows = Array.from({ length: days }, (_, i) => {
      const dayNum = days - i; // 5,4,3,2,1 → dates descending
      return {
        date: `2026-01-0${dayNum}`,
        open: 100 + dayNum,
        high: 101 + dayNum,
        low: 99 + dayNum,
        close: 100 + dayNum,
        adjusted_close: 100 + dayNum,
        volume: 1_000_000,
      };
    });
    const stub = makeStubClient(rows);
    const cache = new SupabaseCache({
      enabled: true,
      client: stub as unknown as any,
      coverage: 0.9,
      maxStalenessMs: 0, // disable freshness gate to assert ordering on fixed dates
    });
    const result = await cache.getPrices('AAPL', days);
    expect(result).toHaveLength(days);
    expect(cache.hitCount).toBe(1);
    // Reversed to oldest-first: 2026-01-01 .. 2026-01-05
    expect(result?.[0].timestamp.toISOString().slice(0, 10)).toBe('2026-01-01');
    expect(result?.[days - 1].timestamp.toISOString().slice(0, 10)).toBe('2026-01-05');
    expect(result?.[0].close).toBe(101); // adjusted_close for 2026-01-01 (100+1)
  });

  it('returns null and bumps staleCount when newest bar is older than maxStalenessMs', async () => {
    const days = 5;
    const rows = Array.from({ length: days }, (_, i) => {
      const dayNum = days - i;
      return {
        date: `2020-01-0${dayNum}`,
        open: 1, high: 1, low: 1, close: 1, adjusted_close: 1, volume: 100,
      };
    });
    const stub = makeStubClient(rows);
    const cache = new SupabaseCache({
      enabled: true,
      client: stub as unknown as any,
      coverage: 0.9,
      maxStalenessMs: 5 * 24 * 60 * 60 * 1000,
    });
    const result = await cache.getPrices('AAPL', days);
    expect(result).toBeNull();
    expect(cache.staleCount).toBe(1);
    expect(cache.missCount).toBe(1);
    expect(cache.hitCount).toBe(0);
  });

  it('returns rows when newest bar is within maxStalenessMs', async () => {
    const days = 3;
    const today = new Date();
    // newest-first, dated today, yesterday, day-before
    const rows = Array.from({ length: days }, (_, i) => {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - i);
      return {
        date: d.toISOString().slice(0, 10),
        open: 1, high: 1, low: 1, close: 1, adjusted_close: 1, volume: 100,
      };
    });
    const stub = makeStubClient(rows);
    const cache = new SupabaseCache({
      enabled: true,
      client: stub as unknown as any,
      coverage: 0.9,
    });
    const result = await cache.getPrices('AAPL', days);
    expect(result).toHaveLength(days);
    expect(cache.hitCount).toBe(1);
    expect(cache.staleCount).toBe(0);
  });

  it('setPrices upserts in batches', async () => {
    const stub = makeStubClient([]);
    const cache = new SupabaseCache({
      enabled: true,
      client: stub as unknown as any,
    });
    const prices = Array.from({ length: 250 }, (_, i) =>
      makePrice('AAPL', `2026-01-0${(i % 9) + 1}`, 100 + i),
    );
    await cache.setPrices('AAPL', prices);
    expect(stub.upsertCalls.length).toBe(3); // 100 + 100 + 50
    expect((stub.upsertCalls[0].opts as { onConflict: string }).onConflict).toBe('symbol,date');
  });

  it('setPrices is a no-op on empty array', async () => {
    const stub = makeStubClient([]);
    const cache = new SupabaseCache({
      enabled: true,
      client: stub as unknown as any,
    });
    await cache.setPrices('AAPL', []);
    expect(stub.upsertCalls.length).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────
// CompositeCache
// ────────────────────────────────────────────────────────────────────────

describe('CompositeCache — Memory in front of Supabase', () => {
  function makeStubSupabase(prices: Price[] | null) {
    const inner = {
      getPrices: vi.fn(async () => prices),
      setPrices: vi.fn(async () => undefined),
      hitCount: 0,
      missCount: 0,
      staleCount: 0,
      telemetry() {
        return { hits: this.hitCount, misses: this.missCount, stales: this.staleCount };
      },
      resetCounters() {
        this.hitCount = 0;
        this.missCount = 0;
        this.staleCount = 0;
      },
    };
    return inner as unknown as SupabaseCache;
  }

  it('serves from memory when memory hits', async () => {
    const memory = new MemoryCache<Price[]>();
    const supabase = makeStubSupabase(null);
    const composite = new CompositeCache({ memoryLayer: memory, supabaseLayer: supabase });
    const prices = [makePrice('AAPL', '2026-01-01', 100), makePrice('AAPL', '2026-01-02', 101)];
    memory.set('AAPL:2', prices);

    const result = await composite.getPrices('AAPL', 2);
    expect(result).toHaveLength(2);
    expect((supabase.getPrices as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    expect(memory.hitCount).toBe(1);
  });

  it('falls through to supabase on memory miss; write-through on supabase hit', async () => {
    const memory = new MemoryCache<Price[]>();
    const days = 10;
    const stubPrices = Array.from({ length: days }, (_, i) =>
      makePrice('AAPL', `2026-01-${String(i + 1).padStart(2, '0')}`, 100 + i),
    );
    const supabase = makeStubSupabase(stubPrices);
    const composite = new CompositeCache({ memoryLayer: memory, supabaseLayer: supabase });

    const result = await composite.getPrices('AAPL', days);
    expect(result).toHaveLength(days);
    expect(supabase.getPrices).toHaveBeenCalledWith('AAPL', days);
    // Write-through: a second read should hit memory, not supabase.
    (supabase.getPrices as unknown as ReturnType<typeof vi.fn>).mockClear();
    const second = await composite.getPrices('AAPL', days);
    expect(second).toHaveLength(days);
    expect(supabase.getPrices).not.toHaveBeenCalled();
  });

  it('returns null when both layers miss', async () => {
    const composite = new CompositeCache({
      memoryLayer: new MemoryCache<Price[]>(),
      supabaseLayer: makeStubSupabase(null),
    });
    expect(await composite.getPrices('AAPL', 60)).toBeNull();
  });

  it('setPrices writes to memory and supabase', async () => {
    const memory = new MemoryCache<Price[]>();
    const supabase = makeStubSupabase(null);
    const composite = new CompositeCache({ memoryLayer: memory, supabaseLayer: supabase });
    const prices = [makePrice('AAPL', '2026-01-01', 100), makePrice('AAPL', '2026-01-02', 101)];

    await composite.setPrices('AAPL', prices, 2);
    expect(supabase.setPrices).toHaveBeenCalledWith('AAPL', prices);
    // Memory was populated; verify by reading back.
    const memHit = memory.get('AAPL:2');
    expect(memHit).toEqual(prices);
  });

  it('telemetry rolls up memory + supabase counters', async () => {
    const memory = new MemoryCache<Price[]>();
    memory.hitCount = 5;
    memory.missCount = 3;
    const supabase = makeStubSupabase(null);
    (supabase as { hitCount: number }).hitCount = 7;
    (supabase as { missCount: number }).missCount = 2;
    const composite = new CompositeCache({ memoryLayer: memory, supabaseLayer: supabase });

    const t = composite.telemetry();
    expect(t.memory.hits).toBe(5);
    expect(t.supabase.hits).toBe(7);
    expect(t.total.hits).toBe(12);
    expect(t.total.misses).toBe(5);
  });
});
