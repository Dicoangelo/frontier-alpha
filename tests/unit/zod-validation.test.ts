/**
 * Unit Test: Zod Input Validation (US-014)
 * Verifies that invalid input is rejected with standardized VALIDATION_ERROR.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// ============================================================================
// Mock dependencies so handlers can be imported
// ============================================================================

// Portfolio optimize has no auth gate but uses process.env
vi.mock('../../api/lib/auth.js', () => ({
  requireAuth: vi.fn().mockResolvedValue({ id: 'test-user', email: 'test@example.com' }),
}));

// Mock PersistentCVRFManager for CVRF endpoints
vi.mock('../../src/cvrf/PersistentCVRFManager.js', () => ({
  createPersistentCVRFManager: vi.fn(() =>
    Promise.resolve({
      startEpisode: () => Promise.resolve({ id: 'ep1', episodeNumber: 1, startDate: new Date() }),
      recordDecision: (d: any) => Promise.resolve({ ...d, id: 'dec1' }),
    })
  ),
}));

// Import handlers after mocks
import optimizeHandler from '../../api/v1/portfolio/optimize.js';
import positionsHandler from '../../api/v1/portfolio/positions/index.js';
import episodeStartHandler from '../../api/v1/cvrf/episode/start.js';
import decisionHandler from '../../api/v1/cvrf/decision.js';
import tradingOrdersHandler from '../../api/v1/trading/orders.js';
import brokerTradeHandler from '../../api/v1/broker/trade.js';

// ============================================================================
// Test helpers
// ============================================================================

function createMockReq(method: string, body?: any, query?: Record<string, string>): VercelRequest {
  return {
    method,
    body,
    query: query ?? {},
    headers: { authorization: 'Bearer valid-token' },
  } as unknown as VercelRequest;
}

function createMockRes() {
  let statusCode = 200;
  let body: any = null;

  const res = {
    setHeader: vi.fn().mockReturnThis(),
    status: vi.fn((code: number) => {
      statusCode = code;
      return res;
    }),
    json: vi.fn((data: any) => {
      body = data;
      return res;
    }),
    end: vi.fn().mockReturnThis(),
    getStatusCode: () => statusCode,
    getBody: () => body,
  } as unknown as VercelResponse & {
    getStatusCode: () => number;
    getBody: () => any;
  };

  return res;
}

// ============================================================================
// Tests
// ============================================================================

describe('Zod Input Validation (US-014)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ------------------------------------------------------------------
  // Portfolio optimize
  // ------------------------------------------------------------------
  describe('POST /api/v1/portfolio/optimize', () => {
    it('rejects invalid symbol format with VALIDATION_ERROR', async () => {
      const req = createMockReq('POST', {
        symbols: ['../../../../etc/passwd'],
      });
      const res = createMockRes();

      await optimizeHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const body = (res.json as any).mock.calls[0][0];
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details).toBeDefined();
    });

    it('rejects empty symbols array', async () => {
      const req = createMockReq('POST', { symbols: [] });
      const res = createMockRes();

      await optimizeHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const body = (res.json as any).mock.calls[0][0];
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects missing symbols field', async () => {
      const req = createMockReq('POST', {});
      const res = createMockRes();

      await optimizeHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const body = (res.json as any).mock.calls[0][0];
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('accepts valid uppercase symbols', async () => {
      const req = createMockReq('POST', {
        symbols: ['AAPL', 'MSFT', 'BRK.B'],
      });
      const res = createMockRes();

      await optimizeHandler(req, res);

      // Should not return a validation error (200 expected)
      expect(res.status).toHaveBeenCalledWith(200);
      const body = (res.json as any).mock.calls[0][0];
      expect(body.success).toBe(true);
    });
  });

  // ------------------------------------------------------------------
  // Portfolio positions
  // ------------------------------------------------------------------
  describe('POST /api/v1/portfolio/positions', () => {
    it('rejects non-positive shares', async () => {
      const req = createMockReq('POST', {
        symbol: 'AAPL',
        shares: -5,
        avgCost: 150,
      });
      const res = createMockRes();

      await positionsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const body = (res.json as any).mock.calls[0][0];
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects non-positive avgCost', async () => {
      const req = createMockReq('POST', {
        symbol: 'AAPL',
        shares: 10,
        avgCost: 0,
      });
      const res = createMockRes();

      await positionsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const body = (res.json as any).mock.calls[0][0];
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects invalid symbol format in positions', async () => {
      const req = createMockReq('POST', {
        symbol: 'not-valid!',
        shares: 10,
        avgCost: 150,
      });
      const res = createMockRes();

      await positionsHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const body = (res.json as any).mock.calls[0][0];
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ------------------------------------------------------------------
  // CVRF episode start
  // ------------------------------------------------------------------
  describe('POST /api/v1/cvrf/episode/start', () => {
    it('rejects invalid watchlist symbol', async () => {
      const req = createMockReq('POST', {
        watchlist: ['AAPL', '../../hack'],
      });
      const res = createMockRes();

      await episodeStartHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const body = (res.json as any).mock.calls[0][0];
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects maxDrawdown >= 100', async () => {
      const req = createMockReq('POST', {
        maxDrawdown: 100,
      });
      const res = createMockRes();

      await episodeStartHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const body = (res.json as any).mock.calls[0][0];
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('accepts valid optional params', async () => {
      const req = createMockReq('POST', {
        watchlist: ['AAPL', 'MSFT'],
        targetReturn: 0.12,
        maxDrawdown: 15,
      });
      const res = createMockRes();

      await episodeStartHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('accepts empty body (all params optional)', async () => {
      const req = createMockReq('POST', {});
      const res = createMockRes();

      await episodeStartHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  // ------------------------------------------------------------------
  // CVRF decision
  // ------------------------------------------------------------------
  describe('POST /api/v1/cvrf/decision', () => {
    it('rejects missing action', async () => {
      const req = createMockReq('POST', { symbol: 'AAPL' });
      const res = createMockRes();

      await decisionHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const body = (res.json as any).mock.calls[0][0];
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects invalid symbol in decision', async () => {
      const req = createMockReq('POST', {
        symbol: 'bad symbol!',
        action: 'buy',
      });
      const res = createMockRes();

      await decisionHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const body = (res.json as any).mock.calls[0][0];
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ------------------------------------------------------------------
  // Trading orders
  // ------------------------------------------------------------------
  describe('POST /api/v1/trading/orders', () => {
    it('rejects invalid side value', async () => {
      const req = createMockReq('POST', {
        symbol: 'AAPL',
        qty: 10,
        side: 'hold',
        type: 'market',
      });
      const res = createMockRes();

      await tradingOrdersHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const body = (res.json as any).mock.calls[0][0];
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects invalid order type', async () => {
      const req = createMockReq('POST', {
        symbol: 'AAPL',
        qty: 10,
        side: 'buy',
        type: 'unknown_type',
      });
      const res = createMockRes();

      await tradingOrdersHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const body = (res.json as any).mock.calls[0][0];
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects missing qty and notional', async () => {
      const req = createMockReq('POST', {
        symbol: 'AAPL',
        side: 'buy',
        type: 'market',
      });
      const res = createMockRes();

      await tradingOrdersHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const body = (res.json as any).mock.calls[0][0];
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects limit order without limitPrice', async () => {
      const req = createMockReq('POST', {
        symbol: 'AAPL',
        qty: 10,
        side: 'buy',
        type: 'limit',
      });
      const res = createMockRes();

      await tradingOrdersHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const body = (res.json as any).mock.calls[0][0];
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('accepts valid market order', async () => {
      const req = createMockReq('POST', {
        symbol: 'AAPL',
        qty: 10,
        side: 'buy',
        type: 'market',
      });
      const res = createMockRes();

      await tradingOrdersHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const body = (res.json as any).mock.calls[0][0];
      expect(body.success).toBe(true);
    });
  });

  // ------------------------------------------------------------------
  // Broker trade (legacy)
  // ------------------------------------------------------------------
  describe('POST /api/v1/broker/trade', () => {
    it('rejects missing qty', async () => {
      const req = createMockReq('POST', {
        symbol: 'AAPL',
        side: 'buy',
        type: 'market',
      });
      const res = createMockRes();

      await brokerTradeHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const body = (res.json as any).mock.calls[0][0];
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects negative quantity', async () => {
      const req = createMockReq('POST', {
        symbol: 'AAPL',
        qty: -5,
        side: 'buy',
        type: 'market',
      });
      const res = createMockRes();

      await brokerTradeHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const body = (res.json as any).mock.calls[0][0];
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
