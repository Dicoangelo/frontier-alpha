/**
 * GET /api/v1/digest/health-summary — weekly health digest cron (US-008).
 *
 * Vercel hits this on Sundays 13:00 UTC (see `vercel.json`). The cron auth is
 * the standard Frontier Alpha pattern: `?key=${CRON_SECRET}` query param OR
 * `Authorization: Bearer ${CRON_SECRET}` header. Any other caller gets 401.
 *
 * The handler:
 *   1. Reads the in-process `errorCounter` snapshot (top-N routes).
 *   2. Calls `/api/v1/health/integrations` via `fastify.inject` (internal,
 *      no network hop) to read live/degraded/offline counts.
 *   3. Reads cache hit ratio (placeholder — wire later via US-006).
 *   4. Resolves the most-recent deploy id from Vercel / Railway env vars.
 *   5. Renders the `weekly-health-digest` template and ships via Resend.
 *
 * The recipient is hard-coded to the operator (`dicoangelo@metaventionsai.com`)
 * for v1.3.0. Multi-operator support is deferred until a second human joins.
 */

import type {
  FastifyInstance,
  FastifyRequest,
  FastifyReply,
} from 'fastify';
import { errorCounter } from '../observability/ErrorCounter.js';
import { logger } from '../observability/logger.js';
import type {
  APIResponse,
  IntegrationHealthEntry,
  IntegrationsHealthResponse,
} from '../types/index.js';

interface RouteContext {
  server: unknown;
}

interface HealthSummaryQuery {
  key?: string;
  /** Override recipient for manual cron testing (still gated on CRON_SECRET). */
  to?: string;
}

interface HealthSummaryResult {
  sent: boolean;
  recipient: string;
  totalErrors: number;
  integrationCounts: { live: number; degraded: number; offline: number };
  sentryConfigured: boolean;
}

/** Default recipient — the sole operator for v1.3.0. */
const DEFAULT_RECIPIENT = 'dicoangelo@metaventionsai.com';

/** Maximum routes to render in the digest body (sorted by count desc). */
const TOP_ROUTES_LIMIT = 10;

/** Maximum bad-integration entries to render. */
const BAD_INTEGRATIONS_LIMIT = 8;

function authorize(request: FastifyRequest, reply: FastifyReply): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    reply.status(503).send({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message:
          'Health digest cron not configured (CRON_SECRET env var missing)',
      },
    });
    return false;
  }
  const auth = request.headers.authorization;
  const bearer = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const queryKey = (request.query as HealthSummaryQuery | undefined)?.key ?? null;
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

/** "May 4 – May 10, 2026" for the prior 7-day window ending yesterday. */
function formatWeekRange(now: Date = new Date()): string {
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  return `${fmt(start)} – ${fmt(end)}, ${end.getUTCFullYear()}`;
}

/** Pull integration health by `inject`-ing the local route — no HTTP hop. */
async function fetchIntegrationsHealth(
  fastify: FastifyInstance
): Promise<IntegrationsHealthResponse | null> {
  try {
    const res = await fastify.inject({
      method: 'GET',
      url: '/api/v1/health/integrations',
    });
    if (res.statusCode !== 200) {
      logger.warn(
        { status: res.statusCode },
        'Health digest: /health/integrations returned non-200'
      );
      return null;
    }
    return res.json() as IntegrationsHealthResponse;
  } catch (err) {
    logger.warn({ err }, 'Health digest: failed to inject /health/integrations');
    return null;
  }
}

/**
 * Resolve the most-recent deploy id from environment. Vercel injects
 * `VERCEL_GIT_COMMIT_SHA`; Railway injects `RAILWAY_DEPLOYMENT_ID`. Otherwise
 * returns null (digest body says "unknown").
 */
function resolveDeployId(): string | null {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  if (sha) return sha.slice(0, 12);
  const railway = process.env.RAILWAY_DEPLOYMENT_ID;
  if (railway) return railway.slice(0, 12);
  return null;
}

