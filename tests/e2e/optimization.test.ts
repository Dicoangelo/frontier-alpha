/**
 * E2E Test: Portfolio Optimization
 * PRD Verification: Run max_sharpe → Verify weights sum to 1, see cognitive explanation
 */

import { describe, it, expect, beforeAll } from 'vitest';

const API_BASE = process.env.TEST_API_URL || 'http://localhost:3000';

describe('Portfolio Optimization', () => {
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

  describe('Max Sharpe Optimization', () => {
    it('should optimize portfolio for maximum Sharpe ratio', async () => {
      const response = await fetch(`${API_BASE}/api/v1/optimize`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          objective: 'max_sharpe',
          constraints: {
            maxPositionWeight: 0.25,
            minPositionWeight: 0.02,
          },
        }),
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.optimizedWeights).toBeDefined();
      expect(data.data.projectedMetrics).toBeDefined();
    });

    it('should return weights that sum to 1', async () => {
      const response = await fetch(`${API_BASE}/api/v1/optimize`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          objective: 'max_sharpe',
        }),
      });

      const data = await response.json();
      const weights = Object.values(data.data.optimizedWeights) as number[];
      const totalWeight = weights.reduce((sum, w) => sum + w, 0);

      expect(Math.abs(totalWeight - 1)).toBeLessThan(0.001); // Allow tiny floating point error
    });

    it('should include cognitive explanation for each recommendation', async () => {
      const response = await fetch(`${API_BASE}/api/v1/optimize`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          objective: 'max_sharpe',
        }),
      });

      const data = await response.json();

      expect(data.data.explanations).toBeDefined();
      expect(Array.isArray(data.data.explanations)).toBe(true);

      if (data.data.explanations.length > 0) {
        const explanation = data.data.explanations[0];
        expect(explanation.symbol).toBeDefined();
        expect(explanation.action).toBeDefined();
        expect(explanation.reasoning).toBeDefined();
        expect(explanation.reasoning.length).toBeGreaterThan(10); // Non-trivial explanation
      }
    });

    it('should include confidence score in explanations', async () => {
      const response = await fetch(`${API_BASE}/api/v1/optimize`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          objective: 'max_sharpe',
        }),
      });

      const data = await response.json();

      if (data.data.explanations?.length > 0) {
        const explanation = data.data.explanations[0];
        expect(explanation.confidence).toBeDefined();
        expect(explanation.confidence).toBeGreaterThanOrEqual(0);
        expect(explanation.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Min Volatility Optimization', () => {
    it('should optimize for minimum volatility', async () => {
      const response = await fetch(`${API_BASE}/api/v1/optimize`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          objective: 'min_volatility',
        }),
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.projectedMetrics.volatility).toBeDefined();
    });
  });

  describe('Risk Parity Optimization', () => {
    it('should optimize for risk parity', async () => {
      const response = await fetch(`${API_BASE}/api/v1/optimize`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          objective: 'risk_parity',
        }),
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.riskContributions).toBeDefined();
    });
  });

  describe('Target Volatility Optimization', () => {
    it('should optimize to target volatility', async () => {
      const targetVol = 0.15; // 15% annualized

      const response = await fetch(`${API_BASE}/api/v1/optimize`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          objective: 'target_volatility',
          constraints: {
            targetVolatility: targetVol,
          },
        }),
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(Math.abs(data.data.projectedMetrics.volatility - targetVol)).toBeLessThan(0.02);
    });
  });

  describe('Constraints', () => {
    it('should respect max position weight constraint', async () => {
      const maxWeight = 0.2;

      const response = await fetch(`${API_BASE}/api/v1/optimize`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          objective: 'max_sharpe',
          constraints: {
            maxPositionWeight: maxWeight,
          },
        }),
      });

      const data = await response.json();
      const weights = Object.values(data.data.optimizedWeights) as number[];

      for (const weight of weights) {
        expect(weight).toBeLessThanOrEqual(maxWeight + 0.001);
      }
    });

    it('should respect sector limits', async () => {
      const response = await fetch(`${API_BASE}/api/v1/optimize`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          objective: 'max_sharpe',
          constraints: {
            maxSectorWeight: {
              Technology: 0.4,
            },
          },
        }),
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.sectorExposures).toBeDefined();
      expect(data.data.sectorExposures.Technology).toBeLessThanOrEqual(0.41);
    });
  });

  describe('Monte Carlo Confidence', () => {
    it('should include Monte Carlo simulation results', async () => {
      const response = await fetch(`${API_BASE}/api/v1/optimize`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          objective: 'max_sharpe',
          monteCarloSimulations: 10000,
        }),
      });

      const data = await response.json();

      expect(data.data.monteCarloResults).toBeDefined();
      expect(data.data.monteCarloResults.medianReturn).toBeDefined();
      expect(data.data.monteCarloResults.var95).toBeDefined();
      expect(data.data.monteCarloResults.cvar95).toBeDefined();
      expect(data.data.monteCarloResults.probPositive).toBeDefined();
    });
  });

  describe('Performance', () => {
    it('should complete optimization in < 5s with 10K Monte Carlo', async () => {
      const startTime = Date.now();

      const response = await fetch(`${API_BASE}/api/v1/optimize`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          objective: 'max_sharpe',
          monteCarloSimulations: 10000,
        }),
      });

      const latency = Date.now() - startTime;

      expect(response.status).toBe(200);
      expect(latency).toBeLessThan(5000); // < 5 seconds
    });
  });
});
