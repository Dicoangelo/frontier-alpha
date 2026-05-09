import type { FastifyInstance } from 'fastify';
import { logger } from '../observability/logger.js';
import type { APIResponse, Price, Quote } from '../types/index.js';

interface RouteContext {
  server: {
    dataProvider: {
      getQuote(symbol: string): Promise<Quote | null>;
      getHistoricalPrices(symbol: string, days: number): Promise<Price[]>;
    };
  };
}

export async function quotesRoutes(fastify: FastifyInstance, opts: RouteContext) {
  const { server } = opts;

  // Batch quote stream — must be registered before :symbol to avoid route conflict
  fastify.get<{
    Querystring: { symbols: string; sse?: string };
  }>(
    '/api/v1/quotes/stream',
    async (request, reply) => {
      const symbolsParam = request.query.symbols;
      if (!symbolsParam) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Symbols parameter is required' },
        });
      }

      const symbols = symbolsParam.split(',').map((s: string) => s.trim().toUpperCase()).filter(Boolean);
      const quotes: Quote[] = [];

      for (const symbol of symbols) {
        try {
          const quote = await server.dataProvider.getQuote(symbol);
          if (quote) quotes.push(quote);
        } catch {
          // Skip symbols that fail
        }
      }

      return reply.send({
        success: true,
        data: quotes,
        meta: {
          timestamp: new Date().toISOString(),
          source: 'fastify',
          count: quotes.length,
        },
      });
    }
  );

  // GET /api/v1/quotes/:symbol/history?days=7
  // Returns the last N daily closes for a symbol — used by HoldingsTable sparkline.
  fastify.get<{
    Params: { symbol: string };
    Querystring: { days?: string };
    Reply: APIResponse<{ symbol: string; closes: number[]; timestamps: string[] }>;
  }>(
    '/api/v1/quotes/:symbol/history',
    async (request, reply) => {
      const start = Date.now();
      const { symbol } = request.params;
      const daysParam = Number(request.query.days);
      const days = Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 365
        ? Math.floor(daysParam)
        : 7;

      try {
        const prices = await server.dataProvider.getHistoricalPrices(symbol, days);
        if (!prices || prices.length === 0) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: `No historical prices for ${symbol}` },
          });
        }

        // Trim to requested window (provider may return more than asked)
        const window = prices.slice(-days);
        const closes = window.map((p) => p.close);
        const timestamps = window.map((p) =>
          p.timestamp instanceof Date ? p.timestamp.toISOString() : String(p.timestamp)
        );

        return {
          success: true,
          data: { symbol: symbol.toUpperCase(), closes, timestamps },
          meta: {
            timestamp: new Date(),
            requestId: request.id,
            latencyMs: Date.now() - start,
          },
        };
      } catch (err) {
        logger.warn({ err, symbol, days }, 'quotes/history: fetch failed');
        return reply.status(502).send({
          success: false,
          error: { code: 'UPSTREAM_ERROR', message: `Failed to fetch history for ${symbol}` },
        });
      }
    }
  );

  // GET /api/v1/quotes/:symbol
  fastify.get<{
    Params: { symbol: string };
    Reply: APIResponse<Quote>;
  }>(
    '/api/v1/quotes/:symbol',
    async (request, reply) => {
      const start = Date.now();
      const { symbol } = request.params;

      const quote = await server.dataProvider.getQuote(symbol);

      if (!quote) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: `No quote found for ${symbol}` },
        });
      }

      return {
        success: true,
        data: quote,
        meta: {
          timestamp: new Date(),
          requestId: request.id,
          latencyMs: Date.now() - start,
        },
      };
    }
  );
}
