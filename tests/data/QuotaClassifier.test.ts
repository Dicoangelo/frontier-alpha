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
  recordUpstreamError,
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
