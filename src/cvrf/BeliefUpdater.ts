/**
 * FRONTIER ALPHA - CVRF Belief Updater
 *
 * Implements textual gradient descent for belief optimization.
 * Updates investment beliefs based on conceptual insights using
 * the learning rate τ (decision overlap).
 *
 * Core equation: θ ← Mᵣ(θ, τ, meta_prompt)
 */

import type {
  BeliefState,
  BeliefUpdate,
  ConceptualInsight,
  MetaPrompt,
  EpisodeComparison,
  CVRFConfig,
} from './types.js';
import { DEFAULT_CVRF_CONFIG } from './types.js';

// ============================================================================
// BELIEF UPDATER
// ============================================================================

export class BeliefUpdater {
  private config: CVRFConfig;
  private currentBeliefs: BeliefState;
  private beliefHistory: BeliefState[] = [];
  private updateHistory: BeliefUpdate[] = [];

  constructor(config: Partial<CVRFConfig> = {}, initialBeliefs?: Partial<BeliefState>) {
    this.config = { ...DEFAULT_CVRF_CONFIG, ...config };
    this.currentBeliefs = this.initializeBeliefs(initialBeliefs);
  }

  // ============================================================================
  // BELIEF INITIALIZATION
  // ============================================================================

  private initializeBeliefs(initial?: Partial<BeliefState>): BeliefState {
    return {
      id: `beliefs_${Date.now()}`,
      version: 1,
      updatedAt: new Date(),

      // Factor beliefs (start with equal weights)
      factorWeights: new Map([
        ['momentum', 0.2],
        ['value', 0.2],
        ['quality', 0.2],
        ['volatility', 0.2],
        ['sentiment', 0.2],
      ]),
      factorConfidences: new Map([
        ['momentum', 0.5],
        ['value', 0.5],
        ['quality', 0.5],
        ['volatility', 0.5],
        ['sentiment', 0.5],
      ]),

      // Risk beliefs
      riskTolerance: 0.15, // 15% max drawdown tolerance
      maxDrawdownThreshold: 0.10,
      volatilityTarget: 0.15, // 15% annualized

      // Timing beliefs
      momentumHorizon: 21, // 21 days
      meanReversionThreshold: 2.0, // 2 sigma

      // Allocation beliefs
      concentrationLimit: 0.20, // 20% max single position
      minPositionSize: 0.02, // 2% min position
      rebalanceThreshold: 0.05, // 5% drift triggers rebalance

      // Regime beliefs
      currentRegime: 'sideways',
      regimeConfidence: 0.5,

      // Conceptual priors (empty initially)
      conceptualPriors: [],

      ...initial,
    };
  }

  // ============================================================================
  // MAIN UPDATE METHOD (Textual Gradient Descent)
  // ============================================================================

  /**
   * Apply textual gradient descent to update beliefs
   *
   * θ ← Mᵣ(θ, τ, meta_prompt)
   *
   * @param comparison Episode comparison result
   * @param insights Extracted conceptual insights
   * @param metaPrompt Generated meta-prompt (optimization direction)
   * @returns Updated belief state and list of updates
   */
  updateBeliefs(
    comparison: EpisodeComparison,
    insights: ConceptualInsight[],
    metaPrompt: MetaPrompt
  ): { newBeliefs: BeliefState; updates: BeliefUpdate[] } {
    const updates: BeliefUpdate[] = [];

    // Calculate effective learning rate from decision overlap
    const tau = this.calculateLearningRate(comparison.decisionOverlap);

    // Save current state for history
    this.beliefHistory.push({ ...this.currentBeliefs });

    // Update factor weights based on insights
    updates.push(...this.updateFactorWeights(insights, metaPrompt, tau));

    // Update factor confidences
    updates.push(...this.updateFactorConfidences(insights, tau));

    // Update risk beliefs
    updates.push(...this.updateRiskBeliefs(comparison, insights, tau));

    // Update timing beliefs
    updates.push(...this.updateTimingBeliefs(insights, tau));

    // Update allocation beliefs
    updates.push(...this.updateAllocationBeliefs(insights, tau));

    // Update regime beliefs
    updates.push(...this.updateRegimeBeliefs(insights, tau));

    // Store conceptual priors
    this.updateConceptualPriors(insights);

    // Increment version
    this.currentBeliefs.version++;
    this.currentBeliefs.updatedAt = new Date();
    this.currentBeliefs.id = `beliefs_v${this.currentBeliefs.version}_${Date.now()}`;

    // Store update history
    this.updateHistory.push(...updates);

    return {
      newBeliefs: { ...this.currentBeliefs },
      updates,
    };
  }

