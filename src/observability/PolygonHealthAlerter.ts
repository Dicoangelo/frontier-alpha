/**
 * Polygon health alerting (Workstream E1).
 *
 * Before this, a Polygon outage only surfaced when a human read the dashboard,
 * curled `/health/integrations`, or opened the weekly digest. This module turns
 * the synthetic monitor into an active alarm:
 *
 *   1. DEBOUNCED alert — after N consecutive failing synthetic-monitor polls
 *      (default 3), send one operator notification. Only fires on the
 *      TRANSITION into the failing state (not every poll), and resets when a
 *      poll comes back clean. This absorbs transient blips (a single failed
 *      15-minute poll) while still catching a sustained outage within ~45 min.
 *
 *   2. IMMEDIATE escalation — if Polygon has logged an ALERTABLE error kind
 *      (401 auth = revoked/invalid key, or 403 plan_tier = entitlement block),
 *      alert now with no debounce. Those need a human immediately; waiting 3
 *      polls to tell the operator their key was revoked is a bug, not caution.
 *      Alertable-kind counts come from `QuotaClassifier` (recorded at the
 *      Polygon fetch sites via `recordProviderError`).
 *
 * State is in-process module-level (same posture as ErrorCounter / QuotaClassifier)
 * and resets on process restart. The send is BEST-EFFORT — every failure path is
 * swallowed so an alerting hiccup never throws into the cron path.
 */

import {
  getErrorKindCount,
  isAlertableErrorKind,
  type ProviderErrorKind,
} from '../data/QuotaClassifier.js';
import { getAlertDelivery } from '../notifications/AlertDelivery.js';
import { logger } from './logger.js';

/** Consecutive failing polls before the debounced alert fires. */
const DEFAULT_THRESHOLD = 3;

/** Operator recipient — the sole operator for v1.3.x (matches health-summary). */
const DEFAULT_RECIPIENT = 'dicoangelo@metaventionsai.com';

// ── In-process state (resets on restart) ───────────────────────────────────
let consecutiveFailures = 0;
/** Guard: only one debounced alert per failing streak (no per-poll spam). */
let alertedForCurrentStreak = false;
/** Alertable-kind counts we've already alerted on, so a persistent 401 doesn't
 * re-alert every 15-minute poll. */
let lastAlertedAuthCount = 0;
let lastAlertedPlanTierCount = 0;

export interface MonitorRunSummary {
  /** Number of failing probes in this poll. */
  failed: number;
  /** Number of passing probes in this poll. */
  passed: number;
  /** Failing routes (route key + error) for the alert body. */
  failingRoutes: Array<{ route: string; error: string | null }>;
}

export interface PolygonAlertOutcome {
  alerted: boolean;
  reason: 'debounce-threshold' | 'alertable-kind' | null;
  consecutiveFailures: number;
}

function threshold(): number {
  const raw = Number(process.env.POLYGON_ALERT_THRESHOLD);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_THRESHOLD;
}

function recipient(): string {
  return process.env.HEALTH_ALERT_RECIPIENT?.trim() || DEFAULT_RECIPIENT;
}

interface AlertContent {
  subject: string;
  html: string;
  text: string;
}

/** Best-effort operator email. Never throws — logs and returns on any failure. */
async function sendOperatorEmail(content: AlertContent): Promise<void> {
  try {
    const to = recipient();
    const result = await getAlertDelivery().sendEmail({
      to,
      subject: content.subject,
      html: content.html,
      text: content.text,
    });
    if (!result.success) {
      logger.warn(
        { error: result.error, to },
        'PolygonHealthAlerter: operator alert email failed',
      );
    } else {
      logger.info({ to, subject: content.subject }, 'PolygonHealthAlerter: alert sent');
    }
  } catch (err) {
    logger.warn({ err }, 'PolygonHealthAlerter: alert send threw (swallowed)');
  }
}

