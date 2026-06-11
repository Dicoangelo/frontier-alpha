/**
 * Upstream Error Quota Classification (IDEA-CIN-5)
 *
 * Classifies every upstream data-provider failure by whether it consumed
 * quota. A rate-limited Polygon call DID burn a request against the 5/min
 * ceiling; a malformed query or auth rejection did not; a 5xx is the
 * provider's fault and says nothing about our budget. Different backoff
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

export type UpstreamProvider = 'polygon' | 'alphaVantage';

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

const stats: Record<UpstreamProvider, QuotaStats> = {
  polygon: { quota_burned: 0, quota_free: 0, provider_fault: 0 },
  alphaVantage: { quota_burned: 0, quota_free: 0, provider_fault: 0 },
};

let trackingSince = new Date();

/** Record one classified upstream error. Returns the class for log enrichment. */
export function recordUpstreamError(provider: UpstreamProvider, impact: QuotaImpact): QuotaImpact {
  stats[provider][impact]++;
  metrics.incCounter('upstream_errors_total', { provider, impact });
  return impact;
}

/** Snapshot for the health surface. */
export function getQuotaStats(): {
  since: string;
  providers: Record<UpstreamProvider, QuotaStats & { guidance: string | null }>;
} {
  const withGuidance = (s: QuotaStats): QuotaStats & { guidance: string | null } => {
    // Surface the guidance for the dominant error class so the operator's
    // first glance at /health/quota says what to do next.
    const dominant = (Object.entries(s) as Array<[QuotaImpact, number]>).sort((a, b) => b[1] - a[1])[0];
    return { ...s, guidance: dominant[1] > 0 ? BACKOFF_GUIDANCE[dominant[0]] : null };
  };
  return {
    since: trackingSince.toISOString(),
    providers: {
      polygon: withGuidance(stats.polygon),
      alphaVantage: withGuidance(stats.alphaVantage),
    },
  };
}

/** Reset counters (test seam). */
export function resetQuotaStats(): void {
  for (const provider of Object.keys(stats) as UpstreamProvider[]) {
    stats[provider] = { quota_burned: 0, quota_free: 0, provider_fault: 0 };
  }
  trackingSince = new Date();
}
