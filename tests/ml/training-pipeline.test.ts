/**
 * Unit Tests for TrainingPipeline (ML Training Pipeline Orchestrator)
 *
 * Tests walk-forward cross-validation, model training, performance metrics,
 * Supabase persistence conversion, and edge cases.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  TrainingPipeline,
} from '../../src/ml/TrainingPipeline.js';
import type {
  TrainingPipelineConfig,
  PipelineResult,
  WalkForwardSplit,
  ModelVersionRecord,
} from '../../src/ml/TrainingPipeline.js';
import type { Price } from '../../src/types/index.js';

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Generate mock price data with controlled characteristics.
 * Seeded PRNG (Mulberry32) for deterministic tests.
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
  let s = seed;
  const rand = () => {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };

  for (let i = 0; i < days; i++) {
    const date = new Date(2024, 0, 1);
    date.setDate(date.getDate() + i);

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
 * Generate factor returns aligned with price data.
 */
function generateFactorReturns(
  length: number,
  factors: string[],
  seed: number = 100,
): Record<string, number[]> {
  const result: Record<string, number[]> = {};
  let s = seed;
  const rand = () => {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };

  for (const factor of factors) {
    const returns: number[] = [];
    for (let i = 0; i < length; i++) {
      const u1 = rand();
      const u2 = rand();
      const z = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
      returns.push(z * 0.01);
    }
    result[factor] = returns;
  }

  return result;
}

// ============================================================================
// TESTS
// ============================================================================

