/**
 * Weekly digest — Vercel cron entry point.
 *
 * Vercel hits GET /api/v1/digest/run on Monday 13:00 UTC (see vercel.json
 * `crons` block). The cron call carries no auth header, so we gate on a
 * shared secret query param `?key={CRON_SECRET}` to keep the endpoint
 * private. Any other caller (browser, abuse) gets a 401.
 *
 * For every active paid subscriber we render and send the weekly-digest
 * email via the same `getAlertDelivery().sendEmail()` channel used by
 * the welcome and subscription-confirmed flows. Failures per-user are
 * logged but non-fatal so a single bad address does not poison the run.
 *
 * Portfolio metrics (delta, top mover, worst mover) are stubbed for
 * v1.3.0 — see TODO markers below. The render shape is locked in so a
 * follow-up sprint can plug real numbers without changing the route.
 */

import type { FastifyInstance } from 'fastify';
import { supabaseAdmin } from '../lib/supabase.js';
import { logger } from '../observability/logger.js';
import type { APIResponse } from '../types/index.js';

interface RouteContext {
  server: unknown;
}

interface DigestRunQuery {
  key?: string;
}

interface DigestRunResult {
  sent: number;
  failed: number;
  skipped: number;
  total: number;
}

interface SubscriptionRow {
  user_id: string;
  plan: string;
  status: string;
}

interface ProfileRow {
  user_id: string;
  display_name: string | null;
}

/**
 * Format a "Apr 28 – May 4, 2026" style date range for the prior 7 days
 * ending yesterday (so Monday-morning sends summarize the completed week).
 */
function formatDateRange(now: Date = new Date()): string {
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
  const year = end.getUTCFullYear();
  return `${fmt(start)} – ${fmt(end)}, ${year}`;
}

export async function digestRoutes(fastify: FastifyInstance, _opts: RouteContext) {
  // GET /api/v1/digest/run — Vercel cron trigger
  fastify.get<{
    Querystring: DigestRunQuery;
    Reply: APIResponse<DigestRunResult>;
  }>('/api/v1/digest/run', async (request, reply) => {
    const start = Date.now();

    // ─── Secret gate ───────────────────────────────────────────────
    // Vercel cron does not carry a Bearer token, so we gate on a
    // shared CRON_SECRET. The 401 message names the env var so
    // operators can self-diagnose.
    const expected = process.env.CRON_SECRET;
    if (!expected) {
      return reply.status(503).send({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Digest cron not configured (CRON_SECRET env var missing)',
        },
      });
    }

    // Accept either `?key={CRON_SECRET}` (manual / future-proof) or
    // Vercel's auto-injected `Authorization: Bearer {CRON_SECRET}` header
    // (default for crons declared in vercel.json when CRON_SECRET env var
    // is set in the project).
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

    // ─── Pull recipient list ───────────────────────────────────────
    // Active paid subscribers are the digest's audience. Free-tier
    // users opt in via subscription, so we filter on plan != 'free'
    // and status = 'active' (covers Stripe trialing/active states).
    const { data: subs, error: subsError } = await supabaseAdmin
      .from('frontier_subscriptions')
      .select('user_id, plan, status')
      .eq('status', 'active');

    if (subsError) {
      logger.error({ err: subsError }, 'Digest cron: failed to load subscriptions');
      return reply.status(500).send({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to load subscription list',
        },
      });
    }

    const recipients = ((subs as SubscriptionRow[] | null) || []).filter(
      (s) => s.plan !== 'free'
    );

    // Hydrate display names in a single round-trip.
    const userIds = recipients.map((s) => s.user_id);
    const profilesById = new Map<string, ProfileRow>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('frontier_profiles')
        .select('user_id, display_name')
        .in('user_id', userIds);
      for (const p of (profiles as ProfileRow[] | null) || []) {
        profilesById.set(p.user_id, p);
      }
    }

    // ─── Render + send ─────────────────────────────────────────────
    const frontendUrl =
      process.env.FRONTEND_URL || 'https://frontier-alpha.metaventionsai.com';
    const dashboardUrl = `${frontendUrl}/dashboard`;
    const dateRange = formatDateRange();

    const { renderWeeklyDigest } = await import(
      '../notifications/email-templates/index.js'
    );
    const { getAlertDelivery } = await import('../notifications/AlertDelivery.js');
    const delivery = getAlertDelivery();

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const sub of recipients) {
      try {
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(
          sub.user_id
        );
        const email = authUser?.user?.email;
        if (!email) {
          skipped += 1;
          continue;
        }

        const meta = authUser?.user?.user_metadata as
          | { full_name?: string; name?: string }
          | undefined;
        const profile = profilesById.get(sub.user_id);
        const displayName =
          profile?.display_name ||
          meta?.full_name ||
          meta?.name ||
          email.split('@')[0];

        // TODO real metrics in v1.3.1 — wire portfolioService.getPortfolio +
        // 7-day delta + per-position return aggregation. Stubbed here so the
        // template render is end-to-end exercised in v1.3.0 and operators can
        // verify provider delivery before the metrics layer ships.
        const payload = renderWeeklyDigest({
          displayName,
          dateRange,
          portfolioValue: 0,
          portfolioDelta: 0,
          portfolioDeltaPct: 0,
          topMover: { symbol: '—', pct: 0, because: 'Metrics ship in v1.3.1' },
          worstMover: { symbol: '—', pct: 0 },
          dashboardUrl,
        });

        const result = await delivery.sendEmail({
          to: email,
          subject: payload.subject,
          html: payload.html,
          text: payload.text,
        });

        if (result.success) {
          sent += 1;
        } else {
          failed += 1;
          logger.warn(
            { userId: sub.user_id, error: result.error },
            'Digest send failed'
          );
        }
      } catch (err) {
        failed += 1;
        logger.warn({ err, userId: sub.user_id }, 'Digest render/send error');
      }
    }

    const summary: DigestRunResult = {
      sent,
      failed,
      skipped,
      total: recipients.length,
    };

    logger.info(summary, 'Weekly digest cron complete');

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
