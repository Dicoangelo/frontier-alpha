/**
 * Weekly health-digest transactional email (US-008).
 *
 * Subject: Frontier Alpha · Health · {dateRange}
 * Audience: operator (single recipient — `dicoangelo@metaventionsai.com`).
 *
 * Body anatomy:
 *   1. halo-gradient kicker + dateRange headline
 *   2. error-summary card  (totalErrors + top routes)
 *   3. integrations card   (live / degraded / offline counts + bad list)
 *   4. cache + deploy card (cache hit ratio placeholder, deploy id)
 *   5. caveat note         (Sentry status — sole-source flag if DSN absent)
 *   6. CTA to /health/errors
 *
 * Renders via the shared `_layout` primitives so glass cards / mono kicker /
 * sovereign CTA stay aligned with welcome / weekly-digest. Text fallback is
 * a flat plaintext mirror so the operator can scan in any client.
 */

import {
  COLORS,
  FONT_MONO,
  FONT_SANS,
  card,
  cta,
  escapeHtml,
  monoKicker,
  shell,
  spacer,
  tabularNum,
} from './_layout.js';
import type { EmailPayload } from './types.js';

export interface RouteErrorSummary {
  /** `${METHOD} ${routeUrlPattern}`. */
  route: string;
  count: number;
  lastError: string;
  lastSeen: string;
}

export interface IntegrationStatusEntry {
  name: string;
  status: 'live' | 'degraded' | 'offline';
  reason?: string | null;
}

/** Per-provider quota + operational error-kind counts (IDEA-CIN-5). Shape
 * mirrors one provider entry of `getQuotaStats().providers`. */
export interface ProviderQuotaSummary {
  quota_burned: number;
  quota_free: number;
  provider_fault: number;
  guidance: string | null;
  errorKinds: {
    rate_limit: number;
    auth: number;
    plan_tier: number;
    client_error: number;
    server_fault: number;
  };
}

/** Full quota snapshot passed from `getQuotaStats()`. */
export interface QuotaDigestSection {
  since: string;
  providers: Record<string, ProviderQuotaSummary>;
}

export interface WeeklyHealthDigestData {
  dateRange: string; // "May 4 – May 10, 2026"
  /** Total errors counted in the rolling 1-hour window. */
  totalErrors: number;
  /** Up to ~10 top-route summaries; sorted by count desc. */
  topRoutes: RouteErrorSummary[];
  /** Counts derived from `/api/v1/health/integrations`. */
  integrations: {
    live: number;
    degraded: number;
    offline: number;
    badEntries: IntegrationStatusEntry[];
  };
  /** Real cache hit ratio from CompositeCache telemetry (US-006). `null` ⇒
   * nothing read yet this window (renders "n/a"). */
  cacheHitRatio: number | null;
  /** Per-provider upstream quota + error-kind counts. Optional; omitted ⇒
   * the quota card is not rendered (back-compat with older callers/tests). */
  quota?: QuotaDigestSection | null;
  /** Most-recent deploy id (Vercel commit SHA, Railway revision, or null). */
  deployId: string | null;
  /** Whether Sentry is configured. False ⇒ counter is sole source. */
  sentryConfigured: boolean;
  /** Operator dashboard URL (CTA). */
  errorsEndpointUrl: string;
}

const POS = '#10b981';
const WARN = '#f59e0b';
const NEG = '#ef4444';

function statusColor(status: 'live' | 'degraded' | 'offline'): string {
  if (status === 'live') return POS;
  if (status === 'degraded') return WARN;
  return NEG;
}

function summaryRow(label: string, value: string, color: string = COLORS.white): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid ${COLORS.border};">
          <span style="font-family:${FONT_MONO};color:${COLORS.textMuted};font-size:11px;letter-spacing:0.18em;text-transform:uppercase;">${escapeHtml(label)}</span>
        </td>
        <td align="right" style="padding:8px 0;border-bottom:1px solid ${COLORS.border};">
          <span style="font-family:${FONT_MONO};color:${color};font-size:13px;font-variant-numeric:tabular-nums;font-weight:600;">${escapeHtml(value)}</span>
        </td>
      </tr>
    </table>`;
}

function routeListRow(route: RouteErrorSummary): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding:6px 0;">
          <div style="font-family:${FONT_MONO};color:${COLORS.text};font-size:12px;">${escapeHtml(route.route)}</div>
          <div style="font-family:${FONT_SANS};color:${COLORS.textDim};font-size:11px;line-height:1.4;">${escapeHtml(route.lastError)}</div>
        </td>
        <td align="right" valign="top" style="padding:6px 0;white-space:nowrap;">
          <span style="font-family:${FONT_MONO};color:${NEG};font-size:13px;font-variant-numeric:tabular-nums;font-weight:600;">${route.count}×</span>
        </td>
      </tr>
    </table>`;
}

