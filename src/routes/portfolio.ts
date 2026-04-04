import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth.js';
import { portfolioService } from '../services/PortfolioService.js';
import { logger } from '../observability/logger.js';
import type { APIResponse, OptimizationConfig, Price } from '../types/index.js';

interface RouteContext {
  server: {
    dataProvider: { getQuote(symbol: string): Promise<{ last: number } | null>; getHistoricalPrices(symbol: string, days: number): Promise<Price[]> };
    optimizer: { optimize(symbols: string[], prices: Map<string, Price[]>, config: OptimizationConfig): Promise<{ weights: Map<string, number>; [key: string]: unknown }> };
    factorEngine: { calculateExposures(symbols: string[], prices: Map<string, Price[]>): Promise<Map<string, unknown[]>> };
    currentPortfolio: unknown;
    useDatabase: boolean;
  };
}

export async function portfolioRoutes(fastify: FastifyInstance, opts: RouteContext) {
  const { server } = opts;

  // GET /api/v1/portfolio
  fastify.get<{ Reply: APIResponse<unknown> }>(
    '/api/v1/portfolio',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const start = Date.now();

      // If using database and user is authenticated
      if (server.useDatabase && request.user) {
        const dbPortfolio = await portfolioService.getPortfolio(request.user.id);

        if (!dbPortfolio) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'No portfolio found' },
          });
        }

        // Get current quotes for positions
        const quotes = new Map<string, number>();
        for (const position of dbPortfolio.positions) {
          const quote = await server.dataProvider.getQuote(position.symbol);
          if (quote) {
            quotes.set(position.symbol, quote.last);
          }
        }

        const portfolio = portfolioService.toAPIFormat(dbPortfolio, quotes);

        return {
          success: true,
          data: portfolio,
          meta: {
            timestamp: new Date(),
            requestId: request.id,
            latencyMs: Date.now() - start,
          },
        };
      }

      // Fallback to in-memory portfolio
      if (!server.currentPortfolio) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'No portfolio configured' },
        });
      }

      return {
        success: true,
        data: server.currentPortfolio,
        meta: {
          timestamp: new Date(),
          requestId: request.id,
          latencyMs: Date.now() - start,
        },
      };
    }
  );

  // POST /api/v1/portfolio/positions — Add position
  fastify.post<{
    Body: { symbol: string; shares: number; avgCost: number };
    Reply: APIResponse<unknown>;
  }>(
    '/api/v1/portfolio/positions',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const start = Date.now();
      const { symbol, shares, avgCost } = request.body;

      try {
        const position = await portfolioService.addPosition(
          request.user.id,
          symbol,
          shares,
          avgCost
        );

        if (!position) {
          return reply.status(400).send({
            success: false,
            error: { code: 'BAD_REQUEST', message: 'Failed to add position' },
          });
        }

        return {
          success: true,
          data: position,
          meta: {
            timestamp: new Date(),
            requestId: request.id,
            latencyMs: Date.now() - start,
          },
        };
      } catch (error) {
        logger.error({ err: error }, 'Failed to add position');
        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
        });
      }
    }
  );

  // PUT /api/v1/portfolio/positions/:id — Update position
  fastify.put<{
    Params: { id: string };
    Body: { shares: number; avgCost: number };
    Reply: APIResponse<unknown>;
  }>(
    '/api/v1/portfolio/positions/:id',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const start = Date.now();
      const { id } = request.params;
      const { shares, avgCost } = request.body;

      try {
        const position = await portfolioService.updatePosition(
          request.user.id,
          id,
          shares,
          avgCost
        );

        if (!position) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Position not found' },
          });
        }

        return {
          success: true,
          data: position,
          meta: {
            timestamp: new Date(),
            requestId: request.id,
            latencyMs: Date.now() - start,
          },
        };
      } catch (error) {
        logger.error({ err: error }, 'Failed to update position');
        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
        });
      }
    }
  );

  // DELETE /api/v1/portfolio/positions/:id — Delete position
  fastify.delete<{
    Params: { id: string };
    Reply: APIResponse<{ deleted: boolean }>;
  }>(
    '/api/v1/portfolio/positions/:id',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const start = Date.now();
      const { id } = request.params;

      try {
        const deleted = await portfolioService.deletePosition(request.user.id, id);

        if (!deleted) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Position not found' },
          });
        }

        return {
          success: true,
          data: { deleted: true },
          meta: {
            timestamp: new Date(),
            requestId: request.id,
            latencyMs: Date.now() - start,
          },
        };
      } catch (error) {
        logger.error({ err: error }, 'Failed to delete position');
        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
        });
      }
    }
  );

  // POST /api/v1/portfolio/optimize
  fastify.post<{
    Body: { symbols: string[]; config: OptimizationConfig };
  }>(
    '/api/v1/portfolio/optimize',
    async (request, reply) => {
      const start = Date.now();
      const { symbols, config } = request.body;

      try {
        // Fetch prices for all symbols
        const prices = new Map<string, Price[]>();
        for (const symbol of [...symbols, 'SPY']) {
          const symbolPrices = await server.dataProvider.getHistoricalPrices(symbol, 252);
          prices.set(symbol, symbolPrices);
        }

        // Run optimization
        const result = await server.optimizer.optimize(symbols, prices, config);

        return {
          success: true,
          data: {
            ...result,
            weights: Object.fromEntries(result.weights) as unknown as Record<string, number>,
          },
          meta: {
            timestamp: new Date(),
            requestId: request.id,
            latencyMs: Date.now() - start,
          },
        };
      } catch (error) {
        logger.error({ err: error }, 'Portfolio optimization failed');
        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Portfolio optimization failed' },
        });
      }
    }
  );

  // GET /api/v1/portfolio/factors/:symbols
  fastify.get<{
    Params: { symbols: string };
    Reply: APIResponse<unknown>;
  }>(
    '/api/v1/portfolio/factors/:symbols',
    async (request, reply) => {
      const start = Date.now();
      const symbols = request.params.symbols.split(',');

      try {
        const prices = new Map<string, Price[]>();
        // Request 300 days to ensure enough data for momentum calculations (need 252 + 21 + buffer)
        for (const symbol of [...symbols, 'SPY']) {
          const symbolPrices = await server.dataProvider.getHistoricalPrices(symbol, 300);
          prices.set(symbol, symbolPrices);
        }

        const exposures = await server.factorEngine.calculateExposures(symbols, prices);

        return {
          success: true,
          data: Object.fromEntries(exposures),
          meta: {
            timestamp: new Date(),
            requestId: request.id,
            latencyMs: Date.now() - start,
          },
        };
      } catch (error) {
        logger.error({ err: error }, 'Factor calculation failed');
        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Factor calculation failed' },
        });
      }
    }
  );
}