  // ============================================================================
  // LEARNING RATE CALCULATION
  // ============================================================================

  /**
   * Calculate effective learning rate from decision overlap
   *
   * High overlap → Low learning rate (beliefs already aligned)
   * Low overlap → High learning rate (need to adapt)
   */
  private calculateLearningRate(decisionOverlap: number): number {
    // Inverse relationship: less overlap = more to learn
    const rawRate = this.config.baseLearningRate * (1 - decisionOverlap);

    // Clamp to bounds
    return Math.max(
      this.config.minLearningRate,
      Math.min(this.config.maxLearningRate, rawRate)
    );
  }

  // ============================================================================
  // FACTOR WEIGHT UPDATES
  // ============================================================================

  private updateFactorWeights(
    insights: ConceptualInsight[],
    metaPrompt: MetaPrompt,
    tau: number
  ): BeliefUpdate[] {
    const updates: BeliefUpdate[] = [];

    // Apply factor adjustments from meta-prompt
    for (const [factor, adjustment] of metaPrompt.factorAdjustments) {
      const currentWeight = this.currentBeliefs.factorWeights.get(factor);
      if (currentWeight === undefined) continue;

      // Scale adjustment by learning rate
      const scaledAdjustment = adjustment * tau;

      // Clamp change to max allowed
      const clampedAdjustment = Math.sign(scaledAdjustment) * Math.min(
        Math.abs(scaledAdjustment),
        this.config.maxBeliefChangePerUpdate
      );

      const newWeight = Math.max(0.05, Math.min(0.5, currentWeight + clampedAdjustment));

      if (newWeight !== currentWeight) {
        this.currentBeliefs.factorWeights.set(factor, newWeight);

        updates.push({
          field: `factorWeights.${factor}`,
          oldValue: currentWeight,
          newValue: newWeight,
          learningRate: tau,
          metaPrompt: `Factor adjustment for ${factor}: ${adjustment > 0 ? 'increase' : 'decrease'} based on episode comparison`,
          timestamp: new Date(),
        });
      }
    }

    // Normalize factor weights to sum to 1
    this.normalizeFactorWeights();

    return updates;
  }

  private normalizeFactorWeights(): void {
    const total = Array.from(this.currentBeliefs.factorWeights.values()).reduce((a, b) => a + b, 0);
    if (total > 0) {
      for (const [factor, weight] of this.currentBeliefs.factorWeights) {
        this.currentBeliefs.factorWeights.set(factor, weight / total);
      }
    }
  }

  // ============================================================================
  // FACTOR CONFIDENCE UPDATES
  // ============================================================================

