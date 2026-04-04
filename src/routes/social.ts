import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth.js';
import { createPortfolioShare, getPortfolioShareByToken } from '../services/SharingService.js';
import { leaderboardService } from '../services/LeaderboardService.js';
import type { LeaderboardMetric, LeaderboardPeriod } from '../services/LeaderboardService.js';

interface RouteContext {
  server: unknown;
}

export async function socialRoutes(fastify: FastifyInstance, _opts: RouteContext) {
  // POST /api/v1/portfolio/share — Token-based sharing (US-010)
  fastify.post<{
    Body: { snapshot_json: Record<string, unknown> };
  }>(
    '/api/v1/portfolio/share',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const start = Date.now();
      const { snapshot_json } = request.body || {};

      if (!snapshot_json || typeof snapshot_json !== 'object') {
        reply.code(400);
        return {
          data: null,
          error: { code: 'VALIDATION_ERROR', message: 'snapshot_json is required and must be an object' },
          meta: { timestamp: new Date(), requestId: request.id, latencyMs: Date.now() - start },
        };
      }

      const origin = `${request.protocol}://${request.hostname}`;
      const result = await createPortfolioShare(request.user!.id, snapshot_json, origin);

      if (!result) {
        reply.code(500);
        return {
          data: null,
          error: { code: 'INTERNAL_ERROR', message: 'Failed to create share link' },
          meta: { timestamp: new Date(), requestId: request.id, latencyMs: Date.now() - start },
        };
      }

      reply.code(201);
      return {
        data: result,
        meta: { timestamp: new Date(), requestId: request.id, latencyMs: Date.now() - start },
      };
    }
  );

  // GET /api/v1/portfolio/shared/:token
  fastify.get<{ Params: { token: string } }>(
    '/api/v1/portfolio/shared/:token',
    async (request, reply) => {
      const start = Date.now();
      const { token } = request.params;

      // Old base64 tokens are 88+ chars; new hex tokens are exactly 32 chars
      if (!/^[0-9a-f]{32}$/.test(token)) {
        reply.code(404);
        return {
          data: null,
          error: { code: 'NOT_FOUND', message: 'This link has expired' },
          meta: { timestamp: new Date(), requestId: request.id, latencyMs: Date.now() - start },
        };
      }

      const snapshot = await getPortfolioShareByToken(token);

      if (!snapshot) {
        reply.code(404);
        return {
          data: null,
          error: { code: 'NOT_FOUND', message: 'Shared portfolio not found or has expired' },
          meta: { timestamp: new Date(), requestId: request.id, latencyMs: Date.now() - start },
        };
      }

      return {
        data: snapshot,
        meta: { timestamp: new Date(), requestId: request.id, latencyMs: Date.now() - start },
      };
    }
  );

  // GET /api/v1/leaderboard
  const VALID_METRICS: LeaderboardMetric[] = ['sharpe', 'total_return', 'risk_adjusted_return', 'consistency'];
  const VALID_PERIODS: LeaderboardPeriod[] = ['1w', '1m', '3m', 'ytd', 'all'];

  fastify.get<{
    Querystring: { metric?: string; period?: string; user_id?: string };
  }>(
    '/api/v1/leaderboard',
    async (request, reply) => {
      const start = Date.now();

      const metric = (request.query.metric || 'sharpe') as LeaderboardMetric;
      const period = (request.query.period || '1m') as LeaderboardPeriod;
      const userId = request.query.user_id;

      if (!VALID_METRICS.includes(metric)) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `Invalid metric. Must be one of: ${VALID_METRICS.join(', ')}`,
          },
        });
      }

      if (!VALID_PERIODS.includes(period)) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `Invalid period. Must be one of: ${VALID_PERIODS.join(', ')}`,
          },
        });
      }

      try {
        if (userId) {
          const entry = await leaderboardService.getUserRank(userId, metric, period);
          if (!entry) {
            return reply.status(404).send({
              success: false,
              error: { code: 'NOT_FOUND', message: 'User not found on leaderboard' },
            });
          }
          return {
            success: true,
            data: entry,
            meta: {
              timestamp: new Date(),
              requestId: request.id,
              latencyMs: Date.now() - start,
            },
          };
        }

        const result = await leaderboardService.getLeaderboard(metric, period);

        return {
          success: true,
          data: result,
          meta: {
            timestamp: new Date(),
            requestId: request.id,
            latencyMs: Date.now() - start,
          },
        };
      } catch (error) {
        const { logger: log } = await import('../observability/logger.js');
        log.error({ err: error }, 'Leaderboard query failed');
        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Leaderboard query failed' },
        });
      }
    }
  );
}
