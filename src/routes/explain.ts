import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth.js';
import { subscriptionGate, requirePlan } from '../middleware/subscriptionGate.js';
import { logger } from '../observability/logger.js';
import type { ExplanationRequest, ExplanationType } from '../services/ExplanationService.js';
import type { APIResponse, Price } from '../types/index.js';

interface RouteContext {
  server: {
    dataProvider: { getHistoricalPrices(symbol: string, days: number): Promise<Price[]> };
    factorEngine: { calculateExposures(symbols: string[], prices: Map<string, Price[]>): Promise<Map<string, unknown[]>> };
    explainer: { explainAllocationChange(symbol: string, oldWeight: number, newWeight: number, factors: { old: unknown[]; new: unknown[] }): unknown };
    explanationService: {
      generate(req: ExplanationRequest): Promise<{ sources: string[]; [key: string]: unknown }>;
      explainTrade(symbol: string): Promise<{ cached: boolean; [key: string]: unknown }>;
      isLLMEnabled: boolean;
    };
  };
}

export async function explainRoutes(fastify: FastifyInstance, opts: RouteContext) {
  const { server } = opts;

  // Pro-only: auth + subscription gate for all explain routes (GPT-4o usage)
  fastify.addHook('preHandler', authMiddleware);
  fastify.addHook('preHandler', subscriptionGate);
  fastify.addHook('preHandler', requirePlan('pro'));

  // POST /api/v1/portfolio/explain — Cognitive explanation
  fastify.post<{
    Body: {
      symbol: string;
      oldWeight: number;
      newWeight: number;
    };
    Reply: APIResponse<unknown>;
  }>(
    '/api/v1/portfolio/explain',
    async (request, reply) => {
      const start = Date.now();
      const { symbol, oldWeight, newWeight } = request.body;

      try {
        // Get factor exposures
        const prices = new Map<string, Price[]>();
        for (const s of [symbol, 'SPY']) {
          prices.set(s, await server.dataProvider.getHistoricalPrices(s, 252));
        }

        const exposures = await server.factorEngine.calculateExposures([symbol], prices);
        const symbolExposures = exposures.get(symbol) || [];

        // Generate explanation
        const explanation = server.explainer.explainAllocationChange(
          symbol,
          oldWeight,
          newWeight,
          { old: symbolExposures, new: symbolExposures }
        );

        return {
          success: true,
          data: explanation,
          meta: {
            timestamp: new Date(),
            requestId: request.id,
            latencyMs: Date.now() - start,
          },
        };
      } catch (error) {
        logger.error({ err: error }, 'Explanation generation failed');
        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Explanation generation failed' },
        });
      }
    }
  );

  // POST /api/v1/explain — General explanation (LLM + Template)
  const VALID_EXPLANATION_TYPES: ExplanationType[] = [
    'portfolio_move', 'rebalance', 'earnings', 'risk_alert', 'factor_shift',
  ];

  fastify.post<{
    Body: ExplanationRequest;
    Reply: APIResponse<unknown>;
  }>(
    '/api/v1/explain',
    async (request, reply) => {
      const start = Date.now();

      try {
        const { type, symbol, context } = request.body;

        if (!type || !VALID_EXPLANATION_TYPES.includes(type)) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: `Invalid explanation type. Must be one of: ${VALID_EXPLANATION_TYPES.join(', ')}`,
            },
          });
        }

        const result = await server.explanationService.generate({
          type,
          symbol,
          context,
        });

        return {
          success: true,
          data: result,
          meta: {
            timestamp: new Date(),
            requestId: request.id,
            latencyMs: Date.now() - start,
            source: result.sources.includes('ai_model') ? 'llm' : 'template',
            llmEnabled: server.explanationService.isLLMEnabled,
          },
        };
      } catch (error) {
        logger.error({ err: error }, 'Explanation generation failed');
        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Explanation generation failed' },
        });
      }
    }
  );

  // GET /api/v1/explain/trade/:symbol — Trade explanation chain-of-thought
  fastify.get<{
    Params: { symbol: string };
    Reply: APIResponse<unknown>;
  }>(
    '/api/v1/explain/trade/:symbol',
    async (request, reply) => {
      const start = Date.now();
      const { symbol } = request.params;

      if (!symbol || symbol.trim().length === 0) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Symbol is required' },
        });
      }

      try {
        const chain = await server.explanationService.explainTrade(symbol.toUpperCase());

        return {
          success: true,
          data: chain,
          meta: {
            timestamp: new Date(),
            requestId: request.id,
            latencyMs: Date.now() - start,
            cached: chain.cached,
          },
        };
      } catch (error) {
        logger.error({ err: error, symbol }, 'Trade explanation failed');
        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Trade explanation generation failed' },
        });
      }
    }
  );
}
