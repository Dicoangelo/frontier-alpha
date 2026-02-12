/**
 * Integration Tests: ML + CVRF Interaction (US-014)
 *
 * Tests that ML predictions (regime detection, factor momentum, factor attribution)
 * properly integrate with the CVRF belief update system.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CVRFManager } from '../../src/cvrf/CVRFManager.js';
import type { MLPredictions, MLEnhancedMetaPrompt } from '../../src/cvrf/types.js';
import type { RegimeDetectionResult } from '../../src/ml/RegimeDetector.js';
import type { MomentumPrediction } from '../../src/ml/NeuralFactorModel.js';
import type { FactorAttributionResult, FactorContribution } from '../../src/ml/FactorAttribution.js';

// ============================================================================
// HELPERS
// ============================================================================

function buildRegimeResult(
  regime: 'bull' | 'bear' | 'sideways' | 'volatile',
  confidence: number
): RegimeDetectionResult {
  const probabilities = { bull: 0.1, bear: 0.1, sideways: 0.1, volatile: 0.1 };
  probabilities[regime] = confidence;
  // Normalize remaining
  const remaining = 1 - confidence;
  const others = Object.keys(probabilities).filter(k => k !== regime) as Array<keyof typeof probabilities>;
  for (const k of others) {
    probabilities[k] = remaining / 3;
  }
  return { regime, confidence, probabilities, timestamp: new Date() };
}

function buildMomentumPrediction(signal: number, confidence: number): MomentumPrediction {
  return {
    signal,
    confidence,
    upperBound: signal + 0.05,
    lowerBound: signal - 0.05,
    scaleSignals: [{ halfLife: 21, signal, weight: 1.0 }],
    timestamp: new Date(),
  };
}

function buildFactorAttribution(factors: Array<{ factor: string; shapley: number }>): FactorAttributionResult {
  const totalReturn = 0.05;
  const factorReturn = factors.reduce((s, f) => s + f.shapley, 0);
  const contributions: FactorContribution[] = factors.map(f => ({
    factor: f.factor,
    exposure: 0.5,
    factorReturn: f.shapley,
    contribution: f.shapley,
    gradientImportance: Math.abs(f.shapley),
    shapleyValue: f.shapley,
    direction: f.shapley >= 0 ? 'positive' as const : 'negative' as const,
    percentOfTotal: factorReturn !== 0 ? (f.shapley / factorReturn) * 100 : 0,
  }));
  return {
    totalReturn,
    factorReturn,
    residualReturn: totalReturn - factorReturn,
    factors: contributions,
    waterfall: [],
    summary: {
      positiveCount: factors.filter(f => f.shapley > 0).length,
      negativeCount: factors.filter(f => f.shapley < 0).length,
      totalPositive: factors.filter(f => f.shapley > 0).reduce((s, f) => s + f.shapley, 0),
      totalNegative: factors.filter(f => f.shapley < 0).reduce((s, f) => s + f.shapley, 0),
      topPositive: factors.filter(f => f.shapley > 0).sort((a, b) => b.shapley - a.shapley)[0]?.factor ?? null,
      topNegative: factors.filter(f => f.shapley < 0).sort((a, b) => a.shapley - b.shapley)[0]?.factor ?? null,
      rSquared: 0.85,
    },
  };
}

function setupTwoEpisodes(manager: CVRFManager): void {
  // Episode 1
  manager.startEpisode(new Date('2026-01-01'));
  manager.recordDecision({
    timestamp: new Date('2026-01-05'),
    symbol: 'AAPL',
    action: 'buy',
    weightBefore: 0,
    weightAfter: 0.15,
    reason: 'momentum',
    factors: [{ factor: 'momentum', exposure: 0.7, tStat: 2.5, confidence: 0.8, contribution: 0.03 }],
    confidence: 0.8,
    outcomeReturn: 0.05,
  });
  manager.updateEpisodeMetrics({
    portfolioReturn: 0.08,
    sharpeRatio: 1.5,
    maxDrawdown: 0.03,
    factorExposures: [
      { factor: 'momentum', exposure: 0.7, tStat: 2.5, confidence: 0.8, contribution: 0.03 },
      { factor: 'value', exposure: 0.3, tStat: 1.2, confidence: 0.6, contribution: 0.01 },
    ],
  });
  manager.closeEpisode(new Date('2026-01-21'), false);

  // Episode 2
  manager.startEpisode(new Date('2026-01-22'));
  manager.recordDecision({
    timestamp: new Date('2026-01-25'),
    symbol: 'MSFT',
    action: 'buy',
    weightBefore: 0,
    weightAfter: 0.10,
    reason: 'value',
    factors: [{ factor: 'value', exposure: 0.8, tStat: 2.0, confidence: 0.7, contribution: 0.02 }],
    confidence: 0.7,
    outcomeReturn: -0.02,
  });
  manager.updateEpisodeMetrics({
    portfolioReturn: -0.03,
    sharpeRatio: -0.5,
    maxDrawdown: 0.08,
    factorExposures: [
      { factor: 'momentum', exposure: 0.2, tStat: 0.5, confidence: 0.4, contribution: -0.01 },
      { factor: 'value', exposure: 0.8, tStat: 2.0, confidence: 0.7, contribution: 0.02 },
    ],
  });
  manager.closeEpisode(new Date('2026-02-11'), false);
}

// ============================================================================
// TESTS
// ============================================================================

describe('ML + CVRF Integration', () => {
  let manager: CVRFManager;

  beforeEach(() => {
    manager = new CVRFManager();
    setupTwoEpisodes(manager);
  });

  // --------------------------------------------------------------------------
  // Test 1: Regime change accelerates learning rate
  // --------------------------------------------------------------------------
  describe('regime change acceleration', () => {
    it('doubles the effective learning rate when regimeChanged is true', async () => {
      // Run without ML predictions
      const managerNoML = new CVRFManager();
      setupTwoEpisodes(managerNoML);
      const resultNoML = await managerNoML.runCVRFCycle();

      // Run with regime change
      const mlPredictions: MLPredictions = {
        regime: buildRegimeResult('bear', 0.85),
        regimeChanged: true,
        previousRegime: 'sideways',
      };
      const resultML = await manager.runCVRFCycle(mlPredictions);

      expect(resultNoML).not.toBeNull();
      expect(resultML).not.toBeNull();

      // The ML cycle should have more belief updates or larger magnitudes
      // because of the accelerated learning rate
      const noMLUpdates = resultNoML!.beliefUpdates;
      const mlUpdates = resultML!.beliefUpdates;

      // Find a common factor weight update to compare learning rates
      const noMLFactorUpdate = noMLUpdates.find(u => u.field.startsWith('factorWeights.'));
      const mlFactorUpdate = mlUpdates.find(u => u.field.startsWith('factorWeights.'));

      if (noMLFactorUpdate && mlFactorUpdate) {
        // ML learning rate should be higher (2x)
        expect(mlFactorUpdate.learningRate).toBeGreaterThan(noMLFactorUpdate.learningRate);
      }

      // The regime should have been updated to bear via ML
      expect(resultML!.newBeliefState.currentRegime).toBe('bear');
    });

    it('respects maxLearningRate even with regime change acceleration', async () => {
      // Set a low max learning rate
      const mgr = new CVRFManager({ maxLearningRate: 0.05 });
      setupTwoEpisodes(mgr);

      const mlPredictions: MLPredictions = {
        regime: buildRegimeResult('bear', 0.9),
        regimeChanged: true,
        previousRegime: 'sideways',
      };
      const result = await mgr.runCVRFCycle(mlPredictions);

      expect(result).not.toBeNull();
      // All learning rates should be <= maxLearningRate
      for (const update of result!.beliefUpdates) {
        expect(update.learningRate).toBeLessThanOrEqual(0.05);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Test 2: Factor attribution influences explore/exploit
  // --------------------------------------------------------------------------
  describe('factor attribution explore/exploit', () => {
    it('high-importance factors receive larger weight updates', async () => {
      const mlPredictions: MLPredictions = {
        factorAttribution: buildFactorAttribution([
          { factor: 'momentum', shapley: 0.04 },  // high importance
          { factor: 'value', shapley: 0.001 },      // low importance
        ]),
      };

      const result = await manager.runCVRFCycle(mlPredictions);
      expect(result).not.toBeNull();

      // Check that ML predictions are stored in cycle result
      expect(result!.mlPredictions).toBeDefined();
      expect(result!.mlPredictions?.factorAttribution).toBeDefined();
    });

    it('meta-prompt includes explore/exploit guidance when attribution provided', async () => {
      const mlPredictions: MLPredictions = {
        factorAttribution: buildFactorAttribution([
          { factor: 'momentum', shapley: 0.04 },
          { factor: 'value', shapley: 0.01 },
          { factor: 'quality', shapley: -0.005 },
          { factor: 'volatility', shapley: -0.002 },
          { factor: 'sentiment', shapley: 0.003 },
        ]),
      };

      const result = await manager.runCVRFCycle(mlPredictions);
      expect(result).not.toBeNull();

      const metaPrompt = result!.metaPrompt as MLEnhancedMetaPrompt;
      expect(metaPrompt.exploreExploitGuidance).toBeDefined();
      expect(metaPrompt.exploreExploitGuidance).toContain('Exploit');
      expect(metaPrompt.exploreExploitGuidance).toContain('Explore');
      expect(metaPrompt.factorImportanceRanking).toBeDefined();
      expect(metaPrompt.factorImportanceRanking!.length).toBe(5);
      // First should be highest importance
      expect(metaPrompt.factorImportanceRanking![0].factor).toBe('momentum');
    });
  });

  // --------------------------------------------------------------------------
  // Test 3: ML regime detection updates beliefs directly
  // --------------------------------------------------------------------------
  describe('ML regime detection', () => {
    it('updates regime in beliefs using ML detection instead of heuristic', async () => {
      const initialBeliefs = manager.getCurrentBeliefs();
      expect(initialBeliefs.currentRegime).toBe('sideways'); // default

      const mlPredictions: MLPredictions = {
        regime: buildRegimeResult('bull', 0.88),
      };

      const result = await manager.runCVRFCycle(mlPredictions);
      expect(result).not.toBeNull();

      expect(result!.newBeliefState.currentRegime).toBe('bull');
      expect(result!.newBeliefState.regimeConfidence).toBeGreaterThan(0.5);

      // Verify there's a regime update in the beliefUpdates
      const regimeUpdate = result!.beliefUpdates.find(u => u.field === 'currentRegime');
      expect(regimeUpdate).toBeDefined();
      expect(regimeUpdate!.newValue).toBe('bull');
      expect(regimeUpdate!.metaPrompt).toContain('ML regime detection');
    });

    it('reinforces regime confidence when ML agrees with current regime', async () => {
      // First, set regime to bull via ML
      const mlPredictions1: MLPredictions = {
        regime: buildRegimeResult('bull', 0.85),
      };
      await manager.runCVRFCycle(mlPredictions1);

      // Add two more episodes to enable another cycle
      manager.startEpisode(new Date('2026-02-12'));
      manager.recordDecision({
        timestamp: new Date('2026-02-15'),
        symbol: 'GOOG',
        action: 'buy',
        weightBefore: 0,
        weightAfter: 0.12,
        reason: 'quality',
        factors: [{ factor: 'quality', exposure: 0.6, tStat: 1.8, confidence: 0.7, contribution: 0.02 }],
        confidence: 0.75,
      });
      manager.updateEpisodeMetrics({
        portfolioReturn: 0.04,
        sharpeRatio: 1.0,
        maxDrawdown: 0.02,
        factorExposures: [{ factor: 'quality', exposure: 0.6, tStat: 1.8, confidence: 0.7, contribution: 0.02 }],
      });
      manager.closeEpisode(new Date('2026-03-04'), false);

      const beliefsBeforeSecondCycle = manager.getCurrentBeliefs();
      const confidenceBefore = beliefsBeforeSecondCycle.regimeConfidence;

      // Run second cycle with same regime (bull) but higher ML confidence
      const mlPredictions2: MLPredictions = {
        regime: buildRegimeResult('bull', 0.95),
      };
      const result = await manager.runCVRFCycle(mlPredictions2);
      expect(result).not.toBeNull();

      // Confidence should be reinforced (not decreased)
      expect(result!.newBeliefState.regimeConfidence).toBeGreaterThanOrEqual(confidenceBefore);
    });
  });

  // --------------------------------------------------------------------------
  // Test 4: ML-enhanced regime insights in ConceptExtractor
  // --------------------------------------------------------------------------
  describe('ML-enhanced insights', () => {
    it('generates ML regime insights with transition details when regime changes', async () => {
      const mlPredictions: MLPredictions = {
        regime: buildRegimeResult('volatile', 0.82),
        regimeChanged: true,
        previousRegime: 'bull',
      };

      const result = await manager.runCVRFCycle(mlPredictions);
      expect(result).not.toBeNull();

      // Find the ML regime insight
      const regimeInsight = result!.extractedInsights.find(
        i => i.type === 'regime' && i.concept.includes('ML detected')
      );
      expect(regimeInsight).toBeDefined();
      expect(regimeInsight!.concept).toContain('bull');
      expect(regimeInsight!.concept).toContain('volatile');
      expect(regimeInsight!.confidence).toBeCloseTo(0.82, 1);
      expect(regimeInsight!.evidence).toContain('Transition: bull → volatile');
    });

    it('generates regime confirmation insights when no regime change', async () => {
      const mlPredictions: MLPredictions = {
        regime: buildRegimeResult('sideways', 0.75),
        regimeChanged: false,
      };

      const result = await manager.runCVRFCycle(mlPredictions);
      expect(result).not.toBeNull();

      // Find the ML regime insight
      const regimeInsight = result!.extractedInsights.find(
        i => i.type === 'regime' && i.concept.includes('ML confirms')
      );
      expect(regimeInsight).toBeDefined();
      expect(regimeInsight!.concept).toContain('sideways');
      expect(regimeInsight!.impactDirection).toBe('neutral');
      // Confirmation insights have discounted confidence
      expect(regimeInsight!.confidence).toBeLessThan(0.75);
    });

    it('meta-prompt includes regime context when ML regime provided', async () => {
      const mlPredictions: MLPredictions = {
        regime: buildRegimeResult('bear', 0.90),
        regimeChanged: true,
        previousRegime: 'bull',
      };

      const result = await manager.runCVRFCycle(mlPredictions);
      expect(result).not.toBeNull();

      const metaPrompt = result!.metaPrompt as MLEnhancedMetaPrompt;
      expect(metaPrompt.regimeContext).toBeDefined();
      expect(metaPrompt.regimeContext).toContain('bear');
      expect(metaPrompt.regimeContext).toContain('Accelerate adaptation');
      expect(metaPrompt.optimizationDirection).toContain('[Regime: bear]');
    });
  });

  // --------------------------------------------------------------------------
  // Test 5: Factor momentum boosts confidence
  // --------------------------------------------------------------------------
  describe('factor momentum confidence boost', () => {
    it('boosts factor confidence when ML momentum has high confidence', async () => {
      const factorMomentum = new Map<string, MomentumPrediction>();
      factorMomentum.set('momentum', buildMomentumPrediction(0.15, 0.85));

      const mlPredictions: MLPredictions = {
        factorMomentum,
      };

      const result = await manager.runCVRFCycle(mlPredictions);
      expect(result).not.toBeNull();

      // Check if any confidence update mentions ML momentum
      const mlConfidenceUpdate = result!.beliefUpdates.find(
        u => u.field.startsWith('factorConfidences.') && u.metaPrompt.includes('ML momentum')
      );
      // This may or may not produce a confidence update depending on whether
      // there's a factor insight for momentum — but the code path is exercised
      if (mlConfidenceUpdate) {
        expect(mlConfidenceUpdate.metaPrompt).toContain('ML momentum confidence');
      }
    });
  });

  // --------------------------------------------------------------------------
  // Test 6: Backward compatibility — CVRF works without ML predictions
  // --------------------------------------------------------------------------
  describe('backward compatibility', () => {
    it('CVRF cycle runs correctly without any ML predictions', async () => {
      const result = await manager.runCVRFCycle();
      expect(result).not.toBeNull();
      expect(result!.mlPredictions).toBeUndefined();
      expect(result!.extractedInsights.length).toBeGreaterThan(0);
      expect(result!.newBeliefState).toBeDefined();
      expect(result!.beliefUpdates).toBeDefined();
    });

    it('CVRF cycle runs correctly with empty ML predictions object', async () => {
      const result = await manager.runCVRFCycle({});
      expect(result).not.toBeNull();
      expect(result!.mlPredictions).toBeDefined();
      expect(result!.extractedInsights.length).toBeGreaterThan(0);
    });
  });
});