  private updateFactorConfidences(
    insights: ConceptualInsight[],
    tau: number
  ): BeliefUpdate[] {
    const updates: BeliefUpdate[] = [];

    // Update confidence based on insight consistency
    const factorInsights = insights.filter(i => i.type === 'factor');

    for (const insight of factorInsights) {
      // Extract factor name from insight
      const factorMatch = insight.concept.match(/(\w+) (?:exposure|factor)/i);
      if (!factorMatch) continue;

      const factor = factorMatch[1].toLowerCase();
      const currentConfidence = this.currentBeliefs.factorConfidences.get(factor);
      if (currentConfidence === undefined) continue;

      // Increase confidence for positive insights, decrease for negative
      const confidenceChange = insight.impactDirection === 'positive'
        ? insight.confidence * tau * 0.1
        : -insight.confidence * tau * 0.1;

      const newConfidence = Math.max(0.1, Math.min(0.95, currentConfidence + confidenceChange));

      if (newConfidence !== currentConfidence) {
        this.currentBeliefs.factorConfidences.set(factor, newConfidence);

        updates.push({
          field: `factorConfidences.${factor}`,
          oldValue: currentConfidence,
          newValue: newConfidence,
          learningRate: tau,
          metaPrompt: `Confidence ${confidenceChange > 0 ? 'increased' : 'decreased'} based on ${insight.type} insight`,
          timestamp: new Date(),
        });
      }
    }

    return updates;
  }

  // ============================================================================
  // RISK BELIEF UPDATES
  // ============================================================================

  private updateRiskBeliefs(
    comparison: EpisodeComparison,
    insights: ConceptualInsight[],
    tau: number
  ): BeliefUpdate[] {
    const updates: BeliefUpdate[] = [];
    const riskInsights = insights.filter(i => i.type === 'risk');

    // Update max drawdown threshold based on comparison
    const betterDrawdown = comparison.betterEpisode.maxDrawdown;
    const worseDrawdown = comparison.worseEpisode.maxDrawdown;

    if (worseDrawdown > this.currentBeliefs.maxDrawdownThreshold * 1.5) {
      // Tighten threshold if drawdown exceeded
      const oldThreshold = this.currentBeliefs.maxDrawdownThreshold;
      const newThreshold = Math.max(
        0.05,
        oldThreshold - tau * 0.02
      );

      if (newThreshold !== oldThreshold) {
        this.currentBeliefs.maxDrawdownThreshold = newThreshold;
        updates.push({
          field: 'maxDrawdownThreshold',
          oldValue: oldThreshold,
          newValue: newThreshold,
          learningRate: tau,
          metaPrompt: `Tightened drawdown threshold due to ${(worseDrawdown * 100).toFixed(1)}% drawdown`,
          timestamp: new Date(),
        });
      }
    }

    // Update volatility target based on risk insights
    for (const insight of riskInsights) {
      if (insight.impactDirection === 'negative' && insight.confidence > 0.7) {
        const oldVol = this.currentBeliefs.volatilityTarget;
        const newVol = Math.max(0.10, oldVol - tau * 0.02);

        if (newVol !== oldVol) {
          this.currentBeliefs.volatilityTarget = newVol;
          updates.push({
            field: 'volatilityTarget',
            oldValue: oldVol,
            newValue: newVol,
            learningRate: tau,
            metaPrompt: 'Reduced volatility target based on risk insight',
            timestamp: new Date(),
          });
        }
        break;
      }
    }

    return updates;
  }

  // ============================================================================
  // TIMING BELIEF UPDATES
  // ============================================================================

  private updateTimingBeliefs(
    insights: ConceptualInsight[],
    tau: number
  ): BeliefUpdate[] {
    const updates: BeliefUpdate[] = [];
    const timingInsights = insights.filter(i => i.type === 'timing');

    for (const insight of timingInsights) {
      if (insight.impactDirection === 'positive' && insight.concept.includes('earlier')) {
        // Shorten momentum horizon for faster signals
        const oldHorizon = this.currentBeliefs.momentumHorizon;
        const newHorizon = Math.max(5, Math.floor(oldHorizon * (1 - tau * 0.1)));

        if (newHorizon !== oldHorizon) {
          this.currentBeliefs.momentumHorizon = newHorizon;
          updates.push({
            field: 'momentumHorizon',
            oldValue: oldHorizon,
            newValue: newHorizon,
            learningRate: tau,
            metaPrompt: 'Shortened momentum horizon for faster signals',
            timestamp: new Date(),
          });
        }
      } else if (insight.impactDirection === 'negative' && insight.concept.includes('delayed')) {
        // Extend horizon to avoid chasing
        const oldHorizon = this.currentBeliefs.momentumHorizon;
        const newHorizon = Math.min(63, Math.floor(oldHorizon * (1 + tau * 0.1)));

        if (newHorizon !== oldHorizon) {
          this.currentBeliefs.momentumHorizon = newHorizon;
          updates.push({
            field: 'momentumHorizon',
            oldValue: oldHorizon,
            newValue: newHorizon,
            learningRate: tau,
            metaPrompt: 'Extended momentum horizon to avoid late entries',
            timestamp: new Date(),
          });
        }
      }
    }

    return updates;
  }

