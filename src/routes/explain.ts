import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth.js';
import { subscriptionGate, requirePlan } from '../middleware/subscriptionGate.js';
import { logger } from '../observability/logger.js';
import type { ExplanationRequest, ExplanationType, ExplanationContext, ExplanationResult, TradeReasoningChain } from '../services/ExplanationService.js';
import type { APIResponse, Price } from '../types/index.js';
import { BASE_HISTORY_DAYS } from '../factors/historySlice.js';
import { insightLedger } from '../insights/InsightLedger.js';

interface RouteContext {
  server: {
    dataProvider: { getHistoricalPrices(symbol: string, days: number): Promise<Price[]> };
    factorEngine: { calculateExposures(symbols: string[], prices: Map<string, Price[]>): Promise<Map<string, unknown[]>> };
    explainer: { explainAllocationChange(symbol: string, oldWeight: number, newWeight: number, factors: { old: unknown[]; new: unknown[] }): unknown };
    explanationService: {
      generate(req: ExplanationRequest): Promise<ExplanationResult>;
      explainTrade(symbol: string): Promise<TradeReasoningChain>;
      enrichWithTemporalAnchors(
        context: ExplanationContext,
        symbol: string,
        prices: Map<string, Price[]>,
        factorEngine: { calculateExposures(symbols: string[], prices: Map<string, Price[]>): Promise<Map<string, unknown[]>> },
      ): Promise<ExplanationContext>;
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
          prices.set(s, await server.dataProvider.getHistoricalPrices(s, BASE_HISTORY_DAYS));
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
          error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? `Explanation generation failed: ${error.message}` : 'Explanation generation failed' },
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

        // Temporal grounding (IDEA-CIN-3): when a symbol is present, enrich the
        // context with 5d/30d-prior factor deltas so the LLM reports real
        // trends. Reuses the BASE_HISTORY_DAYS cache key (shared with /factors
        // and /factors/history) so no new Polygon calls are made. Degrades to
        // the single-snapshot prompt on any fetch failure or INSUFFICIENT_DATA.
        let enrichedContext: ExplanationContext = context ?? {};
        if (symbol) {
          try {
            const prices = new Map<string, Price[]>();
            for (const s of [symbol, 'SPY']) {
              prices.set(s, await server.dataProvider.getHistoricalPrices(s, BASE_HISTORY_DAYS));
            }
            enrichedContext = await server.explanationService.enrichWithTemporalAnchors(
              enrichedContext,
              symbol,
              prices,
              server.factorEngine,
            );
          } catch (err) {
            logger.warn({ err, symbol }, 'temporal anchor fetch failed, using single snapshot');
          }
        }

        const result = await server.explanationService.generate({
          type,
          symbol,
          context: enrichedContext,
        });

        // Fire-and-forget provenance write (IDEA-CIN-2). Never blocks or fails
        // the response: the ledger swallows its own errors and no-ops when the
        // table isn't applied yet. The userId is present because this route is
        // behind authMiddleware.
        if (request.user?.id) {
          void insightLedger.record({
            userId: request.user.id,
            prompt: `${type}:${symbol ?? '_portfolio'}`,
            factorsSnapshot: context?.factors ?? {},
            output: typeof result.text === 'string' ? result.text : undefined,
            metadata: result.routing,
          });
        }

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
          error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? `Explanation generation failed: ${error.message}` : 'Explanation generation failed' },
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
          error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? `Trade explanation generation failed: ${error.message}` : 'Trade explanation generation failed' },
        });
      }
    }
  );
}