describe('TrainingPipeline', () => {
  let pipeline: TrainingPipeline;

  beforeEach(() => {
    pipeline = new TrainingPipeline({
      numWindows: 3,
      minTrainSamples: 30,
    });
  });

  // --------------------------------------------------------------------------
  // Constructor
  // --------------------------------------------------------------------------

  describe('constructor', () => {
    it('creates with default config', () => {
      const p = new TrainingPipeline();
      const config = p.getConfig();
      expect(config.numWindows).toBe(5);
      expect(config.trainRatio).toBe(0.6);
      expect(config.validateRatio).toBe(0.2);
      expect(config.testRatio).toBe(0.2);
      expect(config.riskFreeRate).toBe(0.05);
    });

    it('accepts custom config overrides', () => {
      const p = new TrainingPipeline({
        numWindows: 10,
        riskFreeRate: 0.03,
        minTrainSamples: 100,
      });
      const config = p.getConfig();
      expect(config.numWindows).toBe(10);
      expect(config.riskFreeRate).toBe(0.03);
      expect(config.minTrainSamples).toBe(100);
    });

    it('throws if ratios do not sum to 1', () => {
      expect(() => new TrainingPipeline({
        trainRatio: 0.5,
        validateRatio: 0.5,
        testRatio: 0.5,
      })).toThrow('ratios must sum to 1.0');
    });
  });

  // --------------------------------------------------------------------------
  // Walk-Forward Splits
  // --------------------------------------------------------------------------

  describe('generateSplits', () => {
    it('generates correct number of windows', () => {
      const splits = pipeline.generateSplits(500);
      expect(splits.length).toBe(3);
    });

    it('every split has trainStart < trainEnd < validateStart < validateEnd', () => {
      const splits = pipeline.generateSplits(500);
      for (const split of splits) {
        expect(split.trainStart).toBeLessThan(split.trainEnd);
        expect(split.trainEnd).toBeLessThanOrEqual(split.validateStart);
        expect(split.validateStart).toBeLessThan(split.validateEnd);
      }
    });

    it('last window includes test split', () => {
      const splits = pipeline.generateSplits(500);
      const lastSplit = splits[splits.length - 1];
      expect(lastSplit.testStart).toBeDefined();
      expect(lastSplit.testEnd).toBeDefined();
      expect(lastSplit.testEnd).toBe(500);
    });

    it('non-last windows do not include test split', () => {
      const splits = pipeline.generateSplits(500);
      if (splits.length > 1) {
        for (let i = 0; i < splits.length - 1; i++) {
          expect(splits[i].testStart).toBeUndefined();
          expect(splits[i].testEnd).toBeUndefined();
        }
      }
    });

    it('returns empty for insufficient data', () => {
      const splits = pipeline.generateSplits(10);
      expect(splits.length).toBe(0);
    });

    it('training always starts at index 0 (expanding window)', () => {
      const splits = pipeline.generateSplits(500);
      for (const split of splits) {
        expect(split.trainStart).toBe(0);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Full Pipeline
  // --------------------------------------------------------------------------

  describe('runPipeline', () => {
    it('returns success with valid data', () => {
      const marketData = generatePrices(300, 100, 0.0005, 0.01, 42);
      const factorReturns = generateFactorReturns(300, ['momentum', 'value', 'size'], 200);

      const result = pipeline.runPipeline(marketData, factorReturns);

      expect(result.status).toBe('success');
      expect(result.windowResults.length).toBeGreaterThan(0);
      expect(result.trainingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('returns failed for insufficient data', () => {
      const marketData = generatePrices(20, 100, 0.001, 0.01, 1);
      const factorReturns = generateFactorReturns(20, ['momentum'], 1);

      const result = pipeline.runPipeline(marketData, factorReturns);

      expect(result.status).toBe('failed');
      expect(result.windowResults.length).toBe(0);
      expect(result.aggregateMetrics.validationSamples).toBe(0);
    });

    it('produces aggregate metrics that are finite numbers', () => {
      const marketData = generatePrices(300, 100, 0.0005, 0.01, 42);
      const factorReturns = generateFactorReturns(300, ['momentum', 'value'], 300);

      const result = pipeline.runPipeline(marketData, factorReturns);
      const m = result.aggregateMetrics;

      expect(Number.isFinite(m.accuracy)).toBe(true);
      expect(Number.isFinite(m.sharpeImprovement)).toBe(true);
      expect(Number.isFinite(m.maxDrawdownReduction)).toBe(true);
      expect(Number.isFinite(m.momentumMAE)).toBe(true);
      expect(Number.isFinite(m.informationCoefficient)).toBe(true);
    });

    it('bestWindowIndex is within bounds', () => {
      const marketData = generatePrices(300, 100, 0.0003, 0.012, 55);
      const factorReturns = generateFactorReturns(300, ['momentum'], 55);

      const result = pipeline.runPipeline(marketData, factorReturns);

      expect(result.bestWindowIndex).toBeGreaterThanOrEqual(0);
      expect(result.bestWindowIndex).toBeLessThan(result.windowResults.length);
    });

    it('each window has valid regime labels', () => {
      const marketData = generatePrices(300, 100, 0.0005, 0.01, 77);
      const factorReturns = generateFactorReturns(300, ['momentum'], 77);

      const result = pipeline.runPipeline(marketData, factorReturns);
      const validRegimes = ['bull', 'bear', 'sideways', 'volatile'];

      for (const w of result.windowResults) {
        expect(validRegimes).toContain(w.trainRegime);
        expect(validRegimes).toContain(w.validationRegime);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Model Version
  // --------------------------------------------------------------------------

  describe('modelVersion', () => {
    it('generates a valid model version record', () => {
      const marketData = generatePrices(300, 100, 0.0005, 0.01, 42);
      const factorReturns = generateFactorReturns(300, ['momentum'], 42);

      const result = pipeline.runPipeline(marketData, factorReturns);
      const mv = result.modelVersion;

      expect(mv.id).toMatch(/^mv_/);
      expect(mv.modelType).toBe('regime_detector');
      expect(mv.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(mv.status).toBe('validated');
      expect(mv.dataPoints).toBe(300);
      expect(mv.trainedAt).toBeInstanceOf(Date);
      expect(mv.dataRange.start).toBeInstanceOf(Date);
      expect(mv.dataRange.end).toBeInstanceOf(Date);
      expect(mv.dataRange.start.getTime()).toBeLessThan(mv.dataRange.end.getTime());
    });

    it('assigns archived status for failed pipeline', () => {
      const marketData = generatePrices(20, 100, 0.001, 0.01, 1);
      const result = pipeline.runPipeline(marketData, {});
      expect(result.modelVersion.status).toBe('archived');
    });
  });

  // --------------------------------------------------------------------------
  // Supabase Persistence
  // --------------------------------------------------------------------------

  describe('toSupabaseRow', () => {
    it('converts model version to Supabase row format', () => {
      const marketData = generatePrices(300, 100, 0.0005, 0.01, 42);
      const factorReturns = generateFactorReturns(300, ['momentum'], 42);

      const result = pipeline.runPipeline(marketData, factorReturns);
      const row = pipeline.toSupabaseRow(result.modelVersion);

      expect(row.id).toBe(result.modelVersion.id);
      expect(row.model_type).toBe('regime_detector');
      expect(typeof row.version).toBe('string');
      expect(row.status).toBe('validated');
      expect(typeof row.config).toBe('object');
      expect(typeof row.metrics).toBe('object');
      expect(typeof row.parameters).toBe('object');
      expect(row.data_points).toBe(300);
      expect(typeof row.data_range_start).toBe('string');
      expect(typeof row.data_range_end).toBe('string');
      expect(typeof row.trained_at).toBe('string');
    });

    it('produces ISO date strings', () => {
      const marketData = generatePrices(300, 100, 0.0005, 0.01, 42);
      const factorReturns = generateFactorReturns(300, ['momentum'], 42);

      const result = pipeline.runPipeline(marketData, factorReturns);
      const row = pipeline.toSupabaseRow(result.modelVersion);

      // ISO 8601 format check
      expect(() => new Date(row.trained_at)).not.toThrow();
      expect(() => new Date(row.data_range_start)).not.toThrow();
      expect(() => new Date(row.data_range_end)).not.toThrow();
      expect(new Date(row.trained_at).toISOString()).toBe(row.trained_at);
    });
  });

  // --------------------------------------------------------------------------
  // Performance Metrics
  // --------------------------------------------------------------------------

  describe('performance metrics', () => {
    it('accuracy is between 0 and 1', () => {
      const marketData = generatePrices(300, 100, 0.0005, 0.01, 42);
      const factorReturns = generateFactorReturns(300, ['momentum', 'value'], 42);

      const result = pipeline.runPipeline(marketData, factorReturns);

      for (const w of result.windowResults) {
        expect(w.metrics.accuracy).toBeGreaterThanOrEqual(0);
        expect(w.metrics.accuracy).toBeLessThanOrEqual(1);
      }
    });

    it('maxDrawdownReduction can be positive or negative', () => {
      const marketData = generatePrices(300, 100, 0.0005, 0.01, 42);
      const factorReturns = generateFactorReturns(300, ['momentum'], 42);

      const result = pipeline.runPipeline(marketData, factorReturns);
      // Just verify the metric is a finite number — sign depends on strategy efficacy
      for (const w of result.windowResults) {
        expect(Number.isFinite(w.metrics.maxDrawdownReduction)).toBe(true);
      }
    });

    it('momentumMAE is non-negative', () => {
      const marketData = generatePrices(300, 100, 0.0005, 0.01, 42);
      const factorReturns = generateFactorReturns(300, ['momentum', 'value', 'size'], 42);

      const result = pipeline.runPipeline(marketData, factorReturns);

      for (const w of result.windowResults) {
        expect(w.metrics.momentumMAE).toBeGreaterThanOrEqual(0);
      }
    });

    it('informationCoefficient is between -1 and 1', () => {
      const marketData = generatePrices(300, 100, 0.0005, 0.01, 42);
      const factorReturns = generateFactorReturns(300, ['momentum', 'value', 'size'], 42);

      const result = pipeline.runPipeline(marketData, factorReturns);

      for (const w of result.windowResults) {
        expect(w.metrics.informationCoefficient).toBeGreaterThanOrEqual(-1);
        expect(w.metrics.informationCoefficient).toBeLessThanOrEqual(1);
      }
    });

    it('validation samples are positive for successful windows', () => {
      const marketData = generatePrices(300, 100, 0.0005, 0.01, 42);
      const factorReturns = generateFactorReturns(300, ['momentum'], 42);

      const result = pipeline.runPipeline(marketData, factorReturns);

      for (const w of result.windowResults) {
        expect(w.metrics.validationSamples).toBeGreaterThan(0);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('edge cases', () => {
    it('handles empty factor returns', () => {
      const marketData = generatePrices(300, 100, 0.0005, 0.01, 42);

      const result = pipeline.runPipeline(marketData, {});

      expect(result.status).toBe('success');
      expect(result.aggregateMetrics.momentumMAE).toBe(0);
    });

    it('handles single factor', () => {
      const marketData = generatePrices(300, 100, 0.0005, 0.01, 42);
      const factorReturns = generateFactorReturns(300, ['momentum'], 42);

      const result = pipeline.runPipeline(marketData, factorReturns);

      expect(result.status).toBe('success');
    });

    it('handles many factors', () => {
      const marketData = generatePrices(300, 100, 0.0005, 0.01, 42);
      const factors = ['momentum', 'value', 'size', 'quality', 'volatility', 'growth', 'profitability'];
      const factorReturns = generateFactorReturns(300, factors, 42);

      const result = pipeline.runPipeline(marketData, factorReturns);

      expect(result.status).toBe('success');
    });

    it('works with custom regime and factor model configs', () => {
      const customPipeline = new TrainingPipeline({
        numWindows: 2,
        minTrainSamples: 30,
        regimeConfig: { rollingWindow: 10, maxIterations: 5 },
        factorModelConfig: { windowSize: 10, minDataPoints: 30 },
      });

      const marketData = generatePrices(200, 100, 0.0005, 0.01, 42);
      const factorReturns = generateFactorReturns(200, ['momentum'], 42);

      const result = customPipeline.runPipeline(marketData, factorReturns);

      expect(result.status).toBe('success');
    });

    it('pipeline version increments on successive runs', () => {
      const marketData = generatePrices(300, 100, 0.0005, 0.01, 42);
      const factorReturns = generateFactorReturns(300, ['momentum'], 42);

      const result1 = pipeline.runPipeline(marketData, factorReturns);
      const result2 = pipeline.runPipeline(marketData, factorReturns);

      expect(result1.modelVersion.version).not.toBe(result2.modelVersion.version);
    });
  });
});
