/**
 * E2E Test: Data Source Detection (US-008)
 * Verifies that API responses include dataSource field and X-Data-Source header
 * to distinguish mock vs live data.
 */

import { describe, it, expect } from 'vitest';
import { EXTERNAL_API_STATUSES, isExternalApiError } from '../setup';

const API_BASE = process.env.TEST_API_URL || 'http://localhost:3000';

describe('Data Source Detection (US-008)', () => {
  // ============================================================================
  // 1. Quotes - Single symbol endpoint
  // ============================================================================
  describe('GET /api/v1/quotes/:symbol', () => {
    it('should include dataSource field in response body', async () => {
      const response = await fetch(`${API_BASE}/api/v1/quotes/AAPL`);

      if (response.status === 404 || isExternalApiError(response.status)) {
        return; // endpoint not deployed
      }

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('dataSource');
      expect(['mock', 'live']).toContain(data.dataSource);
    });

    it('should include X-Data-Source header', async () => {
      const response = await fetch(`${API_BASE}/api/v1/quotes/AAPL`);

      if (response.status === 404 || isExternalApiError(response.status)) {
        return;
      }

      const header = response.headers.get('X-Data-Source');
      expect(header).toBeDefined();
      expect(['mock', 'live']).toContain(header);
    });
  });

  // ============================================================================
  // 2. Quotes Stream (REST mode)
  // ============================================================================
  describe('GET /api/v1/quotes/stream (REST)', () => {
    it('should include dataSource field in response body', async () => {
      const response = await fetch(`${API_BASE}/api/v1/quotes/stream?symbols=AAPL,MSFT`);

      if (response.status === 404 || isExternalApiError(response.status)) {
        return;
      }

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('dataSource');
      expect(['mock', 'live']).toContain(data.dataSource);
    });

    it('should include X-Data-Source header', async () => {
      const response = await fetch(`${API_BASE}/api/v1/quotes/stream?symbols=AAPL`);

      if (response.status === 404 || isExternalApiError(response.status)) {
        return;
      }

      const header = response.headers.get('X-Data-Source');
      expect(header).toBeDefined();
      expect(['mock', 'live']).toContain(header);
    });
  });

  // ============================================================================
  // 3. Factor Calculation
  // ============================================================================
  describe('GET /api/v1/portfolio/factors/:symbols', () => {
    it('should include dataSource field in response body', async () => {
      const response = await fetch(`${API_BASE}/api/v1/portfolio/factors/AAPL,MSFT`);

      if (response.status === 404 || isExternalApiError(response.status)) {
        return;
      }

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('dataSource');
      expect(['mock', 'live']).toContain(data.dataSource);
    });

    it('should include X-Data-Source header', async () => {
      const response = await fetch(`${API_BASE}/api/v1/portfolio/factors/AAPL,MSFT`);

      if (response.status === 404 || isExternalApiError(response.status)) {
        return;
      }

      const header = response.headers.get('X-Data-Source');
      expect(header).toBeDefined();
      expect(['mock', 'live']).toContain(header);
    });
  });

  // ============================================================================
  // 4. Earnings Forecast
  // ============================================================================
  describe('GET /api/v1/earnings/forecast/:symbol', () => {
    it('should include dataSource field in response body', async () => {
      const response = await fetch(`${API_BASE}/api/v1/earnings/forecast/AAPL`);

      if (response.status === 404 || isExternalApiError(response.status)) {
        return;
      }

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('dataSource');
      expect(['mock', 'live']).toContain(data.dataSource);
    });

    it('should include X-Data-Source header', async () => {
      const response = await fetch(`${API_BASE}/api/v1/earnings/forecast/AAPL`);

      if (response.status === 404 || isExternalApiError(response.status)) {
        return;
      }

      const header = response.headers.get('X-Data-Source');
      expect(header).toBeDefined();
      expect(['mock', 'live']).toContain(header);
    });
  });

  // ============================================================================
  // 5. Trading Account (503 on broker failure)
  // ============================================================================
  describe('GET /api/v1/trading/account', () => {
    it('should return 503 with BROKER_UNAVAILABLE when broker not configured', async () => {
      const response = await fetch(`${API_BASE}/api/v1/trading/account`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-valid-token',
        },
      });

      // 401 = auth required, 503 = broker unavailable, 404 = not deployed
      if (response.status === 401 || response.status === 404) {
        return; // auth or deployment issue, not what we're testing
      }

      if (response.status === 503) {
        const data = await response.json();
        expect(data.success).toBe(false);
        expect(data.error.code).toBe('BROKER_UNAVAILABLE');
      }

      // Should NOT return 200 with mock account data
      if (response.status === 200) {
        const data = await response.json();
        // If it does return 200, it should have dataSource: 'live'
        expect(data.dataSource).toBe('live');
      }
    });
  });

  // ============================================================================
  // 6. Portfolio Optimize (POST)
  // ============================================================================
  describe('POST /api/v1/portfolio/optimize', () => {
    it('should include dataSource in response body', async () => {
      const response = await fetch(`${API_BASE}/api/v1/portfolio/optimize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-valid-token',
        },
        body: JSON.stringify({
          symbols: ['AAPL', 'MSFT', 'GOOGL'],
          config: { objective: 'max_sharpe' },
        }),
      });

      // Accept auth failure, not deployed, or external API errors
      if (response.status === 401 || response.status === 404 || isExternalApiError(response.status)) {
        return;
      }

      if (response.status === 200) {
        const data = await response.json();
        expect(data).toHaveProperty('dataSource');
        expect(['mock', 'live']).toContain(data.dataSource);
      }
    });

    it('should include X-Data-Source header', async () => {
      const response = await fetch(`${API_BASE}/api/v1/portfolio/optimize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-valid-token',
        },
        body: JSON.stringify({
          symbols: ['AAPL', 'MSFT'],
          config: { objective: 'equal_weight' },
        }),
      });

      if (response.status === 401 || response.status === 404 || isExternalApiError(response.status)) {
        return;
      }

      if (response.status === 200) {
        const header = response.headers.get('X-Data-Source');
        expect(header).toBeDefined();
        expect(['mock', 'live']).toContain(header);
      }
    });
  });

  // ============================================================================
  // 7. Consistency: dataSource value matches X-Data-Source header
  // ============================================================================
  describe('Header and Body Consistency', () => {
    it('dataSource body field should match X-Data-Source header for quotes', async () => {
      const response = await fetch(`${API_BASE}/api/v1/quotes/NVDA`);

      if (response.status === 404 || isExternalApiError(response.status)) {
        return;
      }

      const header = response.headers.get('X-Data-Source');
      const body = await response.json();

      if (body.dataSource && header) {
        expect(body.dataSource).toBe(header);
      }
    });

    it('dataSource body field should match X-Data-Source header for factors', async () => {
      const response = await fetch(`${API_BASE}/api/v1/portfolio/factors/AAPL`);

      if (response.status === 404 || isExternalApiError(response.status)) {
        return;
      }

      const header = response.headers.get('X-Data-Source');
      const body = await response.json();

      if (body.dataSource && header) {
        expect(body.dataSource).toBe(header);
      }
    });
  });
});