export async function healthSummaryRoutes(
  fastify: FastifyInstance,
  _opts: RouteContext
) {
  fastify.get<{
    Querystring: HealthSummaryQuery;
    Reply: APIResponse<HealthSummaryResult>;
  }>('/api/v1/digest/health-summary', async (request, reply) => {
    const start = Date.now();
    if (!authorize(request, reply)) return reply;

    const recipient = request.query.to || DEFAULT_RECIPIENT;
    const dateRange = formatWeekRange();

    // ── Errors ─────────────────────────────────────────────────────────────
    const allRoutes = errorCounter.getSummary();
    const topRoutes = allRoutes.slice(0, TOP_ROUTES_LIMIT);
    const totalErrors = errorCounter.getTotal();

    // ── Integrations ───────────────────────────────────────────────────────
    const intHealth = await fetchIntegrationsHealth(fastify);
    const integrationsLive = intHealth?.summary.live ?? 0;
    const integrationsDegraded = intHealth?.summary.degraded ?? 0;
    const integrationsOffline = intHealth?.summary.offline ?? 0;

    // Pick the bad ones — degraded + offline — for the body list.
    const badEntries: { name: string; status: 'live' | 'degraded' | 'offline'; reason?: string | null }[] = [];
    if (intHealth) {
      for (const [name, entry] of Object.entries(intHealth.integrations) as [
        string,
        IntegrationHealthEntry,
      ][]) {
        if (entry.status === 'degraded' || entry.status === 'offline') {
          badEntries.push({
            name,
            status: entry.status,
            reason: entry.reason ?? entry.lastError ?? null,
          });
          if (badEntries.length >= BAD_INTEGRATIONS_LIMIT) break;
        }
      }
    }

    // ── Cache hit ratio (placeholder until US-006) ────────────────────────
    const cacheHitRatio: number | null = null;

    // ── Deploy id ─────────────────────────────────────────────────────────
    const deployId = resolveDeployId();

    // ── Sentry status ─────────────────────────────────────────────────────
    // Server-side env var is `SENTRY_DSN`. Client-side is `VITE_SENTRY_DSN`.
    // For the digest's "is Sentry on?" question, we treat ANY DSN as "yes"
    // since at least one half of the cross-correlation chain works.
    const sentryConfigured = Boolean(
      process.env.SENTRY_DSN || process.env.VITE_SENTRY_DSN
    );

    // ── Render + ship ─────────────────────────────────────────────────────
    const frontendUrl =
      process.env.FRONTEND_URL || 'https://frontier-alpha.metaventionsai.com';
    const errorsEndpointUrl = `${frontendUrl.replace(/\/$/, '')}/api/v1/health/errors`;

    const { renderWeeklyHealthDigest } = await import(
      '../notifications/email-templates/index.js'
    );
    const { getAlertDelivery } = await import('../notifications/AlertDelivery.js');
    const delivery = getAlertDelivery();

    const payload = renderWeeklyHealthDigest({
      dateRange,
      totalErrors,
      topRoutes,
      integrations: {
        live: integrationsLive,
        degraded: integrationsDegraded,
        offline: integrationsOffline,
        badEntries,
      },
      cacheHitRatio,
      deployId,
      sentryConfigured,
      errorsEndpointUrl,
    });

    let sent = false;
    try {
      const result = await delivery.sendEmail({
        to: recipient,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      });
      sent = result.success;
      if (!result.success) {
        logger.warn(
          { error: result.error, recipient },
          'Health digest send failed'
        );
      }
    } catch (err) {
      logger.warn({ err, recipient }, 'Health digest render/send error');
    }

    const summary: HealthSummaryResult = {
      sent,
      recipient,
      totalErrors,
      integrationCounts: {
        live: integrationsLive,
        degraded: integrationsDegraded,
        offline: integrationsOffline,
      },
      sentryConfigured,
    };

    logger.info(summary, 'Health digest cron complete');

    return {
      success: true,
      data: summary,
      meta: {
        timestamp: new Date(),
        requestId: request.id,
        latencyMs: Date.now() - start,
      },
    };
  });
}
