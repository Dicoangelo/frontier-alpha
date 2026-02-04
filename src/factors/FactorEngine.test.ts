/**
 * Unit Tests for FactorEngine
 *
 * Tests factor calculation accuracy, mock market data handling,
 * and edge cases (missing data, zero values).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  FactorEngine,
  FACTOR_DEFINITIONS,
  SECTOR_MAP,
  FundamentalData,
} from './FactorEngine.js';
import type { Price, FactorExposure } from '../types/index.js';

// Helper to generate mock price data
function generateMockPrices(
  symbol: string,
  days: number,
  startPrice: number = 100,
  volatility: number = 0.02
): Price[] {
  const prices: Price[] = [];
  let price = startPrice;

  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() - (days - i));

    // Random walk with drift
    const change = (Math.random() - 0.5) * 2 * volatility * price;
    price = Math.max(1, price + change);

    prices.push({
      symbol,
      timestamp: date,
      open: price * (1 - Math.random() * 0.01),
      high: price * (1 + Math.random() * 0.02),
      low: price * (1 - Math.random() * 0.02),
      close: price,
      volume: Math.floor(Math.random() * 10000000) + 1000000,
    });
  }

  return prices;
}

// Helper to generate trending prices (for momentum tests)
function generateTrendingPrices(
  symbol: string,
  days: number,
  startPrice: number,
  trend: 'up' | 'down' | 'flat'
): Price[] {
  const prices: Price[] = [];
  let price = startPrice;
  const dailyTrend = trend === 'up' ? 0.002 : trend === 'down' ? -0.002 : 0;

  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() - (days - i));

    // Apply trend + small noise
    price = price * (1 + dailyTrend + (Math.random() - 0.5) * 0.005);
    price = Math.max(1, price);

    prices.push({
      symbol,
      timestamp: date,
      open: price * 0.99,
      high: price * 1.01,
      low: price * 0.98,
      close: price,
      volume: 5000000,
    });
  }

  return prices;
}

describe('FactorEngine', () => {
  let engine: FactorEngine;

  beforeEach(() => {
    engine = new FactorEngine();
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with default factor definitions', () => {
      expect(engine).toBeDefined();
      expect(engine.getFactor('market')).toBeDefined();
      expect(engine.getFactor('momentum_12m')).toBeDefined();
    });

    it('should accept custom factor definitions', () => {
      const customFactors = [
        { name: 'custom', category: 'style' as const, description: 'Test', halfLife: 21 },
      ];
      const customEngine = new FactorEngine(customFactors);
      expect(customEngine.getFactor('custom')).toBeDefined();
      expect(customEngine.getFactor('market')).toBeUndefined();
    });
  });

  describe('Factor Definitions', () => {
    it('should have all required style factors', () => {
      const styleFactors = engine.getFactorsByCategory('style');
      const names = styleFactors.map((f) => f.name);

      expect(names).toContain('market');
      expect(names).toContain('size');
      expect(names).toContain('value');
      expect(names).toContain('profitability');
      expect(names).toContain('investment');
      expect(names).toContain('momentum_12m');
    });

    it('should have volatility factors', () => {
      const volFactors = engine.getFactorsByCategory('volatility');
      const names = volFactors.map((f) => f.name);

      expect(names).toContain('volatility');
      expect(names).toContain('low_vol');
      expect(names).toContain('idio_vol');
    });

    it('should have sector factors', () => {
      const sectorFactors = engine.getFactorsByCategory('sector');
      expect(sectorFactors.length).toBeGreaterThanOrEqual(10);
    });

    it('should have macro factors', () => {
      const macroFactors = engine.getFactorsByCategory('macro');
      const names = macroFactors.map((f) => f.name);

      expect(names).toContain('interest_rate_sens');
      expect(names).toContain('inflation_beta');
      expect(names).toContain('vix_beta');
    });
  });

  describe('Sector Mapping', () => {
    it('should correctly map tech symbols', () => {
      expect(engine.getSector('AAPL')).toBe('Technology');
      expect(engine.getSector('MSFT')).toBe('Technology');
      expect(engine.getSector('NVDA')).toBe('Technology');
    });

    it('should correctly map financial symbols', () => {
      expect(engine.getSector('JPM')).toBe('Financials');
      expect(engine.getSector('GS')).toBe('Financials');
    });

    it('should correctly map healthcare symbols', () => {
      expect(engine.getSector('JNJ')).toBe('Healthcare');
      expect(engine.getSector('UNH')).toBe('Healthcare');
    });

    it('should return Unknown for unmapped symbols', () => {
      expect(engine.getSector('XXXXX')).toBe('Unknown');
    });

    it('should be case-insensitive', () => {
      expect(engine.getSector('aapl')).toBe('Technology');
      expect(engine.getSector('Aapl')).toBe('Technology');
      expect(engine.getSector('AAPL')).toBe('Technology');
    });
  });

  describe('Factor Exposure Calculations', () => {
    it('should calculate exposures for valid symbols with sufficient data', async () => {
      const prices = new Map<string, Price[]>();
      prices.set('AAPL', generateMockPrices('AAPL', 300, 150));
      prices.set('SPY', generateMockPrices('SPY', 300, 450));

      const exposures = await engine.calculateExposures(['AAPL'], prices);

      expect(exposures.has('AAPL')).toBe(true);
      const aaplExposures = exposures.get('AAPL')!;
      expect(aaplExposures.length).toBeGreaterThan(0);
    });

    it('should skip symbols with insufficient price data', async () => {
      const prices = new Map<string, Price[]>();
      prices.set('AAPL', generateMockPrices('AAPL', 30, 150)); // Only 30 days
      prices.set('SPY', generateMockPrices('SPY', 300, 450));

      const exposures = await engine.calculateExposures(['AAPL'], prices);

      // Should skip AAPL due to insufficient data (needs 63+ days)
      expect(exposures.has('AAPL')).toBe(false);
    });

    it('should handle missing market data gracefully', async () => {
      const prices = new Map<string, Price[]>();
      prices.set('AAPL', generateMockPrices('AAPL', 300, 150));
      // No SPY data

      const exposures = await engine.calculateExposures(['AAPL'], prices);

      expect(exposures.has('AAPL')).toBe(true);
      // Should still have momentum and volatility factors
      const aaplExposures = exposures.get('AAPL')!;
      const factorNames = aaplExposures.map((e) => e.factor);
      expect(factorNames).toContain('momentum_12m');
    });
  });

  describe('Momentum Factor Calculations', () => {
    it('should calculate positive momentum for uptrending stocks', async () => {
      const prices = new Map<string, Price[]>();
      prices.set('AAPL', generateTrendingPrices('AAPL', 300, 100, 'up'));
      prices.set('SPY', generateMockPrices('SPY', 300, 450));

      const exposures = await engine.calculateExposures(['AAPL'], prices, {
        includeFundamentals: false,
        includeMacro: false,
        includeSector: false,
      });

      const aaplExposures = exposures.get('AAPL')!;
      const momentum12m = aaplExposures.find((e) => e.factor === 'momentum_12m');

      expect(momentum12m).toBeDefined();
      expect(momentum12m!.exposure).toBeGreaterThan(0);
    });

    it('should calculate negative momentum for downtrending stocks', async () => {
      const prices = new Map<string, Price[]>();
      prices.set('AAPL', generateTrendingPrices('AAPL', 300, 200, 'down'));
      prices.set('SPY', generateMockPrices('SPY', 300, 450));

      const exposures = await engine.calculateExposures(['AAPL'], prices, {
        includeFundamentals: false,
        includeMacro: false,
        includeSector: false,
      });

      const aaplExposures = exposures.get('AAPL')!;
      const momentum12m = aaplExposures.find((e) => e.factor === 'momentum_12m');

      expect(momentum12m).toBeDefined();
      expect(momentum12m!.exposure).toBeLessThan(0);
    });
  });

  describe('Volatility Factor Calculations', () => {
    it('should calculate higher volatility exposure for volatile stocks', async () => {
      const prices = new Map<string, Price[]>();
      // High volatility stock
      prices.set('AAPL', generateMockPrices('AAPL', 300, 150, 0.05));
      prices.set('SPY', generateMockPrices('SPY', 300, 450, 0.01));

      const exposures = await engine.calculateExposures(['AAPL'], prices, {
        includeFundamentals: false,
        includeMacro: false,
        includeSector: false,
      });

      const aaplExposures = exposures.get('AAPL')!;
      const volatility = aaplExposures.find((e) => e.factor === 'volatility');

      expect(volatility).toBeDefined();
      expect(volatility!.exposure).toBeGreaterThan(0);
    });

    it('should have inverse relationship between volatility and low_vol factors', async () => {
      const prices = new Map<string, Price[]>();
      prices.set('AAPL', generateMockPrices('AAPL', 300, 150, 0.03));
      prices.set('SPY', generateMockPrices('SPY', 300, 450, 0.01));

      const exposures = await engine.calculateExposures(['AAPL'], prices, {
        includeFundamentals: false,
        includeMacro: false,
        includeSector: false,
      });

      const aaplExposures = exposures.get('AAPL')!;
      const volatility = aaplExposures.find((e) => e.factor === 'volatility');
      const lowVol = aaplExposures.find((e) => e.factor === 'low_vol');

      expect(volatility).toBeDefined();
      expect(lowVol).toBeDefined();
      expect(volatility!.exposure).toBeCloseTo(-lowVol!.exposure, 5);
    });
  });

  describe('Portfolio-Level Exposures', () => {
    it('should calculate weighted average exposures', () => {
      const weights = new Map<string, number>();
      weights.set('AAPL', 0.6);
      weights.set('MSFT', 0.4);

      const assetExposures = new Map<string, FactorExposure[]>();
      assetExposures.set('AAPL', [
        { factor: 'market', exposure: 1.2, tStat: 5, confidence: 0.9, contribution: 0.05 },
        { factor: 'momentum_12m', exposure: 0.5, tStat: 2, confidence: 0.7, contribution: 0.02 },
      ]);
      assetExposures.set('MSFT', [
        { factor: 'market', exposure: 1.0, tStat: 4, confidence: 0.85, contribution: 0.04 },
        { factor: 'momentum_12m', exposure: -0.3, tStat: -1, confidence: 0.5, contribution: -0.01 },
      ]);

      const portfolioExposures = engine.calculatePortfolioExposures(weights, assetExposures);

      const marketExposure = portfolioExposures.find((e) => e.factor === 'market');
      expect(marketExposure).toBeDefined();
      // 0.6 * 1.2 + 0.4 * 1.0 = 0.72 + 0.4 = 1.12
      expect(marketExposure!.exposure).toBeCloseTo(1.12, 2);

      const momentumExposure = portfolioExposures.find((e) => e.factor === 'momentum_12m');
      expect(momentumExposure).toBeDefined();
      // 0.6 * 0.5 + 0.4 * (-0.3) = 0.3 - 0.12 = 0.18
      expect(momentumExposure!.exposure).toBeCloseTo(0.18, 2);
    });

    it('should sort portfolio exposures by absolute value', () => {
      const weights = new Map<string, number>();
      weights.set('AAPL', 1.0);

      const assetExposures = new Map<string, FactorExposure[]>();
      assetExposures.set('AAPL', [
        { factor: 'small', exposure: 0.1, tStat: 1, confidence: 0.5, contribution: 0.01 },
        { factor: 'large', exposure: 2.0, tStat: 5, confidence: 0.9, contribution: 0.1 },
        { factor: 'negative', exposure: -1.5, tStat: -3, confidence: 0.8, contribution: -0.05 },
      ]);

      const portfolioExposures = engine.calculatePortfolioExposures(weights, assetExposures);

      expect(portfolioExposures[0].factor).toBe('large');
      expect(portfolioExposures[1].factor).toBe('negative');
      expect(portfolioExposures[2].factor).toBe('small');
    });

    it('should handle empty weights', () => {
      const weights = new Map<string, number>();
      const assetExposures = new Map<string, FactorExposure[]>();

      const portfolioExposures = engine.calculatePortfolioExposures(weights, assetExposures);

      expect(portfolioExposures).toEqual([]);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty price arrays', async () => {
      const prices = new Map<string, Price[]>();
      prices.set('AAPL', []);

      const exposures = await engine.calculateExposures(['AAPL'], prices);

      expect(exposures.has('AAPL')).toBe(false);
    });

    it('should handle prices with zero values', async () => {
      const prices = new Map<string, Price[]>();
      const invalidPrices: Price[] = [
        { symbol: 'AAPL', timestamp: new Date(), open: 0, high: 0, low: 0, close: 0, volume: 0 },
        { symbol: 'AAPL', timestamp: new Date(), open: 100, high: 101, low: 99, close: 100, volume: 1000 },
      ];
      prices.set('AAPL', invalidPrices);

      // Should not throw
      const exposures = await engine.calculateExposures(['AAPL'], prices);
      expect(exposures).toBeDefined();
    });

    it('should handle symbols not in prices map', async () => {
      const prices = new Map<string, Price[]>();
      prices.set('MSFT', generateMockPrices('MSFT', 300, 350));

      const exposures = await engine.calculateExposures(['AAPL'], prices);

      expect(exposures.has('AAPL')).toBe(false);
    });

    it('should filter out exposures with zero confidence', async () => {
      const prices = new Map<string, Price[]>();
      prices.set('AAPL', generateMockPrices('AAPL', 300, 150));
      prices.set('SPY', generateMockPrices('SPY', 300, 450));

      const exposures = await engine.calculateExposures(['AAPL'], prices);

      if (exposures.has('AAPL')) {
        const aaplExposures = exposures.get('AAPL')!;
        // All exposures should have positive confidence
        for (const exp of aaplExposures) {
          expect(exp.confidence).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('Factor Definition Constants', () => {
    it('should have reasonable half-life values', () => {
      for (const factor of FACTOR_DEFINITIONS) {
        expect(factor.halfLife).toBeGreaterThan(0);
        expect(factor.halfLife).toBeLessThanOrEqual(252); // Max 1 year
      }
    });

    it('should have non-empty descriptions', () => {
      for (const factor of FACTOR_DEFINITIONS) {
        expect(factor.description.length).toBeGreaterThan(0);
      }
    });

    it('should have valid categories', () => {
      const validCategories = ['style', 'macro', 'sector', 'volatility', 'sentiment', 'quality'];
      for (const factor of FACTOR_DEFINITIONS) {
        expect(validCategories).toContain(factor.category);
      }
    });
  });

  describe('SECTOR_MAP Constants', () => {
    it('should map major tech companies', () => {
      const techSymbols = ['AAPL', 'MSFT', 'NVDA', 'AMD', 'INTC', 'CSCO'];
      for (const symbol of techSymbols) {
        expect(SECTOR_MAP[symbol]).toBe('Technology');
      }
    });

    it('should have coverage for common S&P 500 symbols', () => {
      const commonSymbols = ['AAPL', 'MSFT', 'AMZN', 'GOOGL', 'JPM', 'JNJ', 'XOM', 'PG'];
      for (const symbol of commonSymbols) {
        expect(SECTOR_MAP[symbol]).toBeDefined();
      }
    });
  });
});