  // ============================================================================
  // ALLOCATION BELIEF UPDATES
  // ============================================================================

  private updateAllocationBeliefs(
    insights: ConceptualInsight[],
    tau: number
  ): BeliefUpdate[] {
    const updates: BeliefUpdate[] = [];
    const allocationInsights = insights.filter(i => i.type === 'allocation');

    for (const insight of allocationInsights) {
      if (insight.impactDirection === 'negative' && insight.concept.includes('over-concentration')) {
        // Tighten concentration limits
        const oldLimit = this.currentBeliefs.concentrationLimit;
        const newLimit = Math.max(0.10, oldLimit * (1 - tau * 0.1));

        if (newLimit !== oldLimit) {
          this.currentBeliefs.concentrationLimit = newLimit;
          updates.push({
            field: 'concentrationLimit',
            oldValue: oldLimit,
            newValue: newLimit,
            learningRate: tau,
            metaPrompt: 'Reduced concentration limit to prevent over-exposure',
            timestamp: new Date(),
          });
        }
      } else if (insight.impactDirection === 'positive' && insight.concept.includes('Concentration')) {
        // Potentially allow more concentration if beneficial
        const oldLimit = this.currentBeliefs.concentrationLimit;
        const newLimit = Math.min(0.30, oldLimit * (1 + tau * 0.05));

        if (newLimit !== oldLimit) {
          this.currentBeliefs.concentrationLimit = newLimit;
          updates.push({
            field: 'concentrationLimit',
            oldValue: oldLimit,
            newValue: newLimit,
            learningRate: tau,
            metaPrompt: 'Increased concentration limit for high-conviction positions',
            timestamp: new Date(),
          });
        }
      }
    }

    return updates;
  }

  // ============================================================================
  // REGIME BELIEF UPDATES
  // ============================================================================

  private updateRegimeBeliefs(
    insights: ConceptualInsight[],
    tau: number
  ): BeliefUpdate[] {
    const updates: BeliefUpdate[] = [];
    const regimeInsights = insights.filter(i => i.type === 'regime');

    for (const insight of regimeInsights) {
      // Extract detected regime from insight
      const regimeMatch = insight.concept.match(/(bull|bear|sideways|volatile)/i);
      if (regimeMatch) {
        const detectedRegime = regimeMatch[1].toLowerCase() as BeliefState['currentRegime'];
        const oldRegime = this.currentBeliefs.currentRegime;

        if (detectedRegime !== oldRegime) {
          // Update regime with confidence weighted by insight confidence
          const oldConfidence = this.currentBeliefs.regimeConfidence;
          const newConfidence = Math.max(0.3, Math.min(0.9, insight.confidence * (1 - tau * 0.5) + oldConfidence * tau * 0.5));

          this.currentBeliefs.currentRegime = detectedRegime;
          this.currentBeliefs.regimeConfidence = newConfidence;

          updates.push({
            field: 'currentRegime',
            oldValue: oldRegime,
            newValue: detectedRegime,
            learningRate: tau,
            metaPrompt: `Regime shift detected: ${oldRegime} → ${detectedRegime}`,
            timestamp: new Date(),
          });

          updates.push({
            field: 'regimeConfidence',
            oldValue: oldConfidence,
            newValue: newConfidence,
            learningRate: tau,
            metaPrompt: `Regime confidence updated to ${(newConfidence * 100).toFixed(0)}%`,
            timestamp: new Date(),
          });
        }
      }
    }

    return updates;
  }

