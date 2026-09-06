import type { FastifyInstance } from 'fastify';
import { logger } from '../observability/logger.js';
import { EarningsOracle } from '../earnings/EarningsOracle.js';
import type { EarningsCalendar } from '../earnings/EarningsCalendar.js';
import type { APIResponse, Price } from '../types/index.js';
import { BASE_HISTORY_DAYS } from '../factors/historySlice.js';

interface EarningsReaction {
  surprise: number | null;
  priceMove: number | null;
  outcome: 'beat' | 'miss';
  [key: string]: unknown;
}

const refreshCooldowns = new Map<string, number>();
const COOLDOWN_MS = 60_000;

function hashSymbol(symbol: string): number {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) {
    hash = ((hash << 5) - hash) + symbol.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

const TECH_SYMBOLS = new Set(['AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'META', 'NVDA', 'TSM', 'AVGO', 'ORCL', 'CRM', 'ADBE', 'AMD', 'INTC', 'QCOM', 'TXN', 'NFLX', 'PYPL', 'SQ', 'SHOP']);

function generateMockForecast(symbol: string) {
  const hash = hashSymbol(symbol);
  const isTech = TECH_SYMBOLS.has(symbol.toUpperCase());

  const reportDate = new Date(Date.now() + (hash % 30) * 86400000).toISOString().split('T')[0];
  const baseMove = isTech ? 5 + (hash % 5) : 3 + (hash % 4);
  const beatRate = 50 + (hash % 35);
  const direction = beatRate > 65 ? 'up' : beatRate < 45 ? 'down' : 'neutral';
  const confidence = beatRate > 70 ? 'high' : beatRate > 55 ? 'medium' : 'low';

  let recommendation: string;
  if (baseMove > 7) {
    recommendation = 'hedge';
  } else if (baseMove > 5 && beatRate < 55) {
    recommendation = 'reduce';
  } else if (beatRate > 70 && direction === 'up') {
    recommendation = 'add';
  } else {
    recommendation = 'hold';
  }

  return {
    symbol: symbol.toUpperCase(),
    reportDate,
    expectedMove: baseMove,
    beatRate,
    direction,
    confidence,
    recommendation,
    historicalAvgMove: baseMove * 0.85,
    impliedMove: baseMove * 1.1,
    sector: isTech ? 'Technology' : 'General',
  };
}

function generateMockHistory(symbol: string) {
  const hash = hashSymbol(symbol);
  const reactions = [];
  const now = Date.now();

  for (let i = 0; i < 8; i++) {
    const quarterHash = hash + i * 7;
    const beat = (quarterHash % 100) < 60; // ~60% beat rate
    const move = ((quarterHash % 80) / 10) - 4; // -4% to +4%
    const adjustedMove = beat ? Math.abs(move) : -Math.abs(move);

    const date = new Date(now - (i + 1) * 90 * 86400000);
    reactions.push({
      date: date.toISOString().split('T')[0],
      quarter: `Q${4 - (i % 4)} ${date.getFullYear()}`,
      epsEstimate: 1.5 + (quarterHash % 100) / 100,
      epsActual: beat ? 1.5 + (quarterHash % 100) / 100 + 0.05 : 1.5 + (quarterHash % 100) / 100 - 0.03,
      surprise: beat ? 3.2 + (quarterHash % 50) / 10 : -(2.1 + (quarterHash % 40) / 10),
      priceMove: adjustedMove,
      volume: 1000000 + (quarterHash % 5000000),
      outcome: beat ? 'beat' : 'miss',
    });
  }

  return reactions;
}

/** The subset of the real (Alpha Vantage) oracle the routes call. Injectable for tests. */
export interface ForecastOracle {
  generateForecast(symbol: string, reportDate: string): Promise<Record<string, unknown>>;
  getHistoricalReactions(symbol: string): Promise<Array<Record<string, unknown> & { surprise?: number | null }>>;
}

interface RouteContext {
  server: {
    /**
     * Real upcoming-earnings source (see src/earnings/EarningsCalendar.ts).
     * Until 2026-09 this route family read `server.earningsOracle`, the
     * `src/core` class whose calendar is Math.random() and whose "historical
     * reactions" are noise; the Earnings page rendered both as the user's data.
     */
    earningsCalendar: EarningsCalendar;
    dataProvider: { getHistoricalPrices(symbol: string, days: number): Promise<Price[]> };
    factorEngine: { calculateExposures(symbols: string[], prices: Map<string, Price[]>): Promise<Map<string, unknown[]>> };
    /** Test seam — defaults to the real Alpha Vantage + Polygon oracle. */
    createEarningsOracle?: (alphaVantageKey: string, polygonKey: string) => ForecastOracle;
  };
}

const MAX_DAYS_AHEAD = 90;
const DEFAULT_DAYS_AHEAD = 14;

function parseDays(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_DAYS_AHEAD;
  return Math.min(MAX_DAYS_AHEAD, Math.floor(n));
}

/** Production never serves synthesised earnings; dev/test may for local demos. */
function mockAllowed(): boolean {
  return process.env.NODE_ENV !== 'production';
}

export async function earningsRoutes(fastify: FastifyInstance, opts: RouteContext) {
  const { server } = opts;
  const createOracle =
    server.createEarningsOracle ??
    ((av: string, poly: string): ForecastOracle => new EarningsOracle(av, poly) as unknown as ForecastOracle);

  const realOracle = (): ForecastOracle | null => {
    const alphaVantageKey = process.env.ALPHA_VANTAGE_API_KEY;
    const polygonKey = process.env.POLYGON_API_KEY;
    if (!alphaVantageKey || !polygonKey) return null;
    return createOracle(alphaVantageKey, polygonKey);
  };

  // GET /api/v1/earnings/upcoming?symbols=A,B&days=30
  fastify.get<{
    Querystring: { symbols?: string; days?: string; daysAhead?: string };
    Reply: APIResponse<unknown[]>;
  }>(
    '/api/v1/earnings/upcoming',
    async (request, reply) => {
      const start = Date.now();
      const symbols = (request.query.symbols ?? '')
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      if (symbols.length === 0) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'symbols query parameter is required' },
        });
      }
      const days = parseDays(request.query.days ?? request.query.daysAhead);

      const { events, unavailable, source } = await server.earningsCalendar.getUpcoming(symbols, days);

      return {
        success: true,
        data: events,
        meta: {
          source,
          unavailable,
          daysAhead: days,
          timestamp: new Date(),
          requestId: request.id,
          latencyMs: Date.now() - start,
        },
      };
    }
  );

  // GET /api/v1/earnings/forecast/:symbol
  //
  // Report date comes from the real calendar; the forecast from the real
  // oracle (Alpha Vantage quarterly history + Polygon price reactions). If the
  // symbol has no report inside 90 days → 404; if the oracle is not configured
  // or fails in production → 503, never a synthesised forecast.
  fastify.get<{
    Params: { symbol: string };
    Reply: APIResponse<unknown>;
  }>(
    '/api/v1/earnings/forecast/:symbol',
    async (request, reply) => {
      const start = Date.now();
      const symbol = request.params.symbol.trim().toUpperCase();

      try {
        const { events, unavailable } = await server.earningsCalendar.getUpcoming([symbol], MAX_DAYS_AHEAD);
        if (unavailable.includes(symbol)) {
          return reply.status(503).send({
            success: false,
            error: { code: 'CALENDAR_UNAVAILABLE', message: `Earnings calendar unavailable for ${symbol}` },
          });
        }
        const next = events[0];
        if (!next) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: `No upcoming earnings for ${symbol} in the next ${MAX_DAYS_AHEAD} days` },
          });
        }
        const reportDate = next.reportDate.toISOString().slice(0, 10);

        const oracle = realOracle();
        if (oracle) {
          const forecast = await oracle.generateForecast(symbol, reportDate);
          return {
            success: true,
            data: { symbol, ...forecast, reportDate, epsEstimate: next.epsEstimate, reportTime: next.reportTime },
            meta: {
              source: 'oracle',
              timestamp: new Date(),
              requestId: request.id,
              latencyMs: Date.now() - start,
            },
          };
        }

        if (mockAllowed()) {
          return {
            success: true,
            data: { ...generateMockForecast(symbol), reportDate },
            meta: { source: 'mock', timestamp: new Date(), requestId: request.id, latencyMs: Date.now() - start },
          };
        }
        return reply.status(503).send({
          success: false,
          error: { code: 'FORECAST_UNAVAILABLE', message: 'Earnings forecast provider is not configured' },
        });
      } catch (error) {
        logger.error({ err: error, symbol }, 'Earnings forecast failed');
        return reply.status(503).send({
          success: false,
          error: { code: 'FORECAST_UNAVAILABLE', message: 'Earnings forecast failed' },
        });
      }
    }
  );

  // POST /api/v1/earnings/forecast/:symbol/refresh
  fastify.post<{
    Params: { symbol: string };
  }>(
    '/api/v1/earnings/forecast/:symbol/refresh',
    async (request, reply) => {
      const start = Date.now();
      const { symbol } = request.params;

      if (!symbol || symbol.trim().length === 0) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'symbol parameter is required' },
        });
      }

      const upperSymbol = symbol.toUpperCase();

      // Check cooldown
      const lastRefresh = refreshCooldowns.get(upperSymbol) || 0;
      const elapsed = Date.now() - lastRefresh;
      if (elapsed < COOLDOWN_MS) {
        return reply.status(429).send({
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: `Refresh for ${upperSymbol} is on cooldown`,
          },
          meta: { retryAfterMs: COOLDOWN_MS - elapsed },
        });
      }

      refreshCooldowns.set(upperSymbol, Date.now());

      let forecast: Record<string, unknown> | undefined;
      let source = 'mock';

      const oracle = realOracle();
      if (oracle) {
        try {
          // Real report date from the calendar; fall back to +14d only if the
          // calendar has nothing inside 90 days (the forecast itself is real).
          const { events } = await server.earningsCalendar.getUpcoming([upperSymbol], MAX_DAYS_AHEAD);
          const reportDate = events[0]
            ? events[0].reportDate.toISOString().slice(0, 10)
            : new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
          const oracleForecast = await oracle.generateForecast(upperSymbol, reportDate);
          if (oracleForecast) {
            forecast = { symbol: upperSymbol, ...oracleForecast };
            source = 'oracle';
          }
        } catch (error) {
          logger.warn({ err: error, symbol: upperSymbol }, 'Oracle refresh failed');
        }
      }

      if (!forecast) {
        if (!mockAllowed()) {
          return reply.status(503).send({
            success: false,
            error: { code: 'FORECAST_UNAVAILABLE', message: 'Earnings forecast provider unavailable' },
          });
        }
        forecast = generateMockForecast(upperSymbol);
      }

      return {
        success: true,
        data: forecast,
        meta: {
          source,
          refreshed: true,
          timestamp: new Date(),
          requestId: request.id,
          latencyMs: Date.now() - start,
        },
      };
    }
  );

  // GET /api/v1/earnings/history/:symbol
  fastify.get<{
    Params: { symbol: string };
  }>(
    '/api/v1/earnings/history/:symbol',
    async (request, reply) => {
      const start = Date.now();
      const { symbol } = request.params;

      if (!symbol || symbol.trim().length === 0) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'symbol parameter is required' },
        });
      }

      const upperSymbol = symbol.toUpperCase();
      let reactions;
      let source = 'mock';

      const oracle = realOracle();
      if (oracle) {
        try {
          const historicalReactions = await oracle.getHistoricalReactions(upperSymbol);
          if (historicalReactions && historicalReactions.length > 0) {
            reactions = historicalReactions.map((r) => ({
              ...r,
              outcome: (r.surprise ?? 0) > 0 ? 'beat' : 'miss',
            } as EarningsReaction));
            source = 'oracle';
          }
        } catch (error) {
          logger.warn({ err: error, symbol: upperSymbol }, 'Historical reactions fetch failed');
        }
      }

      if (!reactions) {
        if (!mockAllowed()) {
          return reply.status(503).send({
            success: false,
            error: { code: 'HISTORY_UNAVAILABLE', message: 'Earnings history provider unavailable' },
          });
        }
        reactions = generateMockHistory(upperSymbol);
      }

      // Calculate summary
      const beats = (reactions as EarningsReaction[]).filter((r) => r.outcome === 'beat');
      const misses = (reactions as EarningsReaction[]).filter((r) => r.outcome === 'miss');
      const allMoves = (reactions as EarningsReaction[]).map((r) => Math.abs(r.priceMove ?? 0));
      const beatMoves = beats.map((r) => Math.abs(r.priceMove ?? 0));
      const missMoves = misses.map((r) => Math.abs(r.priceMove ?? 0));

      const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

      const summary = {
        quarters: reactions.length,
        beatRate: reactions.length > 0 ? Math.round((beats.length / reactions.length) * 100) : 0,
        avgMove: Math.round(avg(allMoves) * 100) / 100,
        avgBeatMove: Math.round(avg(beatMoves) * 100) / 100,
        avgMissMove: Math.round(avg(missMoves) * 100) / 100,
      };

      return {
        success: true,
        data: {
          symbol: upperSymbol,
          reactions,
          summary,
        },
        meta: {
          source,
          timestamp: new Date(),
          requestId: request.id,
          latencyMs: Date.now() - start,
        },
      };
    }
  );
}
