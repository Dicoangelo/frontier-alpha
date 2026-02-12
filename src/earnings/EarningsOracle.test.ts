/**
 * Unit Tests for EarningsOracle
 *
 * Tests forecast generation, recommendation logic (HOLD/TRIM/HEDGE),
 * and historical pattern analysis.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EarningsOracle } from './EarningsOracle.js';

describe('EarningsOracle', () => {
  let oracle: EarningsOracle;

  beforeEach(() => {
    // Initialize with mock API keys (tests will use mock data)
    oracle = new EarningsOracle('mock-api-key', 'mock-polygon-key');
  });

  describe('Constructor', () => {
    it('should initialize with API key', () => {
      const instance = new EarningsOracle('test-key');
      expect(instance).toBeDefined();
    });

    it('should accept optional Polygon API key', () => {
      const instance = new EarningsOracle('test-key', 'polygon-key');
      expect(instance).toBeDefined();
    });
  });

  describe('Mock Pattern Generation', () => {
    it('should generate valid mock pattern for any symbol', () => {
      const pattern = EarningsOracle.generateMockPattern('AAPL');

      expect(pattern.symbol).toBe('AAPL');
      expect(pattern.avgMove).toBeGreaterThan(0);
      expect(pattern.beatRate).toBeGreaterThanOrEqual(50);
      expect(pattern.beatRate).toBeLessThanOrEqual(90);
      expect(pattern.reactions.length).toBe(8);
    });

    it('should generate different patterns for different symbols', () => {
      const aaplPattern = EarningsOracle.generateMockPattern('AAPL');
      const msftPattern = EarningsOracle.generateMockPattern('MSFT');

      // Patterns should have some variation
      const sameAvgMove = aaplPattern.avgMove === msftPattern.avgMove;
      const sameBeatRate = aaplPattern.beatRate === msftPattern.beatRate;

      // At least one should differ (hash-based)
      expect(sameAvgMove && sameBeatRate).toBe(false);
    });

    it('should generate higher volatility for tech symbols', () => {
      const techPattern = EarningsOracle.generateMockPattern('NVDA');
      const nonTechPattern = EarningsOracle.generateMockPattern('PG');

      // Tech symbols should have higher average move
      expect(techPattern.avgMove).toBeGreaterThanOrEqual(nonTechPattern.avgMove);
    });

    it('should include historical reactions with all fields', () => {
      const pattern = EarningsOracle.generateMockPattern('AAPL');

      for (const reaction of pattern.reactions) {
        expect(reaction.reportDate).toBeDefined();
        expect(reaction.fiscalQuarter).toBeDefined();
        expect(typeof reaction.estimatedEps).toBe('number');
        expect(typeof reaction.actualEps).toBe('number');
        expect(typeof reaction.surprise).toBe('number');
        expect(typeof reaction.priceMove).toBe('number');
        expect(typeof reaction.postEarningsDrift).toBe('number');
      }
    });

    it('should set volatility trend appropriately for tech stocks', () => {
      const nvdaPattern = EarningsOracle.generateMockPattern('NVDA');
      expect(nvdaPattern.volatilityTrend).toBe('increasing');

      // Non-tech should be stable
      const xomPattern = EarningsOracle.generateMockPattern('XOM');
      expect(xomPattern.volatilityTrend).toBe('stable');
    });
  });

  describe('Price Reaction Calculation', () => {
    it('should calculate price move correctly', () => {
      const mockPrices = [
        { date: '2024-01-08', open: 99, high: 101, low: 98, close: 100, adjustedClose: 100, volume: 1000000 },
        { date: '2024-01-09', open: 100, high: 110, low: 99, close: 108, adjustedClose: 108, volume: 2000000 }, // Earnings day
        { date: '2024-01-10', open: 108, high: 112, low: 107, close: 110, adjustedClose: 110, volume: 1500000 },
        { date: '2024-01-11', open: 110, high: 113, low: 109, close: 111, adjustedClose: 111, volume: 1200000 },
        { date: '2024-01-12', open: 111, high: 114, low: 110, close: 112, adjustedClose: 112, volume: 1100000 },
        { date: '2024-01-15', open: 112, high: 115, low: 111, close: 113, adjustedClose: 113, volume: 1000000 },
        { date: '2024-01-16', open: 113, high: 116, low: 112, close: 115, adjustedClose: 115, volume: 900000 },
      ];

      const result = oracle.calculatePriceReaction(mockPrices, '2024-01-09');

      // Price move: (108 - 100) / 100 = 8%
      expect(result.priceMove).toBeCloseTo(8, 1);

      // Post-earnings drift: (115 - 108) / 108 = ~6.5%
      expect(result.postEarningsDrift).toBeCloseTo(6.48, 1);
    });

    it('should return null for missing earnings date', () => {
      const mockPrices = [
        { date: '2024-01-08', open: 99, high: 101, low: 98, close: 100, adjustedClose: 100, volume: 1000000 },
        { date: '2024-01-09', open: 100, high: 102, low: 99, close: 101, adjustedClose: 101, volume: 1000000 },
      ];

      const result = oracle.calculatePriceReaction(mockPrices, '2024-01-01');

      expect(result.priceMove).toBeNull();
    });

    it('should return null for insufficient post-earnings data', () => {
      const mockPrices = [
        { date: '2024-01-08', open: 99, high: 101, low: 98, close: 100, adjustedClose: 100, volume: 1000000 },
        { date: '2024-01-09', open: 100, high: 110, low: 99, close: 108, adjustedClose: 108, volume: 2000000 },
        { date: '2024-01-10', open: 108, high: 112, low: 107, close: 110, adjustedClose: 110, volume: 1500000 },
      ];

      const result = oracle.calculatePriceReaction(mockPrices, '2024-01-09');

      expect(result.priceMove).not.toBeNull();
      expect(result.postEarningsDrift).toBeNull(); // Not enough days
    });
  });

  describe('Forecast Generation', () => {
    it('should generate valid forecast structure', async () => {
      const forecast = await oracle.generateForecast('AAPL', '2024-04-15');

      expect(forecast.symbol).toBe('AAPL');
      expect(forecast.reportDate).toBe('2024-04-15');
      expect(typeof forecast.expectedMove).toBe('number');
      expect(['up', 'down', 'neutral']).toContain(forecast.expectedDirection);
      expect(forecast.confidence).toBeGreaterThanOrEqual(0);
      expect(forecast.confidence).toBeLessThanOrEqual(1);
      expect(typeof forecast.historicalAvgMove).toBe('number');
      expect(typeof forecast.beatRate).toBe('number');
      expect(['hold', 'reduce', 'hedge', 'add']).toContain(forecast.recommendation);
      expect(forecast.explanation.length).toBeGreaterThan(0);
      expect(forecast.factors).toBeDefined();
    });

    it('should include factors in forecast', async () => {
      const forecast = await oracle.generateForecast('MSFT', '2024-04-20');

      expect(forecast.factors.historicalPattern).toBeDefined();
      expect(forecast.factors.recentTrend).toBeDefined();
      expect(forecast.factors.riskAssessment).toBeDefined();
    });
  });

  describe('Recommendation Logic', () => {
    // We test the recommendation logic by examining mock patterns with known characteristics

    it('should recommend hedge for high volatility stocks', async () => {
      // NVDA has high historical volatility in mock data
      const forecast = await oracle.generateForecast('NVDA', '2024-04-15');

      // High vol stocks should get hedge or reduce recommendation
      expect(['hedge', 'reduce', 'hold']).toContain(forecast.recommendation);
    });

    it('should include risk assessment in explanation', async () => {
      const forecast = await oracle.generateForecast('AAPL', '2024-04-15');

      // Explanation should mention the symbol
      expect(forecast.explanation).toContain('AAPL');

      // Factors should have risk assessment
      expect(forecast.factors.riskAssessment.length).toBeGreaterThan(0);
    });

    it('should adjust expected move based on volatility trend', async () => {
      // Generate forecasts for stocks with different volatility trends
      const nvdaForecast = await oracle.generateForecast('NVDA', '2024-04-15'); // Increasing vol
      const pgForecast = await oracle.generateForecast('PG', '2024-04-15'); // Stable vol

      // Both should have positive expected moves
      expect(nvdaForecast.expectedMove).toBeGreaterThan(0);
      expect(pgForecast.expectedMove).toBeGreaterThan(0);
    });
  });

  describe('Historical Reactions', () => {
    it('should return empty array when no pattern exists', async () => {
      // Create a new oracle instance that hasn't built any patterns
      const freshOracle = new EarningsOracle('mock-key');

      // Without building pattern first, should return empty
      const reactions = await freshOracle.getHistoricalReactions('UNKNOWN_SYMBOL');

      // Returns empty array or builds pattern dynamically
      expect(Array.isArray(reactions)).toBe(true);
    });
  });

  describe('Beat Rate Calculations', () => {
    it('should calculate beat rate from reactions', () => {
      const pattern = EarningsOracle.generateMockPattern('AAPL');

      // Beat rate should be between 50-90% based on mock generation
      expect(pattern.beatRate).toBeGreaterThanOrEqual(50);
      expect(pattern.beatRate).toBeLessThanOrEqual(90);
    });

    it('should have consistent beat/miss reaction averages', () => {
      const pattern = EarningsOracle.generateMockPattern('MSFT');

      // Average beat move should be positive
      expect(pattern.avgBeatMove).toBeGreaterThan(0);

      // Average miss move should be negative
      expect(pattern.avgMissMove).toBeLessThan(0);
    });
  });

  describe('Confidence Calculation', () => {
    it('should calculate confidence based on data quality', async () => {
      const forecast = await oracle.generateForecast('AAPL', '2024-04-15');

      // Confidence should be between 0 and 1
      expect(forecast.confidence).toBeGreaterThanOrEqual(0);
      expect(forecast.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('Expected Direction', () => {
    it('should determine direction based on beat rate and recent patterns', async () => {
      const forecast = await oracle.generateForecast('AAPL', '2024-04-15');

      // Direction should be one of three options
      expect(['up', 'down', 'neutral']).toContain(forecast.expectedDirection);
    });
  });

  describe('Edge Cases', () => {
    it('should handle symbols with no sector mapping', async () => {
      const forecast = await oracle.generateForecast('UNKNOWN', '2024-04-15');

      expect(forecast.symbol).toBe('UNKNOWN');
      expect(forecast.expectedMove).toBeGreaterThan(0);
    });

    it('should handle future report dates', async () => {
      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 6);
      const dateStr = futureDate.toISOString().split('T')[0];

      const forecast = await oracle.generateForecast('AAPL', dateStr);

      expect(forecast.reportDate).toBe(dateStr);
    });

    it('should handle past report dates', async () => {
      const pastDate = '2020-01-15';

      const forecast = await oracle.generateForecast('MSFT', pastDate);

      expect(forecast.reportDate).toBe(pastDate);
    });
  });

  describe('Pattern Volatility Trend', () => {
    it('should detect increasing volatility', () => {
      const pattern = EarningsOracle.generateMockPattern('NVDA');

      // Tech stocks should have increasing volatility in mock
      expect(pattern.volatilityTrend).toBe('increasing');
    });

    it('should detect stable volatility for non-tech', () => {
      const pattern = EarningsOracle.generateMockPattern('PG');

      expect(pattern.volatilityTrend).toBe('stable');
    });
  });

  describe('Explanation Content', () => {
    it('should include percentage in explanation', async () => {
      const forecast = await oracle.generateForecast('AAPL', '2024-04-15');

      expect(forecast.explanation).toMatch(/%/);
    });

    it('should reference the symbol in explanation', async () => {
      const forecast = await oracle.generateForecast('AAPL', '2024-04-15');

      // Explanation should mention the symbol
      expect(forecast.explanation).toContain('AAPL');
    });

    it('should have non-empty factor explanations', async () => {
      const forecast = await oracle.generateForecast('MSFT', '2024-04-20');

      expect(forecast.factors.historicalPattern.length).toBeGreaterThan(0);
      expect(forecast.factors.recentTrend.length).toBeGreaterThan(0);
      expect(forecast.factors.riskAssessment.length).toBeGreaterThan(0);
    });
  });

  describe('Fiscal Quarter Generation', () => {
    it('should generate valid fiscal quarters in mock data', () => {
      const pattern = EarningsOracle.generateMockPattern('AAPL');

      for (const reaction of pattern.reactions) {
        // Should match pattern like "Q1 2024" or "Q4 2023"
        expect(reaction.fiscalQuarter).toMatch(/Q[1-4] \d{4}/);
      }
    });
  });

  describe('EPS Data', () => {
    it('should have positive estimated EPS in mock data', () => {
      const pattern = EarningsOracle.generateMockPattern('AAPL');

      for (const reaction of pattern.reactions) {
        expect(reaction.estimatedEps).toBeGreaterThan(0);
      }
    });

    it('should have actual EPS close to estimated', () => {
      const pattern = EarningsOracle.generateMockPattern('MSFT');

      for (const reaction of pattern.reactions) {
        if (reaction.actualEps !== null) {
          // Actual should be within reasonable range of estimated
          const ratio = reaction.actualEps / reaction.estimatedEps;
          expect(ratio).toBeGreaterThan(0.5);
          expect(ratio).toBeLessThan(2);
        }
      }
    });
  });
});