  // ============================================================================
  // CONCEPTUAL PRIORS MANAGEMENT
  // ============================================================================

  private updateConceptualPriors(insights: ConceptualInsight[]): void {
    // Add high-confidence insights to priors
    const newPriors = insights.filter(i => i.confidence > 0.8);

    // Keep only recent priors (decay old ones)
    const decayedPriors = this.currentBeliefs.conceptualPriors
      .map(p => ({ ...p, confidence: p.confidence * this.config.beliefDecayRate }))
      .filter(p => p.confidence > this.config.minInsightConfidence);

    // Merge new and decayed priors, keeping top N
    this.currentBeliefs.conceptualPriors = [...newPriors, ...decayedPriors]
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, this.config.maxInsightsPerEpisode);
  }

  // ============================================================================
  // GETTERS AND UTILITIES
  // ============================================================================

  getCurrentBeliefs(): BeliefState {
    return { ...this.currentBeliefs };
  }

  getBeliefHistory(): BeliefState[] {
    return [...this.beliefHistory];
  }

  getUpdateHistory(): BeliefUpdate[] {
    return [...this.updateHistory];
  }

  /**
   * Get belief stability metric (how much beliefs changed recently)
   */
  getBeliefStability(): number {
    if (this.beliefHistory.length < 2) return 1.0;

    const recent = this.beliefHistory.slice(-5);
    let totalChange = 0;

    for (let i = 1; i < recent.length; i++) {
      const prev = recent[i - 1];
      const curr = recent[i];

      // Compare factor weights
      for (const [factor, weight] of curr.factorWeights) {
        const prevWeight = prev.factorWeights.get(factor) || weight;
        totalChange += Math.abs(weight - prevWeight);
      }
    }

    // Stability = 1 - normalized change
    return Math.max(0, 1 - totalChange / (recent.length * 5));
  }

  /**
   * Export beliefs for persistence
   */
  exportBeliefs(): {
    current: BeliefState;
    history: BeliefState[];
    updates: BeliefUpdate[];
  } {
    return {
      current: this.getCurrentBeliefs(),
      history: this.getBeliefHistory(),
      updates: this.getUpdateHistory(),
    };
  }

  /**
   * Import beliefs from persistence
   */
  importBeliefs(data: {
    current: BeliefState;
    history?: BeliefState[];
    updates?: BeliefUpdate[];
  }): void {
    this.currentBeliefs = data.current;
    this.beliefHistory = data.history || [];
    this.updateHistory = data.updates || [];
  }

  /**
   * Generate natural language summary of current beliefs
   */
  generateBeliefSummary(): string {
    const beliefs = this.currentBeliefs;
    const topFactors = Array.from(beliefs.factorWeights.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([f, w]) => `${f} (${(w * 100).toFixed(0)}%)`)
      .join(', ');

    return `📊 **Current Investment Beliefs (v${beliefs.version})**

**Top Factor Weights:** ${topFactors}

**Risk Parameters:**
- Max Drawdown Threshold: ${(beliefs.maxDrawdownThreshold * 100).toFixed(0)}%
- Volatility Target: ${(beliefs.volatilityTarget * 100).toFixed(0)}%
- Concentration Limit: ${(beliefs.concentrationLimit * 100).toFixed(0)}%

**Timing:**
- Momentum Horizon: ${beliefs.momentumHorizon} days
- Rebalance Threshold: ${(beliefs.rebalanceThreshold * 100).toFixed(0)}%

**Regime:** ${beliefs.currentRegime} (${(beliefs.regimeConfidence * 100).toFixed(0)}% confidence)

**Conceptual Priors:** ${beliefs.conceptualPriors.length} active insights

_Last updated: ${beliefs.updatedAt.toISOString()}_`;
  }
}

export const beliefUpdater = new BeliefUpdater();
