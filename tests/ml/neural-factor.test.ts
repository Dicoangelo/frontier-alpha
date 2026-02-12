/**
 * Unit Tests for NeuralFactorModel (EWMA-based Momentum Predictor)
 *
 * Tests prediction structure, feature extraction, confidence intervals,
 * signal behavior with trending/mean-reverting data, and edge cases.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  NeuralFactorModel,
} from '../../src/ml/NeuralFactorModel.js';
import type {
  MomentumPrediction,
  FeatureVector,
} from '../../src/ml/NeuralFactorModel.js';

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Seeded PRNG (Mulberry32) for deterministic tests.
 */
function createRng(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * Generate daily factor returns with controlled drift and volatility.
 */
function generateFactorReturns(
  days: number,
  dailyDrift: number,
  dailyVol: number,
  seed: number = 42,
): number[] {
  const rand = createRng(seed);
  const returns: number[] = [];

  for (let i = 0; i < days; i++) {
    const u1 = rand();
    const u2 = rand();
    const z = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
    returns.push(dailyDrift + dailyVol * z);
  }

  return returns;
}

/** Strong uptrend factor returns */
function generateBullishReturns(days: number = 200): number[] {
  return generateFactorReturns(days, 0.001, 0.008, 1);
}

/** Strong downtrend factor returns */
function generateBearishReturns(days: number = 200): number[] {
  return generateFactorReturns(days, -0.001, 0.008, 2);
}

/** Flat/noise factor returns */
function generateFlatReturns(days: number = 200): number[] {
  return generateFactorReturns(days, 0.0, 0.01, 3);
}

/** High volatility factor returns */
function generateVolatileReturns(days: number = 200): number[] {
  return generateFactorReturns(days, 0.0, 0.04, 4);
}

// ============================================================================
// TESTS
// ============================================================================

describe('NeuralFactorModel', () => {
  let model: NeuralFactorModel;

  beforeEach(() => {
    model = new NeuralFactorModel();
  });

  // --------------------------------------------------------------------------
  // 1. Construction and configuration
  // --------------------------------------------------------------------------
  describe('Constructor', () => {
    it('should initialize with default config', () => {
      expect(model).toBeDefined();
      const config = model.getConfig();
      expect(config.windowSize).toBe(21);
      expect(config.ewmaHalfLives).toEqual([5, 10, 21, 63]);
      expect(config.predictionHorizon).toBe(21);
      expect(config.minDataPoints).toBe(63);
      expect(config.confidenceZ).toBe(1.96);
    });

    it('should accept partial custom config', () => {
      const custom = new NeuralFactorModel({ windowSize: 10, minDataPoints: 30 });
      const config = custom.getConfig();
      expect(config.windowSize).toBe(10);
      expect(config.minDataPoints).toBe(30);
      // Defaults preserved
      expect(config.ewmaHalfLives).toEqual([5, 10, 21, 63]);
    });
  });

  // --------------------------------------------------------------------------
  // 2. predictMomentum returns correct structure
  // --------------------------------------------------------------------------
  describe('predictMomentum', () => {
    it('should return all required fields in MomentumPrediction', () => {
      const returns = generateBullishReturns();
      const result: MomentumPrediction = model.predictMomentum(returns);

      expect(typeof result.signal).toBe('number');
      expect(typeof result.confidence).toBe('number');
      expect(typeof result.upperBound).toBe('number');
      expect(typeof result.lowerBound).toBe('number');
      expect(Array.isArray(result.scaleSignals)).toBe(true);
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(Number.isFinite(result.signal)).toBe(true);
    });

    it('should return upper bound >= lower bound', () => {
      const returns = generateBullishReturns();
      const result = model.predictMomentum(returns);
      expect(result.upperBound).toBeGreaterThanOrEqual(result.lowerBound);
    });

    it('should return signal between lower and upper bounds', () => {
      const returns = generateBullishReturns();
      const result = model.predictMomentum(returns);
      expect(result.signal).toBeGreaterThanOrEqual(result.lowerBound);
      expect(result.signal).toBeLessThanOrEqual(result.upperBound);
    });

    it('should return confidence in [0, 1]', () => {
      const scenarios = [
        generateBullishReturns(),
        generateBearishReturns(),
        generateFlatReturns(),
        generateVolatileReturns(),
      ];

      for (const returns of scenarios) {
        const result = model.predictMomentum(returns);
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should return scale signals for each EWMA half-life', () => {
      const returns = generateBullishReturns();
      const result = model.predictMomentum(returns);

      expect(result.scaleSignals).toHaveLength(4); // [5, 10, 21, 63]
      const halfLives = result.scaleSignals.map(s => s.halfLife);
      expect(halfLives).toEqual([5, 10, 21, 63]);
    });

    it('should have scale signal weights summing to ~1', () => {
      const returns = generateBullishReturns();
      const result = model.predictMomentum(returns);

      const totalWeight = result.scaleSignals.reduce((sum, s) => sum + s.weight, 0);
      expect(totalWeight).toBeCloseTo(1.0, 5);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Signal directional behavior
  // --------------------------------------------------------------------------
  describe('Signal Direction', () => {
    it('should produce positive signal for strong uptrend', () => {
      // Use a very strong uptrend
      const returns = generateFactorReturns(200, 0.003, 0.005, 10);
      const result = model.predictMomentum(returns);
      expect(result.signal).toBeGreaterThan(0);
    });

    it('should produce negative signal for strong downtrend', () => {
      // Use a very strong downtrend
      const returns = generateFactorReturns(200, -0.003, 0.005, 20);
      const result = model.predictMomentum(returns);
      expect(result.signal).toBeLessThan(0);
    });

    it('should produce near-zero signal for flat returns', () => {
      const returns = generateFlatReturns(300);
      const result = model.predictMomentum(returns);
      // Near zero, but allow some noise
      expect(Math.abs(result.signal)).toBeLessThan(1.0);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Confidence intervals
  // --------------------------------------------------------------------------
  describe('Confidence Intervals', () => {
    it('should produce wider intervals for volatile data', () => {
      const calmReturns = generateFactorReturns(200, 0.001, 0.005, 50);
      const volReturns = generateFactorReturns(200, 0.001, 0.04, 51);

      const calmResult = model.predictMomentum(calmReturns);
      const volResult = model.predictMomentum(volReturns);

      const calmWidth = calmResult.upperBound - calmResult.lowerBound;
      const volWidth = volResult.upperBound - volResult.lowerBound;

      expect(volWidth).toBeGreaterThan(calmWidth);
    });

    it('should produce symmetric intervals around signal', () => {
      const returns = generateBullishReturns();
      const result = model.predictMomentum(returns);

      const upperDist = result.upperBound - result.signal;
      const lowerDist = result.signal - result.lowerBound;

      expect(upperDist).toBeCloseTo(lowerDist, 10);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Feature extraction
  // --------------------------------------------------------------------------
  describe('extractFeatures', () => {
    it('should extract correct number of feature vectors', () => {
      const returns = generateBullishReturns(100);
      const features: FeatureVector[] = model.extractFeatures(returns);

      // 100 data points, window=21, so features from index 21 to 99 = 79
      expect(features.length).toBe(100 - 21);
    });

    it('should return features with finite numeric values', () => {
      const returns = generateBullishReturns();
      const features = model.extractFeatures(returns);

      for (const f of features) {
        expect(Number.isFinite(f.return_)).toBe(true);
        expect(Number.isFinite(f.volatility)).toBe(true);
        expect(Number.isFinite(f.trendStrength)).toBe(true);
        expect(Number.isFinite(f.meanReversion)).toBe(true);
        expect(Number.isFinite(f.acceleration)).toBe(true);
      }
    });

    it('should return non-negative volatility in features', () => {
      const returns = generateBullishReturns();
      const features = model.extractFeatures(returns);

      for (const f of features) {
        expect(f.volatility).toBeGreaterThanOrEqual(0);
      }
    });

    it('should return empty array for insufficient data', () => {
      const returns = generateBullishReturns(10);
      const features = model.extractFeatures(returns);
      expect(features).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // 6. Edge cases
  // --------------------------------------------------------------------------
  describe('Edge Cases', () => {
    it('should handle insufficient data gracefully', () => {
      const result = model.predictMomentum([0.01, -0.005, 0.003]);
      expect(result.signal).toBe(0);
      expect(result.confidence).toBe(0);
      expect(result.scaleSignals).toEqual([]);
    });

    it('should handle empty array', () => {
      const result = model.predictMomentum([]);
      expect(result.signal).toBe(0);
      expect(result.confidence).toBe(0);
    });

    it('should handle exactly minDataPoints entries', () => {
      const returns = generateBullishReturns(63); // exactly minDataPoints
      const result = model.predictMomentum(returns);
      expect(result).toBeDefined();
      expect(Number.isFinite(result.signal)).toBe(true);
      expect(result.scaleSignals.length).toBeGreaterThan(0);
    });

    it('should handle all-zero returns', () => {
      const returns = new Array(100).fill(0);
      const result = model.predictMomentum(returns);
      expect(result).toBeDefined();
      expect(Number.isFinite(result.signal)).toBe(true);
      expect(result.signal).toBe(0);
    });

    it('should handle constant positive returns', () => {
      const returns = new Array(100).fill(0.001);
      const result = model.predictMomentum(returns);
      expect(result).toBeDefined();
      expect(Number.isFinite(result.signal)).toBe(true);
      // All scales should agree on positive direction
      expect(result.signal).toBeGreaterThanOrEqual(0);
    });

    it('should not mutate the input array', () => {
      const returns = generateBullishReturns();
      const original = [...returns];
      model.predictMomentum(returns);
      expect(returns).toEqual(original);
    });
  });

  // --------------------------------------------------------------------------
  // 7. Custom configuration
  // --------------------------------------------------------------------------
  describe('Custom Configuration', () => {
    it('should respect custom EWMA half-lives', () => {
      const custom = new NeuralFactorModel({ ewmaHalfLives: [3, 7] });
      const returns = generateBullishReturns();
      const result = custom.predictMomentum(returns);

      expect(result.scaleSignals).toHaveLength(2);
      expect(result.scaleSignals[0].halfLife).toBe(3);
      expect(result.scaleSignals[1].halfLife).toBe(7);
    });

    it('should produce narrower intervals with smaller confidence Z', () => {
      const wide = new NeuralFactorModel({ confidenceZ: 2.576 }); // 99%
      const narrow = new NeuralFactorModel({ confidenceZ: 1.645 }); // 90%

      const returns = generateBullishReturns();
      const wideResult = wide.predictMomentum(returns);
      const narrowResult = narrow.predictMomentum(returns);

      const wideWidth = wideResult.upperBound - wideResult.lowerBound;
      const narrowWidth = narrowResult.upperBound - narrowResult.lowerBound;

      expect(wideWidth).toBeGreaterThan(narrowWidth);
    });
  });
});