function buildAlertContent(
  reason: 'debounce-threshold' | 'alertable-kind',
  summary: MonitorRunSummary,
  detail: string,
): AlertContent {
  const headline =
    reason === 'alertable-kind'
      ? 'Polygon needs a human NOW'
      : `Polygon health failing (${consecutiveFailures} consecutive polls)`;
  const failing = summary.failingRoutes.length
    ? summary.failingRoutes.map((r) => `  - ${r.route}: ${r.error ?? 'unknown'}`).join('\n')
    : '  (no per-route detail)';
  const text = [
    `FRONTIER ALPHA · HEALTH ALERT`,
    '',
    headline,
    detail,
    '',
    `Passed: ${summary.passed} · Failed: ${summary.failed}`,
    'Failing routes:',
    failing,
    '',
    'Source: synthetic-monitor (GET /api/v1/cron/synthetic-monitor).',
    'Runbook: CLAUDE.md → Incident playbook (/health/integrations degraded).',
  ].join('\n');
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111;max-width:600px;margin:0 auto;padding:20px;">
  <h2 style="margin:0 0 8px;color:#b91c1c;">${esc(headline)}</h2>
  <p style="margin:0 0 12px;color:#374151;">${esc(detail)}</p>
  <p style="margin:0 0 4px;color:#374151;"><strong>Passed:</strong> ${summary.passed} · <strong>Failed:</strong> ${summary.failed}</p>
  <pre style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;font-size:12px;overflow:auto;">${esc(failing)}</pre>
  <p style="margin:12px 0 0;color:#6b7280;font-size:12px;">Source: synthetic-monitor · Runbook: CLAUDE.md incident playbook.</p>
</body></html>`;
  const subject =
    reason === 'alertable-kind'
      ? 'Frontier Alpha · Polygon ALERT · key/plan action required'
      : `Frontier Alpha · Polygon health failing (${consecutiveFailures}× polls)`;
  return { subject, html, text };
}

/**
 * Evaluate one synthetic-monitor poll and, if warranted, fire a best-effort
 * operator alert. Returns the decision so the caller (and tests) can assert
 * behavior. Never throws.
 */
export async function evaluatePolygonHealth(
  summary: MonitorRunSummary,
): Promise<PolygonAlertOutcome> {
  // Update the debounce counter first so the alert body reports the right count.
  if (summary.failed > 0) {
    consecutiveFailures += 1;
  } else {
    consecutiveFailures = 0;
    alertedForCurrentStreak = false;
  }

  // ── 1) Immediate alertable-kind escalation (no debounce) ─────────────────
  const authCount = getErrorKindCount('polygon', 'auth');
  const planTierCount = getErrorKindCount('polygon', 'plan_tier');
  const newAuth = authCount > lastAlertedAuthCount;
  const newPlanTier = planTierCount > lastAlertedPlanTierCount;

  // Require the run to be actually failing before paging on an error COUNT.
  //
  // The watermarks above are module state. On Vercel that resets with every
  // serverless instance, so `count > 0` is effectively always "new" and any
  // stray 403 recorded anywhere in the same warm instance pages the operator —
  // which is exactly what happened: the hourly warm-cache cron and this
  // 15-minute monitor share a warm instance, the warmer's expected
  // grouped-daily 403s landed in the counter, and this emailed
  // "key/plan action required" every 15 minutes while all 13 probes passed.
  //
  // A real revoked key or plan downgrade takes probes down with it, so gating
  // on `summary.failed > 0` keeps the alert for genuine breakage and drops the
  // false pages. The 403 source is fixed at origin too (see fetchGroupedDaily),
  // this is the belt to that braces.
  if ((newAuth || newPlanTier) && summary.failed === 0) {
    logger.info(
      { authCount, planTierCount, passed: summary.passed },
      'Polygon auth/plan-tier errors recorded but every probe passed — not alerting',
    );
    lastAlertedAuthCount = authCount;
    lastAlertedPlanTierCount = planTierCount;
    return { alerted: false, reason: null, consecutiveFailures };
  }

  if (newAuth || newPlanTier) {
    const kind: ProviderErrorKind = newAuth ? 'auth' : 'plan_tier';
    // isAlertableErrorKind is true by construction here, but keep the guard
    // explicit so the intent (auth/plan-tier only) is legible.
    if (isAlertableErrorKind(kind)) {
      // Advance both watermarks so we don't re-alert on the same counts.
      lastAlertedAuthCount = authCount;
      lastAlertedPlanTierCount = planTierCount;
      const detail =
        kind === 'auth'
          ? `Polygon returned HTTP 401 (auth). The API key is likely revoked, invalid, or truncated. Rotate it (CLAUDE.md rotation runbook, printf-not-echo).`
          : `Polygon returned HTTP 403 (plan_tier). The requested data is not entitled on the current plan. Check the Polygon plan / endpoint entitlement.`;
      await sendOperatorEmail(buildAlertContent('alertable-kind', summary, detail));
      return { alerted: true, reason: 'alertable-kind', consecutiveFailures };
    }
  }

  // ── 2) Debounced threshold alert (transition into failing state only) ────
  if (summary.failed > 0 && consecutiveFailures >= threshold() && !alertedForCurrentStreak) {
    alertedForCurrentStreak = true;
    const detail = `The synthetic monitor has failed ${consecutiveFailures} consecutive polls (threshold ${threshold()}). This is a sustained Polygon-path / production health failure, not a transient blip.`;
    await sendOperatorEmail(buildAlertContent('debounce-threshold', summary, detail));
    return { alerted: true, reason: 'debounce-threshold', consecutiveFailures };
  }

  return { alerted: false, reason: null, consecutiveFailures };
}

/** Reset all in-process state (test seam). */
export function resetPolygonHealthAlerter(): void {
  consecutiveFailures = 0;
  alertedForCurrentStreak = false;
  lastAlertedAuthCount = 0;
  lastAlertedPlanTierCount = 0;
}

/** Read-only snapshot (test seam / diagnostics). */
export function getPolygonHealthAlerterState(): {
  consecutiveFailures: number;
  alertedForCurrentStreak: boolean;
} {
  return { consecutiveFailures, alertedForCurrentStreak };
}
