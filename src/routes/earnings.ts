import type { FastifyInstance } from 'fastify';
import { logger } from '../observability/logger.js';
import type { APIResponse, EarningsImpactForecast, Price } from '../types/index.js';

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
}
