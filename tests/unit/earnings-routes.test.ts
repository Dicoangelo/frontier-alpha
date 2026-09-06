/**
 * Proof-of-test for the earnings routes: /upcoming must reflect the REAL
 * calendar (pre-fix it returned Math.random() events from the core oracle) and
 * /forecast must use the calendar's report date + the real oracle, with 404 /
 * 503 instead of synthesised data.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';

vi.hoisted(() => {
  process.env.SUPABASE_URL ??= 'http://localhost:54321';
  process.env.SUPABASE_SERVICE_KEY ??= 'test-service-key';
});

import { earningsRoutes } from '../../src/routes/earnings.js';
import { EarningsCalendar } from '../../src/earnings/EarningsCalendar.js';

const CSV_HEADER = 'symbol,name,reportDate,fiscalDateEnding,estimate,currency,timeOfTheDay';
const csv = (rows: string[]) => [CSV_HEADER, ...rows].join('\n') + '\n';
const NOW = new Date('2026-09-06T12:00:00Z');

function calendarWith(bodies: Record<string, string>) {
  const fetchImpl = (async (url: string) => {
    const symbol = new URL(url).searchParams.get('symbol') ?? '';
    return new Response(bodies[symbol] ?? csv([]), { status: 200 });
  }) as unknown as typeof fetch;
  return new EarningsCalendar({ apiKey: 'k', fetchImpl, now: () => NOW });
}

async function build(calendar: EarningsCalendar, oracle?: { generateForecast: ReturnType<typeof vi.fn> }) {
  const app = Fastify();
  await app.register(earningsRoutes, {
    server: {
      earningsCalendar: calendar,
      dataProvider: { getHistoricalPrices: vi.fn(async () => []) },
      factorEngine: { calculateExposures: vi.fn(async () => new Map()) },
      createEarningsOracle: oracle
        ? () => ({ generateForecast: oracle.generateForecast, getHistoricalReactions: vi.fn(async () => []) })
        : undefined,
    },
  } as never);
  return app;
}

const ENV = { ...process.env };
beforeEach(() => {
  process.env.NODE_ENV = 'production';
  process.env.ALPHA_VANTAGE_API_KEY = 'av';
  process.env.POLYGON_API_KEY = 'poly';
});
afterEach(() => {
  process.env.NODE_ENV = ENV.NODE_ENV;
  process.env.ALPHA_VANTAGE_API_KEY = ENV.ALPHA_VANTAGE_API_KEY;
  process.env.POLYGON_API_KEY = ENV.POLYGON_API_KEY;
});

describe('GET /api/v1/earnings/upcoming', () => {
  it('returns the calendar events with provenance, never a random event', async () => {
    const app = await build(calendarWith({
      NVDA: csv(['NVDA,NVIDIA,2026-09-10,2026-07-31,1.10,USD,post-market']),
      AAPL: csv([]),
    }));
    const res = await app.inject({ method: 'GET', url: '/api/v1/earnings/upcoming?symbols=NVDA,AAPL&days=30' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ symbol: 'NVDA', epsEstimate: 1.1, source: 'alphaVantage', reportTime: 'post_market' });
    expect(body.data[0].reportDate).toBe('2026-09-10T00:00:00.000Z');
    expect(body.meta).toMatchObject({ source: 'alphaVantage', unavailable: [], daysAhead: 30 });
    // Same request twice → identical (a random calendar fails this).
    const again = await app.inject({ method: 'GET', url: '/api/v1/earnings/upcoming?symbols=NVDA,AAPL&days=30' });
    expect(again.json().data).toEqual(body.data);
  });

  it('400s without symbols and lists unresolvable symbols in meta.unavailable', async () => {
    const app = await build(calendarWith({ AMZN: '{"Information":"rate limit"}' }));
    expect((await app.inject({ method: 'GET', url: '/api/v1/earnings/upcoming' })).statusCode).toBe(400);
    const res = await app.inject({ method: 'GET', url: '/api/v1/earnings/upcoming?symbols=AMZN' });
    expect(res.json()).toMatchObject({ success: true, data: [], meta: { unavailable: ['AMZN'] } });
  });
});

describe('GET /api/v1/earnings/forecast/:symbol', () => {
  it('forecasts against the calendar report date via the real oracle', async () => {
    const generateForecast = vi.fn(async (_s: string, reportDate: string) => ({ expectedMove: 0.05, beatRate: 70, reportDate }));
    const app = await build(calendarWith({ GOOGL: csv(['GOOGL,ALPHABET,2026-10-28,2026-09-30,3.02,USD,post-market']) }), { generateForecast });
    const res = await app.inject({ method: 'GET', url: '/api/v1/earnings/forecast/googl' });
    expect(res.statusCode).toBe(200);
    expect(generateForecast).toHaveBeenCalledWith('GOOGL', '2026-10-28');
    expect(res.json().data).toMatchObject({ symbol: 'GOOGL', reportDate: '2026-10-28', epsEstimate: 3.02, beatRate: 70 });
    expect(res.json().meta.source).toBe('oracle');
  });

  it('404s when nothing is scheduled and 503s (no mock) when the oracle is unconfigured in production', async () => {
    const generateForecast = vi.fn();
    const app = await build(calendarWith({ AAPL: csv([]) }), { generateForecast });
    expect((await app.inject({ method: 'GET', url: '/api/v1/earnings/forecast/AAPL' })).statusCode).toBe(404);

    delete process.env.ALPHA_VANTAGE_API_KEY;
    const app2 = await build(calendarWith({ MSFT: csv(['MSFT,MICROSOFT,2026-10-22,2026-09-30,3.40,USD,post-market']) }));
    const res = await app2.inject({ method: 'GET', url: '/api/v1/earnings/forecast/MSFT' });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('FORECAST_UNAVAILABLE');
  });
});
