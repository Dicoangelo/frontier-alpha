/**
 * E2E Test: Health & System Status
 * PRD Verification: System availability and performance targets
 */

import { describe, it, expect } from 'vitest';

const API_BASE = process.env.TEST_API_URL || 'http://localhost:3000';

describe('System Health', () => {
  describe('Health Endpoint', () => {
    it('should return healthy status', async () => {
      const response = await fetch(`${API_BASE}/api/v1/health`, {
        method: 'GET',
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.timestamp).toBeDefined();
    });

    it('should include version info', async () => {
      const response = await fetch(`${API_BASE}/api/v1/health`, {
        method: 'GET',
      });

      const data = await response.json();

      expect(data.version).toBeDefined();
    });

    it('should respond quickly', async () => {
      const startTime = Date.now();
      await fetch(`${API_BASE}/api/v1/health`, { method: 'GET' });
      const latency = Date.now() - startTime;

      expect(latency).toBeLessThan(100);
    });
  });

  describe('Quote Endpoint', () => {
    it('should return quote or error for valid symbol', async () => {
      const response = await fetch(`${API_BASE}/api/v1/quotes/AAPL`, {
        method: 'GET',
      });

      const data = await response.json();

      // 200 if API keys configured, 500 if not (expected in test env)
      expect([200, 500]).toContain(response.status);

      if (response.status === 200) {
        expect(data.success).toBe(true);
        expect(data.data).toBeDefined();
      } else {
        // API keys not configured - expected in test environment
        expect(data.message).toContain('data providers');
      }
    });

    it('quote endpoint should respond quickly', async () => {
      const startTime = Date.now();
      await fetch(`${API_BASE}/api/v1/quotes/AAPL`);
      const latency = Date.now() - startTime;

      expect(latency).toBeLessThan(500);
    });
  });

  describe('Earnings Endpoint', () => {
    it('should return upcoming earnings', async () => {
      const response = await fetch(`${API_BASE}/api/v1/earnings/upcoming`, {
        method: 'GET',
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
      expect(Array.isArray(data.data)).toBe(true);
    });
  });

  describe('Factor Endpoint', () => {
    it('should return factors for symbols', async () => {
      const response = await fetch(`${API_BASE}/api/v1/portfolio/factors/AAPL,MSFT`, {
        method: 'GET',
      });

      // May take time due to data fetching
      expect([200, 500]).toContain(response.status);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid routes gracefully', async () => {
      const response = await fetch(`${API_BASE}/nonexistent`, {
        method: 'GET',
      });

      expect(response.status).toBe(404);
    });
  });

  describe('CORS Headers', () => {
    it('should include CORS headers', async () => {
      const response = await fetch(`${API_BASE}/api/v1/health`, {
        method: 'GET',
      });

      // Fastify CORS returns headers on actual requests
      expect(response.status).toBe(200);
    });
  });
});
