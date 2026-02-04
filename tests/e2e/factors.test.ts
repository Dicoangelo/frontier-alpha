/**
 * E2E Test: Factor Analysis
 * PRD Verification: Run factors on portfolio → Verify all categories populated
 */

import { describe, it, expect, beforeAll } from 'vitest';

const API_BASE = process.env.TEST_API_URL || 'http://localhost:3000';

describe('Factor Analysis', () => {
  let accessToken: string;

  beforeAll(async () => {
    const loginResponse = await fetch(`${API_BASE}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: process.env.TEST_USER_EMAIL || 'test@example.com',
        password: process.env.TEST_USER_PASSWORD || 'TestPassword123!',
      }),
    });
    const loginData = await loginResponse.json();
    accessToken = loginData.data?.accessToken || 'mock-token';
  });

  const headers = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  });

  describe('Portfolio Factor Exposures', () => {
    it('should return factor exposures for portfolio', async () => {
      const response = await fetch(`${API_BASE}/api/v1/portfolio/factors`, {
        method: 'GET',
        headers: headers(),
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.exposures).toBeDefined();
    });

    it('should include all required factor categories', async () => {
      const response = await fetch(`${API_BASE}/api/v1/portfolio/factors`, {
        method: 'GET',
        headers: headers(),
      });

      const data = await response.json();
      const exposures = data.data.exposures;

      // Style factors
      expect(exposures.momentum).toBeDefined();
      expect(exposures.value).toBeDefined();
      expect(exposures.quality).toBeDefined();
      expect(exposures.size).toBeDefined();
      expect(exposures.lowVolatility).toBeDefined();

      // Macro factors
      expect(exposures.interestRateSensitivity).toBeDefined();
      expect(exposures.inflationBeta).toBeDefined();

      // Sector exposures
      expect(exposures.sectors).toBeDefined();
      expect(typeof exposures.sectors).toBe('object');
    });

    it('should have factor values between -1 and 1', async () => {
      const response = await fetch(`${API_BASE}/api/v1/portfolio/factors`, {
        method: 'GET',
        headers: headers(),
      });

      const data = await response.json();
      const { exposures } = data.data;

      const stylefactors = [
        exposures.momentum,
        exposures.value,
        exposures.quality,
        exposures.size,
        exposures.lowVolatility,
      ];

      for (const factor of stylefactors) {
        expect(factor).toBeGreaterThanOrEqual(-1);
        expect(factor).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Single Symbol Factor Analysis', () => {
    it('should return factors for individual stock', async () => {
      const response = await fetch(`${API_BASE}/api/v1/factors/AAPL`, {
        method: 'GET',
        headers: headers(),
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.symbol).toBe('AAPL');
      expect(data.data.factors).toBeDefined();
    });

    it('should include quality metrics', async () => {
      const response = await fetch(`${API_BASE}/api/v1/factors/AAPL`, {
        method: 'GET',
        headers: headers(),
      });

      const data = await response.json();
      const factors = data.data.factors;

      // Quality factors from PRD
      expect(factors.roe).toBeDefined();
      expect(factors.roa).toBeDefined();
      expect(factors.grossMargin).toBeDefined();
      expect(factors.debtToEquity).toBeDefined();
      expect(factors.currentRatio).toBeDefined();
    });

    it('should include sentiment factor', async () => {
      const response = await fetch(`${API_BASE}/api/v1/factors/AAPL`, {
        method: 'GET',
        headers: headers(),
      });

      const data = await response.json();

      expect(data.data.factors.sentiment).toBeDefined();
      expect(data.data.factors.sentiment.score).toBeDefined();
      expect(data.data.factors.sentiment.label).toBeDefined();
    });
  });

  describe('Factor Performance', () => {
    it('should calculate factors in < 2s for 20 positions', async () => {
      const startTime = Date.now();

      const response = await fetch(`${API_BASE}/api/v1/portfolio/factors`, {
        method: 'GET',
        headers: headers(),
      });

      const latency = Date.now() - startTime;

      expect(response.status).toBe(200);
      expect(latency).toBeLessThan(2000); // < 2 seconds
    });
  });

  describe('Factor Attribution', () => {
    it('should return factor contribution to returns', async () => {
      const response = await fetch(`${API_BASE}/api/v1/portfolio/attribution`, {
        method: 'GET',
        headers: headers(),
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.factorAttribution).toBeDefined();
      expect(data.data.factorAttribution.contributions).toBeDefined();
    });

    it('should include Brinson attribution', async () => {
      const response = await fetch(`${API_BASE}/api/v1/portfolio/attribution`, {
        method: 'GET',
        headers: headers(),
      });

      const data = await response.json();
      const brinson = data.data.brinsonAttribution;

      expect(brinson).toBeDefined();
      expect(brinson.allocation).toBeDefined();
      expect(brinson.selection).toBeDefined();
      expect(brinson.interaction).toBeDefined();
    });
  });
});
