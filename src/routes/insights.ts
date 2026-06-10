import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth.js';
import { logger } from '../observability/logger.js';
import { insightLedger } from '../insights/InsightLedger.js';
import type { APIResponse } from '../types/index.js';

/**
 * Insight provenance ledger routes (IDEA-CIN-2).
 *
 * GET  /api/v1/insights/history     — paginated, per-user provenance receipts
 * POST /api/v1/insights/:id/rating  — set a user rating on one's own entry
 *
 * Ledger WRITES happen at the explanation route (see src/routes/explain.ts),
 * not here — these endpoints only read back and rate. Both no-op gracefully
 * when the `frontier_insight_ledger` table has not yet been applied in prod.
 */
export async function insightsRoutes(fastify: FastifyInstance) {
  // All insight routes are per-user; auth establishes request.user.
  fastify.addHook('preHandler', authMiddleware);

  // GET /api/v1/insights/history
  fastify.get<{
    Querystring: { limit?: string; offset?: string };
    Reply: APIResponse<unknown>;
  }>(
    '/api/v1/insights/history',
    async (request, reply) => {
      const start = Date.now();
      const userId = request.user?.id;

      if (!userId) {
        return reply.status(401).send({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        });
      }

      try {
        const limit = request.query.limit ? Number(request.query.limit) : undefined;
        const offset = request.query.offset ? Number(request.query.offset) : undefined;

        const result = await insightLedger.getHistory(userId, {
          limit: Number.isFinite(limit) ? limit : undefined,
          offset: Number.isFinite(offset) ? offset : undefined,
        });

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
        logger.error({ err: error }, 'Failed to fetch insight history');
        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch insight history' },
        });
      }
    }
  );

  // POST /api/v1/insights/:id/rating
  fastify.post<{
    Params: { id: string };
    Body: { rating: number };
    Reply: APIResponse<unknown>;
  }>(
    '/api/v1/insights/:id/rating',
    async (request, reply) => {
      const start = Date.now();
      const userId = request.user?.id;

      if (!userId) {
        return reply.status(401).send({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        });
      }

      const { id } = request.params;
      const { rating } = request.body ?? {};

      // Rating range matches the migration CHECK: -1 (thumbs-down sentinel)
      // through 5 (stars). Integers only.
      if (
        typeof rating !== 'number' ||
        !Number.isInteger(rating) ||
        rating < -1 ||
        rating > 5
      ) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'rating must be an integer between -1 and 5',
          },
        });
      }

      try {
        const updated = await insightLedger.rate(userId, id, rating);

        if (!updated) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Insight not found' },
          });
        }

        return {
          success: true,
          data: updated,
          meta: {
            timestamp: new Date(),
            requestId: request.id,
            latencyMs: Date.now() - start,
          },
        };
      } catch (error) {
        logger.error({ err: error, id }, 'Failed to rate insight');
        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Failed to rate insight' },
        });
      }
    }
  );
}
