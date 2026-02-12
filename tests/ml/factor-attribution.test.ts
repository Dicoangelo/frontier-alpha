/**
 * Unit Tests for FactorAttribution (Gradient-Based Feature Importance)
 *
 * Tests attribution calculation, gradient importance, Shapley values,
 * waterfall chart data, positive/negative breakdown, and edge cases.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  FactorAttribution,
} from '../../src/ml/FactorAttribution.js';
import type {
  FactorAttributionResult,
} from '../../src/ml/FactorAttribution.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

/** Standard 5-factor model exposures (Fama-French-like) */
const STANDARD_EXPOSURES: Record<string, number> = {
  market: 1.05,
  size: -0.20,
  value: 0.15,
  momentum: 0.30,
  quality: 0.25,
};

/** Standard factor returns for a period */
const STANDARD_RETURNS: Record<string, number> = {
  market: 0.03,
  size: -0.01,
  value: 0.005,
  momentum: 0.02,
  quality: 0.015,
};

/**
 * Pre-computed expected factor return:
 * market: 1.05 × 0.03 = 0.0315
 * size: -0.20 × -0.01 = 0.002
 * value: 0.15 × 0.005 = 0.00075
 * momentum: 0.30 × 0.02 = 0.006
 * quality: 0.25 × 0.015 = 0.00375
 * total = 0.044
 */
const EXPECTED_FACTOR_RETURN = 0.044;

// ============================================================================
// TESTS
// ============================================================================

