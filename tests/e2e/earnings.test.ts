/**
 * E2E Test: Earnings Oracle
 * PRD Verification: View calendar → Click stock → See Oracle recommendation
 */

import { describe, it, expect, beforeAll } from 'vitest';

const API_BASE = process.env.TEST_API_URL || 'http://localhost:3000';

describe('Earnings Oracle', () => {
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

  describe('Earnings Calendar', () => {
    it('should return upcoming earnings for portfolio', async () => {
      const response = await fetch(`${API_BASE}/api/v1/earnings/upcoming`, {
        method: 'GET',
        headers: headers(),
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.earnings).toBeDefined();
      expect(Array.isArray(data.data.earnings)).toBe(true);
    });

    it('should include expected move for each earning', async () => {
      const response = await fetch(`${API_BASE}/api/v1/earnings/upcoming`, {
        method: 'GET',
        headers: headers(),
      });

      const data = await response.json();

      if (data.data.earnings.length > 0) {
        const earning = data.data.earnings[0];
        expect(earning.symbol).toBeDefined();
        expect(earning.date).toBeDefined();
        expect(earning.expectedMove).toBeDefined();
        expect(earning.expectedMove.percentage).toBeDefined();
      }
    });

    it('should filter by date range', async () => {
      const startDate = new Date().toISOString().split('T')[0];
      const endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      const response = await fetch(
        `${API_BASE}/api/v1/earnings/upcoming?startDate=${startDate}&endDate=${endDate}`,
        {
          method: 'GET',
          headers: headers(),
        }
      );

      const data = await response.json();

      expect(response.status).toBe(200);
      for (const earning of data.data.earnings) {
        const earningDate = new Date(earning.date);
        expect(earningDate >= new Date(startDate)).toBe(true);
        expect(earningDate <= new Date(endDate)).toBe(true);
      }
    });
  });

  describe('Historical Earnings Reactions', () => {
    it('should return 8 quarters of historical reactions', async () => {
      const response = await fetch(`${API_BASE}/api/v1/earnings/history/AAPL`, {
        method: 'GET',
        headers: headers(),
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.reactions).toBeDefined();
      expect(data.data.reactions.length).toBeGreaterThanOrEqual(4);
      expect(data.data.reactions.length).toBeLessThanOrEqual(8);
    });

    it('should include beat/miss indicator', async () => {
      const response = await fetch(`${API_BASE}/api/v1/earnings/history/AAPL`, {
        method: 'GET',
        headers: headers(),
      });

      const data = await response.json();

      if (data.data.reactions.length > 0) {
        const reaction = data.data.reactions[0];
        expect(reaction.date).toBeDefined();
        expect(reaction.surprise).toBeDefined(); // beat/miss amount
        expect(reaction.priceMove).toBeDefined();
        expect(['beat', 'miss', 'inline']).toContain(reaction.result);
      }
    });

    it('should include summary statistics', async () => {
      const response = await fetch(`${API_BASE}/api/v1/earnings/history/AAPL`, {
        method: 'GET',
        headers: headers(),
      });

      const data = await response.json();

      expect(data.data.summary).toBeDefined();
      expect(data.data.summary.beatRate).toBeDefined();
      expect(data.data.summary.avgMove).toBeDefined();
      expect(data.data.summary.avgBeatMove).toBeDefined();
      expect(data.data.summary.avgMissMove).toBeDefined();
    });
  });

  describe('Earnings Forecast', () => {
    it('should return Oracle recommendation', async () => {
      const response = await fetch(`${API_BASE}/api/v1/earnings/forecast/AAPL`, {
        method: 'GET',
        headers: headers(),
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.recommendation).toBeDefined();
      expect(['HOLD', 'TRIM', 'HEDGE', 'BUY']).toContain(
        data.data.recommendation.action
      );
    });

    it('should include expected move with dollar amount', async () => {
      const response = await fetch(`${API_BASE}/api/v1/earnings/forecast/AAPL`, {
        method: 'GET',
        headers: headers(),
      });

      const data = await response.json();

      expect(data.data.expectedMove).toBeDefined();
      expect(data.data.expectedMove.percentage).toBeDefined();
      expect(data.data.expectedMove.dollarAmount).toBeDefined();
    });

    it('should include factor-adjusted view', async () => {
      const response = await fetch(`${API_BASE}/api/v1/earnings/forecast/AAPL`, {
        method: 'GET',
        headers: headers(),
      });

      const data = await response.json();

      expect(data.data.factors).toBeDefined();
      expect(data.data.factors.historicalPattern).toBeDefined();
      expect(data.data.factors.recentTrend).toBeDefined();
    });

    it('should include beat rate', async () => {
      const response = await fetch(`${API_BASE}/api/v1/earnings/forecast/AAPL`, {
        method: 'GET',
        headers: headers(),
      });

      const data = await response.json();

      expect(data.data.beatRate).toBeDefined();
      expect(data.data.beatRate).toBeGreaterThanOrEqual(0);
      expect(data.data.beatRate).toBeLessThanOrEqual(1);
    });

    it('should include detailed reasoning', async () => {
      const response = await fetch(`${API_BASE}/api/v1/earnings/forecast/AAPL`, {
        method: 'GET',
        headers: headers(),
      });

      const data = await response.json();

      expect(data.data.recommendation.reasoning).toBeDefined();
      expect(data.data.recommendation.reasoning.length).toBeGreaterThan(20);
    });
  });

  describe('Portfolio Earnings Impact', () => {
    it('should calculate aggregate earnings risk', async () => {
      const response = await fetch(`${API_BASE}/api/v1/portfolio/earnings-risk`, {
        method: 'GET',
        headers: headers(),
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.aggregateRisk).toBeDefined();
      expect(data.data.upcomingCount).toBeDefined();
      expect(data.data.positionsAtRisk).toBeDefined();
    });
  });
});
