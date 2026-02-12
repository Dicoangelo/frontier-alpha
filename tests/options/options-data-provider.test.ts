/**
 * Unit Tests for OptionsDataProvider
 *
 * Tests options chain fetching, caching, mock data generation,
 * Polygon.io adapter, fallback behavior, and edge cases.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { OptionsDataProvider } from '../../src/options/OptionsDataProvider.js';
import type { OptionsDataProviderConfig } from '../../src/options/OptionsDataProvider.js';

// ============================================================================
// HELPERS
// ============================================================================

/** Create a provider that always uses mock data (no API key). */
function createMockProvider(overrides: Partial<OptionsDataProviderConfig> = {}): OptionsDataProvider {
  return new OptionsDataProvider({
    polygonApiKey: '',
    ...overrides,
  });
}

// ============================================================================
// TESTS
// ============================================================================

describe('OptionsDataProvider', () => {
  let provider: OptionsDataProvider;

  beforeEach(() => {
    provider = createMockProvider();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Constructor & Configuration
  // --------------------------------------------------------------------------

  describe('constructor', () => {
    it('should create with default configuration', () => {
      const p = new OptionsDataProvider({ polygonApiKey: '' });
      expect(p.isLive).toBe(false);
    });

    it('should report isLive=true when API key is provided', () => {
      const p = new OptionsDataProvider({ polygonApiKey: 'test-key-123' });
      expect(p.isLive).toBe(true);
    });

    it('should use POLYGON_API_KEY env var when no key in config', () => {
      const original = process.env.POLYGON_API_KEY;
      process.env.POLYGON_API_KEY = 'env-key';
      try {
        const p = new OptionsDataProvider();
        expect(p.isLive).toBe(true);
      } finally {
        if (original === undefined) {
          delete process.env.POLYGON_API_KEY;
        } else {
          process.env.POLYGON_API_KEY = original;
        }
      }
    });
  });

  // --------------------------------------------------------------------------
  // Mock Data Generation
  // --------------------------------------------------------------------------

  describe('mock options chain', () => {
    it('should generate a full options chain with calls and puts', async () => {
      const chain = await provider.getOptionsChain('AAPL');

      expect(chain.symbol).toBe('AAPL');
      expect(chain.expirations.length).toBeGreaterThan(0);
      expect(chain.calls.length).toBeGreaterThan(0);
      expect(chain.puts.length).toBeGreaterThan(0);
      expect(chain.underlyingPrice).toBeGreaterThan(0);
    });

    it('should return calls and puts organized by expiration and strike', async () => {
      const chain = await provider.getOptionsChain('MSFT');

      // Verify expirations are sorted
      const sortedExpirations = [...chain.expirations].sort();
      expect(chain.expirations).toEqual(sortedExpirations);

      // Verify each call and put has valid structure
      for (const call of chain.calls) {
        expect(call.type).toBe('call');
        expect(call.strike).toBeGreaterThan(0);
        expect(call.expiration).toBeTruthy();
        expect(call.ask).toBeGreaterThanOrEqual(call.bid);
      }

      for (const put of chain.puts) {
        expect(put.type).toBe('put');
        expect(put.strike).toBeGreaterThan(0);
        expect(put.expiration).toBeTruthy();
        expect(put.ask).toBeGreaterThanOrEqual(put.bid);
      }
    });

    it('should parse bid, ask, last, volume, open interest, and IV for each contract', async () => {
      const chain = await provider.getOptionsChain('TSLA');

      const contract = chain.calls[0];

      expect(typeof contract.bid).toBe('number');
      expect(typeof contract.ask).toBe('number');
      expect(typeof contract.last).toBe('number');
      expect(typeof contract.volume).toBe('number');
      expect(typeof contract.openInterest).toBe('number');
      expect(typeof contract.impliedVolatility).toBe('number');

      // IV should be a reasonable value (0-500%)
      expect(contract.impliedVolatility).toBeGreaterThan(0);
      expect(contract.impliedVolatility).toBeLessThan(5);

      // Volume and OI are non-negative integers
      expect(contract.volume).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(contract.volume)).toBe(true);
      expect(contract.openInterest).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(contract.openInterest)).toBe(true);
    });

    it('should generate deterministic data for the same symbol', async () => {
      const chain1 = provider.generateMockOptionsChain('AAPL');
      const chain2 = provider.generateMockOptionsChain('AAPL');

      expect(chain1.underlyingPrice).toBe(chain2.underlyingPrice);
      expect(chain1.calls.length).toBe(chain2.calls.length);
      expect(chain1.puts.length).toBe(chain2.puts.length);

      // Same prices since seeded PRNG is reset per call
      expect(chain1.calls[0].last).toBe(chain2.calls[0].last);
      expect(chain1.puts[0].last).toBe(chain2.puts[0].last);
    });

    it('should generate different data for different symbols', async () => {
      const chainAAPL = provider.generateMockOptionsChain('AAPL');
      const chainGOOG = provider.generateMockOptionsChain('GOOG');

      // Different underlying prices (different symbol hashes)
      expect(chainAAPL.underlyingPrice).not.toBe(chainGOOG.underlyingPrice);
    });

    it('should include greeks (delta, gamma, theta, vega) in mock data', async () => {
      const chain = await provider.getOptionsChain('SPY');

      const call = chain.calls[0];
      expect(call.delta).toBeDefined();
      expect(call.gamma).toBeDefined();
      expect(call.theta).toBeDefined();
      expect(call.vega).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Caching
  // --------------------------------------------------------------------------

  describe('caching', () => {
    it('should cache results with 5-minute TTL by default', async () => {
      const chain1 = await provider.getOptionsChain('AAPL');
      const chain2 = await provider.getOptionsChain('AAPL');

      // Should be the exact same object reference (cached)
      expect(chain1).toBe(chain2);
    });

    it('should return fresh data after cache expires', async () => {
      // Use very short TTL
      const shortTtlProvider = createMockProvider({ cacheTtlMs: 1 });

      const chain1 = await shortTtlProvider.getOptionsChain('AAPL');

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 5));

      const chain2 = await shortTtlProvider.getOptionsChain('AAPL');

      // Different object references (cache expired)
      expect(chain1).not.toBe(chain2);
      // But same data structure since mock is deterministic
      expect(chain1.symbol).toBe(chain2.symbol);
    });

    it('should clear cache when clearCache is called', async () => {
      const chain1 = await provider.getOptionsChain('AAPL');
      provider.clearCache();
      const chain2 = await provider.getOptionsChain('AAPL');

      // Different references after cache clear
      expect(chain1).not.toBe(chain2);
    });
  });

  // --------------------------------------------------------------------------
  // Batch Operations
  // --------------------------------------------------------------------------

  describe('batch operations', () => {
    it('should fetch options chains for multiple symbols', async () => {
      const symbols = ['AAPL', 'MSFT', 'GOOG'];
      const results = await provider.getOptionsChainBatch(symbols);

      expect(results.size).toBe(3);
      expect(results.has('AAPL')).toBe(true);
      expect(results.has('MSFT')).toBe(true);
      expect(results.has('GOOG')).toBe(true);

      for (const [symbol, chain] of results) {
        expect(chain.symbol).toBe(symbol);
        expect(chain.calls.length).toBeGreaterThan(0);
        expect(chain.puts.length).toBeGreaterThan(0);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Polygon.io Fallback
  // --------------------------------------------------------------------------

  describe('Polygon.io fallback', () => {
    it('should fall back to mock data when Polygon API fails', async () => {
      const liveProvider = new OptionsDataProvider({ polygonApiKey: 'invalid-key' });

      // Mock fetch to simulate API failure
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

      const chain = await liveProvider.getOptionsChain('AAPL');

      // Should still return data (mock fallback)
      expect(chain.symbol).toBe('AAPL');
      expect(chain.calls.length).toBeGreaterThan(0);
      expect(chain.puts.length).toBeGreaterThan(0);
    });

    it('should fall back to mock data when Polygon returns non-OK status', async () => {
      const liveProvider = new OptionsDataProvider({ polygonApiKey: 'test-key' });

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 403,
        }),
      );

      const chain = await liveProvider.getOptionsChain('AAPL');

      expect(chain.symbol).toBe('AAPL');
      expect(chain.calls.length).toBeGreaterThan(0);
    });

    it('should fall back to mock data when Polygon returns empty results', async () => {
      const liveProvider = new OptionsDataProvider({ polygonApiKey: 'test-key' });

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ results: [], status: 'OK' }),
        }),
      );

      const chain = await liveProvider.getOptionsChain('AAPL');

      expect(chain.symbol).toBe('AAPL');
      expect(chain.calls.length).toBeGreaterThan(0);
    });

    it('should parse Polygon API response correctly', async () => {
      const liveProvider = new OptionsDataProvider({ polygonApiKey: 'test-key' });

      const mockPolygonResponse: Record<string, unknown> = {
        results: [
          {
            details: {
              contract_type: 'call',
              expiration_date: '2026-03-21',
              strike_price: 150,
              ticker: 'O:AAPL260321C00150000',
            },
            implied_volatility: 0.28,
            last_quote: { bid: 12.50, ask: 12.80, midpoint: 12.65 },
            day: { volume: 5000, close: 12.65 },
            open_interest: 15000,
            greeks: { delta: 0.65, gamma: 0.02, theta: -0.05, vega: 0.15 },
            underlying_asset: { price: 155.00, ticker: 'AAPL' },
          },
          {
            details: {
              contract_type: 'put',
              expiration_date: '2026-03-21',
              strike_price: 150,
              ticker: 'O:AAPL260321P00150000',
            },
            implied_volatility: 0.30,
            last_quote: { bid: 7.20, ask: 7.50, midpoint: 7.35 },
            day: { volume: 3000, close: 7.35 },
            open_interest: 12000,
            greeks: { delta: -0.35, gamma: 0.02, theta: -0.04, vega: 0.14 },
            underlying_asset: { price: 155.00, ticker: 'AAPL' },
          },
        ],
        status: 'OK',
      };

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(mockPolygonResponse),
        }),
      );

      const chain = await liveProvider.getOptionsChain('AAPL');

      expect(chain.symbol).toBe('AAPL');
      expect(chain.underlyingPrice).toBe(155.00);
      expect(chain.expirations).toEqual(['2026-03-21']);

      expect(chain.calls.length).toBe(1);
      const call = chain.calls[0];
      expect(call.strike).toBe(150);
      expect(call.bid).toBe(12.50);
      expect(call.ask).toBe(12.80);
      expect(call.last).toBe(12.65);
      expect(call.volume).toBe(5000);
      expect(call.openInterest).toBe(15000);
      expect(call.impliedVolatility).toBe(0.28);
      expect(call.delta).toBe(0.65);
      expect(call.type).toBe('call');

      expect(chain.puts.length).toBe(1);
      const put = chain.puts[0];
      expect(put.strike).toBe(150);
      expect(put.bid).toBe(7.20);
      expect(put.impliedVolatility).toBe(0.30);
      expect(put.type).toBe('put');
    });
  });

  // --------------------------------------------------------------------------
  // Symbol Normalization
  // --------------------------------------------------------------------------

  describe('symbol normalization', () => {
    it('should uppercase symbols automatically', async () => {
      const chain = await provider.getOptionsChain('aapl');
      expect(chain.symbol).toBe('AAPL');
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('edge cases', () => {
    it('should handle custom maxExpirations', async () => {
      const smallProvider = createMockProvider({ maxExpirations: 2 });
      const chain = await smallProvider.getOptionsChain('AAPL');

      expect(chain.expirations.length).toBe(2);
    });

    it('should generate reasonable straddle pricing at ATM', async () => {
      const chain = await provider.getOptionsChain('SPY');
      const price = chain.underlyingPrice!;

      // Find ATM strike (closest to underlying)
      const strikes = [...new Set(chain.calls.map(c => c.strike))];
      const atmStrike = strikes.reduce((best, s) =>
        Math.abs(s - price) < Math.abs(best - price) ? s : best,
      );

      // Find nearest expiration ATM call and put
      const exp = chain.expirations[0];
      const atmCall = chain.calls.find(c => c.strike === atmStrike && c.expiration === exp);
      const atmPut = chain.puts.find(p => p.strike === atmStrike && p.expiration === exp);

      expect(atmCall).toBeDefined();
      expect(atmPut).toBeDefined();

      // ATM options should have meaningful time value
      expect(atmCall!.last).toBeGreaterThan(0);
      expect(atmPut!.last).toBeGreaterThan(0);
    });
  });
});
