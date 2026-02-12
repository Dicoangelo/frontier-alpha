/**
 * E2E Test: Tax Optimization API
 * PRD Verification: Tax lots, harvesting opportunities, wash sales, and tax reports
 *
 * Tax endpoints are protected (require auth). Tests verify both
 * authenticated and unauthenticated access patterns.
 */

import { describe, it, expect } from 'vitest';
import { EXTERNAL_API_STATUSES, PerformanceTimer } from '../setup';

const API_BASE = process.env.TEST_API_URL || 'http://localhost:3000';
const AUTH_HEADERS = {
  'Content-Type': 'application/json',
  Authorization: 'Bearer mock-valid-token',
};
const NO_AUTH_HEADERS = {
  'Content-Type': 'application/json',
};

describe('Tax Optimization API', () => {
  // ========================
  // Tax Lots
  // ========================
  describe('Tax Lots — GET /api/v1/tax/lots', () => {
    it('should return tax lots for authenticated user', async () => {
      const response = await fetch(`${API_BASE}/api/v1/tax/lots`, {
        method: 'GET',
        headers: AUTH_HEADERS,
      });

      expect(EXTERNAL_API_STATUSES).toContain(response.status);

      if (response.status === 200) {
        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.data.lots).toBeDefined();
        expect(Array.isArray(data.data.lots)).toBe(true);
        expect(typeof data.data.count).toBe('number');
        expect(data.data.count).toBe(data.data.lots.length);
      }
    });

    it('should filter lots by symbol', async () => {
      const response = await fetch(`${API_BASE}/api/v1/tax/lots?symbol=AAPL`, {
        method: 'GET',
        headers: AUTH_HEADERS,
      });

      expect(EXTERNAL_API_STATUSES).toContain(response.status);

      if (response.status === 200) {
        const data = await response.json();
        expect(data.success).toBe(true);
        for (const lot of data.data.lots) {
          expect(lot.symbol).toBe('AAPL');
        }
      }
    });

    it('should return 401 without auth', async () => {
      const response = await fetch(`${API_BASE}/api/v1/tax/lots`, {
        method: 'GET',
        headers: NO_AUTH_HEADERS,
      });

      expect(response.status).toBe(401);
    });

    it('should include lot metadata (holdingDays, isShortTerm)', async () => {
      const response = await fetch(`${API_BASE}/api/v1/tax/lots`, {
        method: 'GET',
        headers: AUTH_HEADERS,
      });

      if (response.status !== 200) {
        expect(EXTERNAL_API_STATUSES).toContain(response.status);
        return;
      }

      const data = await response.json();
      if (data.data.lots.length > 0) {
        const lot = data.data.lots[0];
        expect(typeof lot.holdingDays).toBe('number');
        expect(typeof lot.isShortTerm).toBe('boolean');
        expect(lot.purchaseDate).toBeDefined();
      }
    });
  });

  // ========================
  // Harvesting Opportunities
  // ========================
  describe('Harvesting — GET /api/v1/tax/harvest', () => {
    it('should return harvesting opportunities', async () => {
      const response = await fetch(`${API_BASE}/api/v1/tax/harvest`, {
        method: 'GET',
        headers: AUTH_HEADERS,
      });

      expect(EXTERNAL_API_STATUSES).toContain(response.status);

      if (response.status === 200) {
        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.data.opportunities).toBeDefined();
        expect(Array.isArray(data.data.opportunities)).toBe(true);
        expect(typeof data.data.totalEstimatedTaxSavings).toBe('number');
        expect(typeof data.data.scannedPositions).toBe('number');
        expect(typeof data.data.qualifyingPositions).toBe('number');
      }
    });

    it('should include replacement securities in opportunities', async () => {
      const response = await fetch(`${API_BASE}/api/v1/tax/harvest`, {
        method: 'GET',
        headers: AUTH_HEADERS,
      });

      if (response.status !== 200) {
        expect(EXTERNAL_API_STATUSES).toContain(response.status);
        return;
      }

      const data = await response.json();
      if (data.data.opportunities.length > 0) {
        const opp = data.data.opportunities[0];
        expect(typeof opp.symbol).toBe('string');
        expect(typeof opp.unrealizedLoss).toBe('number');
        expect(opp.unrealizedLoss).toBeLessThan(0);
        expect(typeof opp.estimatedTaxSavings).toBe('number');
        expect(opp.estimatedTaxSavings).toBeGreaterThan(0);
        expect(Array.isArray(opp.replacements)).toBe(true);
      }
    });
  });

  // ========================
  // Harvest Execution
  // ========================
  describe('Harvest Execution — POST /api/v1/tax/harvest', () => {
    it('should execute a harvest with valid params', async () => {
      const response = await fetch(`${API_BASE}/api/v1/tax/harvest`, {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({
          symbol: 'MSFT',
          shares: 10,
          salePrice: 405.0,
        }),
      });

      expect(EXTERNAL_API_STATUSES).toContain(response.status);

      if (response.status === 200) {
        const data = await response.json();
        expect(data.success).toBe(true);
        expect(typeof data.data.totalProceeds).toBe('number');
        expect(typeof data.data.totalCostBasis).toBe('number');
        expect(typeof data.data.realizedGain).toBe('number');
        expect(typeof data.data.isShortTerm).toBe('boolean');
        expect(Array.isArray(data.data.events)).toBe(true);
      }
    });

    it('should reject harvest without required params', async () => {
      const response = await fetch(`${API_BASE}/api/v1/tax/harvest`, {
        method: 'POST',
        headers: AUTH_HEADERS,
        body: JSON.stringify({ symbol: 'MSFT' }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ========================
  // Wash Sales
  // ========================
  describe('Wash Sales — GET /api/v1/tax/wash-sales', () => {
    it('should return wash sale violations', async () => {
      const response = await fetch(`${API_BASE}/api/v1/tax/wash-sales`, {
        method: 'GET',
        headers: AUTH_HEADERS,
      });

      expect(EXTERNAL_API_STATUSES).toContain(response.status);

      if (response.status === 200) {
        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.data.violations).toBeDefined();
        expect(Array.isArray(data.data.violations)).toBe(true);
        expect(typeof data.data.totalDisallowedLosses).toBe('number');
        expect(typeof data.data.violationCount).toBe('number');
        expect(data.data.violationCount).toBe(data.data.violations.length);
      }
    });

    it('should include violation detail fields', async () => {
      const response = await fetch(`${API_BASE}/api/v1/tax/wash-sales`, {
        method: 'GET',
        headers: AUTH_HEADERS,
      });

      if (response.status !== 200) {
        expect(EXTERNAL_API_STATUSES).toContain(response.status);
        return;
      }

      const data = await response.json();
      if (data.data.violations.length > 0) {
        const v = data.data.violations[0];
        expect(typeof v.saleSymbol).toBe('string');
        expect(typeof v.saleDate).toBe('string');
        expect(typeof v.disallowedLoss).toBe('number');
        expect(typeof v.adjustedCostBasis).toBe('number');
        expect(typeof v.affectedShares).toBe('number');
        expect(['same_ticker', 'substantially_identical']).toContain(v.matchType);
      }
    });
  });

  // ========================
  // Tax Report
  // ========================
  describe('Tax Report — GET /api/v1/tax/report', () => {
    it('should generate annual tax report', async () => {
      const year = new Date().getFullYear();
      const response = await fetch(`${API_BASE}/api/v1/tax/report?year=${year}`, {
        method: 'GET',
        headers: AUTH_HEADERS,
      });

      expect(EXTERNAL_API_STATUSES).toContain(response.status);

      if (response.status === 200) {
        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.data.taxYear).toBe(year);
        expect(data.data.summary).toBeDefined();
        expect(typeof data.data.summary.totalRealizedGain).toBe('number');
        expect(Array.isArray(data.data.shortTermTransactions)).toBe(true);
        expect(Array.isArray(data.data.longTermTransactions)).toBe(true);
        expect(data.data.scheduleD).toBeDefined();
        expect(typeof data.data.scheduleD.netGainOrLoss).toBe('number');
      }
    });

    it('should reject invalid year', async () => {
      const response = await fetch(`${API_BASE}/api/v1/tax/report?year=abc`, {
        method: 'GET',
        headers: AUTH_HEADERS,
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('should include Form 8949 row structure', async () => {
      const response = await fetch(`${API_BASE}/api/v1/tax/report`, {
        method: 'GET',
        headers: AUTH_HEADERS,
      });

      if (response.status !== 200) {
        expect(EXTERNAL_API_STATUSES).toContain(response.status);
        return;
      }

      const data = await response.json();
      const allTx = [
        ...data.data.shortTermTransactions,
        ...data.data.longTermTransactions,
      ];

      if (allTx.length > 0) {
        const tx = allTx[0];
        expect(typeof tx.description).toBe('string');
        expect(typeof tx.dateAcquired).toBe('string');
        expect(typeof tx.dateSold).toBe('string');
        expect(typeof tx.proceeds).toBe('number');
        expect(typeof tx.costBasis).toBe('number');
        expect(typeof tx.gainOrLoss).toBe('number');
        expect(typeof tx.isShortTerm).toBe('boolean');
        expect(typeof tx.symbol).toBe('string');
      }
    });
  });

  // ========================
  // Performance
  // ========================
  describe('Tax API Performance', () => {
    it('should respond within 500ms', async () => {
      const timer = new PerformanceTimer();

      const response = await fetch(`${API_BASE}/api/v1/tax/lots`, {
        method: 'GET',
        headers: AUTH_HEADERS,
      });

      const elapsed = timer.elapsed();
      expect(elapsed).toBeLessThan(500);
      expect(EXTERNAL_API_STATUSES).toContain(response.status);
    });
  });
});