function integrationListRow(entry: IntegrationStatusEntry): string {
  const color = statusColor(entry.status);
  const reason = entry.reason
    ? `<div style="font-family:${FONT_SANS};color:${COLORS.textDim};font-size:11px;line-height:1.4;">${escapeHtml(entry.reason)}</div>`
    : '';
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding:6px 0;">
          <div style="font-family:${FONT_MONO};color:${COLORS.text};font-size:12px;">${escapeHtml(entry.name)}</div>
          ${reason}
        </td>
        <td align="right" valign="top" style="padding:6px 0;white-space:nowrap;">
          <span style="font-family:${FONT_MONO};color:${color};font-size:11px;letter-spacing:0.18em;text-transform:uppercase;font-weight:600;">${escapeHtml(entry.status)}</span>
        </td>
      </tr>
    </table>`;
}

/** One provider row in the quota card: rate-limit / auth / plan-tier counts. */
function quotaProviderRow(name: string, p: ProviderQuotaSummary): string {
  const k = p.errorKinds;
  // Alertable kinds (auth/plan-tier) go red when non-zero; rate-limit is amber.
  const authColor = k.auth > 0 ? NEG : COLORS.textMuted;
  const planColor = k.plan_tier > 0 ? NEG : COLORS.textMuted;
  const rateColor = k.rate_limit > 0 ? WARN : COLORS.textMuted;
  const guidance = p.guidance
    ? `<div style="font-family:${FONT_SANS};color:${COLORS.textDim};font-size:11px;line-height:1.4;">${escapeHtml(p.guidance)}</div>`
    : '';
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding:6px 0;border-bottom:1px solid ${COLORS.border};">
          <div style="font-family:${FONT_MONO};color:${COLORS.text};font-size:12px;">${escapeHtml(name)}</div>
          ${guidance}
        </td>
        <td align="right" valign="top" style="padding:6px 0;border-bottom:1px solid ${COLORS.border};white-space:nowrap;">
          <span style="font-family:${FONT_MONO};font-size:11px;font-variant-numeric:tabular-nums;color:${rateColor};">rate ${k.rate_limit}</span>
          <span style="font-family:${FONT_MONO};font-size:11px;font-variant-numeric:tabular-nums;color:${authColor};margin-left:10px;">auth ${k.auth}</span>
          <span style="font-family:${FONT_MONO};font-size:11px;font-variant-numeric:tabular-nums;color:${planColor};margin-left:10px;">plan ${k.plan_tier}</span>
        </td>
      </tr>
    </table>`;
}

