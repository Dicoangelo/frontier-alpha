import type { FastifyInstance } from 'fastify';
import { getCVRFRiskAssessment } from '../cvrf/integration.js';
import { logger } from '../observability/logger.js';
import type { APIResponse } from '../types/index.js';
import type { CVRFManager } from '../cvrf/CVRFManager.js';

interface RouteContext {
  server: {
    cvrfManager: CVRFManager;
  };
}

export async function cvrfRoutes(fastify: FastifyInstance, opts: RouteContext) {
  const { server } = opts;

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
      const episode = server.cvrfManager.startEpisode();

      return {
        success: true,
        data: {
          id: episode.id,
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
    Body: { runCvrfCycle?: boolean };
    Reply: APIResponse<unknown>;
  }>(
    '/api/v1/cvrf/episode/close',
    async (request, reply) => {
      const start = Date.now();
      const { runCvrfCycle = true } = request.body || {};

      try {
        const { episode, cvrfResult } = await server.cvrfManager.closeEpisode(
          undefined,
          runCvrfCycle
        );

        return {
          success: true,
          data: {
            episode: {
              id: episode.id,
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
        const decision = server.cvrfManager.recordDecision({
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
        portfolioReturns,
        positions,
        server.cvrfManager
      );

      return {
        success: true,
        data: assessment,
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
          betterEpisodeReturn: cycle.episodeComparison.betterEpisode.portfolioReturn,
          worseEpisodeReturn: cycle.episodeComparison.worseEpisode.portfolioReturn,
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
}