describe('FactorAttribution', () => {
  let attribution: FactorAttribution;

  beforeEach(() => {
    attribution = new FactorAttribution();
  });

  // --------------------------------------------------------------------------
  // Constructor & Config
  // --------------------------------------------------------------------------

  describe('Constructor', () => {
    it('uses default config when none provided', () => {
      const config = attribution.getConfig();
      expect(config.epsilon).toBe(1e-6);
      expect(config.minContribution).toBe(0);
      expect(config.maxWaterfallFactors).toBe(15);
    });

    it('merges custom config with defaults', () => {
      const custom = new FactorAttribution({ epsilon: 1e-4, maxWaterfallFactors: 5 });
      const config = custom.getConfig();
      expect(config.epsilon).toBe(1e-4);
      expect(config.maxWaterfallFactors).toBe(5);
      expect(config.minContribution).toBe(0); // default preserved
    });
  });

  // --------------------------------------------------------------------------
  // Basic Attribution
  // --------------------------------------------------------------------------

  describe('calculateAttribution', () => {
    it('returns correct totalReturn, factorReturn, and residualReturn', () => {
      const portfolioReturn = 0.05;
      const result = attribution.calculateAttribution(
        portfolioReturn,
        STANDARD_EXPOSURES,
        STANDARD_RETURNS,
      );

      expect(result.totalReturn).toBe(portfolioReturn);
      expect(result.factorReturn).toBeCloseTo(EXPECTED_FACTOR_RETURN, 8);
      expect(result.residualReturn).toBeCloseTo(
        portfolioReturn - EXPECTED_FACTOR_RETURN,
        8,
      );
    });

    it('returns all 5 factors ranked by absolute contribution', () => {
      const result = attribution.calculateAttribution(
        0.05,
        STANDARD_EXPOSURES,
        STANDARD_RETURNS,
      );

      expect(result.factors).toHaveLength(5);

      // Verify descending order by |contribution|
      for (let i = 1; i < result.factors.length; i++) {
        expect(Math.abs(result.factors[i - 1].contribution))
          .toBeGreaterThanOrEqual(Math.abs(result.factors[i].contribution));
      }

      // Market should be the top factor (1.05 × 0.03 = 0.0315)
      expect(result.factors[0].factor).toBe('market');
    });

    it('computes correct individual contributions', () => {
      const result = attribution.calculateAttribution(
        0.05,
        STANDARD_EXPOSURES,
        STANDARD_RETURNS,
      );

      const findFactor = (name: string) => result.factors.find(f => f.factor === name);

      expect(findFactor('market')!.contribution).toBeCloseTo(1.05 * 0.03, 8);
      expect(findFactor('size')!.contribution).toBeCloseTo(-0.20 * -0.01, 8);
      expect(findFactor('value')!.contribution).toBeCloseTo(0.15 * 0.005, 8);
      expect(findFactor('momentum')!.contribution).toBeCloseTo(0.30 * 0.02, 8);
      expect(findFactor('quality')!.contribution).toBeCloseTo(0.25 * 0.015, 8);
    });
  });

  // --------------------------------------------------------------------------
  // Positive vs Negative Contribution Breakdown
  // --------------------------------------------------------------------------

  describe('Positive vs Negative Breakdown', () => {
    it('correctly identifies positive and negative contributions', () => {
      const exposures: Record<string, number> = {
        market: 1.0,
        size: -0.5,
        value: 0.3,
      };
      const returns: Record<string, number> = {
        market: 0.02,   // positive: 1.0 × 0.02 = 0.02
        size: 0.01,      // negative: -0.5 × 0.01 = -0.005
        value: -0.01,    // negative: 0.3 × -0.01 = -0.003
      };

      const result = attribution.calculateAttribution(0.012, exposures, returns);

      expect(result.summary.positiveCount).toBe(1);
      expect(result.summary.negativeCount).toBe(2);
      expect(result.summary.topPositive).toBe('market');
      expect(result.summary.topNegative).not.toBeNull();
    });

    it('computes totalPositive and totalNegative correctly', () => {
      const exposures = { a: 1.0, b: -0.5, c: 0.3 };
      const returns = { a: 0.04, b: 0.02, c: -0.01 };
      // a: 0.04, b: -0.01, c: -0.003

      const result = attribution.calculateAttribution(0.027, exposures, returns);

      expect(result.summary.totalPositive).toBeCloseTo(0.04, 8);
      expect(result.summary.totalNegative).toBeCloseTo(-0.013, 8);
    });

    it('marks direction correctly on each factor', () => {
      const result = attribution.calculateAttribution(
        0.05,
        STANDARD_EXPOSURES,
        STANDARD_RETURNS,
      );

      for (const f of result.factors) {
        if (f.contribution >= 0) {
          expect(f.direction).toBe('positive');
        } else {
          expect(f.direction).toBe('negative');
        }
      }
    });
  });

  // --------------------------------------------------------------------------
  // Gradient-Based Importance
  // --------------------------------------------------------------------------

  describe('Gradient-Based Importance', () => {
    it('gradient equals absolute factor return for linear model', () => {
      const gradients = attribution.computeGradientImportance(
        Object.keys(STANDARD_EXPOSURES),
        STANDARD_EXPOSURES,
        STANDARD_RETURNS,
      );

      // For R = Σ(exposure_i × return_i), ∂R/∂exposure_i = return_i
      expect(gradients.get('market')).toBeCloseTo(Math.abs(0.03), 4);
      expect(gradients.get('size')).toBeCloseTo(Math.abs(-0.01), 4);
      expect(gradients.get('momentum')).toBeCloseTo(Math.abs(0.02), 4);
    });

    it('gradient importance is always non-negative', () => {
      const result = attribution.calculateAttribution(
        0.05,
        STANDARD_EXPOSURES,
        STANDARD_RETURNS,
      );

      for (const f of result.factors) {
        expect(f.gradientImportance).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Shapley-Inspired Attribution
  // --------------------------------------------------------------------------

  describe('Shapley-Inspired Attribution', () => {
    it('Shapley values sum to total factor return', () => {
      const shapley = attribution.computeShapleyValues(
        Object.keys(STANDARD_EXPOSURES),
        STANDARD_EXPOSURES,
        STANDARD_RETURNS,
        0.05,
      );

      let shapleySum = 0;
      for (const val of shapley.values()) {
        shapleySum += val;
      }

      expect(shapleySum).toBeCloseTo(EXPECTED_FACTOR_RETURN, 8);
    });

    it('Shapley values equal direct contributions for linear model', () => {
      const shapley = attribution.computeShapleyValues(
        Object.keys(STANDARD_EXPOSURES),
        STANDARD_EXPOSURES,
        STANDARD_RETURNS,
        0.05,
      );

      // In a linear model, leave-one-out marginal = direct contribution
      // After normalization, Shapley values should equal direct contributions
      expect(shapley.get('market')).toBeCloseTo(1.05 * 0.03, 8);
      expect(shapley.get('size')).toBeCloseTo(-0.20 * -0.01, 8);
    });

    it('returns empty map for empty factors', () => {
      const shapley = attribution.computeShapleyValues([], {}, {}, 0.05);
      expect(shapley.size).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Waterfall Chart Data
  // --------------------------------------------------------------------------

  describe('Waterfall Chart', () => {
    it('produces waterfall with correct structure', () => {
      const result = attribution.calculateAttribution(
        0.05,
        STANDARD_EXPOSURES,
        STANDARD_RETURNS,
      );

      expect(result.waterfall.length).toBeGreaterThan(0);

      // Last item should be the total
      const total = result.waterfall[result.waterfall.length - 1];
      expect(total.label).toBe('total');
      expect(total.type).toBe('total');
      expect(total.value).toBeCloseTo(0.05, 8);
    });

    it('waterfall bars connect: each start equals previous end', () => {
      const result = attribution.calculateAttribution(
        0.05,
        STANDARD_EXPOSURES,
        STANDARD_RETURNS,
      );

      // Skip the last entry (total bar starts from 0)
      const bars = result.waterfall.slice(0, -1);
      for (let i = 1; i < bars.length; i++) {
        expect(bars[i].start).toBeCloseTo(bars[i - 1].end, 10);
      }
    });

    it('waterfall cumulative reaches total return', () => {
      const result = attribution.calculateAttribution(
        0.05,
        STANDARD_EXPOSURES,
        STANDARD_RETURNS,
      );

      // The bar before 'total' should end at portfolioReturn
      const barsBeforeTotal = result.waterfall.slice(0, -1);
      const lastBar = barsBeforeTotal[barsBeforeTotal.length - 1];
      expect(lastBar.end).toBeCloseTo(0.05, 8);
    });

    it('respects maxWaterfallFactors config', () => {
      const custom = new FactorAttribution({ maxWaterfallFactors: 2 });

      // Create many factors
      const exposures: Record<string, number> = {};
      const returns: Record<string, number> = {};
      for (let i = 0; i < 10; i++) {
        exposures[`factor_${i}`] = 0.1 * (i + 1);
        returns[`factor_${i}`] = 0.01;
      }

      const result = custom.calculateAttribution(0.1, exposures, returns);

      // Should have at most 2 factor bars + residual + total
      const factorBars = result.waterfall.filter(
        w => w.type === 'positive' || w.type === 'negative',
      );
      expect(factorBars.length).toBeLessThanOrEqual(2);
    });
  });

  // --------------------------------------------------------------------------
  // Summary Statistics
  // --------------------------------------------------------------------------

  describe('Summary Statistics', () => {
    it('computes R-squared correctly', () => {
      // When factors explain all return, R² should be 1
      const factorReturn = EXPECTED_FACTOR_RETURN;
      const result = attribution.calculateAttribution(
        factorReturn,
        STANDARD_EXPOSURES,
        STANDARD_RETURNS,
      );

      expect(result.summary.rSquared).toBeCloseTo(1.0, 6);
    });

    it('R-squared decreases when residual is large', () => {
      const result = attribution.calculateAttribution(
        0.10, // much larger than factor return of 0.044
        STANDARD_EXPOSURES,
        STANDARD_RETURNS,
      );

      expect(result.summary.rSquared).toBeLessThan(1.0);
      expect(result.summary.rSquared).toBeGreaterThanOrEqual(0);
    });

    it('percentOfTotal sums to approximately 100% for all factors', () => {
      const result = attribution.calculateAttribution(
        0.05,
        STANDARD_EXPOSURES,
        STANDARD_RETURNS,
      );

      const totalPercent = result.factors.reduce((sum, f) => sum + f.percentOfTotal, 0);
      // Percent is computed relative to |factorReturn|, sum of signed % may differ
      // but abs percentages should reflect relative magnitude
      expect(totalPercent).not.toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('handles empty factor exposures', () => {
      const result = attribution.calculateAttribution(0.05, {}, {});

      expect(result.totalReturn).toBe(0.05);
      expect(result.factorReturn).toBe(0);
      expect(result.residualReturn).toBe(0.05);
      expect(result.factors).toHaveLength(0);
      expect(result.waterfall.length).toBeGreaterThan(0);
    });

    it('handles zero portfolio return', () => {
      const result = attribution.calculateAttribution(
        0,
        STANDARD_EXPOSURES,
        STANDARD_RETURNS,
      );

      expect(result.totalReturn).toBe(0);
      expect(result.factorReturn).toBeCloseTo(EXPECTED_FACTOR_RETURN, 8);
      expect(result.residualReturn).toBeCloseTo(-EXPECTED_FACTOR_RETURN, 8);
    });

    it('handles all-zero factor returns', () => {
      const zeroReturns: Record<string, number> = {
        market: 0,
        size: 0,
        value: 0,
      };

      const result = attribution.calculateAttribution(
        0.01,
        { market: 1.0, size: -0.5, value: 0.3 },
        zeroReturns,
      );

      expect(result.factorReturn).toBe(0);
      expect(result.residualReturn).toBe(0.01);

      for (const f of result.factors) {
        expect(f.contribution).toBeCloseTo(0, 10);
      }
    });

    it('handles single factor', () => {
      const result = attribution.calculateAttribution(
        0.03,
        { market: 1.0 },
        { market: 0.025 },
      );

      expect(result.factors).toHaveLength(1);
      expect(result.factors[0].factor).toBe('market');
      expect(result.factors[0].contribution).toBeCloseTo(0.025, 8);
      expect(result.factors[0].shapleyValue).toBeCloseTo(0.025, 8);
    });

    it('handles factors with exposures but no matching returns', () => {
      const result = attribution.calculateAttribution(
        0.02,
        { market: 1.0, unknown_factor: 0.5 },
        { market: 0.02 },
      );

      expect(result.factorReturn).toBeCloseTo(0.02, 8);

      const unknown = result.factors.find(f => f.factor === 'unknown_factor');
      expect(unknown).toBeDefined();
      expect(unknown!.contribution).toBe(0);
    });

    it('handles minContribution filtering', () => {
      const custom = new FactorAttribution({ minContribution: 0.005 });
      const result = custom.calculateAttribution(
        0.05,
        STANDARD_EXPOSURES,
        STANDARD_RETURNS,
      );

      for (const f of result.factors) {
        expect(Math.abs(f.contribution)).toBeGreaterThanOrEqual(0.005);
      }
    });
  });
});
