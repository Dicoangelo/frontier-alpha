/**
 * FRONTIER ALPHA - CVRF Integration
 *
 * This file demonstrates how to integrate CVRF with existing
 * frontier-alpha components:
 * - CognitiveExplainer: Enhanced with CVRF insights
 * - PortfolioOptimizer: Constrained by CVRF beliefs
 * - WalkForwardEngine: Triggers CVRF cycles at window boundaries
 * - RiskAlertSystem: Integrated with dual-level risk control
 */

import { CVRFManager, cvrfManager } from './CVRFManager.js';
import type { CVRFCycleResult, BeliefState, TradingDecision } from './types.js';
import type {
  OptimizationConfig,
  OptimizationResult,
  FactorExposure,
  CognitiveExplanation,
} from '../types/index.js';
import { logger } from '../lib/logger.js';

// ============================================================================
// CVRF-ENHANCED COGNITIVE EXPLAINER
// ============================================================================

/**
 * Enhance CognitiveExplainer explanations with CVRF insights
 */
export function enhanceExplanationWithCVRF(
  baseExplanation: CognitiveExplanation,
  cvrfManager: CVRFManager
): CognitiveExplanation & { cvrfContext: string } {
  const beliefs = cvrfManager.getCurrentBeliefs();
  const lastCycle = cvrfManager.getCycleHistory().slice(-1)[0];

  let cvrfContext = '';

  if (lastCycle) {
    // Add CVRF context to explanation
    const relevantInsights = lastCycle.extractedInsights.filter(
      i => i.concept.toLowerCase().includes(baseExplanation.symbol.toLowerCase())
    );

    if (relevantInsights.length > 0) {
      cvrfContext = `\n\n**CVRF Context:**\n${relevantInsights.map(i => `- ${i.concept}`).join('\n')}`;
    }

    // Add regime context
    cvrfContext += `\n\n**Regime:** ${beliefs.currentRegime} (${(beliefs.regimeConfidence * 100).toFixed(0)}% confidence)`;

    // Add factor guidance
    const topFactors = Array.from(beliefs.factorWeights.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    cvrfContext += `\n\n**Current Factor Focus:** ${topFactors.map(([f, w]) => `${f} (${(w * 100).toFixed(0)}%)`).join(', ')}`;
  }

  return {
    ...baseExplanation,
    narrative: baseExplanation.narrative + cvrfContext,
    cvrfContext,
  };
}

// ============================================================================
// CVRF-CONSTRAINED PORTFOLIO OPTIMIZER
// ============================================================================

/**
 * Get CVRF-constrained optimization config
 */
export function getCVRFOptimizationConfig(
  baseConfig: OptimizationConfig,
  cvrfManager: CVRFManager
): OptimizationConfig & { cvrfConstraints: ReturnType<CVRFManager['getOptimizationConstraints']> } {
  const cvrfConstraints = cvrfManager.getOptimizationConstraints();

  // Adjust base config based on CVRF beliefs
  return {
    ...baseConfig,
    // Override target volatility if CVRF suggests different
    targetVolatility: cvrfConstraints.volatilityTarget,
    // Add CVRF constraints for reference
    cvrfConstraints,
  };
}

/**
 * Post-process optimization result with CVRF validation
 */
export function validateOptimizationWithCVRF(
  result: OptimizationResult,
  cvrfManager: CVRFManager
): {
  isValid: boolean;
  warnings: string[];
  adjustedWeights?: Map<string, number>;
} {
  const constraints = cvrfManager.getOptimizationConstraints();
  const beliefs = cvrfManager.getCurrentBeliefs();
  const warnings: string[] = [];
  let adjustedWeights: Map<string, number> | undefined;

  // Check concentration limits
  for (const [symbol, weight] of result.weights) {
    if (weight > constraints.maxWeight) {
      warnings.push(`${symbol} weight (${(weight * 100).toFixed(1)}%) exceeds CVRF limit (${(constraints.maxWeight * 100).toFixed(1)}%)`);

      // Create adjusted weights
      if (!adjustedWeights) {
        adjustedWeights = new Map(result.weights);
      }
      adjustedWeights.set(symbol, constraints.maxWeight);
    }
  }

  // Check factor alignment
  for (const exposure of result.factorExposures) {
    const target = constraints.factorTargets.get(exposure.factor);
    if (target) {
      const deviation = Math.abs(exposure.exposure - target.target);
      if (deviation > target.tolerance) {
        warnings.push(`${exposure.factor} exposure (${exposure.exposure.toFixed(2)}) deviates from CVRF target (${target.target.toFixed(2)} ± ${target.tolerance.toFixed(2)})`);
      }
    }
  }

  // Check volatility
  if (result.expectedVolatility > constraints.volatilityTarget * 1.2) {
    warnings.push(`Expected volatility (${(result.expectedVolatility * 100).toFixed(1)}%) exceeds CVRF target (${(constraints.volatilityTarget * 100).toFixed(1)}%)`);
  }

  // Normalize adjusted weights if needed
  if (adjustedWeights) {
    const total = Array.from(adjustedWeights.values()).reduce((a, b) => a + b, 0);
    for (const [symbol, weight] of adjustedWeights) {
      adjustedWeights.set(symbol, weight / total);
    }
  }

  return {
    isValid: warnings.length === 0,
    warnings,
    adjustedWeights,
  };
}

// ============================================================================
// WALK-FORWARD ENGINE INTEGRATION
// ============================================================================

/**
 * Hook for WalkForwardEngine to trigger CVRF at window boundaries
 */
export async function onWalkForwardWindowComplete(
  windowId: number,
  inSampleReturn: number,
  outOfSampleReturn: number,
  factorExposures: FactorExposure[],
  decisions: Array<Omit<TradingDecision, 'id'>>,
  cvrfManager: CVRFManager
): Promise<CVRFCycleResult | null> {
  // Record decisions to current episode
  for (const decision of decisions) {
    cvrfManager.recordDecision(decision);
  }

  // Update episode metrics
  cvrfManager.updateEpisodeMetrics({
    portfolioReturn: outOfSampleReturn,
    sharpeRatio: inSampleReturn / Math.max(0.01, Math.abs(outOfSampleReturn - inSampleReturn)),
    maxDrawdown: Math.abs(Math.min(0, outOfSampleReturn)),
    factorExposures,
  });

  // Close episode and trigger CVRF cycle
  const { cvrfResult } = await cvrfManager.closeEpisode(undefined, true);

  // Start new episode for next window
  cvrfManager.startEpisode();

  return cvrfResult;
}

// ============================================================================
// RISK ALERT SYSTEM INTEGRATION
// ============================================================================

/**
 * Enhance risk alert with CVRF dual-level control
 */
export function getCVRFRiskAssessment(
  portfolioValue: number,
  portfolioReturns: number[],
  positions: Array<{ symbol: string; weight: number }>,
  cvrfManager: CVRFManager
): {
  withinEpisode: ReturnType<CVRFManager['checkWithinEpisodeRisk']>;
  overEpisode: ReturnType<CVRFManager['getOverEpisodeAdjustment']>;
  combinedRecommendation: string;
} {
  const withinEpisode = cvrfManager.checkWithinEpisodeRisk(
    portfolioValue,
    portfolioReturns,
    positions
  );

  const overEpisode = cvrfManager.getOverEpisodeAdjustment();

  // Generate combined recommendation
  let recommendation = '';

  if (withinEpisode.triggered) {
    recommendation += `⚠️ **Immediate Action Required:** ${withinEpisode.adjustment.type.replace('_', ' ')} by ${(withinEpisode.adjustment.magnitude * 100).toFixed(0)}%`;
    if (withinEpisode.adjustment.targets.length > 0) {
      recommendation += ` on ${withinEpisode.adjustment.targets.join(', ')}`;
    }
    recommendation += '\n\n';
  }

  if (overEpisode.conceptualInsights.length > 0) {
    recommendation += `📊 **Strategic Guidance (from CVRF):**\n`;
    recommendation += overEpisode.metaPrompt.optimizationDirection + '\n\n';

    if (overEpisode.metaPrompt.keyLearnings.length > 0) {
      recommendation += `**Key Learnings:**\n`;
      recommendation += overEpisode.metaPrompt.keyLearnings.map(l => `- ${l}`).join('\n');
    }
  }

  if (!recommendation) {
    recommendation = '✅ No immediate adjustments needed. Portfolio aligned with CVRF beliefs.';
  }

  return {
    withinEpisode,
    overEpisode,
    combinedRecommendation: recommendation,
  };
}

// ============================================================================
// FULL INTEGRATION EXAMPLE
// ============================================================================

/**
 * Example: Full CVRF-enhanced trading loop
 */
export async function runCVRFEnhancedTradingLoop(
  cvrfManager: CVRFManager,
  tradingDays: number = 21
): Promise<{
  episodeReturn: number;
  decisions: TradingDecision[];
  cvrfResult: CVRFCycleResult | null;
}> {
  // Start new episode
  const episode = cvrfManager.startEpisode();
  const decisions: TradingDecision[] = [];
  let cumulativeReturn = 1;

  logger.info({ episodeId: episode.id }, 'Starting CVRF-enhanced trading episode');
  logger.info({ regime: cvrfManager.getCurrentBeliefs().currentRegime }, 'Current beliefs');

  // Simulate trading days
  for (let day = 0; day < tradingDays; day++) {
    // Get CVRF-informed constraints
    const constraints = cvrfManager.getOptimizationConstraints();

    // Simulate a trading decision (in real use, this comes from optimizer)
    const decision = cvrfManager.recordDecision({
      timestamp: new Date(),
      symbol: ['AAPL', 'NVDA', 'MSFT', 'GOOGL'][day % 4],
      action: day % 3 === 0 ? 'buy' : day % 3 === 1 ? 'hold' : 'rebalance',
      weightBefore: 0.25,
      weightAfter: 0.25 + (Math.random() - 0.5) * 0.05,
      reason: `CVRF regime: ${cvrfManager.getCurrentBeliefs().currentRegime}`,
      factors: [
        { factor: 'momentum', exposure: 0.3 + Math.random() * 0.2, tStat: 2.1, confidence: 0.8, contribution: 0.05 },
        { factor: 'value', exposure: 0.1 + Math.random() * 0.1, tStat: 1.5, confidence: 0.7, contribution: 0.02 },
      ],
      confidence: 0.6 + Math.random() * 0.3,
    });

    decisions.push(decision);

    // Simulate daily return
    const dailyReturn = (Math.random() - 0.48) * 0.02; // Slight positive bias
    cumulativeReturn *= (1 + dailyReturn);

    // Check within-episode risk every 5 days
    if (day % 5 === 4) {
      const riskCheck = cvrfManager.checkWithinEpisodeRisk(
        cumulativeReturn * 100000,
        decisions.map(() => (Math.random() - 0.48) * 0.02),
        [{ symbol: 'AAPL', weight: 0.25 }, { symbol: 'NVDA', weight: 0.25 }]
      );

      if (riskCheck.triggered) {
        logger.warn({ day: day + 1, adjustmentType: riskCheck.adjustment.type }, 'Risk control triggered');
      }
    }
  }

  // Update episode metrics
  const episodeReturn = cumulativeReturn - 1;
  cvrfManager.updateEpisodeMetrics({
    portfolioReturn: episodeReturn,
    sharpeRatio: episodeReturn / 0.15, // Simplified Sharpe
    maxDrawdown: Math.max(0, -episodeReturn * 0.5),
    factorExposures: [
      { factor: 'momentum', exposure: 0.35, tStat: 2.3, confidence: 0.8, contribution: 0.06 },
      { factor: 'value', exposure: 0.15, tStat: 1.8, confidence: 0.75, contribution: 0.03 },
      { factor: 'volatility', exposure: -0.1, tStat: -1.2, confidence: 0.6, contribution: -0.01 },
    ],
  });

  // Close episode and run CVRF cycle
  const { cvrfResult } = await cvrfManager.closeEpisode();

  if (cvrfResult) {
    logger.info({ performanceDelta: (cvrfResult.episodeComparison.performanceDelta * 100).toFixed(2), insightsExtracted: cvrfResult.extractedInsights.length, beliefUpdates: cvrfResult.beliefUpdates.length, newRegime: cvrfResult.newBeliefState.currentRegime }, 'CVRF cycle complete');
  }

  return {
    episodeReturn,
    decisions,
    cvrfResult,
  };
}

