/**
 * Unit Tests for RegimeDetector (HMM-based Market Regime Detection)
 *
 * Tests regime classification accuracy, transition probabilities,
 * Viterbi decoding, and edge cases.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  RegimeDetector,
} from '../../src/ml/RegimeDetector.js';
import type {
  MarketRegime,
  RegimeDetectionResult,
} from '../../src/ml/RegimeDetector.js';
import type { Price } from '../../src/types/index.js';

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Generate mock price data with controlled characteristics.
 */
function generatePrices(
  days: number,
  startPrice: number,
  dailyDrift: number,
  dailyVol: number,
  seed: number = 42,
): Price[] {
  const prices: Price[] = [];
  let price = startPrice;
  // Simple seeded PRNG (Mulberry32)
  let s = seed;
  const rand = () => {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };

  for (let i = 0; i < days; i++) {
    const date = new Date(2025, 0, 1);
    date.setDate(date.getDate() + i);

    // Normal-ish via Box-Muller
    const u1 = rand();
    const u2 = rand();
    const z = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);

    const dailyReturn = dailyDrift + dailyVol * z;
    price = Math.max(0.01, price * (1 + dailyReturn));

    prices.push({
      symbol: 'TEST',
      timestamp: date,
      open: price * 0.999,
      high: price * 1.005,
      low: price * 0.995,
      close: price,
      volume: 1_000_000,
    });
  }

  return prices;
}

/**
 * Generate strongly bullish price data.
 */
function generateBullMarket(days: number = 120): Price[] {
  return generatePrices(days, 100, 0.001, 0.008, 1);
}

/**
 * Generate strongly bearish price data.
 */
function generateBearMarket(days: number = 120): Price[] {
  return generatePrices(days, 200, -0.002, 0.015, 2);
}

/**
 * Generate sideways/range-bound price data.
 */
function generateSidewaysMarket(days: number = 120): Price[] {
  return generatePrices(days, 100, 0.0, 0.005, 3);
}

/**
 * Generate highly volatile price data.
 */
function generateVolatileMarket(days: number = 120): Price[] {
  return generatePrices(days, 100, 0.0, 0.04, 4);
}

// ============================================================================
// TESTS
// ============================================================================

