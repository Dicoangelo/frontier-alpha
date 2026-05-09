/**
 * E2E Test: Factor History Endpoint
 *
 * Verifies GET /api/v1/portfolio/factors/history/:symbols?window=1d|5d.
 * Like the sibling factors.test.ts file, factor endpoints depend on external
 * APIs (Polygon, Alpha Vantage). 500/503 are accepted as "external API
 * unavailable" and not test failures.
 */

import { describe, it, expect } from 'vitest';
import { EXTERNAL_API_STATUSES, isExternalApiError } from '../setup';

const API_BASE = process.env.TEST_API_URL || 'http://localhost:3000';

describe('Factor History Endpoint', () => {
  it('returns current + prior factor snapshots, or external API unavailable', async () => {
    const response = await fetch(
      `${API_BASE}/api/v1/portfolio/factors/history/AAPL,MSFT?window=1d`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      }
    );

    expect(EXTERNAL_API_STATUSES).toContain(response.status);

    if (response.status === 200) {
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
      expect(body.data.window).toBe('1d');
      expect(body.data.current).toBeDefined();
      expect(body.data.prior).toBeDefined();
      expect(typeof body.data.asOfDate).toBe('string');
      expect(typeof body.data.priorDate).toBe('string');
    }
  });

  it('accepts the 5d window value', async () => {
    const response = await fetch(
      `${API_BASE}/api/v1/portfolio/factors/history/AAPL?window=5d`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      }
    );

    if (isExternalApiError(response.status)) {
      expect(true).toBe(true);
      return;
    }

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.window).toBe('5d');
  });

  it('rejects unsupported window values with 400', async () => {
    const response = await fetch(
      `${API_BASE}/api/v1/portfolio/factors/history/AAPL?window=banana`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      }
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNSUPPORTED_WINDOW');
  });

  it('defaults to 1d when window omitted', async () => {
    const response = await fetch(
      `${API_BASE}/api/v1/portfolio/factors/history/AAPL`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      }
    );

    if (isExternalApiError(response.status)) {
      expect(true).toBe(true);
      return;
    }

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.window).toBe('1d');
  });

  it('includes meta with requestId on successful response', async () => {
    const response = await fetch(
      `${API_BASE}/api/v1/portfolio/factors/history/AAPL?window=1d`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      }
    );

    if (isExternalApiError(response.status)) {
      expect(true).toBe(true);
      return;
    }

    const body = await response.json();
    expect(body.meta).toBeDefined();
    expect(body.meta.requestId).toBeDefined();
  });
});
