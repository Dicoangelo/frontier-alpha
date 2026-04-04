import type { FastifyInstance } from 'fastify';
import type { APIResponse, Quote } from '../types/index.js';

interface RouteContext {
  server: {
    dataProvider: { getQuote(symbol: string): Promise<Quote | null> };
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
