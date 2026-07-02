/**
 * Upstream Error Quota Classification (IDEA-CIN-5)
 *
 * Classifies every upstream data-provider failure by whether it consumed
 * quota. A rate-limited call (HTTP 429) DID burn a metered request; a
 * malformed query or auth rejection did not; a 5xx is the provider's fault
 * and says nothing about our budget. (Polygon Stocks Starter has no per-minute
 * call ceiling, but Alpha Vantage's free tier does — 25 req/day — so the
 * quota signal still matters for the failover providers.) Different backoff
 * strategies follow from each class — and the v1.3.7 cache-thrashing
 * investigation would have been faster with this signal in the logs.
 *
 * In-memory counters reset on process restart (same posture as ErrorCounter).
 * Also mirrored into the Prometheus registry as `upstream_errors_total`.
 */

import { metrics } from '../observability/metrics.js';

export type QuotaImpact =
  /** The call counted against our quota (rate limit hit, or served-then-rejected). */
  | 'quota_burned'
  /** Rejected before serving — malformed query, bad symbol, auth failure. Free. */
  | 'quota_free'
  /** Upstream 5xx / network fault. Says nothing about our budget. */
  | 'provider_fault';

export type UpstreamProvider = 'polygon' | 'alpaca' | 'alphaVantage';

metrics.registerCounter(
  'upstream_errors_total',
  'Upstream data-provider errors classified by quota impact',
);

/** Recommended caller behavior per class; included in logs for the operator. */
export const BACKOFF_GUIDANCE: Record<QuotaImpact, string> = {
  quota_burned: 'back off the full rate window before retrying',
  quota_free: 'fix the request — retrying as-is burns nothing but never succeeds',
  provider_fault: 'retry with jitter; consider provider failover',
};

/** Classify an HTTP error status from an upstream provider. */
export function classifyHttpStatus(status: number): QuotaImpact {
  if (status === 429) return 'quota_burned';
  if (status >= 500) return 'provider_fault';
  // 400/401/403/404/422 — rejected at the door, not metered.
  return 'quota_free';
}

/**
 * Orthogonal to QuotaImpact (which is about *budget* accounting), this is the
 * *operational* class of the failure — what a human should DO about it.
 * `classifyHttpStatus` collapses 400/401/403/404/422 into a single
 * `quota_free` bucket, which is right for quota math but hides the two cases
 * that need a human: a revoked/invalid key (401) and a plan-tier block (403).
 */
export type ProviderErrorKind =
  /** 429 — rate limited. Back off; transient. */
  | 'rate_limit'
  /** 401 — key invalid, revoked, or truncated. ALERT: needs key rotation. */
  | 'auth'
  /** 403 — entitlement/plan-tier block. Surface the plan limit, not an outage. */
  | 'plan_tier'
  /** 400/404/422 — malformed query or bad symbol. Benign; fix the request. */
  | 'client_error'
  /** 5xx / network — the provider's fault. Retry with jitter, then failover. */
  | 'server_fault';

/** Map an HTTP status to its operational error kind. */
export function classifyErrorKind(status: number): ProviderErrorKind {
  if (status === 429) return 'rate_limit';
  if (status === 401) return 'auth';
  if (status === 403) return 'plan_tier';
  if (status >= 500) return 'server_fault';
  return 'client_error';
}

/** Kinds that warrant an operator alert rather than silent failover. */
export function isAlertableErrorKind(kind: ProviderErrorKind): boolean {
  return kind === 'auth' || kind === 'plan_tier';
}

/**
 * Classify a 200-with-error-body response (both Polygon and Alpha Vantage
 * signal rate limits inside successful HTTP responses). Rate-limit language
 * means the request was metered; anything else is a free rejection.
 */
export function classifyErrorBody(reason: string): QuotaImpact {
  const text = reason.toLowerCase();
  if (
    text.includes('rate limit') ||
    text.includes('exceeded the maximum') ||
    text.includes('too many requests') ||
    text.includes('requests per minute') ||
    text.includes('call frequency')
  ) {
    return 'quota_burned';
  }
  return 'quota_free';
}

