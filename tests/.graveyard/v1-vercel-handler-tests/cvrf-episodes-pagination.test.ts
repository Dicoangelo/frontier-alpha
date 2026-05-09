/**
 * Unit Test: CVRF Episodes Pagination (US-011)
 * Verifies that the episodes endpoint correctly paginates results.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Mock auth to always succeed
vi.mock('../../api/lib/auth.js', () => ({
  requireAuth: vi.fn().mockResolvedValue({ id: 'test-user', email: 'test@example.com' }),
}));

// Generate mock episodes
function mockEpisode(n: number) {
  return {
    id: `episode_${n}_${Date.now()}`,
    episodeNumber: n,
    startDate: new Date(Date.now() - n * 86400000),
    endDate: new Date(Date.now() - (n - 1) * 86400000),
    decisions: Array.from({ length: 3 }, (_, i) => ({
      id: `decision_${n}_${i}`,
      timestamp: new Date(),
      symbol: 'AAPL',
      action: 'buy' as const,
      weightBefore: 0,
      weightAfter: 0.1,
      reason: 'test',
      confidence: 0.8,
      factors: [],
    })),
    portfolioReturn: Math.random() * 0.1 - 0.05,
    sharpeRatio: Math.random() * 2,
    maxDrawdown: Math.random() * 0.05,
    volatility: Math.random() * 0.2,
    factorExposures: [],
  };
}

// Create 100 mock episodes
const ALL_EPISODES = Array.from({ length: 100 }, (_, i) => mockEpisode(i + 1));

// Mock persistence
vi.mock('../../src/cvrf/persistence.js', () => ({
  getRecentEpisodes: vi.fn((_userId: string | null, limit: number, offset: number) => {
    return Promise.resolve(ALL_EPISODES.slice(offset, offset + limit));
  }),
  getCompletedEpisodesCount: vi.fn(() => {
    return Promise.resolve(ALL_EPISODES.length);
  }),
}));

// Mock PersistentCVRFManager
vi.mock('../../src/cvrf/PersistentCVRFManager.js', () => ({
  createPersistentCVRFManager: vi.fn(() =>
    Promise.resolve({
      getCurrentEpisode: () => null,
    })
  ),
}));

// Import handler after mocks
import handler from '../../api/v1/cvrf/episodes.js';

function createMockReq(query: Record<string, string> = {}): VercelRequest {
  return {
    method: 'GET',
    query,
    headers: { authorization: 'Bearer valid-token' },
  } as unknown as VercelRequest;
}

function createMockRes() {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let body: any = null;

  const res = {
    setHeader: vi.fn((key: string, value: string) => {
      headers[key] = value;
      return res;
    }),
    status: vi.fn((code: number) => {
      statusCode = code;
      return res;
    }),
    json: vi.fn((data: any) => {
      body = data;
      return res;
    }),
    end: vi.fn(() => res),
    getStatusCode: () => statusCode,
    getBody: () => body,
    getHeaders: () => headers,
  } as unknown as VercelResponse & {
    getStatusCode: () => number;
    getBody: () => any;
    getHeaders: () => Record<string, string>;
  };

  return res;
}

describe('CVRF Episodes Pagination (US-011)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return default 50 episodes when no limit specified', async () => {
    const req = createMockReq();
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalled();

    const body = (res.json as any).mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data.completed).toHaveLength(50);
    expect(body.data.pagination.limit).toBe(50);
    expect(body.data.pagination.offset).toBe(0);
    expect(body.data.pagination.total).toBe(100);
    expect(body.data.pagination.hasMore).toBe(true);
  });

  it('100 episodes returns only first 50 with hasMore: true', async () => {
    const req = createMockReq({ limit: '50', offset: '0' });
    const res = createMockRes();

    await handler(req, res);

    const body = (res.json as any).mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data.completed).toHaveLength(50);
    expect(body.data.pagination.hasMore).toBe(true);
    expect(body.data.pagination.total).toBe(100);
    expect(body.data.totalEpisodes).toBe(100); // no active episode
  });

  it('should return second page with offset=50', async () => {
    const req = createMockReq({ limit: '50', offset: '50' });
    const res = createMockRes();

    await handler(req, res);

    const body = (res.json as any).mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data.completed).toHaveLength(50);
    expect(body.data.pagination.offset).toBe(50);
    expect(body.data.pagination.hasMore).toBe(false);
  });

  it('should respect custom limit parameter', async () => {
    const req = createMockReq({ limit: '10' });
    const res = createMockRes();

    await handler(req, res);

    const body = (res.json as any).mock.calls[0][0];
    expect(body.data.completed).toHaveLength(10);
    expect(body.data.pagination.limit).toBe(10);
    expect(body.data.pagination.hasMore).toBe(true);
  });

  it('should cap limit at 200', async () => {
    const req = createMockReq({ limit: '500' });
    const res = createMockRes();

    await handler(req, res);

    const body = (res.json as any).mock.calls[0][0];
    expect(body.data.pagination.limit).toBe(200);
  });

  it('should default to 50 for invalid limit', async () => {
    const req = createMockReq({ limit: 'abc' });
    const res = createMockRes();

    await handler(req, res);

    const body = (res.json as any).mock.calls[0][0];
    expect(body.data.pagination.limit).toBe(50);
  });

  it('should return decisionsCount per episode by default (no expand)', async () => {
    const req = createMockReq({ limit: '5' });
    const res = createMockRes();

    await handler(req, res);

    const body = (res.json as any).mock.calls[0][0];
    const episode = body.data.completed[0];
    expect(episode).toHaveProperty('decisionsCount');
    expect(episode).not.toHaveProperty('decisions');
  });

  it('should include full decisions when expand=decisions', async () => {
    const req = createMockReq({ limit: '5', expand: 'decisions' });
    const res = createMockRes();

    await handler(req, res);

    const body = (res.json as any).mock.calls[0][0];
    const episode = body.data.completed[0];
    expect(episode).toHaveProperty('decisionsCount');
    expect(episode).toHaveProperty('decisions');
    expect(Array.isArray(episode.decisions)).toBe(true);
  });

  it('should include pagination metadata in response', async () => {
    const req = createMockReq({ limit: '25', offset: '10' });
    const res = createMockRes();

    await handler(req, res);

    const body = (res.json as any).mock.calls[0][0];
    expect(body.data.pagination).toEqual({
      total: 100,
      limit: 25,
      offset: 10,
      hasMore: true,
    });
  });
});
