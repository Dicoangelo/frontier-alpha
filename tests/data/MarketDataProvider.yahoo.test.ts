/**
 * Yahoo Finance keyless failover (added 2026-09 after the Polygon Starter plan
 * was cancelled). Pins the chain position — after Polygon/Alpaca, before Alpha
 * Vantage — and the chart-payload parsing for both quotes and daily bars.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../setup.js';

vi.hoisted(() => {
  process.env.SUPABASE_URL ??= 'http://localhost:54321';
  process.env.SUPABASE_SERVICE_KEY ??= 'test-service-key';
});

import { MarketDataProvider } from '../../src/data/MarketDataProvider.js';
import type { CompositeCache } from '../../src/data/cache/index.js';
import { resetBreakers } from '../../src/data/resilience.js';
import { resetQuotaStats, getErrorKindCount } from '../../src/data/QuotaClassifier.js';

const POLY_KEY = 'x'.repeat(32);
const POLY_AGGS = 'https://api.polygon.io/v2/aggs/ticker/:symbol/range/1/day/:from/:to';
const YAHOO_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart/:symbol';
const AV = 'https://www.alphavantage.co/query';

const DAY = 86_400;

/** A Yahoo chart body with `n` daily bars ending at `last`, one null holiday. */
function yahooChart(last: number, n = 5) {
  const now = Math.floor(Date.now() / 1000);
  const timestamp: number[] = [];
  const close: Array<number | null> = [];
  for (let i = n - 1; i >= 0; i--) {
    timestamp.push(now - i * DAY);
    close.push(i === 2 ? null : last - i); // bars: last-4, last-3, null, last-1, last
  }
  return HttpResponse.json({
    chart: {
      result: [
        {
          meta: { symbol: 'AAPL', regularMarketPrice: last, regularMarketTime: now },
          timestamp,
          indicators: { quote: [{ open: close, high: close, low: close, close, volume: close.map(() => 1000) }] },
        },
      ],
      error: null,
    },
  });
}

function stubCache(): CompositeCache {
  return {
    getPrices: vi.fn().mockResolvedValue(null),
    setPrices: vi.fn().mockResolvedValue(undefined),
    getStalePrices: vi.fn().mockResolvedValue(null),
    telemetry: vi.fn(),
    resetCounters: vi.fn(),
  } as unknown as CompositeCache;
}

function makeProvider(overrides: Record<string, unknown> = {}): MarketDataProvider {
  const p = new MarketDataProvider({
    polygonApiKey: POLY_KEY,
    allowMockFallback: false,
    ...overrides,
  });
  (p as unknown as { useSupabaseCache: boolean }).useSupabaseCache = false;
  (p as unknown as { historicalPriceCache: CompositeCache }).historicalPriceCache = stubCache();
  return p;
}

beforeEach(() => {
  resetBreakers();
  resetQuotaStats();
});

describe('Yahoo failover — quotes', () => {
  it('serves a quote from Yahoo when Polygon rejects (free-tier 429), tagged source=yahoo', async () => {
    server.use(
      http.get(POLY_AGGS, () => new HttpResponse('rate limited', { status: 429 })),
      http.get(YAHOO_CHART, () => yahooChart(200)),
    );

    const quote = await makeProvider().getQuote('AAPL');

    expect(quote?.last).toBe(200);
    expect(quote?.source).toBe('yahoo');
    // prior session close is the bar before the latest (199), not the null holiday
    expect(quote?.change).toBeCloseTo(1);
    expect(quote?.changePercent).toBeCloseTo((1 / 199) * 100);
  });

  it('serves a quote from Yahoo on a Polygon plan-tier 403', async () => {
    server.use(
      http.get(POLY_AGGS, () => new HttpResponse('not authorized', { status: 403 })),
      http.get(YAHOO_CHART, () => yahooChart(150)),
    );
    const quote = await makeProvider().getQuote('AAPL');
    expect(quote?.last).toBe(150);
    expect(quote?.source).toBe('yahoo');
  });

  it('is skipped when yahooFallback=false (chain goes straight to Alpha Vantage)', async () => {
    let yahooHits = 0;
    server.use(
      http.get(POLY_AGGS, () => new HttpResponse('rate limited', { status: 429 })),
      http.get(YAHOO_CHART, () => { yahooHits += 1; return yahooChart(200); }),
      http.get(AV, () => HttpResponse.json({ 'Global Quote': { '05. price': '77.5', '09. change': '1', '10. change percent': '1.3%' } })),
    );

    const quote = await makeProvider({ yahooFallback: false, alphaVantageApiKey: 'av' }).getQuote('AAPL');

    expect(yahooHits).toBe(0);
    expect(quote?.last).toBe(77.5);
    expect(quote?.source).toBe('alphaVantage');
  });

  it('records a Yahoo HTTP failure and falls through to Alpha Vantage', async () => {
    server.use(
      http.get(POLY_AGGS, () => new HttpResponse('rate limited', { status: 429 })),
      http.get(YAHOO_CHART, () => new HttpResponse('nope', { status: 500 })),
      http.get(AV, () => HttpResponse.json({ 'Global Quote': { '05. price': '12', '09. change': '0', '10. change percent': '0%' } })),
    );

    const quote = await makeProvider({ alphaVantageApiKey: 'av' }).getQuote('AAPL');

    expect(quote?.source).toBe('alphaVantage');
    expect(getErrorKindCount('yahoo', 'server_fault')).toBe(1);
  });

  it('returns null quote when Yahoo answers with an error body and nothing else is configured', async () => {
    server.use(
      http.get(POLY_AGGS, () => new HttpResponse('rate limited', { status: 429 })),
      http.get(YAHOO_CHART, () => HttpResponse.json({ chart: { result: null, error: { code: 'Not Found' } } })),
    );
    await expect(makeProvider().getQuote('ZZZZ')).rejects.toThrow(/No data providers available/);
  });
});

describe('Yahoo failover — daily bars', () => {
  it('serves chronological bars (null holidays dropped) when Polygon fails', async () => {
    server.use(
      http.get(POLY_AGGS, () => new HttpResponse('rate limited', { status: 429 })),
      http.get(YAHOO_CHART, ({ request }) => {
        expect(new URL(request.url).searchParams.get('range')).toBe('1mo');
        return yahooChart(100, 5);
      }),
    );

    const prices = await makeProvider().getHistoricalPrices('AAPL', 7);

    expect(prices.map((p) => p.close)).toEqual([96, 97, 99, 100]);
    for (let i = 1; i < prices.length; i++) {
      expect(prices[i].timestamp.getTime()).toBeGreaterThan(prices[i - 1].timestamp.getTime());
    }
  });

  it('picks a range wide enough for the requested window', async () => {
    const ranges: string[] = [];
    server.use(
      http.get(POLY_AGGS, () => new HttpResponse('rate limited', { status: 429 })),
      http.get(YAHOO_CHART, ({ request }) => {
        ranges.push(new URL(request.url).searchParams.get('range') ?? '');
        return yahooChart(100, 3);
      }),
    );
    const p = makeProvider();
    await p.getHistoricalPrices('AAPL', 300);
    await p.getHistoricalPrices('MSFT', 252);
    expect(ranges).toEqual(['2y', '2y']);
  });
});
