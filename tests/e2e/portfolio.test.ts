/**
 * E2E Test: Portfolio CRUD Operations
 * PRD Verification: Add position → Edit → Delete → Verify in DB
 */

import { describe, it, expect, beforeAll } from 'vitest';

const API_BASE = process.env.TEST_API_URL || 'http://localhost:3000';

describe('Portfolio CRUD', () => {
  let accessToken: string;
  let positionId: string;

  beforeAll(async () => {
    // Login to get token
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

  describe('Create Position', () => {
    it('should add a new position to portfolio', async () => {
      const newPosition = {
        symbol: 'NVDA',
        shares: 100,
        costBasis: 450.0,
      };

      const response = await fetch(`${API_BASE}/api/v1/portfolio/positions`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(newPosition),
      });

      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.position).toBeDefined();
      expect(data.data.position.symbol).toBe('NVDA');
      expect(data.data.position.shares).toBe(100);
      expect(data.data.position.costBasis).toBe(450.0);

      positionId = data.data.position.id;
    });

    it('should reject invalid symbol', async () => {
      const response = await fetch(`${API_BASE}/api/v1/portfolio/positions`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          symbol: '',
          shares: 100,
          costBasis: 100,
        }),
      });

      expect(response.status).toBe(400);
    });

    it('should reject negative shares', async () => {
      const response = await fetch(`${API_BASE}/api/v1/portfolio/positions`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          symbol: 'AAPL',
          shares: -50,
          costBasis: 175,
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('Read Portfolio', () => {
    it('should return full portfolio with positions', async () => {
      const response = await fetch(`${API_BASE}/api/v1/portfolio`, {
        method: 'GET',
        headers: headers(),
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.positions).toBeDefined();
      expect(Array.isArray(data.data.positions)).toBe(true);
      expect(data.data.totalValue).toBeDefined();
    });

    it('should return single position by ID', async () => {
      const response = await fetch(
        `${API_BASE}/api/v1/portfolio/positions/${positionId}`,
        {
          method: 'GET',
          headers: headers(),
        }
      );

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.position.id).toBe(positionId);
    });
  });

  describe('Update Position', () => {
    it('should update position shares', async () => {
      const response = await fetch(
        `${API_BASE}/api/v1/portfolio/positions/${positionId}`,
        {
          method: 'PUT',
          headers: headers(),
          body: JSON.stringify({
            shares: 150,
          }),
        }
      );

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.position.shares).toBe(150);
    });

    it('should update cost basis', async () => {
      const response = await fetch(
        `${API_BASE}/api/v1/portfolio/positions/${positionId}`,
        {
          method: 'PUT',
          headers: headers(),
          body: JSON.stringify({
            costBasis: 425.0,
          }),
        }
      );

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.position.costBasis).toBe(425.0);
    });
  });

  describe('Delete Position', () => {
    it('should remove position from portfolio', async () => {
      const response = await fetch(
        `${API_BASE}/api/v1/portfolio/positions/${positionId}`,
        {
          method: 'DELETE',
          headers: headers(),
        }
      );

      expect(response.status).toBe(200);
    });

    it('should not find deleted position', async () => {
      const response = await fetch(
        `${API_BASE}/api/v1/portfolio/positions/${positionId}`,
        {
          method: 'GET',
          headers: headers(),
        }
      );

      expect(response.status).toBe(404);
    });
  });

  describe('Portfolio Metrics', () => {
    it('should calculate portfolio metrics', async () => {
      const response = await fetch(`${API_BASE}/api/v1/portfolio/metrics`, {
        method: 'GET',
        headers: headers(),
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.totalValue).toBeDefined();
      expect(data.data.dayChange).toBeDefined();
      expect(data.data.totalReturn).toBeDefined();
    });
  });
});
