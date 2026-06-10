/**
 * Route tests for the insight provenance ledger endpoints (IDEA-CIN-2).
 *
 *   GET  /api/v1/insights/history
 *   POST /api/v1/insights/:id/rating
 *
 * auth middleware is mocked to inject a fixed user; the InsightLedger service
 * is mocked so these tests exercise the route layer (validation, status codes,
 * response envelope) without touching Supabase.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

vi.hoisted(() => {
  process.env.SUPABASE_URL ??= 'http://localhost:54321';
  process.env.SUPABASE_SERVICE_KEY ??= 'test-service-key';
});

const TEST_USER = { id: 'user-abc', email: 'u@example.com', aud: 'authenticated' };

// authMiddleware stub — injects request.user unless a header opts out.
vi.mock('../../src/middleware/auth.js', () => ({
  authMiddleware: vi.fn(async (request: { user?: unknown; headers: Record<string, string> }) => {
    if (request.headers['x-no-auth'] !== '1') {
      request.user = TEST_USER;
    }
  }),
}));

const getHistory = vi.fn();
const rate = vi.fn();

vi.mock('../../src/insights/InsightLedger.js', () => ({
  insightLedger: {
    getHistory: (...a: unknown[]) => getHistory(...a),
    rate: (...a: unknown[]) => rate(...a),
  },
}));

vi.mock('../../src/observability/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { insightsRoutes } from '../../src/routes/insights.js';

async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(insightsRoutes);
  await app.ready();
  return app;
}

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();
  app = await buildTestApp();
});

describe('GET /api/v1/insights/history', () => {
  it('returns paginated history for the authed user', async () => {
    getHistory.mockResolvedValue({ entries: [{ id: 'ins-1' }], total: 1, limit: 25, offset: 0 });

    const res = await app.inject({ method: 'GET', url: '/api/v1/insights/history?limit=10&offset=0' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.entries).toHaveLength(1);
    expect(getHistory).toHaveBeenCalledWith('user-abc', { limit: 10, offset: 0 });
  });

  it('401s when there is no authenticated user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/insights/history',
      headers: { 'x-no-auth': '1' },
    });
    expect(res.statusCode).toBe(401);
    expect(getHistory).not.toHaveBeenCalled();
  });

  it('passes undefined for non-numeric pagination params', async () => {
    getHistory.mockResolvedValue({ entries: [], total: 0, limit: 25, offset: 0 });
    await app.inject({ method: 'GET', url: '/api/v1/insights/history?limit=abc' });
    expect(getHistory).toHaveBeenCalledWith('user-abc', { limit: undefined, offset: undefined });
  });
});

describe('POST /api/v1/insights/:id/rating', () => {
  it('rates an insight and returns the updated row', async () => {
    rate.mockResolvedValue({ id: 'ins-1', user_rating: 5 });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/insights/ins-1/rating',
      payload: { rating: 5 },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.user_rating).toBe(5);
    expect(rate).toHaveBeenCalledWith('user-abc', 'ins-1', 5);
  });

  it('400s on an out-of-range rating', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/insights/ins-1/rating',
      payload: { rating: 9 },
    });
    expect(res.statusCode).toBe(400);
    expect(rate).not.toHaveBeenCalled();
  });

  it('400s on a non-integer rating', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/insights/ins-1/rating',
      payload: { rating: 2.5 },
    });
    expect(res.statusCode).toBe(400);
    expect(rate).not.toHaveBeenCalled();
  });

  it('accepts the -1 thumbs-down sentinel', async () => {
    rate.mockResolvedValue({ id: 'ins-1', user_rating: -1 });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/insights/ins-1/rating',
      payload: { rating: -1 },
    });
    expect(res.statusCode).toBe(200);
    expect(rate).toHaveBeenCalledWith('user-abc', 'ins-1', -1);
  });

  it('404s when the insight is not found / not owned', async () => {
    rate.mockResolvedValue(null);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/insights/missing/rating',
      payload: { rating: 5 },
    });
    expect(res.statusCode).toBe(404);
  });

  it('401s when there is no authenticated user', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/insights/ins-1/rating',
      payload: { rating: 5 },
      headers: { 'x-no-auth': '1' },
    });
    expect(res.statusCode).toBe(401);
    expect(rate).not.toHaveBeenCalled();
  });
});
