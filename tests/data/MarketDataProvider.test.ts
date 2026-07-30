/**
 * Integration tests for MarketDataProvider's failure-path behavior
 * (harden/data-provider-cdf). Before this suite there was ZERO coverage on the
 * real fetch path — only the health-probe's separate implementation was tested.
 *
 * MSW intercepts every upstream (Polygon, Alpaca, Alpha Vantage). Each test
 * drives one scenario the plan called out:
 *   - Polygon 429 → retry → Alpaca fallback
 *   - Polygon 401 (revoked key) → classified `auth`, failover still serves
 *   - all providers down → serve last-resort STALE cache (no hard throw)
 *   - quote dedup: concurrent same-symbol callers hit upstream once
 *   - circuit breaker open → provider skipped straight to failover
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
import type { CompositeCache } from '../../src/data/cache/index.js';
import type { Price } from '../../src/types/index.js';
import { resetBreakers, getBreaker } from '../../src/data/resilience.js';
import { resetQuotaStats, getErrorKindCount } from '../../src/data/QuotaClassifier.js';

const POLY_KEY = 'x'.repeat(32);

// URL matchers for MSW.
// Quotes are derived from daily aggregates, not the snapshot endpoint —
// `/v2/snapshot/...` is not entitled on the Stocks Starter plan (403).
const POLY_AGGS = 'https://api.polygon.io/v2/aggs/ticker/:symbol/range/1/day/:from/:to';
const POLY_QUOTE = POLY_AGGS;
const ALPACA_SNAPSHOT = 'https://data.alpaca.markets/v2/stocks/:symbol/snapshot';
const ALPACA_BARS = 'https://data.alpaca.markets/v2/stocks/:symbol/bars';

/** Two daily bars, newest first — the shape `fetchPolygonQuote` parses. */
function polygonQuoteAggsOK(last: number) {
  const day = 24 * 60 * 60 * 1000;
  return HttpResponse.json({
    status: 'OK',
    results: [
      { o: last - 0.5, h: last + 1, l: last - 1, c: last, v: 1_000_000, t: Date.now() },
      { o: last - 2, h: last, l: last - 3, c: last - 1.5, v: 900_000, t: Date.now() - day },
    ],
  });
}

function alpacaSnapshotOK(last: number) {
  return HttpResponse.json({
    latestTrade: { p: last, t: new Date().toISOString() },
    latestQuote: { bp: last - 0.05, ap: last + 0.05 },
    dailyBar: { c: last },
    prevDailyBar: { c: last - 1 },
  });
}

/** A cache stub with controllable getStalePrices for the degradation test. */
function stubCache(stale: Price[] | null = null): CompositeCache {
  return {
    getPrices: vi.fn().mockResolvedValue(null),
    setPrices: vi.fn().mockResolvedValue(undefined),
    getStalePrices: vi.fn().mockResolvedValue(stale),
    telemetry: vi.fn(),
    resetCounters: vi.fn(),
  } as unknown as CompositeCache;
}

function makeProvider(overrides: Record<string, unknown> = {}): MarketDataProvider {
  const p = new MarketDataProvider({
    polygonApiKey: POLY_KEY,
    alpacaApiKey: 'ak',
    alpacaApiSecret: 'as',
    allowMockFallback: false,
    ...overrides,
  });
  // Force the durable quote-cache read off so tests exercise the upstream
  // chain deterministically (no supabase-js calls MSW would flag).
  (p as unknown as { useSupabaseCache: boolean }).useSupabaseCache = false;
  return p;
}

beforeEach(() => {
  resetBreakers();
  resetQuotaStats();
});

