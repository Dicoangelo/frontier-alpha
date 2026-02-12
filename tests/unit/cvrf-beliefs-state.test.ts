/**
 * Unit Test: CVRF Belief State API (US-022)
 * Tests beliefs/current, beliefs/timeline, and beliefs/correlations endpoints.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// ---------- Shared helpers ----------

function createMockReq(overrides: Partial<VercelRequest> = {}): VercelRequest {
  return {
    method: 'GET',
    headers: { authorization: 'Bearer test-token' },
    query: {},
    ...overrides,
  } as unknown as VercelRequest;
}

function createMockRes(): VercelResponse & { _status: number; _json: any; _headers: Record<string, string> } {
  const res: any = {
    _status: 0,
    _json: null,
    _headers: {} as Record<string, string>,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(body: any) {
      res._json = body;
      return res;
    },
    end() {
      return res;
    },
    setHeader(name: string, value: string) {
      res._headers[name] = value;
      return res;
    },
    getHeader(name: string) {
      return res._headers[name];
    },
  };
  return res;
}

// ---------- Mock auth ----------

vi.mock('../../api/lib/auth.js', () => ({
  requireAuth: vi.fn().mockResolvedValue({ id: 'test-user', email: 'test@example.com', aud: 'authenticated' }),
}));

// ---------- Mock beliefs and cycle history ----------

const mockBeliefs = {
  id: 'beliefs_test',
  version: 3,
  updatedAt: new Date('2026-02-10'),
  factorWeights: new Map([
    ['momentum', 0.25],
    ['value', 0.15],
    ['quality', 0.22],
    ['volatility', 0.18],
    ['sentiment', 0.20],
  ]),
  factorConfidences: new Map([
    ['momentum', 0.8],
    ['value', 0.6],
    ['quality', 0.7],
    ['volatility', 0.5],
    ['sentiment', 0.65],
  ]),
  riskTolerance: 0.15,
  maxDrawdownThreshold: 0.10,
  volatilityTarget: 0.15,
  momentumHorizon: 21,
  meanReversionThreshold: 2.0,
  concentrationLimit: 0.20,
  minPositionSize: 0.02,
  rebalanceThreshold: 0.05,
  currentRegime: 'bull' as const,
  regimeConfidence: 0.75,
  conceptualPriors: [],
};

function mockCycle(daysAgo: number, factors: Record<string, number>) {
  return {
    cycleId: `cycle_${daysAgo}`,
    timestamp: new Date(Date.now() - daysAgo * 86400000),
    episodeComparison: {
      performanceDelta: 0.02,
      decisionOverlap: 0.4,
      betterEpisode: { id: 'ep1', startDate: new Date(), decisions: [], factorExposures: [] },
      worseEpisode: { id: 'ep2', startDate: new Date(), decisions: [], factorExposures: [] },
      profitableTrades: [],
      losingTrades: [],
    },
    extractedInsights: [
      { id: 'ins1', type: 'factor', concept: 'momentum strong', evidence: [], confidence: 0.8, sourceEpisode: 'ep1', impactDirection: 'positive' },
    ],
    metaPrompt: {
      optimizationDirection: 'increase momentum',
      keyLearnings: [],
      factorAdjustments: new Map(),
      riskGuidance: '',
      timingInsights: '',
      generatedAt: new Date(),
    },
    beliefUpdates: [],
    newBeliefState: {
      ...mockBeliefs,
      factorWeights: new Map(Object.entries(factors)),
      factorConfidences: new Map(Object.entries(factors).map(([k, v]) => [k, v + 0.1])),
    },
    explanation: 'test cycle',
  };
}

const mockCycles = [
  mockCycle(5, { momentum: 0.25, value: 0.15, quality: 0.22, volatility: 0.18, sentiment: 0.20 }),
  mockCycle(10, { momentum: 0.22, value: 0.18, quality: 0.20, volatility: 0.20, sentiment: 0.20 }),
  mockCycle(15, { momentum: 0.20, value: 0.20, quality: 0.20, volatility: 0.20, sentiment: 0.20 }),
  mockCycle(60, { momentum: 0.18, value: 0.22, quality: 0.20, volatility: 0.20, sentiment: 0.20 }),
];

vi.mock('../../src/cvrf/PersistentCVRFManager.js', () => ({
  createPersistentCVRFManager: vi.fn(() =>
    Promise.resolve({
      getCurrentBeliefs: () => mockBeliefs,
      getCycleHistory: () => mockCycles,
    })
  ),
}));

// ======================================================================
// beliefs/current
// ======================================================================

describe('GET /api/v1/cvrf/beliefs/current', () => {
  let handler: (req: VercelRequest, res: VercelResponse) => Promise<any>;

  beforeEach(async () => {
    const mod = await import('../../api/v1/cvrf/beliefs/current.js');
    handler = mod.default;
  });

  it('returns 80+ factors with conviction scores', async () => {
    const req = createMockReq();
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.success).toBe(true);

    const { beliefs: factors, totalFactors } = res._json.data;
    expect(totalFactors).toBeGreaterThanOrEqual(80);
    expect(factors.length).toBe(totalFactors);

    // Every factor must have required shape
    for (const f of factors) {
      expect(f).toHaveProperty('factorId');
      expect(f).toHaveProperty('factorName');
      expect(f).toHaveProperty('category');
      expect(f).toHaveProperty('conviction');
      expect(f).toHaveProperty('direction');
      expect(f).toHaveProperty('lastUpdated');
      expect(typeof f.conviction).toBe('number');
      expect(f.conviction).toBeGreaterThanOrEqual(0);
      expect(f.conviction).toBeLessThanOrEqual(1);
      expect(['bullish', 'bearish', 'neutral']).toContain(f.direction);
    }
  });

  it('includes regime information', async () => {
    const req = createMockReq();
    const res = createMockRes();
    await handler(req, res);

    const { regime } = res._json.data;
    expect(regime.current).toBe('bull');
    expect(regime.confidence).toBe(0.75);
  });

  it('includes belief version', async () => {
    const req = createMockReq();
    const res = createMockRes();
    await handler(req, res);

    expect(res._json.data.beliefVersion).toBe(3);
  });

  it('factors include all categories', async () => {
    const req = createMockReq();
    const res = createMockRes();
    await handler(req, res);

    const categories = new Set(res._json.data.beliefs.map((f: any) => f.category));
    expect(categories.has('style')).toBe(true);
    expect(categories.has('quality')).toBe(true);
    expect(categories.has('volatility')).toBe(true);
    expect(categories.has('sentiment')).toBe(true);
    expect(categories.has('macro')).toBe(true);
    expect(categories.has('sector')).toBe(true);
  });

  it('sets X-Data-Source header and dataSource field', async () => {
    const req = createMockReq();
    const res = createMockRes();
    await handler(req, res);

    expect(res._headers['X-Data-Source']).toBe('live');
    expect(res._json.dataSource).toBe('live');
  });

  it('returns 405 for non-GET methods', async () => {
    const req = createMockReq({ method: 'POST' });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(405);
    expect(res._json.success).toBe(false);
  });

  it('requires authentication', async () => {
    const { requireAuth } = await import('../../api/lib/auth.js');
    (requireAuth as any).mockResolvedValueOnce(null);

    const req = createMockReq();
    const res = createMockRes();
    await handler(req, res);

    // Handler should return early when requireAuth returns null
    expect(res._json).toBeNull();
  });
});

// ======================================================================
// beliefs/timeline
// ======================================================================

describe('GET /api/v1/cvrf/beliefs/timeline', () => {
  let handler: (req: VercelRequest, res: VercelResponse) => Promise<any>;

  beforeEach(async () => {
    const mod = await import('../../api/v1/cvrf/beliefs/timeline.js');
    handler = mod.default;
  });

  it('returns snapshots within default 30-day window', async () => {
    const req = createMockReq();
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    const { snapshots, days } = res._json.data;
    expect(days).toBe(30);
    // Only cycles within 30 days (5d, 10d, 15d)
    expect(snapshots.length).toBe(3);
  });

  it('respects custom days parameter', async () => {
    const req = createMockReq({ query: { days: '90' } } as any);
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    // All 4 cycles are within 90 days
    expect(res._json.data.snapshots.length).toBe(4);
    expect(res._json.data.days).toBe(90);
  });

  it('rejects invalid days parameter', async () => {
    const req = createMockReq({ query: { days: '0' } } as any);
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(400);
    expect(res._json.success).toBe(false);
  });

  it('rejects days > 365', async () => {
    const req = createMockReq({ query: { days: '400' } } as any);
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(400);
  });

  it('snapshots contain factor weights and regime', async () => {
    const req = createMockReq();
    const res = createMockRes();
    await handler(req, res);

    const snap = res._json.data.snapshots[0];
    expect(snap).toHaveProperty('date');
    expect(snap).toHaveProperty('factorWeights');
    expect(snap).toHaveProperty('factorConfidences');
    expect(snap).toHaveProperty('regime');
    expect(snap).toHaveProperty('regimeConfidence');
    expect(snap).toHaveProperty('performanceDelta');
  });

  it('includes factor list and regime transitions count', async () => {
    const req = createMockReq();
    const res = createMockRes();
    await handler(req, res);

    expect(res._json.data.factors).toContain('momentum');
    expect(typeof res._json.data.regimeTransitions).toBe('number');
  });
});

// ======================================================================
// beliefs/correlations
// ======================================================================

describe('GET /api/v1/cvrf/beliefs/correlations', () => {
  let handler: (req: VercelRequest, res: VercelResponse) => Promise<any>;

  beforeEach(async () => {
    const mod = await import('../../api/v1/cvrf/beliefs/correlations.js');
    handler = mod.default;
  });

  it('returns a symmetric correlation matrix', async () => {
    const req = createMockReq();
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    const { matrix, factors } = res._json.data;
    expect(factors.length).toBeGreaterThan(0);

    // Diagonal should be 1
    for (const f of factors) {
      expect(matrix[f][f]).toBe(1.0);
    }

    // Symmetric: matrix[a][b] === matrix[b][a]
    for (let i = 0; i < factors.length; i++) {
      for (let j = i + 1; j < factors.length; j++) {
        expect(matrix[factors[i]][factors[j]]).toBe(matrix[factors[j]][factors[i]]);
      }
    }
  });

  it('includes strong correlations list', async () => {
    const req = createMockReq();
    const res = createMockRes();
    await handler(req, res);

    const { strongCorrelations } = res._json.data;
    expect(Array.isArray(strongCorrelations)).toBe(true);

    for (const sc of strongCorrelations) {
      expect(sc).toHaveProperty('factor1');
      expect(sc).toHaveProperty('factor2');
      expect(sc).toHaveProperty('correlation');
      expect(Math.abs(sc.correlation)).toBeGreaterThan(0.5);
    }
  });

  it('reports cycle count', async () => {
    const req = createMockReq();
    const res = createMockRes();
    await handler(req, res);

    expect(res._json.data.cycleCount).toBe(4);
  });

  it('returns 405 for non-GET methods', async () => {
    const req = createMockReq({ method: 'DELETE' });
    const res = createMockRes();
    await handler(req, res);

    expect(res._status).toBe(405);
  });
});
