/**
 * Cache warmer cron — Vercel cron entry point (US-006, P5).
 *
 * Vercel hits GET /api/v1/cron/warm-cache hourly (see vercel.json `crons`).
 * The cron call carries no auth header, so we gate on a shared secret
 * exactly like the digest cron (`?key={CRON_SECRET}` or
 * `Authorization: Bearer {CRON_SECRET}`). Any other caller (browser,
 * abuse) gets a 401.
 *
 * Hourly cadence keeps the cache hot across Vercel cold-starts; the boot-
 * time fire-and-forget call in `src/index.ts` covers Railway and the
 * Vercel function's own first request after a cold-start.
 */

import type { FastifyInstance } from 'fastify';
import { logger } from '../observability/logger.js';
import type { APIResponse } from '../types/index.js';
import { warmTopHeldSymbols } from '../data/CacheWarmer.js';
import type { AppServer } from '../app.js';

interface RouteContext {
  server: AppServer;
}

interface WarmCacheQuery {
  key?: string;
  /** Override the limit for ad-hoc warms; production cron leaves it unset. */
  limit?: string;
}

interface WarmCacheResult {
  attempted: number;
  succeeded: number;
  failed: number;
  symbols: string[];
}

export async function cronWarmCacheRoutes(
  fastify: FastifyInstance,
  opts: RouteContext,
) {
  const { server } = opts;

  fastify.get<{
    Querystring: WarmCacheQuery;
    Reply: APIResponse<WarmCacheResult>;
  }>('/api/v1/cron/warm-cache', async (request, reply) => {
    const start = Date.now();

    // ─── Secret gate ───────────────────────────────────────────────
    // Same pattern as digestRoutes — accept either ?key=... query or
    // Vercel's auto-injected Authorization: Bearer header.
    const expected = process.env.CRON_SECRET;
    if (!expected) {
      return reply.status(503).send({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Cache warmer cron not configured (CRON_SECRET env var missing)',
        },
      });
    }

    const authHeader = request.headers.authorization;
    const headerKey =
      authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const presented = request.query.key || headerKey;

    if (presented !== expected) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message:
            'Invalid or missing cron key (provide ?key={CRON_SECRET} or Authorization: Bearer {CRON_SECRET})',
        },
      });
    }

    // ─── Run warmer ────────────────────────────────────────────────
    const limit = Math.max(
      1,
      Math.min(100, Number.parseInt(request.query.limit ?? '20', 10) || 20),
    );

    try {
      const result = await warmTopHeldSymbols(server.dataProvider, limit);
      logger.info({ ...result, latencyMs: Date.now() - start }, 'Cache warmer cron complete');

      return {
        success: true,
        data: result,
        meta: {
          timestamp: new Date(),
          requestId: request.id,
          latencyMs: Date.now() - start,
        },
      };
    } catch (err) {
      logger.error({ err }, 'Cache warmer cron failed');
      return reply.status(500).send({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Cache warmer threw',
        },
      });
    }
  });
}
