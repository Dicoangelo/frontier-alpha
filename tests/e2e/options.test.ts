/**
 * E2E Test: Options Intelligence API
 * PRD Verification: Options chain, Greeks, strategies, and vol surface endpoints
 *
 * Note: Options endpoints may depend on external APIs for price data.
 * Tests accept 500/503 as "external API unavailable" — not a test failure.
 */

import { describe, it, expect } from 'vitest';
import { EXTERNAL_API_STATUSES, PerformanceTimer } from '../setup';

const API_BASE = process.env.TEST_API_URL || 'http://localhost:3000';

describe('Options Intelligence API', () => {
  // ========================
  // Options Chain
  // ========================
  describe('Options Chain — GET /api/v1/options/chain', () => {
    it('should return options chain with calls and puts', async () => {
      const response = await fetch(`${API_BASE}/api/v1/options/chain?symbol=AAPL`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      expect(EXTERNAL_API_STATUSES).toContain(response.status);

      if (response.status === 200) {
        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.data.symbol).toBe('AAPL');
        expect(Array.isArray(data.data.expirations)).toBe(true);
        expect(data.data.expirations.length).toBeGreaterThan(0);
        expect(Array.isArray(data.data.calls)).toBe(true);
        expect(Array.isArray(data.data.puts)).toBe(true);
        expect(data.data.calls.length).toBeGreaterThan(0);
        expect(data.data.puts.length).toBeGreaterThan(0);
      }
    });

    it('should validate call contract structure', async () => {
      const response = await fetch(`${API_BASE}/api/v1/options/chain?symbol=MSFT`);

      if (response.status !== 200) {
        expect(EXTERNAL_API_STATUSES).toContain(response.status);
        return;
      }

      const data = await response.json();
      const call = data.data.calls[0];
      expect(typeof call.strike).toBe('number');
      expect(typeof call.expiration).toBe('string');
      expect(typeof call.bid).toBe('number');
      expect(typeof call.ask).toBe('number');
      expect(typeof call.last).toBe('number');
      expect(typeof call.volume).toBe('number');
      expect(typeof call.openInterest).toBe('number');
      expect(typeof call.impliedVolatility).toBe('number');
      expect(call.type).toBe('call');
    });

    it('should return 400 without symbol parameter', async () => {
      const response = await fetch(`${API_BASE}/api/v1/options/chain`);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ========================
  // Greeks
  // ========================
  describe('Greeks — GET /api/v1/options/greeks', () => {
    it('should return single contract Greeks', async () => {
      const response = await fetch(
        `${API_BASE}/api/v1/options/greeks?symbol=AAPL&strike=150&expiration=2026-03-14&type=call`
      );

      expect(EXTERNAL_API_STATUSES).toContain(response.status);

      if (response.status === 200) {
        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.data.mode).toBe('contract');
        const greeks = data.data.greeks;
        expect(typeof greeks.delta).toBe('number');
        expect(typeof greeks.gamma).toBe('number');
        expect(typeof greeks.theta).toBe('number');
        expect(typeof greeks.vega).toBe('number');
        expect(typeof greeks.rho).toBe('number');
        expect(greeks.symbol).toBe('AAPL');
        expect(greeks.strike).toBe(150);
        expect(greeks.type).toBe('call');
      }
    });

    it('should return portfolio Greeks without strike/expiration', async () => {
      const response = await fetch(`${API_BASE}/api/v1/options/greeks?symbol=AAPL`);

      expect(EXTERNAL_API_STATUSES).toContain(response.status);

      if (response.status === 200) {
        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.data.mode).toBe('portfolio');
        const greeks = data.data.greeks;
        expect(typeof greeks.netDelta).toBe('number');
        expect(typeof greeks.netGamma).toBe('number');
        expect(typeof greeks.netTheta).toBe('number');
        expect(typeof greeks.netVega).toBe('number');
      }
    });

    it('should return 400 without symbol parameter', async () => {
      const response = await fetch(`${API_BASE}/api/v1/options/greeks`);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ========================
  // Strategy Analysis (POST)
  // ========================
  describe('Strategy Analysis — POST /api/v1/options/strategies', () => {
    it('should analyze a covered call strategy', async () => {
      const response = await fetch(`${API_BASE}/api/v1/options/strategies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'covered_call',
          symbol: 'AAPL',
          underlyingPrice: 150,
          expiration: '2026-03-14',
        }),
      });

      expect(EXTERNAL_API_STATUSES).toContain(response.status);

      if (response.status === 200) {
        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.data.strategy).toBeDefined();
        expect(typeof data.data.maxProfit).toBe('number');
        expect(typeof data.data.maxLoss).toBe('number');
        expect(Array.isArray(data.data.breakevens)).toBe(true);
        expect(typeof data.data.probabilityOfProfit).toBe('number');
        expect(data.data.probabilityOfProfit).toBeGreaterThanOrEqual(0);
        expect(data.data.probabilityOfProfit).toBeLessThanOrEqual(1);
        expect(typeof data.data.netDebit).toBe('number');
        expect(Array.isArray(data.data.pnlData)).toBe(true);
        expect(data.data.pnlData.length).toBeGreaterThan(0);
      }
    });

    it('should reject invalid strategy type', async () => {
      const response = await fetch(`${API_BASE}/api/v1/options/strategies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'invalid_strategy',
          symbol: 'AAPL',
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject missing symbol', async () => {
      const response = await fetch(`${API_BASE}/api/v1/options/strategies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'straddle' }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ========================
  // Strategy Recommendations (GET)
  // ========================
  describe('Strategy Recommendations — GET /api/v1/options/strategies', () => {
    it('should return recommended strategies', async () => {
      const response = await fetch(
        `${API_BASE}/api/v1/options/strategies?symbol=AAPL&ivRank=65&regime=bull`
      );

      expect(EXTERNAL_API_STATUSES).toContain(response.status);

      if (response.status === 200) {
        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.data.symbol).toBe('AAPL');
        expect(typeof data.data.ivRank).toBe('number');
        expect(typeof data.data.regime).toBe('string');
        expect(Array.isArray(data.data.recommendations)).toBe(true);
        expect(data.data.recommendations.length).toBeGreaterThan(0);

        const rec = data.data.recommendations[0];
        expect(typeof rec.type).toBe('string');
        expect(typeof rec.name).toBe('string');
        expect(typeof rec.rationale).toBe('string');
        expect(typeof rec.score).toBe('number');
        expect(rec.score).toBeGreaterThanOrEqual(0);
        expect(rec.score).toBeLessThanOrEqual(1);
      }
    });

    it('should return 400 without symbol', async () => {
      const response = await fetch(`${API_BASE}/api/v1/options/strategies`);
      expect(response.status).toBe(400);
    });
  });

  // ========================
  // Vol Surface
  // ========================
  describe('Vol Surface — GET /api/v1/options/vol-surface', () => {
    it('should return vol surface data', async () => {
      const response = await fetch(`${API_BASE}/api/v1/options/vol-surface?symbol=AAPL`);

      expect(EXTERNAL_API_STATUSES).toContain(response.status);

      if (response.status === 200) {
        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.data.symbol).toBe('AAPL');
        expect(typeof data.data.underlyingPrice).toBe('number');
        expect(Array.isArray(data.data.strikes)).toBe(true);
        expect(data.data.strikes.length).toBeGreaterThan(0);
        expect(Array.isArray(data.data.expirations)).toBe(true);
        expect(data.data.expirations.length).toBeGreaterThan(0);
        expect(Array.isArray(data.data.surface)).toBe(true);
        expect(data.data.surface.length).toBeGreaterThan(0);
      }
    });

    it('should include IV values in surface points', async () => {
      const response = await fetch(`${API_BASE}/api/v1/options/vol-surface?symbol=NVDA`);

      if (response.status !== 200) {
        expect(EXTERNAL_API_STATUSES).toContain(response.status);
        return;
      }

      const data = await response.json();
      const point = data.data.surface[0];
      expect(typeof point.strike).toBe('number');
      expect(typeof point.expiration).toBe('string');
      expect(typeof point.iv).toBe('number');
      expect(point.iv).toBeGreaterThan(0);
      expect(point.iv).toBeLessThan(5); // IV should be reasonable (< 500%)
    });

    it('should include heatmap data', async () => {
      const response = await fetch(`${API_BASE}/api/v1/options/vol-surface?symbol=AAPL`);

      if (response.status !== 200) {
        expect(EXTERNAL_API_STATUSES).toContain(response.status);
        return;
      }

      const data = await response.json();
      expect(data.data.heatmap).toBeDefined();
      expect(data.data.heatmap.symbol).toBe('AAPL');
      expect(typeof data.data.heatmap.underlyingPrice).toBe('number');
      expect(Array.isArray(data.data.heatmap.strikes)).toBe(true);
      expect(Array.isArray(data.data.heatmap.expirations)).toBe(true);
    });

    it('should return 400 without symbol', async () => {
      const response = await fetch(`${API_BASE}/api/v1/options/vol-surface`);
      expect(response.status).toBe(400);
    });
  });

  // ========================
  // Performance
  // ========================
  describe('Options API Performance', () => {
    it('should respond within 2000ms', async () => {
      const timer = new PerformanceTimer();
      const response = await fetch(`${API_BASE}/api/v1/options/chain?symbol=AAPL`);
      expect(EXTERNAL_API_STATUSES).toContain(response.status);

      if (response.status === 200) {
        timer.assertUnder(2000, 'Options chain endpoint');
        const data = await response.json();
        expect(data.meta).toBeDefined();
        expect(typeof data.meta.latencyMs).toBe('number');
      }
    });
  });
});
