import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth.js';
import { subscriptionGate, requirePlan } from '../middleware/subscriptionGate.js';
import { getCVRFRiskAssessment } from '../cvrf/integration.js';
import { logger } from '../observability/logger.js';
import { FACTOR_DEFINITIONS } from '../factors/FactorEngine.js';
import * as persistence from '../cvrf/persistence.js';
import type { APIResponse } from '../types/index.js';
import type { PersistentCVRFManager } from '../cvrf/PersistentCVRFManager.js';

interface RouteContext {
  server: {
    cvrfManager: PersistentCVRFManager;
  };
}

export async function cvrfRoutes(fastify: FastifyInstance, opts: RouteContext) {
  const { server } = opts;

  // Pro-only: auth + subscription gate for all CVRF routes
  fastify.addHook('preHandler', authMiddleware);
  fastify.addHook('preHandler', subscriptionGate);
  fastify.addHook('preHandler', requirePlan('pro'));

  // GET /api/v1/cvrf/beliefs
  fastify.get<{ Reply: APIResponse<unknown> }>(
    '/api/v1/cvrf/beliefs',
    async (request, _reply) => {
      const start = Date.now();
      const beliefs = server.cvrfManager.getCurrentBeliefs();

      return {
        success: true,
        data: {
          ...beliefs,
          factorWeights: Object.fromEntries(beliefs.factorWeights),
          factorConfidences: Object.fromEntries(beliefs.factorConfidences),
        },
        meta: {
          timestamp: new Date(),
          requestId: request.id,
          latencyMs: Date.now() - start,
        },
      };
    }
  );

  // POST /api/v1/cvrf/episode/start
  fastify.post<{ Reply: APIResponse<unknown> }>(
    '/api/v1/cvrf/episode/start',
    async (request, _reply) => {
      const start = Date.now();
      const episode = await server.cvrfManager.startEpisode();

      return {
        success: true,
        data: {
          id: episode.id,
          episodeNumber: episode.episodeNumber ?? 0,
          startDate: episode.startDate,
          message: 'CVRF episode started. Record decisions and close when complete.',
        },
        meta: {
          timestamp: new Date(),
          requestId: request.id,
          latencyMs: Date.now() - start,
        },
      };
    }
  );

  // POST /api/v1/cvrf/episode/close
  fastify.post<{
    Body: {
      runCvrfCycle?: boolean;
      metrics?: {
        portfolioReturn?: number;
        sharpeRatio?: number;
        maxDrawdown?: number;
        volatility?: number;
      };
    };
    Reply: APIResponse<unknown>;
  }>(
    '/api/v1/cvrf/episode/close',
    async (request, reply) => {
      const start = Date.now();
      const { runCvrfCycle = true, metrics } = request.body || {};

      try {
        const { episode, cvrfResult } = await server.cvrfManager.closeEpisode(
          metrics,
          runCvrfCycle
        );

        return {
          success: true,
          data: {
            episode: {
              id: episode.id,
              episodeNumber: episode.episodeNumber ?? 0,
              startDate: episode.startDate,
              endDate: episode.endDate,
              decisionsCount: episode.decisions.length,
              portfolioReturn: episode.portfolioReturn,
              sharpeRatio: episode.sharpeRatio,
            },
            cvrfResult: cvrfResult ? {
              performanceDelta: cvrfResult.episodeComparison.performanceDelta,
              decisionOverlap: cvrfResult.episodeComparison.decisionOverlap,
              insightsExtracted: cvrfResult.extractedInsights.length,
              beliefUpdates: cvrfResult.beliefUpdates.length,
              newRegime: cvrfResult.newBeliefState.currentRegime,
            } : null,
          },
          meta: {
            timestamp: new Date(),
            requestId: request.id,
            latencyMs: Date.now() - start,
          },
        };
      } catch (error) {
        logger.error({ err: error }, 'CVRF episode close failed');
        return reply.status(400).send({
          success: false,
          error: { code: 'BAD_REQUEST', message: 'Failed to close CVRF episode' },
        });
      }
    }
  );

  // POST /api/v1/cvrf/decision
  fastify.post<{
    Body: {
      symbol: string;
      action: 'buy' | 'sell' | 'hold' | 'rebalance';
      weightBefore: number;
      weightAfter: number;
      reason: string;
      confidence: number;
      factors?: Array<{ factor: string; exposure: number; tStat: number; confidence: number; contribution: number }>;
    };
    Reply: APIResponse<unknown>;
  }>(
    '/api/v1/cvrf/decision',
    async (request, reply) => {
      const start = Date.now();
      const { symbol, action, weightBefore, weightAfter, reason, confidence, factors } = request.body;

      try {
        const decision = await server.cvrfManager.recordDecision({
          timestamp: new Date(),
          symbol,
          action,
          weightBefore,
          weightAfter,
          reason,
          confidence,
          factors: factors || [],
        });

        return {
          success: true,
          data: decision,
          meta: {
            timestamp: new Date(),
            requestId: request.id,
            latencyMs: Date.now() - start,
          },
        };
      } catch (error) {
        logger.error({ err: error }, 'Failed to record decision');
        return reply.status(400).send({
          success: false,
          error: { code: 'BAD_REQUEST', message: 'Failed to record trading decision' },
        });
      }
    }
  );

  // GET /api/v1/cvrf/constraints
  fastify.get<{ Reply: APIResponse<unknown> }>(
    '/api/v1/cvrf/constraints',
    async (request, _reply) => {
      const start = Date.now();
      const constraints = server.cvrfManager.getOptimizationConstraints();

      return {
        success: true,
        data: {
          ...constraints,
          factorTargets: Object.fromEntries(constraints.factorTargets),
        },
        meta: {
          timestamp: new Date(),
          requestId: request.id,
          latencyMs: Date.now() - start,
        },
      };
    }
  );

  // POST /api/v1/cvrf/risk
  fastify.post<{
    Body: {
      portfolioValue: number;
      portfolioReturns: number[];
      positions: Array<{ symbol: string; weight: number }>;
    };
    Reply: APIResponse<unknown>;
  }>(
    '/api/v1/cvrf/risk',
    async (request, _reply) => {
      const start = Date.now();
      const { portfolioValue, portfolioReturns, positions } = request.body;

      const assessment = getCVRFRiskAssessment(
        portfolioValue,
        portfolioReturns || [],
        positions,
        server.cvrfManager as any
      );

      // Serialize Maps in overEpisode to plain objects (matches Vercel surface)
      const serializedAssessment = {
        ...assessment,
        overEpisode: {
          ...assessment.overEpisode,
          metaPrompt: {
            ...assessment.overEpisode.metaPrompt,
            factorAdjustments: assessment.overEpisode.metaPrompt.factorAdjustments instanceof Map
              ? Object.fromEntries(assessment.overEpisode.metaPrompt.factorAdjustments)
              : assessment.overEpisode.metaPrompt.factorAdjustments,
          },
          beliefDeltas: assessment.overEpisode.beliefDeltas instanceof Map
            ? Object.fromEntries(assessment.overEpisode.beliefDeltas)
            : assessment.overEpisode.beliefDeltas,
        },
      };

      return {
        success: true,
        data: serializedAssessment,
        meta: {
          timestamp: new Date(),
          requestId: request.id,
          latencyMs: Date.now() - start,
        },
      };
    }
  );

  // GET /api/v1/cvrf/history
  fastify.get<{ Reply: APIResponse<unknown> }>(
    '/api/v1/cvrf/history',
    async (request, _reply) => {
      const start = Date.now();
      const history = server.cvrfManager.getCycleHistory();

      return {
        success: true,
        data: history.map(cycle => ({
          timestamp: cycle.timestamp,
          previousEpisodeReturn: cycle.episodeComparison.previousEpisodeReturn,
          currentEpisodeReturn: cycle.episodeComparison.currentEpisodeReturn,
          performanceDelta: cycle.episodeComparison.performanceDelta,
          decisionOverlap: cycle.episodeComparison.decisionOverlap,
          insightsCount: cycle.extractedInsights.length,
          beliefUpdatesCount: cycle.beliefUpdates.length,
          newRegime: cycle.newBeliefState.currentRegime,
        })),
        meta: {
          timestamp: new Date(),
          requestId: request.id,
          latencyMs: Date.now() - start,
        },
      };
    }
  );

  // GET /api/v1/cvrf/belief-history
  fastify.get<{ Reply: APIResponse<unknown> }>(
    '/api/v1/cvrf/belief-history',
    async (request, _reply) => {
      const start = Date.now();
      const history = server.cvrfManager.getCycleHistory();

      const beliefSnapshots = history.map((cycle, index) => {
        const fw = cycle.newBeliefState.factorWeights;
        const fc = cycle.newBeliefState.factorConfidences;
        return {
          cycleNumber: index + 1,
          timestamp: cycle.timestamp,
          factorWeights: Object.fromEntries(fw instanceof Map ? fw : Object.entries(fw || {})),
          factorConfidences: Object.fromEntries(fc instanceof Map ? fc : Object.entries(fc || {})),
          regime: cycle.newBeliefState.currentRegime,
          regimeConfidence: cycle.newBeliefState.regimeConfidence,
          riskTolerance: cycle.newBeliefState.riskTolerance,
          volatilityTarget: cycle.newBeliefState.volatilityTarget,
          beliefUpdates: cycle.beliefUpdates.map(u => ({
            field: u.field,
            oldValue: u.oldValue,
            newValue: u.newValue,
            learningRate: u.learningRate,
          })),
          insights: cycle.extractedInsights.map(i => ({
            type: i.type,
            concept: i.concept,
            confidence: i.confidence,
          })),
        };
      });

      const factors = new Set<string>();
      for (const snap of beliefSnapshots) {
        for (const key of Object.keys(snap.factorWeights)) {
          factors.add(key);
        }
      }

      let regimeTransitions = 0;
      for (let i = 1; i < beliefSnapshots.length; i++) {
        if (beliefSnapshots[i].regime !== beliefSnapshots[i - 1].regime) {
          regimeTransitions++;
        }
      }

      return {
        success: true,
        data: {
          beliefSnapshots,
          totalCycles: beliefSnapshots.length,
          factors: Array.from(factors),
          regimeTransitions,
        },
        meta: {
          timestamp: new Date(),
          requestId: request.id,
          latencyMs: Date.now() - start,
        },
      };
    }
  );

  // GET /api/v1/cvrf/beliefs/current
  fastify.get<{ Reply: APIResponse<unknown> }>(
    '/api/v1/cvrf/beliefs/current',
    async (request, _reply) => {
      const start = Date.now();
      const currentBeliefs = server.cvrfManager.getCurrentBeliefs();
      const fw = currentBeliefs.factorWeights instanceof Map
        ? currentBeliefs.factorWeights
        : new Map(Object.entries(currentBeliefs.factorWeights || {}));
      const fc = currentBeliefs.factorConfidences instanceof Map
        ? currentBeliefs.factorConfidences
        : new Map(Object.entries(currentBeliefs.factorConfidences || {}));

      const neutralWeight = 0.2;
      const neutralThreshold = 0.03;

      const beliefs = FACTOR_DEFINITIONS.map(def => {
        const weight = fw.get(def.name) ?? neutralWeight;
        const confidence = fc.get(def.name) ?? 0.5;
        let direction: 'bullish' | 'bearish' | 'neutral' = 'neutral';
        if ((weight as number) > neutralWeight + neutralThreshold) direction = 'bullish';
        else if ((weight as number) < neutralWeight - neutralThreshold) direction = 'bearish';

        return {
          factorId: def.name,
          factorName: def.description,
          category: def.category,
          conviction: confidence,
          direction,
        };
      });

      // Add regime meta-factor
      beliefs.push({
        factorId: 'regime',
        factorName: 'Market Regime',
        category: 'macro' as any,
        conviction: currentBeliefs.regimeConfidence ?? 0.5,
        direction: 'neutral',
      });

      // Add risk parameter factors
      const riskFactors = [
        { id: 'risk_tolerance', name: 'Risk Tolerance', value: currentBeliefs.riskTolerance },
        { id: 'volatility_target', name: 'Volatility Target', value: currentBeliefs.volatilityTarget },
        { id: 'max_drawdown_limit', name: 'Max Drawdown Limit', value: (currentBeliefs as any).maxDrawdownLimit },
        { id: 'position_size_limit', name: 'Position Size Limit', value: (currentBeliefs as any).positionSizeLimit },
        { id: 'sector_concentration', name: 'Sector Concentration', value: (currentBeliefs as any).sectorConcentration },
        { id: 'turnover_limit', name: 'Turnover Limit', value: (currentBeliefs as any).turnoverLimit },
        { id: 'tracking_error', name: 'Tracking Error', value: (currentBeliefs as any).trackingError },
        { id: 'leverage_limit', name: 'Leverage Limit', value: (currentBeliefs as any).leverageLimit },
      ];

      for (const rf of riskFactors) {
        beliefs.push({
          factorId: rf.id,
          factorName: rf.name,
          category: 'risk' as any,
          conviction: rf.value ?? 0.5,
          direction: 'neutral',
        });
      }

      return {
        success: true,
        data: {
          beliefs,
          totalFactors: beliefs.length,
          regime: {
            current: currentBeliefs.currentRegime,
            confidence: currentBeliefs.regimeConfidence,
          },
          beliefVersion: currentBeliefs.updatedAt || new Date().toISOString(),
        },
        meta: {
          timestamp: new Date(),
          requestId: request.id,
          latencyMs: Date.now() - start,
        },
      };
    }
  );

  // GET /api/v1/cvrf/beliefs/correlations
  fastify.get<{ Reply: APIResponse<unknown> }>(
    '/api/v1/cvrf/beliefs/correlations',
    async (request, _reply) => {
      const start = Date.now();
      const history = server.cvrfManager.getCycleHistory();

      function pearsonCorrelation(x: number[], y: number[]): number {
        const n = x.length;
        if (n < 2) return 0;
        const meanX = x.reduce((a, b) => a + b, 0) / n;
        const meanY = y.reduce((a, b) => a + b, 0) / n;
        let num = 0, denX = 0, denY = 0;
        for (let i = 0; i < n; i++) {
          const dx = x[i] - meanX;
          const dy = y[i] - meanY;
          num += dx * dy;
          denX += dx * dx;
          denY += dy * dy;
        }
        const den = Math.sqrt(denX * denY);
        return den === 0 ? 0 : num / den;
      }

      // Build time series per factor
      const factorSeries: Record<string, number[]> = {};
      for (const cycle of history) {
        const fw = cycle.newBeliefState.factorWeights;
        const weights = Object.fromEntries(fw instanceof Map ? fw : Object.entries(fw || {}));
        for (const [factor, weight] of Object.entries(weights)) {
          if (!factorSeries[factor]) factorSeries[factor] = [];
          factorSeries[factor].push(weight as number);
        }
      }

      const factors = Object.keys(factorSeries);
      // Pad to uniform length
      const maxLen = Math.max(...factors.map(f => factorSeries[f].length), 0);
      for (const f of factors) {
        while (factorSeries[f].length < maxLen) {
          factorSeries[f].push(0.2); // neutral weight as default
        }
      }

      // Compute full symmetric matrix
      const matrix: Record<string, Record<string, number>> = {};
      for (const f1 of factors) {
        matrix[f1] = {};
        for (const f2 of factors) {
          matrix[f1][f2] = f1 === f2 ? 1.0 : pearsonCorrelation(factorSeries[f1], factorSeries[f2]);
        }
      }

      // Top strong correlations (abs > 0.5)
      const strongCorrelations: Array<{ factor1: string; factor2: string; correlation: number }> = [];
      for (let i = 0; i < factors.length; i++) {
        for (let j = i + 1; j < factors.length; j++) {
          const corr = matrix[factors[i]][factors[j]];
          if (Math.abs(corr) > 0.5) {
            strongCorrelations.push({
              factor1: factors[i],
              factor2: factors[j],
              correlation: Math.round(corr * 1000) / 1000,
            });
          }
        }
      }
      strongCorrelations.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));

      return {
        success: true,
        data: {
          matrix,
          factors,
          cycleCount: history.length,
          strongCorrelations: strongCorrelations.slice(0, 20),
        },
        meta: {
          timestamp: new Date(),
          requestId: request.id,
          latencyMs: Date.now() - start,
        },
      };
    }
  );

  // GET /api/v1/cvrf/beliefs/timeline
  fastify.get<{
    Querystring: { days?: string };
    Reply: APIResponse<unknown>;
  }>(
    '/api/v1/cvrf/beliefs/timeline',
    async (request, _reply) => {
      const start = Date.now();
      const daysParam = parseInt((request.query as any).days || '30', 10);
      const days = Math.max(1, Math.min(365, daysParam));
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);

      const history = server.cvrfManager.getCycleHistory();
      const filtered = history.filter(cycle => new Date(cycle.timestamp) >= cutoff);

      const factors = new Set<string>();
      const snapshots = filtered.map(cycle => {
        const fw = cycle.newBeliefState.factorWeights;
        const weights = Object.fromEntries(fw instanceof Map ? fw : Object.entries(fw || {}));
        for (const key of Object.keys(weights)) factors.add(key);

        return {
          date: cycle.timestamp,
          factorWeights: weights,
          regime: cycle.newBeliefState.currentRegime,
          regimeConfidence: cycle.newBeliefState.regimeConfidence,
          performanceDelta: cycle.episodeComparison.performanceDelta,
          insightsCount: cycle.extractedInsights.length,
          beliefUpdatesCount: cycle.beliefUpdates.length,
        };
      });

      let regimeTransitions = 0;
      for (let i = 1; i < snapshots.length; i++) {
        if (snapshots[i].regime !== snapshots[i - 1].regime) {
          regimeTransitions++;
        }
      }

      return {
        success: true,
        data: {
          snapshots,
          totalSnapshots: snapshots.length,
          days,
          factors: Array.from(factors),
          regimeTransitions,
        },
        meta: {
          timestamp: new Date(),
          requestId: request.id,
          latencyMs: Date.now() - start,
        },
      };
    }
  );

  // GET /api/v1/cvrf/episodes
  fastify.get<{
    Querystring: { limit?: string; offset?: string; expand?: string };
    Reply: APIResponse<unknown>;
  }>(
    '/api/v1/cvrf/episodes',
    async (request, reply) => {
      const start = Date.now();
      const query = request.query as any;
      const limit = Math.max(1, Math.min(100, parseInt(query.limit || '50', 10)));
      const offset = Math.max(0, parseInt(query.offset || '0', 10));
      const expandDecisions = query.expand === 'decisions';

      try {
        const [episodes, totalCount] = await Promise.all([
          persistence.getRecentEpisodes(null, limit, offset, expandDecisions),
          persistence.getCompletedEpisodesCount(null),
        ]);

        // Get current episode from manager
        const recentEpisodes = server.cvrfManager.getRecentEpisodes();
        const currentEpisode = recentEpisodes.length > 0 ? recentEpisodes[recentEpisodes.length - 1] : null;
        const isCurrentOpen = currentEpisode && !currentEpisode.endDate;

        return {
          success: true,
          data: {
            currentEpisode: isCurrentOpen ? {
              id: currentEpisode!.id,
              episodeNumber: currentEpisode!.episodeNumber ?? 0,
              startDate: currentEpisode!.startDate,
              decisionsCount: currentEpisode!.decisions.length,
              status: 'open',
            } : null,
            completedEpisodes: episodes,
            pagination: {
              limit,
              offset,
              total: totalCount,
              hasMore: offset + limit < totalCount,
            },
          },
          meta: {
            timestamp: new Date(),
            requestId: request.id,
            latencyMs: Date.now() - start,
          },
        };
      } catch (error) {
        logger.error({ err: error }, 'Failed to fetch episodes');
        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch episode history' },
        });
      }
    }
  );

  // GET /api/v1/cvrf/meta-prompt
  fastify.get<{ Reply: APIResponse<unknown> }>(
    '/api/v1/cvrf/meta-prompt',
    async (request, _reply) => {
      const start = Date.now();
      const history = server.cvrfManager.getCycleHistory();

      if (history.length === 0) {
        return {
          success: true,
          data: null,
          message: 'No CVRF cycles completed yet. Start and close an episode to generate a meta-prompt.',
          meta: {
            timestamp: new Date(),
            requestId: request.id,
            latencyMs: Date.now() - start,
          },
        };
      }

      const lastCycle = history[history.length - 1];
      const metaPrompt = lastCycle.metaPrompt;
      const fa = metaPrompt.factorAdjustments;

      return {
        success: true,
        data: {
          optimizationDirection: metaPrompt.optimizationDirection,
          keyLearnings: metaPrompt.keyLearnings,
          factorAdjustments: Object.fromEntries(fa instanceof Map ? fa : Object.entries(fa || {})),
          riskGuidance: metaPrompt.riskGuidance,
          timingInsights: metaPrompt.timingInsights,
          generatedAt: metaPrompt.generatedAt,
          cycleNumber: history.length,
        },
        meta: {
          timestamp: new Date(),
          requestId: request.id,
          latencyMs: Date.now() - start,
        },
      };
    }
  );

  // GET /api/v1/cvrf/stats
  fastify.get<{ Reply: APIResponse<unknown> }>(
    '/api/v1/cvrf/stats',
    async (request, _reply) => {
      const start = Date.now();
      const beliefs = server.cvrfManager.getCurrentBeliefs();
      const episodes = server.cvrfManager.getRecentEpisodes();
      const history = server.cvrfManager.getCycleHistory();

      const completedEpisodes = episodes.filter(e => e.endDate);
      const totalDecisions = completedEpisodes.reduce((sum, e) => sum + e.decisions.length, 0);
      const avgReturn = completedEpisodes.length > 0
        ? completedEpisodes.reduce((sum, e) => sum + (e.portfolioReturn || 0), 0) / completedEpisodes.length
        : 0;
      const avgSharpe = completedEpisodes.length > 0
        ? completedEpisodes.reduce((sum, e) => sum + (e.sharpeRatio || 0), 0) / completedEpisodes.length
        : 0;

      const avgDecisionOverlap = history.length > 0
        ? history.reduce((sum, c) => sum + c.episodeComparison.decisionOverlap, 0) / history.length
        : 0;
      const avgLearningRate = history.length > 0
        ? history.reduce((sum, c) => sum + c.beliefUpdates.length, 0) / history.length
        : 0;
      const totalInsights = history.reduce((sum, c) => sum + c.extractedInsights.length, 0);
      const totalBeliefUpdates = history.reduce((sum, c) => sum + c.beliefUpdates.length, 0);

      const fw = beliefs.factorWeights;
      const factorWeightsObj = Object.fromEntries(fw instanceof Map ? fw : Object.entries(fw || {}));
      const fc = beliefs.factorConfidences;
      const factorConfidencesObj = Object.fromEntries(fc instanceof Map ? fc : Object.entries(fc || {}));

      return {
        success: true,
        data: {
          episodes: {
            total: episodes.length,
            completed: completedEpisodes.length,
            totalDecisions,
            avgReturn: Math.round(avgReturn * 10000) / 10000,
            avgSharpe: Math.round(avgSharpe * 100) / 100,
          },
          cvrf: {
            totalCycles: history.length,
            avgDecisionOverlap: Math.round(avgDecisionOverlap * 1000) / 1000,
            avgLearningRate: Math.round(avgLearningRate * 100) / 100,
            totalInsights,
            totalBeliefUpdates,
          },
          beliefs: {
            currentRegime: beliefs.currentRegime,
            regimeConfidence: beliefs.regimeConfidence,
            riskTolerance: beliefs.riskTolerance,
            volatilityTarget: beliefs.volatilityTarget,
            lastUpdated: beliefs.updatedAt,
          },
          factors: {
            totalFactors: Object.keys(factorWeightsObj).length,
            factorWeights: factorWeightsObj,
            factorConfidences: factorConfidencesObj,
          },
        },
        meta: {
          timestamp: new Date(),
          requestId: request.id,
          latencyMs: Date.now() - start,
        },
      };
    }
  );
}
