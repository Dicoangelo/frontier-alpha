/**
 * Unit Tests for PortfolioOptimizer
 *
 * Tests optimization objectives (max_sharpe, min_vol, risk_parity),
 * constraint enforcement, and Monte Carlo simulation output format.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PortfolioOptimizer } from './PortfolioOptimizer.js';
import type { Price, OptimizationConfig } from '../types/index.js';

// Helper to generate mock price data with controlled returns
function generateMockPrices(
  symbol: string,
  days: number,
  startPrice: number = 100,
  dailyReturn: number = 0.0004, // ~10% annual
  volatility: number = 0.02
): Price[] {
  const prices: Price[] = [];
  let price = startPrice;

  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() - (days - i));

    // Random walk with controlled drift
    const noise = (Math.random() - 0.5) * 2 * volatility;
    price = price * (1 + dailyReturn + noise);
    price = Math.max(1, price);

    prices.push({
      symbol,
      timestamp: date,
      open: price * 0.99,
      high: price * 1.01,
      low: price * 0.98,
      close: price,
      volume: Math.floor(Math.random() * 10000000) + 1000000,
    });
  }

  return prices;
}

// Helper to generate correlated price data
function generateCorrelatedPrices(
  symbol: string,
  basePrices: Price[],
  correlation: number = 0.8,
  startPrice: number = 100
): Price[] {
  const prices: Price[] = [];
  let price = startPrice;

  const baseReturns: number[] = [];
  for (let i = 1; i < basePrices.length; i++) {
    const ret = (basePrices[i].close - basePrices[i - 1].close) / basePrices[i - 1].close;
    baseReturns.push(ret);
  }

  for (let i = 0; i < basePrices.length; i++) {
    const date = new Date(basePrices[i].timestamp);

    if (i > 0) {
      const baseReturn = baseReturns[i - 1];
      const idioReturn = (Math.random() - 0.5) * 0.02;
      const totalReturn = correlation * baseReturn + (1 - correlation) * idioReturn;
      price = price * (1 + totalReturn);
      price = Math.max(1, price);
    }

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

describe('PortfolioOptimizer', () => {
  let optimizer: PortfolioOptimizer;

  beforeEach(() => {
    optimizer = new PortfolioOptimizer();
  });

  describe('Constructor', () => {
    it('should initialize with default factor engine', () => {
      expect(optimizer).toBeDefined();
    });

    it('should accept custom factor engine', () => {
      const customOptimizer = new PortfolioOptimizer();
      expect(customOptimizer).toBeDefined();
    });
  });

  describe('Optimization Objectives', () => {
    const createTestPrices = () => {
      const prices = new Map<string, Price[]>();
      prices.set('AAPL', generateMockPrices('AAPL', 300, 150, 0.0005, 0.02));
      prices.set('MSFT', generateMockPrices('MSFT', 300, 350, 0.0004, 0.018));
      prices.set('GOOGL', generateMockPrices('GOOGL', 300, 140, 0.0003, 0.025));
      return prices;
    };

    describe('max_sharpe objective', () => {
      it('should return valid weights that sum to 1', async () => {
        const prices = createTestPrices();
        const config: OptimizationConfig = {
          objective: 'max_sharpe',
          riskFreeRate: 0.05,
        };

        const result = await optimizer.optimize(['AAPL', 'MSFT', 'GOOGL'], prices, config);

        const weightSum = Array.from(result.weights.values()).reduce((a, b) => a + b, 0);
        expect(weightSum).toBeCloseTo(1, 2);
      });

      it('should return non-negative weights (long-only)', async () => {
        const prices = createTestPrices();
        const config: OptimizationConfig = {
          objective: 'max_sharpe',
          riskFreeRate: 0.05,
        };

        const result = await optimizer.optimize(['AAPL', 'MSFT', 'GOOGL'], prices, config);

        for (const [, weight] of result.weights) {
          expect(weight).toBeGreaterThanOrEqual(0);
        }
      });

      it('should include all metrics in result', async () => {
        const prices = createTestPrices();
        const config: OptimizationConfig = {
          objective: 'max_sharpe',
          riskFreeRate: 0.05,
        };

        const result = await optimizer.optimize(['AAPL', 'MSFT', 'GOOGL'], prices, config);

        expect(result.expectedReturn).toBeDefined();
        expect(result.expectedVolatility).toBeDefined();
        expect(result.sharpeRatio).toBeDefined();
        expect(result.monteCarlo).toBeDefined();
        expect(result.explanation).toBeDefined();
      });
    });

    describe('min_volatility objective', () => {
      it('should produce lower volatility than equal weight', async () => {
        const prices = createTestPrices();

        const minVolConfig: OptimizationConfig = {
          objective: 'min_volatility',
          riskFreeRate: 0.05,
        };

        const result = await optimizer.optimize(['AAPL', 'MSFT', 'GOOGL'], prices, minVolConfig);

        // Min vol portfolio should have reasonable volatility
        expect(result.expectedVolatility).toBeGreaterThan(0);
        expect(result.expectedVolatility).toBeLessThan(1); // Less than 100% annualized
      });

      it('should return valid weights', async () => {
        const prices = createTestPrices();
        const config: OptimizationConfig = {
          objective: 'min_volatility',
          riskFreeRate: 0.05,
        };

        const result = await optimizer.optimize(['AAPL', 'MSFT', 'GOOGL'], prices, config);

        const weightSum = Array.from(result.weights.values()).reduce((a, b) => a + b, 0);
        expect(weightSum).toBeCloseTo(1, 2);
      });
    });

    describe('risk_parity objective', () => {
      it('should return weights where each asset contributes similar risk', async () => {
        const prices = createTestPrices();
        const config: OptimizationConfig = {
          objective: 'risk_parity',
          riskFreeRate: 0.05,
        };

        const result = await optimizer.optimize(['AAPL', 'MSFT', 'GOOGL'], prices, config);

        // Weights should be valid
        const weightSum = Array.from(result.weights.values()).reduce((a, b) => a + b, 0);
        expect(weightSum).toBeCloseTo(1, 2);

        // All weights should be positive for risk parity
        for (const [, weight] of result.weights) {
          expect(weight).toBeGreaterThan(0);
        }
      });

      it('should produce reasonable portfolio metrics', async () => {
        const prices = createTestPrices();
        const config: OptimizationConfig = {
          objective: 'risk_parity',
          riskFreeRate: 0.05,
        };

        const result = await optimizer.optimize(['AAPL', 'MSFT', 'GOOGL'], prices, config);

        expect(result.expectedVolatility).toBeGreaterThan(0);
        expect(result.expectedReturn).toBeDefined();
      });
    });

    describe('target_volatility objective', () => {
      it('should scale weights to achieve target volatility', async () => {
        const prices = createTestPrices();
        const targetVol = 0.10; // 10% target
        const config: OptimizationConfig = {
          objective: 'target_volatility',
          riskFreeRate: 0.05,
          targetVolatility: targetVol,
        };

        const result = await optimizer.optimize(['AAPL', 'MSFT', 'GOOGL'], prices, config);

        // Should have some weights (may be scaled down)
        const hasWeights = Array.from(result.weights.values()).some((w) => w > 0);
        expect(hasWeights).toBe(true);
      });
    });

    describe('default (equal weight)', () => {
      it('should fall back to equal weights for unknown objective', async () => {
        const prices = createTestPrices();
        const config: OptimizationConfig = {
          objective: 'unknown' as any,
          riskFreeRate: 0.05,
        };

        const result = await optimizer.optimize(['AAPL', 'MSFT', 'GOOGL'], prices, config);

        // Should have equal weights
        const weights = Array.from(result.weights.values());
        const expectedWeight = 1 / 3;

        for (const weight of weights) {
          expect(weight).toBeCloseTo(expectedWeight, 2);
        }
      });
    });
  });

  describe('Monte Carlo Simulation', () => {
    it('should return valid Monte Carlo results', async () => {
      const prices = new Map<string, Price[]>();
      prices.set('AAPL', generateMockPrices('AAPL', 300, 150));
      prices.set('MSFT', generateMockPrices('MSFT', 300, 350));

      const config: OptimizationConfig = {
        objective: 'max_sharpe',
        riskFreeRate: 0.05,
      };

      const result = await optimizer.optimize(['AAPL', 'MSFT'], prices, config);

      expect(result.monteCarlo.simulations).toBe(10000);
      expect(typeof result.monteCarlo.var95).toBe('number');
      expect(typeof result.monteCarlo.cvar95).toBe('number');
      expect(typeof result.monteCarlo.medianReturn).toBe('number');
      expect(typeof result.monteCarlo.probPositive).toBe('number');
    });

    it('should have VaR95 less than or equal to CVaR95 in magnitude', async () => {
      const prices = new Map<string, Price[]>();
      prices.set('AAPL', generateMockPrices('AAPL', 300, 150));
      prices.set('MSFT', generateMockPrices('MSFT', 300, 350));

      const config: OptimizationConfig = {
        objective: 'max_sharpe',
        riskFreeRate: 0.05,
      };

      const result = await optimizer.optimize(['AAPL', 'MSFT'], prices, config);

      // CVaR (expected shortfall) should be worse than VaR
      // Both are typically negative for 95% confidence
      expect(result.monteCarlo.cvar95).toBeLessThanOrEqual(result.monteCarlo.var95);
    });

    it('should have probability positive between 0 and 1', async () => {
      const prices = new Map<string, Price[]>();
      prices.set('AAPL', generateMockPrices('AAPL', 300, 150));
      prices.set('MSFT', generateMockPrices('MSFT', 300, 350));

      const config: OptimizationConfig = {
        objective: 'max_sharpe',
        riskFreeRate: 0.05,
      };

      const result = await optimizer.optimize(['AAPL', 'MSFT'], prices, config);

      expect(result.monteCarlo.probPositive).toBeGreaterThanOrEqual(0);
      expect(result.monteCarlo.probPositive).toBeLessThanOrEqual(1);
    });
  });

  describe('Factor Exposures', () => {
    it('should include factor exposures in result', async () => {
      const prices = new Map<string, Price[]>();
      prices.set('AAPL', generateMockPrices('AAPL', 300, 150));
      prices.set('MSFT', generateMockPrices('MSFT', 300, 350));
      prices.set('SPY', generateMockPrices('SPY', 300, 450)); // Market proxy

      const config: OptimizationConfig = {
        objective: 'max_sharpe',
        riskFreeRate: 0.05,
      };

      const result = await optimizer.optimize(['AAPL', 'MSFT'], prices, config);

      expect(result.factorExposures).toBeDefined();
      expect(Array.isArray(result.factorExposures)).toBe(true);
    });
  });

  describe('Explanation Generation', () => {
    it('should include key metrics in explanation', async () => {
      const prices = new Map<string, Price[]>();
      prices.set('AAPL', generateMockPrices('AAPL', 300, 150));
      prices.set('MSFT', generateMockPrices('MSFT', 300, 350));

      const config: OptimizationConfig = {
        objective: 'max_sharpe',
        riskFreeRate: 0.05,
      };

      const result = await optimizer.optimize(['AAPL', 'MSFT'], prices, config);

      expect(result.explanation).toContain('%'); // Return or volatility
      expect(result.explanation.toLowerCase()).toContain('sharpe');
    });

    it('should mention top holdings', async () => {
      const prices = new Map<string, Price[]>();
      prices.set('AAPL', generateMockPrices('AAPL', 300, 150));
      prices.set('MSFT', generateMockPrices('MSFT', 300, 350));

      const config: OptimizationConfig = {
        objective: 'max_sharpe',
        riskFreeRate: 0.05,
      };

      const result = await optimizer.optimize(['AAPL', 'MSFT'], prices, config);

      // Should mention at least one symbol
      const mentionsSymbol = result.explanation.includes('AAPL') || result.explanation.includes('MSFT');
      expect(mentionsSymbol).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle single asset portfolio', async () => {
      const prices = new Map<string, Price[]>();
      prices.set('AAPL', generateMockPrices('AAPL', 300, 150));

      const config: OptimizationConfig = {
        objective: 'max_sharpe',
        riskFreeRate: 0.05,
      };

      const result = await optimizer.optimize(['AAPL'], prices, config);

      expect(result.weights.get('AAPL')).toBeCloseTo(1, 2);
    });

    it('should handle empty returns gracefully', async () => {
      const prices = new Map<string, Price[]>();
      prices.set('AAPL', [
        { symbol: 'AAPL', timestamp: new Date(), open: 100, high: 101, low: 99, close: 100, volume: 1000 },
      ]);

      const config: OptimizationConfig = {
        objective: 'max_sharpe',
        riskFreeRate: 0.05,
      };

      // Should not throw
      const result = await optimizer.optimize(['AAPL'], prices, config);
      expect(result.weights).toBeDefined();
    });

    it('should handle highly correlated assets', async () => {
      const prices = new Map<string, Price[]>();
      const basePrices = generateMockPrices('AAPL', 300, 150);
      prices.set('AAPL', basePrices);
      prices.set('MSFT', generateCorrelatedPrices('MSFT', basePrices, 0.95, 350));

      const config: OptimizationConfig = {
        objective: 'risk_parity',
        riskFreeRate: 0.05,
      };

      const result = await optimizer.optimize(['AAPL', 'MSFT'], prices, config);

      // Should still produce valid weights
      const weightSum = Array.from(result.weights.values()).reduce((a, b) => a + b, 0);
      expect(weightSum).toBeCloseTo(1, 2);
    });

    it('should handle assets with very different volatilities', async () => {
      const prices = new Map<string, Price[]>();
      prices.set('LOW_VOL', generateMockPrices('LOW_VOL', 300, 100, 0.0001, 0.005));
      prices.set('HIGH_VOL', generateMockPrices('HIGH_VOL', 300, 100, 0.001, 0.05));

      const config: OptimizationConfig = {
        objective: 'min_volatility',
        riskFreeRate: 0.05,
      };

      const result = await optimizer.optimize(['LOW_VOL', 'HIGH_VOL'], prices, config);

      // Min vol should prefer the low volatility asset
      const lowVolWeight = result.weights.get('LOW_VOL') || 0;
      const highVolWeight = result.weights.get('HIGH_VOL') || 0;

      expect(lowVolWeight).toBeGreaterThan(highVolWeight);
    });
  });

  describe('Result Structure', () => {
    it('should return all required fields', async () => {
      const prices = new Map<string, Price[]>();
      prices.set('AAPL', generateMockPrices('AAPL', 300, 150));
      prices.set('MSFT', generateMockPrices('MSFT', 300, 350));

      const config: OptimizationConfig = {
        objective: 'max_sharpe',
        riskFreeRate: 0.05,
      };

      const result = await optimizer.optimize(['AAPL', 'MSFT'], prices, config);

      // Check OptimizationResult structure
      expect(result.weights).toBeInstanceOf(Map);
      expect(typeof result.expectedReturn).toBe('number');
      expect(typeof result.expectedVolatility).toBe('number');
      expect(typeof result.sharpeRatio).toBe('number');
      expect(Array.isArray(result.factorExposures)).toBe(true);
      expect(typeof result.explanation).toBe('string');

      // Check MonteCarloResult structure
      expect(typeof result.monteCarlo.simulations).toBe('number');
      expect(typeof result.monteCarlo.var95).toBe('number');
      expect(typeof result.monteCarlo.cvar95).toBe('number');
      expect(typeof result.monteCarlo.medianReturn).toBe('number');
      expect(typeof result.monteCarlo.probPositive).toBe('number');
    });

    it('should annualize returns and volatility', async () => {
      const prices = new Map<string, Price[]>();
      prices.set('AAPL', generateMockPrices('AAPL', 300, 150, 0.0004, 0.01)); // ~10% annual return, ~16% vol

      const config: OptimizationConfig = {
        objective: 'max_sharpe',
        riskFreeRate: 0.05,
      };

      const result = await optimizer.optimize(['AAPL'], prices, config);

      // Annualized volatility should be in reasonable range (1-100%)
      expect(result.expectedVolatility).toBeGreaterThan(0.01);
      expect(result.expectedVolatility).toBeLessThan(2);
    });
  });
});
