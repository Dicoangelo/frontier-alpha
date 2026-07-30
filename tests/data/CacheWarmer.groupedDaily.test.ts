/**
 * Tests for the B2 grouped-daily freshness sync (Tier 2 cache warming).
 *
 * The grouped-daily endpoint returns EVERY US ticker's OHLCV for ONE trading
 * day in a SINGLE call — a big win for DAILY FRESHNESS (one call refreshes the
 * latest bar for all warmed symbols instead of N per-symbol calls). It
 * COMPLEMENTS the per-symbol backfill; it does not replace it.
 *
 * MSW intercepts the grouped endpoint. Coverage:
 *   - grouped-daily returns a multi-ticker map from ONE call
 *   - a `status:'ERROR'` / empty body yields an empty map
 *   - the freshness sync write-throughs the latest bar for warmed symbols
 *   - weekend ref dates walk back to Friday (mostRecentTradingDay)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../setup.js';

// supabase.ts throws on import without these — set before importing the SUT.
vi.hoisted(() => {
  process.env.SUPABASE_URL ??= 'http://localhost:54321';
  process.env.SUPABASE_SERVICE_KEY ??= 'test-service-key';
});

import { MarketDataProvider } from '../../src/data/MarketDataProvider.js';
import {
  warmLatestDayAllSymbols,
  mostRecentTradingDay,
} from '../../src/data/CacheWarmer.js';
import type { CompositeCache } from '../../src/data/cache/index.js';
import type { Price } from '../../src/types/index.js';
import { resetBreakers, getBreaker } from '../../src/data/resilience.js';
import { resetQuotaStats } from '../../src/data/QuotaClassifier.js';

const POLY_KEY = 'x'.repeat(32);
const POLY_GROUPED =
  'https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/:date';

/** Grouped-daily OK body with one row per ticker (T = ticker, t = ms ts). */
function groupedOK(tickers: Record<string, number>) {
  const ts = Date.parse('2026-06-19T20:00:00Z');
  return HttpResponse.json({
    status: 'OK',
    results: Object.entries(tickers).map(([T, c]) => ({
      T,
      o: c - 1,
      h: c + 1,
      l: c - 2,
      c,
      v: 1_000_000,
      t: ts,
    })),
  });
}

/** A cache stub that records setPrices calls. */
function stubCache(): CompositeCache {
  return {
    getPrices: vi.fn().mockResolvedValue(null),
    setPrices: vi.fn().mockResolvedValue(undefined),
    getStalePrices: vi.fn().mockResolvedValue(null),
    setMemoryOnly: vi.fn(),
    telemetry: vi.fn(),
    resetCounters: vi.fn(),
  } as unknown as CompositeCache;
}

function makeProvider(): MarketDataProvider {
  const p = new MarketDataProvider({
    polygonApiKey: POLY_KEY,
    allowMockFallback: false,
  });
  (p as unknown as { useSupabaseCache: boolean }).useSupabaseCache = false;
  return p;
}

beforeEach(() => {
  resetBreakers();
  resetQuotaStats();
});

describe('MarketDataProvider.fetchGroupedDaily', () => {
  it('returns a multi-ticker map from ONE grouped-daily call', async () => {
    let hits = 0;
    server.use(
      http.get(POLY_GROUPED, () => {
        hits += 1;
        return groupedOK({ AAPL: 200, MSFT: 400, NVDA: 120 });
      }),
    );

    const provider = makeProvider();
    const map = await provider.fetchGroupedDaily(new Date('2026-06-19T12:00:00Z'));

    expect(hits).toBe(1); // one call for the whole market
    expect(map.size).toBe(3);
    expect(map.get('AAPL')?.[0].close).toBe(200);
    expect(map.get('MSFT')?.[0].close).toBe(400);
    expect(map.get('NVDA')?.[0].close).toBe(120);
    // Each entry is a single-day Price[].
    expect(map.get('AAPL')).toHaveLength(1);
    const bar = map.get('AAPL')![0];
    expect(bar.symbol).toBe('AAPL');
    expect(bar.open).toBe(199);
    expect(bar.high).toBe(201);
    expect(bar.low).toBe(198);
    expect(bar.volume).toBe(1_000_000);
    expect(bar.timestamp).toBeInstanceOf(Date);
  });

  it('yields an empty map on a status:ERROR body', async () => {
    server.use(
      http.get(POLY_GROUPED, () =>
        HttpResponse.json({ status: 'ERROR', error: 'unknown api key' }),
      ),
    );

    const map = await makeProvider().fetchGroupedDaily(new Date('2026-06-19T12:00:00Z'));
    expect(map.size).toBe(0);
  });

  it('yields an empty map on an OK body with no results (holiday)', async () => {
    server.use(
      http.get(POLY_GROUPED, () => HttpResponse.json({ status: 'OK', results: [] })),
    );

    const map = await makeProvider().fetchGroupedDaily(new Date('2026-06-19T12:00:00Z'));
    expect(map.size).toBe(0);
    // A valid empty response is NOT a provider failure — breaker stays closed.
    expect(getBreaker('polygon').getState()).toBe('closed');
  });

  it('yields an empty map (no throw) on a non-200 HTTP status', async () => {
    server.use(
      http.get(POLY_GROUPED, () => new HttpResponse('rate limited', { status: 429 })),
    );

    const map = await makeProvider().fetchGroupedDaily(new Date('2026-06-19T12:00:00Z'));
    expect(map.size).toBe(0);
  });

  it('skips the call entirely when the polygon breaker is open', async () => {
    let hits = 0;
    server.use(
      http.get(POLY_GROUPED, () => {
        hits += 1;
        return groupedOK({ AAPL: 200 });
      }),
    );

    const breaker = getBreaker('polygon');
    for (let i = 0; i < 5; i++) breaker.recordFailure();
    expect(breaker.getState()).toBe('open');

    const map = await makeProvider().fetchGroupedDaily(new Date('2026-06-19T12:00:00Z'));
    expect(map.size).toBe(0);
    expect(hits).toBe(0); // never called — breaker open
  });
});

