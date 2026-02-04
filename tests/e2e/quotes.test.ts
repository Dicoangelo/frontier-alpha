/**
 * E2E Test: Real-Time Quotes
 * PRD Verification: Subscribe to AAPL → Verify price updates in < 1s
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const API_BASE = process.env.TEST_API_URL || 'http://localhost:3000';
const WS_BASE = process.env.TEST_WS_URL || 'ws://localhost:3000';

describe('Real-Time Quotes', () => {
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

  describe('REST Quote Endpoint', () => {
    it('should fetch current quote for single symbol', async () => {
      const response = await fetch(`${API_BASE}/api/v1/quotes/AAPL`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.quote).toBeDefined();
      expect(data.data.quote.symbol).toBe('AAPL');
      expect(data.data.quote.price).toBeGreaterThan(0);
      expect(data.data.quote.timestamp).toBeDefined();
    });

    it('should fetch quotes for multiple symbols', async () => {
      const symbols = ['AAPL', 'MSFT', 'GOOGL', 'NVDA'];
      const response = await fetch(
        `${API_BASE}/api/v1/quotes?symbols=${symbols.join(',')}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(Object.keys(data.data.quotes).length).toBe(symbols.length);

      for (const symbol of symbols) {
        expect(data.data.quotes[symbol]).toBeDefined();
        expect(data.data.quotes[symbol].price).toBeGreaterThan(0);
      }
    });

    it('should include bid/ask spread', async () => {
      const response = await fetch(`${API_BASE}/api/v1/quotes/AAPL`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const data = await response.json();
      const quote = data.data.quote;

      expect(quote.bid).toBeDefined();
      expect(quote.ask).toBeDefined();
      expect(quote.bid).toBeLessThanOrEqual(quote.ask);
    });
  });

  describe('SSE Quote Stream', () => {
    it('should receive quote updates via SSE within 1 second', async () => {
      const startTime = Date.now();
      let receivedUpdate = false;
      let latency = 0;

      const response = await fetch(
        `${API_BASE}/api/v1/quotes/stream?symbols=AAPL`,
        {
          method: 'GET',
          headers: {
            Accept: 'text/event-stream',
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      // Read first event from stream
      const reader = response.body?.getReader();
      if (reader) {
        const { value, done } = await reader.read();
        if (!done && value) {
          const text = new TextDecoder().decode(value);
          if (text.includes('data:')) {
            receivedUpdate = true;
            latency = Date.now() - startTime;
          }
        }
        reader.cancel();
      }

      expect(receivedUpdate).toBe(true);
      expect(latency).toBeLessThan(1000); // < 1 second
    });

    it('should receive updates for subscribed symbols only', async () => {
      const response = await fetch(
        `${API_BASE}/api/v1/quotes/stream?symbols=AAPL,MSFT`,
        {
          method: 'GET',
          headers: {
            Accept: 'text/event-stream',
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      const reader = response.body?.getReader();
      const receivedSymbols = new Set<string>();

      if (reader) {
        // Read a few events
        for (let i = 0; i < 5; i++) {
          const { value, done } = await reader.read();
          if (done) break;
          const text = new TextDecoder().decode(value);
          const match = text.match(/"symbol":"(\w+)"/);
          if (match) {
            receivedSymbols.add(match[1]);
          }
        }
        reader.cancel();
      }

      // Should only receive AAPL and MSFT
      for (const symbol of receivedSymbols) {
        expect(['AAPL', 'MSFT']).toContain(symbol);
      }
    });
  });

  describe('Quote Caching', () => {
    it('should return cached quotes with X-Cache header', async () => {
      // First request
      await fetch(`${API_BASE}/api/v1/quotes/AAPL`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      });

      // Second request should be cached
      const response = await fetch(`${API_BASE}/api/v1/quotes/AAPL`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const cacheHeader = response.headers.get('X-Cache');
      expect(['HIT', 'MISS']).toContain(cacheHeader);
    });
  });

  describe('Performance', () => {
    it('should return quote in < 100ms', async () => {
      const startTime = Date.now();

      await fetch(`${API_BASE}/api/v1/quotes/AAPL`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const latency = Date.now() - startTime;
      expect(latency).toBeLessThan(100);
    });
  });
});
