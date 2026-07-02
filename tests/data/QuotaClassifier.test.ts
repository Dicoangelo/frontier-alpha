/**
 * Unit tests for upstream quota-impact classification (IDEA-CIN-5).
 *
 * The single invariant that matters: a 429 (or rate-limit body) is counted
 * as quota BURNED, a malformed/auth rejection is FREE, and a 5xx is the
 * provider's fault — because the right backoff strategy differs per class.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  classifyHttpStatus,
  classifyErrorBody,
  classifyErrorKind,
  isAlertableErrorKind,
  recordUpstreamError,
  recordProviderError,
  getErrorKindCount,
  getQuotaStats,
  resetQuotaStats,
  BACKOFF_GUIDANCE,
} from '../../src/data/QuotaClassifier.js';

beforeEach(() => {
  resetQuotaStats();
});

describe('classifyHttpStatus', () => {
  it('classifies 429 as quota_burned', () => {
    expect(classifyHttpStatus(429)).toBe('quota_burned');
  });

  it('classifies request-shaped rejections as quota_free', () => {
    for (const status of [400, 401, 403, 404, 422]) {
      expect(classifyHttpStatus(status)).toBe('quota_free');
    }
  });

  it('classifies 5xx as provider_fault', () => {
    for (const status of [500, 502, 503]) {
      expect(classifyHttpStatus(status)).toBe('provider_fault');
    }
  });
});

describe('classifyErrorBody', () => {
  it('detects Polygon rate-limit language', () => {
    expect(
      classifyErrorBody("You've exceeded the maximum requests per minute"),
    ).toBe('quota_burned');
  });

  it('detects Alpha Vantage call-frequency language', () => {
    expect(
      classifyErrorBody('Our standard API call frequency is 25 requests per day'),
    ).toBe('quota_burned');
  });

  it('treats invalid-key rejections as quota_free', () => {
    expect(classifyErrorBody('Unknown API Key')).toBe('quota_free');
    expect(classifyErrorBody('Invalid symbol XYZQ')).toBe('quota_free');
  });
});

describe('recordUpstreamError / getQuotaStats', () => {
  it('accumulates per-provider, per-class counts', () => {
    recordUpstreamError('polygon', 'quota_burned');
    recordUpstreamError('polygon', 'quota_burned');
    recordUpstreamError('polygon', 'quota_free');
    recordUpstreamError('alphaVantage', 'provider_fault');

    const stats = getQuotaStats();
    expect(stats.providers.polygon.quota_burned).toBe(2);
    expect(stats.providers.polygon.quota_free).toBe(1);
    expect(stats.providers.alphaVantage.provider_fault).toBe(1);
  });

  it('tracks the alpaca failover provider independently', () => {
    recordUpstreamError('alpaca', 'provider_fault');
    recordUpstreamError('alpaca', 'quota_free');

    const stats = getQuotaStats();
    expect(stats.providers.alpaca.provider_fault).toBe(1);
    expect(stats.providers.alpaca.quota_free).toBe(1);
    // Independent from the other providers.
    expect(stats.providers.polygon.provider_fault).toBe(0);
    expect(stats.providers.alphaVantage.provider_fault).toBe(0);
  });

  it('surfaces guidance for the dominant error class', () => {
    recordUpstreamError('polygon', 'quota_burned');
    recordUpstreamError('polygon', 'quota_burned');
    recordUpstreamError('polygon', 'provider_fault');

    const stats = getQuotaStats();
    expect(stats.providers.polygon.guidance).toBe(BACKOFF_GUIDANCE.quota_burned);
  });

  it('reports null guidance when no errors are recorded', () => {
    const stats = getQuotaStats();
    expect(stats.providers.polygon.guidance).toBeNull();
    expect(stats.providers.alphaVantage.guidance).toBeNull();
  });

  it('resets counts and tracking window', () => {
    recordUpstreamError('polygon', 'quota_burned');
    resetQuotaStats();
    const stats = getQuotaStats();
    expect(stats.providers.polygon.quota_burned).toBe(0);
  });
});

describe('classifyErrorKind (C3 — operational error axis)', () => {
  it('distinguishes the two human-actionable cases from benign client errors', () => {
    expect(classifyErrorKind(429)).toBe('rate_limit');
    expect(classifyErrorKind(401)).toBe('auth'); // revoked/invalid key
    expect(classifyErrorKind(403)).toBe('plan_tier'); // entitlement block
    expect(classifyErrorKind(400)).toBe('client_error');
    expect(classifyErrorKind(404)).toBe('client_error');
    expect(classifyErrorKind(422)).toBe('client_error');
    expect(classifyErrorKind(500)).toBe('server_fault');
    expect(classifyErrorKind(503)).toBe('server_fault');
  });

  it('flags only auth + plan_tier as alertable', () => {
    expect(isAlertableErrorKind('auth')).toBe(true);
    expect(isAlertableErrorKind('plan_tier')).toBe(true);
    expect(isAlertableErrorKind('rate_limit')).toBe(false);
    expect(isAlertableErrorKind('client_error')).toBe(false);
    expect(isAlertableErrorKind('server_fault')).toBe(false);
  });
});

describe('recordProviderError (dual-axis recorder)', () => {
  it('records both quota impact and operational kind from one status', () => {
    const r = recordProviderError('polygon', 401);
    expect(r.impact).toBe('quota_free'); // auth rejection is not metered
    expect(r.kind).toBe('auth');

    const stats = getQuotaStats();
    expect(stats.providers.polygon.quota_free).toBe(1);
    expect(stats.providers.polygon.errorKinds.auth).toBe(1);
    expect(getErrorKindCount('polygon', 'auth')).toBe(1);
  });

  it('separates a revoked key (401) from a plan-tier block (403)', () => {
    recordProviderError('polygon', 401);
    recordProviderError('polygon', 403);
    recordProviderError('polygon', 403);

    expect(getErrorKindCount('polygon', 'auth')).toBe(1);
    expect(getErrorKindCount('polygon', 'plan_tier')).toBe(2);
    // Both still land in the quota_free bucket for budget accounting.
    expect(getQuotaStats().providers.polygon.quota_free).toBe(3);
  });

  it('counts a 429 as both quota_burned and rate_limit kind', () => {
    recordProviderError('alpaca', 429);
    const stats = getQuotaStats();
    expect(stats.providers.alpaca.quota_burned).toBe(1);
    expect(stats.providers.alpaca.errorKinds.rate_limit).toBe(1);
  });

  it('resetQuotaStats clears error-kind counters too', () => {
    recordProviderError('polygon', 401);
    resetQuotaStats();
    expect(getErrorKindCount('polygon', 'auth')).toBe(0);
    expect(getQuotaStats().providers.polygon.errorKinds.auth).toBe(0);
  });
});