describe('warmLatestDayAllSymbols — freshness sync', () => {
  it('write-throughs the latest bar for each warmed symbol found in the group', async () => {
    server.use(
      http.get(POLY_GROUPED, () => groupedOK({ AAPL: 200, MSFT: 400, NVDA: 120, TSLA: 250 })),
    );

    const provider = makeProvider();
    const cache = stubCache();
    (provider as unknown as { historicalPriceCache: CompositeCache }).historicalPriceCache = cache;

    // Ask for 3 warmed symbols; only those present in the group are refreshed.
    const result = await warmLatestDayAllSymbols(
      provider,
      ['aapl', 'msft', 'GOOGL'], // GOOGL is NOT in the group
      new Date('2026-06-19T12:00:00Z'),
    );

    expect(result.tickersInGroup).toBe(4);
    expect(result.updated).toBe(2);
    expect(result.symbols).toEqual(['AAPL', 'MSFT']);

    expect(cache.setPrices).toHaveBeenCalledTimes(2);
    const [aaplSym, aaplBars] = (cache.setPrices as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(aaplSym).toBe('AAPL');
    expect(aaplBars).toHaveLength(1);
    expect((aaplBars as Price[])[0].close).toBe(200);
  });

  // Regression: on a weekday before the close, today IS a trading day but its
  // grouped bar does not exist yet, so the sync targeted an empty day and
  // refreshed nothing for most of every day. It now walks back to the most
  // recent day that actually has a bar. The same path covers market holidays.
  it('walks back to the previous trading day when today has no bar yet', async () => {
    const empty = new Set(['2026-06-19']); // "today", pre-close
    server.use(
      http.get(POLY_GROUPED, ({ params }) => {
        const date = String((params as { date: string }).date);
        return empty.has(date)
          ? HttpResponse.json({ status: 'OK', results: [] })
          : groupedOK({ AAPL: 200, MSFT: 400 });
      }),
    );

    const provider = makeProvider();
    const cache = stubCache();
    (provider as unknown as { historicalPriceCache: CompositeCache }).historicalPriceCache = cache;

    const result = await warmLatestDayAllSymbols(
      provider,
      ['AAPL', 'MSFT'],
      new Date('2026-06-19T12:00:00Z'),
    );

    expect(result.date).toBe('2026-06-18'); // fell back one day
    expect(result.tickersInGroup).toBe(2);
    expect(result.updated).toBe(2);
    expect(cache.setPrices).toHaveBeenCalledTimes(2);
  });

  it('gives up after the bounded lookback instead of walking forever', async () => {
    let calls = 0;
    server.use(
      http.get(POLY_GROUPED, () => {
        calls += 1;
        return HttpResponse.json({ status: 'OK', results: [] });
      }),
    );

    const provider = makeProvider();
    const cache = stubCache();
    (provider as unknown as { historicalPriceCache: CompositeCache }).historicalPriceCache = cache;

    const result = await warmLatestDayAllSymbols(
      provider,
      ['AAPL'],
      new Date('2026-06-19T12:00:00Z'),
    );

    expect(result.updated).toBe(0);
    expect(cache.setPrices).not.toHaveBeenCalled();
    // 1 initial attempt + MAX_FRESHNESS_LOOKBACK_DAYS walk-backs.
    expect(calls).toBe(5);
  });

  it('is a no-op (no cache writes) when grouped-daily returns nothing', async () => {
    server.use(
      http.get(POLY_GROUPED, () => HttpResponse.json({ status: 'OK', results: [] })),
    );

    const provider = makeProvider();
    const cache = stubCache();
    (provider as unknown as { historicalPriceCache: CompositeCache }).historicalPriceCache = cache;

    const result = await warmLatestDayAllSymbols(provider, ['AAPL', 'MSFT'], new Date('2026-06-19T12:00:00Z'));

    expect(result.updated).toBe(0);
    expect(cache.setPrices).not.toHaveBeenCalled();
  });

  it('returns early without an upstream call when no symbols are warmed', async () => {
    let hits = 0;
    server.use(
      http.get(POLY_GROUPED, () => {
        hits += 1;
        return groupedOK({ AAPL: 200 });
      }),
    );

    const result = await warmLatestDayAllSymbols(makeProvider(), [], new Date('2026-06-19T12:00:00Z'));
    expect(result.updated).toBe(0);
    expect(hits).toBe(0);
  });
});

describe('mostRecentTradingDay', () => {
  it('returns the same day for a weekday', () => {
    // 2026-06-19 is a Friday.
    const d = mostRecentTradingDay(new Date('2026-06-19T12:00:00Z'));
    expect(d.toISOString().slice(0, 10)).toBe('2026-06-19');
  });

  it('walks Saturday back to Friday', () => {
    // 2026-06-20 is a Saturday.
    const d = mostRecentTradingDay(new Date('2026-06-20T12:00:00Z'));
    expect(d.toISOString().slice(0, 10)).toBe('2026-06-19');
  });

  it('walks Sunday back to Friday', () => {
    // 2026-06-21 is a Sunday.
    const d = mostRecentTradingDay(new Date('2026-06-21T12:00:00Z'));
    expect(d.toISOString().slice(0, 10)).toBe('2026-06-19');
  });
});