export function renderWeeklyHealthDigest(
  data: WeeklyHealthDigestData
): EmailPayload {
  const subject = `Frontier Alpha · Health · ${data.dateRange}`;
  const errorColor = data.totalErrors === 0 ? POS : data.totalErrors < 10 ? WARN : NEG;

  // --- Header card --------------------------------------------------------
  const headerBlock = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td>
          ${monoKicker('Weekly Health · Operator Digest', COLORS.textMuted)}
          ${spacer(12)}
          <div style="font-family:${FONT_SANS};font-size:30px;font-weight:700;letter-spacing:-0.01em;line-height:1.15;">
            <span style="color:${COLORS.haloFallback};background:${COLORS.gradHalo};-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;">${escapeHtml(data.dateRange)}</span>
          </div>
          ${spacer(10)}
          <div style="font-family:${FONT_SANS};color:${COLORS.textMuted};font-size:14px;line-height:1.5;">
            Errors, integrations, cache, deploys — your week from the substrate side.
          </div>
        </td>
      </tr>
    </table>`;

  // --- Error summary card -------------------------------------------------
  const errorRows =
    data.topRoutes.length === 0
      ? `<div style="font-family:${FONT_SANS};color:${COLORS.textMuted};font-size:13px;line-height:1.5;">No errored routes in the current 1-hour window.</div>`
      : data.topRoutes.map(routeListRow).join('');

  const errorBlock = `
    ${monoKicker('Errors · Last 1 Hour', COLORS.textMuted)}
    ${spacer(10)}
    ${tabularNum(String(data.totalErrors), errorColor, '28px')}
    <span style="font-family:${FONT_SANS};color:${COLORS.textMuted};font-size:13px;margin-left:8px;">total</span>
    ${spacer(14)}
    ${errorRows}`;

  // --- Integrations card --------------------------------------------------
  const integrationRows =
    data.integrations.badEntries.length === 0
      ? `<div style="font-family:${FONT_SANS};color:${COLORS.textMuted};font-size:13px;line-height:1.5;">All integrations live. Nothing to do.</div>`
      : data.integrations.badEntries.map(integrationListRow).join('');

  const integrationBlock = `
    ${monoKicker('Integrations', COLORS.textMuted)}
    ${spacer(10)}
    ${summaryRow('Live', String(data.integrations.live), POS)}
    ${summaryRow('Degraded', String(data.integrations.degraded), WARN)}
    ${summaryRow('Offline', String(data.integrations.offline), NEG)}
    ${spacer(12)}
    ${integrationRows}`;

  // --- Infra card ---------------------------------------------------------
  const cacheValue =
    data.cacheHitRatio == null
      ? 'n/a · pending US-006'
      : `${(data.cacheHitRatio * 100).toFixed(1)}%`;
  const deployValue = data.deployId ?? 'unknown';

  const infraBlock = `
    ${monoKicker('Infra', COLORS.textMuted)}
    ${spacer(10)}
    ${summaryRow('Cache hit ratio', cacheValue, COLORS.white)}
    ${summaryRow('Latest deploy', deployValue, COLORS.white)}`;

  // --- Provider quota card (optional) -------------------------------------
  const quotaProviders = data.quota
    ? Object.entries(data.quota.providers)
    : [];
  const quotaBlock =
    quotaProviders.length === 0
      ? null
      : `
    ${monoKicker('Upstream Quota · Error Kinds', COLORS.textMuted)}
    ${spacer(6)}
    <div style="font-family:${FONT_SANS};color:${COLORS.textMuted};font-size:12px;line-height:1.5;">Per-provider request outcomes since ${escapeHtml(data.quota!.since)}. rate = 429 rate-limits · auth = 401 revoked/invalid key · plan = 403 plan-tier block.</div>
    ${spacer(10)}
    ${quotaProviders.map(([name, p]) => quotaProviderRow(name, p)).join('')}`;

  // --- Caveat -------------------------------------------------------------
  const caveatText = data.sentryConfigured
    ? 'Sentry is configured. The error counter and Sentry are dual sources; cross-reference via X-Request-Id tag for any specific incident.'
    : 'Sentry DSN is not configured. The in-process counter is the sole error source. Cold-starts on Vercel reset it; long-running Railway workers retain a fuller window. To raise the ceiling, add SENTRY_DSN + VITE_SENTRY_DSN.';

  const caveatBlock = `
    <div style="font-family:${FONT_SANS};color:${COLORS.textMuted};font-size:12px;line-height:1.5;font-style:italic;">
      ${escapeHtml(caveatText)}
    </div>`;

  const body = `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td style="padding:8px 32px 32px 32px;">
        ${card({ body: headerBlock })}
        ${spacer(16)}
        ${card({ body: errorBlock })}
        ${spacer(16)}
        ${card({ body: integrationBlock })}
        ${spacer(16)}
        ${card({ body: infraBlock })}
        ${spacer(16)}
        ${quotaBlock ? `${card({ body: quotaBlock })}${spacer(16)}` : ''}
        ${card({ body: caveatBlock, padding: '16px 20px' })}
        ${spacer(24)}
        ${cta({ href: data.errorsEndpointUrl, label: 'Open /health/errors', accent: 'halo' })}
        ${spacer(16)}
        <div style="font-family:${FONT_MONO};color:${COLORS.textDim};font-size:10px;letter-spacing:0.2em;text-transform:uppercase;">Digest generated ${escapeHtml(new Date().toUTCString())}</div>
      </td>
    </tr>
  </table>`;

  const html = shell({
    accent: 'halo',
    preheader: `${data.dateRange} · ${data.totalErrors} errors · ${data.integrations.degraded + data.integrations.offline} bad integrations`,
    body,
  });

  const textRoutes = data.topRoutes.length
    ? data.topRoutes
        .map((r) => `  ${r.count}× ${r.route} — ${r.lastError}`)
        .join('\n')
    : '  (none)';
  const textIntegrations = data.integrations.badEntries.length
    ? data.integrations.badEntries
        .map(
          (e) =>
            `  ${e.status.padEnd(9)} ${e.name}${e.reason ? ` — ${e.reason}` : ''}`
        )
        .join('\n')
    : '  (all live)';

  const textQuota =
    quotaProviders.length === 0
      ? null
      : quotaProviders
          .map(
            ([name, p]) =>
              `  ${name.padEnd(13)} rate ${p.errorKinds.rate_limit} · auth ${p.errorKinds.auth} · plan ${p.errorKinds.plan_tier}${p.guidance ? ` — ${p.guidance}` : ''}`
          )
          .join('\n');

  const text = [
    `FRONTIER ALPHA · WEEKLY HEALTH DIGEST · ${data.dateRange}`,
    '',
    `Total errors (1h window): ${data.totalErrors}`,
    'Top routes:',
    textRoutes,
    '',
    `Integrations: ${data.integrations.live} live / ${data.integrations.degraded} degraded / ${data.integrations.offline} offline`,
    textIntegrations,
    '',
    `Cache hit ratio: ${cacheValue}`,
    `Latest deploy: ${deployValue}`,
    ...(textQuota
      ? ['', `Upstream quota (since ${data.quota!.since}):`, textQuota]
      : []),
    '',
    caveatText,
    '',
    `Open /health/errors: ${data.errorsEndpointUrl}`,
    '',
    '— FRONTIER ALPHA · METAVENTIONSAI.COM',
  ].join('\n');

  return { subject, html, text };
}
