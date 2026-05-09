/**
 * GET /api/v1/cron/synthetic-monitor — placeholder stub for US-007.
 *
 * US-008 lays the observability foundation; US-007 will fill this stub
 * with the actual smoke-test execution path that runs the
 * `tests/integration/protected-routes.test.ts` assertions against
 * production every 15 minutes (cron) and posts failures to Sentry.
 *
 * For now this endpoint:
 *   - Is registered so vercel.json + the arch-scanner see it.
 *   - Is gated on CRON_SECRET (matches the rest of the cron family).
 *   - Returns a `notImplemented` envelope so any external poller
 *     (uptime kuma, statuspage probe, manual curl) gets a clean 200
 *     with a clear "wired but not running yet" payload.
 *
 * The vercel.json cron entry can be added in US-007 when the smoke
 * runner exists; we are intentionally NOT adding the cron entry today
 * to avoid scheduling work that is a no-op.
 */

import type {
  FastifyInstance,
  FastifyRequest,
  FastifyReply,
} from 'fastify';
import type { APIResponse } from '../types/index.js';

interface RouteContext {
  server: unknown;
}

interface SyntheticMonitorQuery {
  key?: string;
}

interface SyntheticMonitorStubData {
  status: 'not_implemented';
  message: string;
  ownedBy: string;
}

function authorize(request: FastifyRequest, reply: FastifyReply): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    reply.status(503).send({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message:
          'Synthetic monitor not configured (CRON_SECRET env var missing)',
      },
    });
    return false;
  }
  const auth = request.headers.authorization;
  const bearer = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const queryKey =
    (request.query as SyntheticMonitorQuery | undefined)?.key ?? null;
  const presented = bearer ?? queryKey;
  if (presented !== cronSecret) {
    reply.status(401).send({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message:
          'Invalid or missing cron key (provide ?key={CRON_SECRET} or Authorization: Bearer {CRON_SECRET})',
      },
    });
    return false;
  }
  return true;
}

export async function syntheticMonitorRoutes(
  fastify: FastifyInstance,
  _opts: RouteContext
) {
  fastify.get<{
    Querystring: SyntheticMonitorQuery;
    Reply: APIResponse<SyntheticMonitorStubData>;
  }>('/api/v1/cron/synthetic-monitor', async (request, reply) => {
    const start = Date.now();
    if (!authorize(request, reply)) return reply;

    return {
      success: true,
      data: {
        status: 'not_implemented',
        message:
          'Synthetic monitor stub. US-007 will wire the smoke-test runner here.',
        ownedBy: 'US-007 (v1.3.0 reliability wave)',
      },
      meta: {
        timestamp: new Date(),
        requestId: request.id,
        latencyMs: Date.now() - start,
      },
    };
  });
}
