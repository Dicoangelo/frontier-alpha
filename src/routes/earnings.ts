import type { FastifyInstance } from 'fastify';
import { logger } from '../observability/logger.js';
import { EarningsOracle } from '../earnings/EarningsOracle.js';
import type { APIResponse, EarningsImpactForecast, Price } from '../types/index.js';

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

interface RouteContext {
  server: {
    earningsOracle: {
      getUpcomingEarnings(symbols: string[], days: number): Promise<unknown[]>;
      forecast(symbol: string, earning: unknown, exposures: unknown[]): Promise<EarningsImpactForecast>;
    };
    dataProvider: { getHistoricalPrices(symbol: string, days: number): Promise<Price[]> };
    factorEngine: { calculateExposures(symbols: string[], prices: Map<string, Price[]>): Promise<Map<string, unknown[]>> };
  };
}

export async function earningsRoutes(fastify: FastifyInstance, opts: RouteContext) {
  const { server } = opts;

  // GET /api/v1/earnings/upcoming
  fastify.get<{
    Querystring: { symbols: string };
    Reply: APIResponse<unknown[]>;
  }>(
    '/api/v1/earnings/upcoming',
    async (request, _reply) => {
      const start = Date.now();
      const symbols = request.query.symbols?.split(',') || [
        'AAPL', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'JPM', 'V', 'JNJ', 'UNH'
      ];

      const earnings = await server.earningsOracle.getUpcomingEarnings(symbols, 14);

      return {
        success: true,
        data: earnings,
        meta: {
          timestamp: new Date(),
          requestId: request.id,
          latencyMs: Date.now() - start,
        },
      };
    }
  );

  // GET /api/v1/earnings/forecast/:symbol
  fastify.get<{
    Params: { symbol: string };
    Reply: APIResponse<EarningsImpactForecast>;
  }>(
    '/api/v1/earnings/forecast/:symbol',
    async (request, reply) => {
      const start = Date.now();
      const { symbol } = request.params;

      try {
        // Get upcoming earnings
        const earnings = await server.earningsOracle.getUpcomingEarnings([symbol], 30);
        if (earnings.length === 0) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: `No upcoming earnings for ${symbol}` },
          });
        }

        // Get factor exposures
        const prices = new Map<string, Price[]>();
        for (const s of [symbol, 'SPY']) {
          prices.set(s, await server.dataProvider.getHistoricalPrices(s, 252));
        }
        const exposures = await server.factorEngine.calculateExposures([symbol], prices);

        // Generate forecast
        const forecast = await server.earningsOracle.forecast(
          symbol,
          earnings[0],
          exposures.get(symbol) || []
        );

        return {
          success: true,
          data: forecast,
          meta: {
            timestamp: new Date(),
            requestId: request.id,
            latencyMs: Date.now() - start,
          },
        };
      } catch (error) {
        logger.error({ err: error }, 'Earnings forecast failed');
        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Earnings forecast failed' },
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

      let forecast;
      let source = 'mock';

      const alphaVantageKey = process.env.ALPHA_VANTAGE_API_KEY;
      const polygonKey = process.env.POLYGON_API_KEY;
      const isProduction = process.env.NODE_ENV === 'production';

      if (alphaVantageKey && polygonKey && isProduction) {
        try {
          const oracle = new EarningsOracle(alphaVantageKey, polygonKey);
          // Generate fresh forecast 14 days ahead
          const reportDate = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
          const oracleForecast = await oracle.generateForecast(upperSymbol, reportDate);
          if (oracleForecast) {
            forecast = {
              symbol: upperSymbol,
              ...oracleForecast,
            };
            source = 'oracle';
          }
        } catch (error) {
          logger.warn({ err: error, symbol: upperSymbol }, 'Oracle refresh failed, falling back to mock');
        }
      }

      if (!forecast) {
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

      const alphaVantageKey = process.env.ALPHA_VANTAGE_API_KEY;
      const polygonKey = process.env.POLYGON_API_KEY;
      const isProduction = process.env.NODE_ENV === 'production';

      if (alphaVantageKey && polygonKey && isProduction) {
        try {
          const oracle = new EarningsOracle(alphaVantageKey, polygonKey);
          const historicalReactions = await oracle.getHistoricalReactions(upperSymbol);
          if (historicalReactions && historicalReactions.length > 0) {
            reactions = historicalReactions.map((r: any) => ({
              ...r,
              outcome: r.surprise > 0 ? 'beat' : 'miss',
            }));
            source = 'oracle';
          }
        } catch (error) {
          logger.warn({ err: error, symbol: upperSymbol }, 'Historical reactions fetch failed, falling back to mock');
        }
      }

      if (!reactions) {
        reactions = generateMockHistory(upperSymbol);
      }

      // Calculate summary
      const beats = reactions.filter((r: any) => r.outcome === 'beat');
      const misses = reactions.filter((r: any) => r.outcome === 'miss');
      const allMoves = reactions.map((r: any) => Math.abs(r.priceMove));
      const beatMoves = beats.map((r: any) => Math.abs(r.priceMove));
      const missMoves = misses.map((r: any) => Math.abs(r.priceMove));

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