interface QuotaStats {
  quota_burned: number;
  quota_free: number;
  provider_fault: number;
}

type ErrorKindStats = Record<ProviderErrorKind, number>;

const emptyKindStats = (): ErrorKindStats => ({
  rate_limit: 0,
  auth: 0,
  plan_tier: 0,
  client_error: 0,
  server_fault: 0,
});

const stats: Record<UpstreamProvider, QuotaStats> = {
  polygon: { quota_burned: 0, quota_free: 0, provider_fault: 0 },
  alpaca: { quota_burned: 0, quota_free: 0, provider_fault: 0 },
  alphaVantage: { quota_burned: 0, quota_free: 0, provider_fault: 0 },
};

const kindStats: Record<UpstreamProvider, ErrorKindStats> = {
  polygon: emptyKindStats(),
  alpaca: emptyKindStats(),
  alphaVantage: emptyKindStats(),
};

metrics.registerCounter(
  'upstream_error_kinds_total',
  'Upstream data-provider errors classified by operational kind',
);

let trackingSince = new Date();

/** Record one classified upstream error. Returns the class for log enrichment. */
export function recordUpstreamError(provider: UpstreamProvider, impact: QuotaImpact): QuotaImpact {
  stats[provider][impact]++;
  metrics.incCounter('upstream_errors_total', { provider, impact });
  return impact;
}

/**
 * Record an HTTP error from a provider on BOTH axes at once — quota impact
 * (for budget math) and operational kind (for alerting). Prefer this over
 * calling `recordUpstreamError(provider, classifyHttpStatus(status))` at fetch
 * sites so the auth/plan-tier signal is captured for E1 alerting.
 */
export function recordProviderError(
  provider: UpstreamProvider,
  status: number,
): { impact: QuotaImpact; kind: ProviderErrorKind } {
  const impact = classifyHttpStatus(status);
  const kind = classifyErrorKind(status);
  stats[provider][impact]++;
  kindStats[provider][kind]++;
  metrics.incCounter('upstream_errors_total', { provider, impact });
  metrics.incCounter('upstream_error_kinds_total', { provider, kind });
  return { impact, kind };
}

/** Per-provider count of a given operational error kind since tracking began. */
export function getErrorKindCount(provider: UpstreamProvider, kind: ProviderErrorKind): number {
  return kindStats[provider][kind];
}

/** Snapshot for the health surface. */
export function getQuotaStats(): {
  since: string;
  providers: Record<
    UpstreamProvider,
    QuotaStats & { guidance: string | null; errorKinds: ErrorKindStats }
  >;
} {
  const withGuidance = (
    provider: UpstreamProvider,
  ): QuotaStats & { guidance: string | null; errorKinds: ErrorKindStats } => {
    const s = stats[provider];
    // Surface the guidance for the dominant error class so the operator's
    // first glance at /health/quota says what to do next.
    const dominant = (Object.entries(s) as Array<[QuotaImpact, number]>).sort((a, b) => b[1] - a[1])[0];
    return {
      ...s,
      guidance: dominant[1] > 0 ? BACKOFF_GUIDANCE[dominant[0]] : null,
      errorKinds: { ...kindStats[provider] },
    };
  };
  return {
    since: trackingSince.toISOString(),
    providers: {
      polygon: withGuidance('polygon'),
      alpaca: withGuidance('alpaca'),
      alphaVantage: withGuidance('alphaVantage'),
    },
  };
}

/** Reset counters (test seam). */
export function resetQuotaStats(): void {
  for (const provider of Object.keys(stats) as UpstreamProvider[]) {
    stats[provider] = { quota_burned: 0, quota_free: 0, provider_fault: 0 };
    kindStats[provider] = emptyKindStats();
  }
  trackingSince = new Date();
}