describe('getQuote — failover + retry', () => {
  it('retries a Polygon 429, then falls over to Alpaca', async () => {
    let polyHits = 0;
    server.use(
      http.get(POLY_QUOTE, () => {
        polyHits += 1;
        return new HttpResponse('rate limited', { status: 429 });
      }),
      http.get(ALPACA_SNAPSHOT, () => alpacaSnapshotOK(200)),
    );

    const provider = makeProvider();
    const quote = await provider.getQuote('AAPL');

    expect(quote?.last).toBe(200); // came from Alpaca
    expect(polyHits).toBeGreaterThan(1); // 429 was retried before failover
  });

  it('classifies a Polygon 401 as an auth failure and still serves via Alpaca', async () => {
    server.use(
      http.get(POLY_QUOTE, () => new HttpResponse('bad key', { status: 401 })),
      http.get(ALPACA_SNAPSHOT, () => alpacaSnapshotOK(321)),
    );

    const provider = makeProvider();
    const quote = await provider.getQuote('AAPL');

    expect(quote?.last).toBe(321);
    expect(getErrorKindCount('polygon', 'auth')).toBe(1);
  });

  it('does not retry a 401 (single Polygon hit)', async () => {
    let polyHits = 0;
    server.use(
      http.get(POLY_QUOTE, () => {
        polyHits += 1;
        return new HttpResponse('bad key', { status: 401 });
      }),
      http.get(ALPACA_SNAPSHOT, () => alpacaSnapshotOK(100)),
    );

    await makeProvider().getQuote('AAPL');
    expect(polyHits).toBe(1);
  });
});

describe('getQuote — dedup (D3)', () => {
  it('coalesces concurrent same-symbol callers onto one upstream fetch', async () => {
    let polyHits = 0;
    server.use(
      http.get(POLY_QUOTE, async () => {
        polyHits += 1;
        // Small delay so the second caller arrives while the first is inflight.
        await new Promise((r) => setTimeout(r, 20));
        return polygonQuoteAggsOK(150);
      }),
    );

    const provider = makeProvider();
    const [a, b] = await Promise.all([provider.getQuote('AAPL'), provider.getQuote('AAPL')]);

    expect(a?.last).toBe(150);
    expect(b?.last).toBe(150);
    expect(polyHits).toBe(1); // deduped
  });
});

describe('getQuote — circuit breaker (D2)', () => {
  it('skips Polygon entirely once its breaker is open', async () => {
    let polyHits = 0;
    server.use(
      http.get(POLY_QUOTE, () => {
        polyHits += 1;
        return polygonQuoteAggsOK(999);
      }),
      http.get(ALPACA_SNAPSHOT, () => alpacaSnapshotOK(42)),
    );

    // Pre-open the shared polygon breaker (default threshold 5).
    const breaker = getBreaker('polygon');
    for (let i = 0; i < 5; i++) breaker.recordFailure();
    expect(breaker.getState()).toBe('open');

    const quote = await makeProvider().getQuote('AAPL');
    expect(quote?.last).toBe(42); // served by Alpaca
    expect(polyHits).toBe(0); // Polygon never called — breaker open
  });
});

describe('getHistoricalPrices — graceful degradation (C2)', () => {
  it('serves stale cache rows when every provider fails instead of throwing', async () => {
    server.use(
      http.get(POLY_AGGS, () => new HttpResponse('boom', { status: 500 })),
      http.get(ALPACA_BARS, () => new HttpResponse('boom', { status: 500 })),
    );

    const staleRows: Price[] = [
      { symbol: 'AAPL', timestamp: new Date('2026-05-01'), open: 1, high: 2, low: 1, close: 1.5, volume: 100 },
      { symbol: 'AAPL', timestamp: new Date('2026-05-02'), open: 1.5, high: 2.5, low: 1.4, close: 2.0, volume: 120 },
    ];
    const cache = stubCache(staleRows);
    const provider = makeProvider();
    (provider as unknown as { historicalPriceCache: CompositeCache }).historicalPriceCache = cache;

    const prices = await provider.getHistoricalPrices('AAPL', 2);
    expect(prices).toHaveLength(2);
    expect(prices[1].close).toBe(2.0);
    expect(cache.getStalePrices).toHaveBeenCalledWith('AAPL', 2);
  });

  it('throws DataNotAvailableError when providers fail AND no stale cache exists', async () => {
    server.use(
      http.get(POLY_AGGS, () => new HttpResponse('boom', { status: 500 })),
      http.get(ALPACA_BARS, () => new HttpResponse('boom', { status: 500 })),
    );

    const cache = stubCache(null); // no stale rows
    const provider = makeProvider();
    (provider as unknown as { historicalPriceCache: CompositeCache }).historicalPriceCache = cache;

    await expect(provider.getHistoricalPrices('ZZZZ', 2)).rejects.toThrow(/all providers failed/);
  });
});
