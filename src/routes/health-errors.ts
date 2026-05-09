/**
 * GET /api/v1/health/errors — service-role / cron-gated error counter snapshot.
 *
 * Reads the in-process `errorCounter` (US-008) and returns a flat array of
 * `{ route, count, lastError, lastSeen }` records, sorted by count desc, for
 * errors observed in the last hour (counter resets hourly).
 *
 * Auth: NOT public. Accept either:
 *   - `Authorization: Bearer ${SUPABASE_SERVICE_KEY}` (operator running curl)
 *   - `Authorization: Bearer ${CRON_SECRET}` (Vercel cron / synthetic monitor)
 *   - `?key=${CRON_SECRET}` query param (manual cron debugging)
 *
 * Response (200):
 *   {
 *     success: true,
 *     data: {
 *       windowStartedAt: ISO,
 *       totalErrors: number,
 *       routes: ErrorRecord[]
 *     }
 *   }
 *
 * Response (401): unauthorized
 * Response (503): no auth configured (CRON_SECRET + SUPABASE_SERVICE_KEY both missing)
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { errorCounter, type ErrorRecord } from '../observability/ErrorCounter.js';
import type { APIResponse } from '../types/index.js';

interface RouteContext {
  server: unknown;
}

interface HealthErrorsQuery {
  key?: string;
}

interface HealthErrorsData {
  /** ISO timestamp of when this counter window started (rolling 1-hour). */
  windowStartedAt: string;
  /** Total errors counted across all routes in the current window. */
  totalErrors: number;
  /** Per-route breakdown, sorted by count desc. */
  routes: ErrorRecord[];
}

/** Module-level boot timestamp; reset on cold start (matches ErrorCounter scope). */
const bootedAt = new Date().toISOString();

/**
 * Gate the request on either the Supabase service-role key (operator) or
 * CRON_SECRET (cron / synthetic monitor). Returns true on success, sends
 * a 401/503 reply and returns false on failure.
 */
function authorize(request: FastifyRequest, reply: FastifyReply): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!cronSecret && !serviceKey) {
    reply.status(503).send({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message:
          'Error endpoint not configured (set CRON_SECRET or SUPABASE_SERVICE_KEY)',
      },
    });
    return false;
  }

  const auth = request.headers.authorization;
  const bearer = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const queryKey = (request.query as HealthErrorsQuery | undefined)?.key ?? null;
  const presented = bearer ?? queryKey;

  const validKeys = [cronSecret, serviceKey].filter(
    (k): k is string => typeof k === 'string' && k.length > 0
  );

  if (!presented || !validKeys.includes(presented)) {
    reply.status(401).send({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message:
          'This endpoint requires Bearer SUPABASE_SERVICE_KEY or Bearer CRON_SECRET (or ?key=CRON_SECRET).',
      },
    });
    return false;
  }

  return true;
}

export async function healthErrorsRoutes(
  fastify: FastifyInstance,
  _opts: RouteContext
) {
  fastify.get<{
    Querystring: HealthErrorsQuery;
    Reply: APIResponse<HealthErrorsData>;
  }>('/api/v1/health/errors', async (request, reply) => {
    const start = Date.now();
    if (!authorize(request, reply)) return reply;

    const routes = errorCounter.getSummary();
    const totalErrors = errorCounter.getTotal();

    return {
      success: true,
      data: {
        windowStartedAt: bootedAt,
        totalErrors,
        routes,
      },
      meta: {
        timestamp: new Date(),
        requestId: request.id,
        latencyMs: Date.now() - start,
      },
    };
  });
}