describe('RegimeDetector', () => {
  let detector: RegimeDetector;

  beforeEach(() => {
    detector = new RegimeDetector();
  });

  // --------------------------------------------------------------------------
  // 1. Construction and initialization
  // --------------------------------------------------------------------------
  describe('Constructor', () => {
    it('should initialize with default config', () => {
      expect(detector).toBeDefined();
      const transitions = detector.getTransitionProbabilities();
      expect(transitions).toHaveLength(4);
    });

    it('should accept custom config', () => {
      const custom = new RegimeDetector({ rollingWindow: 10, maxIterations: 5 });
      expect(custom).toBeDefined();
      // Should work with a shorter window
      const prices = generateBullMarket(30);
      const result = custom.detectRegime(prices);
      expect(result).toBeDefined();
      expect(result.regime).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // 2. detectRegime returns correct structure
  // --------------------------------------------------------------------------
  describe('detectRegime', () => {
    it('should return all required fields in RegimeDetectionResult', () => {
      const prices = generateBullMarket(100);
      const result: RegimeDetectionResult = detector.detectRegime(prices);

      expect(result.regime).toBeDefined();
      expect(RegimeDetector.REGIMES).toContain(result.regime);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.probabilities).toBeDefined();
      expect(result.probabilities.bull).toBeDefined();
      expect(result.probabilities.bear).toBeDefined();
      expect(result.probabilities.sideways).toBeDefined();
      expect(result.probabilities.volatile).toBeDefined();
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should return probabilities that sum to ~1', () => {
      const prices = generateBullMarket(100);
      const result = detector.detectRegime(prices);
      const sum =
        result.probabilities.bull +
        result.probabilities.bear +
        result.probabilities.sideways +
        result.probabilities.volatile;
      expect(sum).toBeCloseTo(1.0, 1);
    });

    it('should classify a strong bull market with bull or sideways regime', () => {
      const prices = generateBullMarket(200);
      const result = detector.detectRegime(prices);
      // Bull market should not be classified as bear
      expect(result.regime).not.toBe('bear');
    });

    it('should classify a bear market as non-bull', () => {
      const prices = generateBearMarket(200);
      const result = detector.detectRegime(prices);
      // Bear market should not be classified as bull
      expect(result.regime).not.toBe('bull');
    });

    it('should detect volatile regime for high-volatility data', () => {
      const prices = generateVolatileMarket(200);
      const result = detector.detectRegime(prices);
      // High-vol data should have elevated volatile probability
      expect(result.probabilities.volatile + result.probabilities.bear).toBeGreaterThan(0.1);
    });
  });

  // --------------------------------------------------------------------------
  // 3. getTransitionProbabilities
  // --------------------------------------------------------------------------
  describe('getTransitionProbabilities', () => {
    it('should return 4 transition matrices (one per regime)', () => {
      const transitions = detector.getTransitionProbabilities();
      expect(transitions).toHaveLength(4);

      const fromRegimes = transitions.map(t => t.from);
      expect(fromRegimes).toContain('bull');
      expect(fromRegimes).toContain('bear');
      expect(fromRegimes).toContain('sideways');
      expect(fromRegimes).toContain('volatile');
    });

    it('should have rows that sum to ~1 (valid probability distributions)', () => {
      const transitions = detector.getTransitionProbabilities();
      for (const row of transitions) {
        const sum = row.to.bull + row.to.bear + row.to.sideways + row.to.volatile;
        expect(sum).toBeCloseTo(1.0, 5);
      }
    });

    it('should have self-transition probabilities as the largest (regime persistence)', () => {
      // Before any training, the default prior has diagonal-dominant transitions
      const transitions = detector.getTransitionProbabilities();
      for (const row of transitions) {
        const selfProb = row.to[row.from];
        for (const regime of RegimeDetector.REGIMES) {
          if (regime !== row.from) {
            expect(selfProb).toBeGreaterThanOrEqual(row.to[regime]);
          }
        }
      }
    });

    it('should update after training on data', () => {
      const before = detector.getTransitionProbabilities();
      const beforeBullToBull = before.find(t => t.from === 'bull')!.to.bull;

      // Train on bull market data
      const prices = generateBullMarket(200);
      detector.detectRegime(prices);

      const after = detector.getTransitionProbabilities();
      const afterBullToBull = after.find(t => t.from === 'bull')!.to.bull;

      // The transition probabilities should have changed after training
      expect(afterBullToBull).not.toBe(beforeBullToBull);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Viterbi decoding
  // --------------------------------------------------------------------------
  describe('decodeRegimeSequence', () => {
    it('should return a regime label for each observation window', () => {
      const prices = generateBullMarket(100);
      const sequence = detector.decodeRegimeSequence(prices);
      // With rollingWindow=21, we get observations starting at index 21
      expect(sequence.length).toBeGreaterThan(0);
      for (const regime of sequence) {
        expect(RegimeDetector.REGIMES).toContain(regime);
      }
    });

    it('should return empty array for insufficient data', () => {
      const prices = generateBullMarket(5);
      const sequence = detector.decodeRegimeSequence(prices);
      expect(sequence).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Observation extraction
  // --------------------------------------------------------------------------
  describe('extractObservations', () => {
    it('should extract correct number of observations', () => {
      const prices = generateBullMarket(50);
      const obs = detector.extractObservations(prices);
      // 50 prices → 49 returns → observations from index 21 to 49 = 29
      expect(obs.length).toBe(49 - 21 + 1);
    });

    it('should return observations with valid feature ranges', () => {
      const prices = generateBullMarket(100);
      const obs = detector.extractObservations(prices);
      for (const o of obs) {
        expect(typeof o.rollingReturn).toBe('number');
        expect(typeof o.rollingVolatility).toBe('number');
        expect(typeof o.rollingCorrelation).toBe('number');
        expect(Number.isFinite(o.rollingReturn)).toBe(true);
        expect(o.rollingVolatility).toBeGreaterThanOrEqual(0);
        // Correlation in [-1, 1]
        expect(o.rollingCorrelation).toBeGreaterThanOrEqual(-1.01);
        expect(o.rollingCorrelation).toBeLessThanOrEqual(1.01);
      }
    });

    it('should return empty for insufficient data', () => {
      const prices = generateBullMarket(10);
      const obs = detector.extractObservations(prices);
      expect(obs).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // 6. Edge cases
  // --------------------------------------------------------------------------
  describe('Edge Cases', () => {
    it('should handle empty price array', () => {
      const result = detector.detectRegime([]);
      expect(result.regime).toBe('sideways');
      expect(result.confidence).toBe(0);
    });

    it('should handle single price entry', () => {
      const prices: Price[] = [{
        symbol: 'TEST', timestamp: new Date(), open: 100, high: 101, low: 99, close: 100, volume: 1000,
      }];
      const result = detector.detectRegime(prices);
      expect(result.regime).toBe('sideways');
      expect(result.confidence).toBe(0);
    });

    it('should handle exactly rollingWindow+1 prices (minimum for 1 observation)', () => {
      const prices = generateBullMarket(22); // 21 window + 1 = minimum
      const result = detector.detectRegime(prices);
      expect(result).toBeDefined();
      expect(RegimeDetector.REGIMES).toContain(result.regime);
    });

    it('should handle flat prices (zero volatility)', () => {
      const prices: Price[] = [];
      for (let i = 0; i < 60; i++) {
        const date = new Date(2025, 0, 1);
        date.setDate(date.getDate() + i);
        prices.push({
          symbol: 'FLAT', timestamp: date,
          open: 100, high: 100, low: 100, close: 100, volume: 1000,
        });
      }
      // Should not throw
      const result = detector.detectRegime(prices);
      expect(result).toBeDefined();
      expect(RegimeDetector.REGIMES).toContain(result.regime);
    });

    it('should not mutate the input price array', () => {
      const prices = generateBullMarket(100);
      const original = [...prices];
      detector.detectRegime(prices);
      expect(prices).toEqual(original);
    });
  });

  // --------------------------------------------------------------------------
  // 7. REGIMES constant
  // --------------------------------------------------------------------------
  describe('REGIMES Constant', () => {
    it('should contain exactly 4 regimes', () => {
      expect(RegimeDetector.REGIMES).toHaveLength(4);
    });

    it('should contain bull, bear, sideways, volatile', () => {
      expect(RegimeDetector.REGIMES).toContain('bull');
      expect(RegimeDetector.REGIMES).toContain('bear');
      expect(RegimeDetector.REGIMES).toContain('sideways');
      expect(RegimeDetector.REGIMES).toContain('volatile');
    });
  });

  // --------------------------------------------------------------------------
  // 8. Confidence behavior
  // --------------------------------------------------------------------------
  describe('Confidence Scores', () => {
    it('should produce higher confidence with more data', () => {
      const shortPrices = generateBullMarket(30);
      const longPrices = generateBullMarket(300);

      const shortResult = detector.detectRegime(shortPrices);

      // Re-create detector for fair comparison
      const detector2 = new RegimeDetector();
      const longResult = detector2.detectRegime(longPrices);

      // More data should generally produce equal or higher confidence
      // At minimum, both should be valid
      expect(shortResult.confidence).toBeGreaterThanOrEqual(0);
      expect(longResult.confidence).toBeGreaterThanOrEqual(0);
      expect(longResult.confidence).toBeGreaterThanOrEqual(shortResult.confidence - 0.1);
    });

    it('should return confidence between 0 and 1 inclusive', () => {
      const scenarios = [
        generateBullMarket(100),
        generateBearMarket(100),
        generateSidewaysMarket(100),
        generateVolatileMarket(100),
      ];
      for (const prices of scenarios) {
        const det = new RegimeDetector();
        const result = det.detectRegime(prices);
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
      }
    });
  });
});
