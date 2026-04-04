import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth.js';
import { subscriptionGate, requirePlan } from '../middleware/subscriptionGate.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { logger } from '../observability/logger.js';
import type { MarketRegime, RegimeDetectionResult } from '../ml/RegimeDetector.js';
import type { FactorAttributionResult } from '../ml/FactorAttribution.js';
import type { ModelStatus, ModelType } from '../ml/TrainingPipeline.js';
import type { Price } from '../types/index.js';

interface RouteContext {
  server: {
    dataProvider: { getHistoricalPrices(symbol: string, days: number): Promise<Price[]> };
    factorEngine: { calculateExposures(symbols: string[], prices: Map<string, Price[]>): Promise<Map<string, Array<{ factor: string; exposure: number }>>> };
    regimeDetector: {
      detectRegime(prices: Price[]): RegimeDetectionResult;
      getTransitionProbabilities(): Array<{ from: MarketRegime; to: Record<MarketRegime, number> }>;
    };
    factorAttribution: {
      calculateAttribution(totalReturn: number, exposures: Record<string, number>, returns: Record<string, number>): FactorAttributionResult;
    };
    useDatabase: boolean;
  };
}

export async function mlRoutes(fastify: FastifyInstance, opts: RouteContext) {
  const { server } = opts;

  // Pro-only: auth + subscription gate for all ML routes
  fastify.addHook('preHandler', authMiddleware);
  fastify.addHook('preHandler', subscriptionGate);
  fastify.addHook('preHandler', requirePlan('pro'));

  // GET /api/v1/ml/regime
  fastify.get<{
    Querystring: { symbols?: string };
  }>(
    '/api/v1/ml/regime',
    async (request, reply) => {
      const start = Date.now();
      const symbolsParam = request.query.symbols || 'SPY';
      const symbol = symbolsParam.split(',')[0].trim().toUpperCase();

      try {
        const prices = await server.dataProvider.getHistoricalPrices(symbol, 252);

        if (!prices || prices.length < 42) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'INSUFFICIENT_DATA',
              message: `Need at least 42 price points for regime detection, got ${prices?.length ?? 0}`,
            },
          });
        }

        const result: RegimeDetectionResult = server.regimeDetector.detectRegime(prices);

        const transitions = server.regimeDetector.getTransitionProbabilities();
        const transitionMap: Record<MarketRegime, Record<MarketRegime, number>> = {} as Record<MarketRegime, Record<MarketRegime, number>>;
        for (const t of transitions) {
          transitionMap[t.from] = t.to;
        }

        return {
          success: true,
          data: {
            regime: result.regime,
            confidence: result.confidence,
            probabilities: result.probabilities,
            transitions: transitionMap,
            symbol,
            timestamp: result.timestamp.toISOString(),
          },
          meta: {
            timestamp: new Date(),
            requestId: request.id,
            latencyMs: Date.now() - start,
          },
        };
      } catch (error) {
        logger.error({ err: error }, 'Regime detection failed');
        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Regime detection failed' },
        });
      }
    }
  );

  // GET /api/v1/ml/attribution
  fastify.get<{
    Querystring: { symbols?: string };
  }>(
    '/api/v1/ml/attribution',
    async (request, reply) => {
      const start = Date.now();
      const symbolsParam = request.query.symbols || 'AAPL,MSFT,GOOGL';
      const symbols = symbolsParam.split(',').map((s: string) => s.trim().toUpperCase()).filter(Boolean);

      try {
        // Fetch prices and compute factor exposures
        const prices = new Map<string, Price[]>();
        for (const s of [...symbols, 'SPY']) {
          const symbolPrices = await server.dataProvider.getHistoricalPrices(s, 300);
          prices.set(s, symbolPrices);
        }

        const exposuresMap = await server.factorEngine.calculateExposures(symbols, prices);

        // Build equal-weight portfolio exposures and factor returns
        const factorExposures: Record<string, number> = {};
        const factorReturns: Record<string, number> = {};

        // Use first symbol's factors as the factor list
        const firstSymbolExposures = exposuresMap.get(symbols[0]);
        if (!firstSymbolExposures || firstSymbolExposures.length === 0) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'INSUFFICIENT_DATA',
              message: 'No factor exposures available for the given symbols',
            },
          });
        }

        for (const fe of firstSymbolExposures) {
          // Average exposure across symbols
          let totalExposure = 0;
          for (const sym of symbols) {
            const symExposures = exposuresMap.get(sym) || [];
            const matching = symExposures.find(e => e.factor === fe.factor);
            totalExposure += matching?.exposure ?? 0;
          }
          factorExposures[fe.factor] = totalExposure / symbols.length;
          // Use factor exposure as proxy for factor return (for demo/mock)
          factorReturns[fe.factor] = (totalExposure / symbols.length) * 0.01;
        }

        // Compute total portfolio return from factor model
        const totalReturn = Object.keys(factorExposures).reduce(
          (sum, f) => sum + factorExposures[f] * factorReturns[f], 0
        );

        const result: FactorAttributionResult = server.factorAttribution.calculateAttribution(
          totalReturn,
          factorExposures,
          factorReturns,
        );

        return {
          success: true,
          data: {
            totalReturn: result.totalReturn,
            factorReturn: result.factorReturn,
            residualReturn: result.residualReturn,
            factors: result.factors,
            waterfall: result.waterfall,
            summary: result.summary,
            symbols,
          },
          meta: {
            timestamp: new Date(),
            requestId: request.id,
            latencyMs: Date.now() - start,
          },
        };
      } catch (error) {
        logger.error({ err: error }, 'Factor attribution failed');
        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Factor attribution failed' },
        });
      }
    }
  );

  // GET /api/v1/ml/models
  fastify.get<{
    Querystring: { type?: string; status?: string };
  }>(
    '/api/v1/ml/models',
    async (request, reply) => {
      const start = Date.now();
      const typeFilter = request.query.type as ModelType | undefined;
      const statusFilter = request.query.status as ModelStatus | undefined;

      try {
        // If using database, fetch from Supabase
        if (server.useDatabase) {
          let query = supabaseAdmin
            .from('frontier_model_versions')
            .select('*')
            .order('trained_at', { ascending: false })
            .limit(50);

          if (typeFilter) {
            query = query.eq('model_type', typeFilter);
          }
          if (statusFilter) {
            query = query.eq('status', statusFilter);
          }

          const { data, error } = await query;

          if (error) {
            logger.error({ err: error }, 'Failed to fetch model versions');
            return reply.status(500).send({
              success: false,
              error: { code: 'DATABASE_ERROR', message: 'Failed to fetch model versions' },
            });
          }

          return {
            success: true,
            data: {
              models: data || [],
              count: data?.length ?? 0,
            },
            meta: {
              timestamp: new Date(),
              requestId: request.id,
              latencyMs: Date.now() - start,
            },
          };
        }

        // Fallback: return in-memory mock model versions
        const mockModels: Array<{
          id: string;
          model_type: ModelType;
          version: string;
          status: ModelStatus;
          metrics: Record<string, number>;
          trained_at: string;
          data_points: number;
        }> = [
          {
            id: 'mv_mock_regime_1',
            model_type: 'regime_detector',
            version: '1.0.0',
            status: 'deployed',
            metrics: { accuracy: 0.72, sharpeImprovement: 0.15, maxDrawdownReduction: 0.03 },
            trained_at: new Date(Date.now() - 86400000).toISOString(),
            data_points: 252,
          },
          {
            id: 'mv_mock_factor_1',
            model_type: 'neural_factor',
            version: '1.0.0',
            status: 'deployed',
            metrics: { momentumMAE: 0.012, informationCoefficient: 0.18 },
            trained_at: new Date(Date.now() - 86400000).toISOString(),
            data_points: 252,
          },
          {
            id: 'mv_mock_regime_0',
            model_type: 'regime_detector',
            version: '0.9.0',
            status: 'archived',
            metrics: { accuracy: 0.65, sharpeImprovement: 0.08, maxDrawdownReduction: 0.01 },
            trained_at: new Date(Date.now() - 172800000).toISOString(),
            data_points: 126,
          },
        ];

        let filteredModels = mockModels;
        if (typeFilter) {
          filteredModels = filteredModels.filter(m => m.model_type === typeFilter);
        }
        if (statusFilter) {
          filteredModels = filteredModels.filter(m => m.status === statusFilter);
        }

        return {
          success: true,
          data: {
            models: filteredModels,
            count: filteredModels.length,
          },
          meta: {
            timestamp: new Date(),
            requestId: request.id,
            latencyMs: Date.now() - start,
          },
        };
      } catch (error) {
        logger.error({ err: error }, 'Failed to fetch model versions');
        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch model versions' },
        });
      }
    }
  );
}
