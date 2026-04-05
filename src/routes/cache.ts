/**
 * Cache admin routes — Redis cache stats and invalidation.
 *
 * Ported from `api/v1/cache/stats.ts` to unify on the single Fastify surface
 * exposed via `buildApp()`.
 */

import type { FastifyInstance } from 'fastify';
import { getCache } from '../cache/RedisCache.js';
import { logger } from '../observability/logger.js';
import type { APIResponse } from '../types/index.js';

interface RouteContext {
  server: unknown;
}

interface InvalidateBody {
  action?: string;
  type?: 'quotes' | 'factors' | 'api' | 'all';
}

export async function cacheRoutes(fastify: FastifyInstance, _opts: RouteContext) {
  // GET /api/v1/cache/stats
  fastify.get<{ Reply: APIResponse<unknown> }>(
    '/api/v1/cache/stats',
    async (request, reply) => {
      const start = Date.now();
      try {
        const cache = getCache();
        const stats = cache.getStats();
        return {
          success: true,
          data: {
            enabled: cache.isAvailable(),
            connected: cache.isConnected(),
            stats: {
              hits: stats.hits,
              misses: stats.misses,
              hitRate: `${stats.hitRate.toFixed(2)}%`,
              sets: stats.sets,
              deletes: stats.deletes,
              errors: stats.errors,
            },
            memory: { entries: stats.memorySize },
          },
          meta: { timestamp: new Date(), requestId: request.id, latencyMs: Date.now() - start },
        };
      } catch (error) {
        logger.error({ err: error }, 'Cache stats error');
        return reply.status(500).send({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : 'Failed to fetch cache stats',
          },
        });
      }
    }
  );

  // POST /api/v1/cache/stats — invalidate
  fastify.post<{ Body: InvalidateBody; Reply: APIResponse<unknown> }>(
    '/api/v1/cache/stats',
    async (request, reply) => {
      const start = Date.now();
      const { action, type } = request.body || {};

      if (action !== 'invalidate') {
        return reply.status(400).send({
          success: false,
          error: { code: 'BAD_REQUEST', message: 'action must be "invalidate"' },
        });
      }

      try {
        const cache = getCache();
        let invalidated = 0;

        switch (type) {
          case 'quotes':
            invalidated = await cache.invalidateQuotes();
            break;
          case 'factors':
            invalidated = await cache.invalidateFactors();
            break;
          case 'api':
            invalidated = await cache.invalidateApiCache();
            break;
          case 'all':
            await cache.clear();
            invalidated = -1;
            break;
          default:
            return reply.status(400).send({
              success: false,
              error: { code: 'BAD_REQUEST', message: 'type must be quotes|factors|api|all' },
            });
        }

        return {
          success: true,
          data: { invalidated, type },
          meta: { timestamp: new Date(), requestId: request.id, latencyMs: Date.now() - start },
        };
      } catch (error) {
        logger.error({ err: error }, 'Cache invalidate error');
        return reply.status(500).send({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : 'Failed to invalidate cache',
          },
        });
      }
    }
  );

  // DELETE /api/v1/cache/stats — clear all
  fastify.delete<{ Reply: APIResponse<unknown> }>(
    '/api/v1/cache/stats',
    async (request, reply) => {
      const start = Date.now();
      try {
        const cache = getCache();
        await cache.clear();
        return {
          success: true,
          data: { cleared: true },
          meta: { timestamp: new Date(), requestId: request.id, latencyMs: Date.now() - start },
        };
      } catch (error) {
        logger.error({ err: error }, 'Cache clear error');
        return reply.status(500).send({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : 'Failed to clear cache',
          },
        });
      }
    }
  );
}
