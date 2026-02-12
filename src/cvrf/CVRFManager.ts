/**
 * FRONTIER ALPHA - CVRF Manager (Orchestrator)
 *
 * Main orchestrator for the Conceptual Verbal Reinforcement Framework.
 * Coordinates episode management, concept extraction, and belief updates.
 *
 * Implements the full CVRF cycle:
 * 1. Episode comparison (compare k-1 and k)
 * 2. Concept extraction (profitable/losing trade analysis)
 * 3. Meta-prompt generation (textual optimization direction)
 * 4. Learning rate calculation (τ from decision overlap)
 * 5. Belief update (θ ← Mᵣ(θ, τ, meta_prompt))
 *
 * Plus dual-level risk control:
 * - Within-episode: CVaR-based real-time adjustments
 * - Over-episode: CVRF belief updates
 */

import type {
  CVRFConfig,
  CVRFCycleResult,
  CVRFPerformanceMetrics,
  Episode,
  EpisodeComparison,
  ConceptualInsight,
  MetaPrompt,
  BeliefState,
  TradingDecision,
  WithinEpisodeRiskControl,
  OverEpisodeBeliefAdjustment,
  MLPredictions,
} from './types.js';
import { DEFAULT_CVRF_CONFIG } from './types.js';
import { EpisodeManager } from './EpisodeManager.js';
import { ConceptExtractor } from './ConceptExtractor.js';
import { BeliefUpdater } from './BeliefUpdater.js';
import type { FactorExposure, OptimizationResult } from '../types/index.js';
import { logger } from '../lib/logger.js';

// ============================================================================
// CVRF MANAGER
// ============================================================================

export class CVRFManager {
  private config: CVRFConfig;
  private episodeManager: EpisodeManager;
  private conceptExtractor: ConceptExtractor;
  private beliefUpdater: BeliefUpdater;
  private cycleHistory: CVRFCycleResult[] = [];
  private cycleCounter = 0;

  constructor(config: Partial<CVRFConfig> = {}) {
    this.config = { ...DEFAULT_CVRF_CONFIG, ...config };
    this.episodeManager = new EpisodeManager(this.config);
    this.conceptExtractor = new ConceptExtractor(this.config);
    this.beliefUpdater = new BeliefUpdater(this.config);
  }

  // ============================================================================
  // MAIN CVRF CYCLE
  // ============================================================================

  /**
   * Run a complete CVRF optimization cycle
   *
   * This is the main entry point for episodic belief optimization.
   * Call this after each trading episode completes.
   *
   * @param mlPredictions Optional ML predictions (regime detection, factor momentum,
   *   factor attribution) to enhance belief updates
   */
  async runCVRFCycle(mlPredictions?: MLPredictions): Promise<CVRFCycleResult | null> {
    // Check if we have enough episodes
    if (!this.episodeManager.hasEnoughEpisodesForCVRF()) {
      logger.info('CVRF: Insufficient episodes for comparison, need at least 2');
      return null;
    }

    // Step 1: Get latest episode comparison
    const comparison = this.episodeManager.getLatestComparison();
    if (!comparison) {
      logger.info('CVRF: Could not generate episode comparison');
      return null;
    }

    // Step 2: Extract conceptual insights (ML-enhanced if predictions available)
    const insights = this.conceptExtractor.extractInsights(comparison, mlPredictions);

    // Step 3: Generate meta-prompt (textual optimization direction)
    const metaPrompt = this.conceptExtractor.generateMetaPrompt(comparison, insights, mlPredictions);

    // Step 4 & 5: Update beliefs using textual gradient descent (ML-accelerated)
    const { newBeliefs, updates } = this.beliefUpdater.updateBeliefs(
      comparison,
      insights,
      metaPrompt,
      mlPredictions
    );

    // Generate explanation
    const explanation = this.generateCycleExplanation(
      comparison,
      insights,
      metaPrompt,
      newBeliefs
    );

    // Create cycle result
    const result: CVRFCycleResult = {
      cycleId: `cvrf_cycle_${++this.cycleCounter}_${Date.now()}`,
      timestamp: new Date(),
      episodeComparison: comparison,
      extractedInsights: insights,
      metaPrompt,
      beliefUpdates: updates,
      newBeliefState: newBeliefs,
      explanation,
      mlPredictions,
    };

    // Store in history
    this.cycleHistory.push(result);

    return result;
  }

  // ============================================================================
  // EPISODE MANAGEMENT
  // ============================================================================

  /**
   * Start a new trading episode
   */
  startEpisode(startDate?: Date): Episode {
    return this.episodeManager.startEpisode(startDate);
  }

  /**
   * Record a trading decision
   */
  recordDecision(decision: Omit<TradingDecision, 'id'>): TradingDecision {
    return this.episodeManager.recordDecision(decision);
  }

  /**
   * Update episode metrics
   */
  updateEpisodeMetrics(metrics: {
    portfolioReturn: number;
    sharpeRatio: number;
    maxDrawdown: number;
    factorExposures: FactorExposure[];
    optimizationResult?: OptimizationResult;
  }): void {
    this.episodeManager.updateEpisodeMetrics(metrics);
  }

  /**
   * Close current episode and optionally trigger CVRF cycle
   *
   * @param endDate Optional end date for the episode
   * @param triggerCVRF Whether to trigger a CVRF cycle after closing
   * @param mlPredictions Optional ML predictions to enhance the CVRF cycle
   */
  async closeEpisode(
    endDate?: Date,
    triggerCVRF: boolean = true,
    mlPredictions?: MLPredictions
  ): Promise<{ episode: Episode | null; cvrfResult: CVRFCycleResult | null }> {
    const episode = this.episodeManager.closeEpisode(endDate);

    let cvrfResult: CVRFCycleResult | null = null;
    if (triggerCVRF && episode) {
      cvrfResult = await this.runCVRFCycle(mlPredictions);
    }

    return { episode, cvrfResult };
  }

  // ============================================================================
  // DUAL-LEVEL RISK CONTROL
  // ============================================================================

  /**
   * Within-episode CVaR-based risk control
   *
   * Call this during an episode to check if risk thresholds are breached.
   * Returns adjustment recommendations if CVaR threshold is exceeded.
   */
  checkWithinEpisodeRisk(
    currentPortfolioValue: number,
    portfolioReturns: number[],
    positions: Array<{ symbol: string; weight: number }>
  ): WithinEpisodeRiskControl {
    if (!this.config.enableWithinEpisodeCVaR) {
      return {
        currentCVaR: 0,
        threshold: 0,
        triggered: false,
        adjustment: { type: 'none', magnitude: 0, targets: [] },
      };
    }

    // Calculate CVaR (Conditional Value at Risk)
    const cvar = this.calculateCVaR(portfolioReturns, this.config.cvarConfidenceLevel);
    const threshold = this.beliefUpdater.getCurrentBeliefs().maxDrawdownThreshold;

    const triggered = Math.abs(cvar) > threshold;

    let adjustment: WithinEpisodeRiskControl['adjustment'] = {
      type: 'none',
      magnitude: 0,
      targets: [],
    };

    if (triggered) {
      // Determine adjustment type based on severity
      const severity = Math.abs(cvar) / threshold;

      if (severity > 1.5) {
        // Severe: reduce exposure
        adjustment = {
          type: 'reduce_exposure',
          magnitude: Math.min(0.3, (severity - 1) * 0.2),
          targets: positions
            .sort((a, b) => b.weight - a.weight)
            .slice(0, 3)
            .map(p => p.symbol),
        };
      } else if (severity > 1.2) {
        // Moderate: hedge
        adjustment = {
          type: 'hedge',
          magnitude: Math.min(0.2, (severity - 1) * 0.15),
          targets: ['SPY_PUT', 'VIX_CALL'], // Example hedges
        };
      } else {
        // Mild: rebalance
        adjustment = {
          type: 'rebalance',
          magnitude: Math.min(0.1, (severity - 1) * 0.1),
          targets: positions
            .filter(p => p.weight > this.beliefUpdater.getCurrentBeliefs().concentrationLimit)
            .map(p => p.symbol),
        };
      }
    }

    return {
      currentCVaR: cvar,
      threshold,
      triggered,
      adjustment,
    };
  }

  /**
   * Get over-episode belief adjustment recommendations
   */
  getOverEpisodeAdjustment(): OverEpisodeBeliefAdjustment {
    const _beliefs = this.beliefUpdater.getCurrentBeliefs();
    const lastCycle = this.cycleHistory[this.cycleHistory.length - 1];

    if (!lastCycle) {
      return {
        conceptualInsights: [],
        metaPrompt: {
          optimizationDirection: 'No adjustments - insufficient history',
          keyLearnings: [],
          factorAdjustments: new Map(),
          riskGuidance: '',
          timingInsights: '',
          generatedAt: new Date(),
        },
        learningRate: 0,
        beliefDeltas: new Map(),
      };
    }

    // Calculate belief deltas from last cycle
    const beliefDeltas = new Map<string, number>();
    for (const update of lastCycle.beliefUpdates) {
      if (typeof update.oldValue === 'number' && typeof update.newValue === 'number') {
        beliefDeltas.set(update.field, update.newValue - update.oldValue);
      }
    }

    return {
      conceptualInsights: lastCycle.extractedInsights,
      metaPrompt: lastCycle.metaPrompt,
      learningRate: lastCycle.episodeComparison.decisionOverlap,
      beliefDeltas,
    };
  }

  // ============================================================================
  // PORTFOLIO OPTIMIZER INTEGRATION
  // ============================================================================

  /**
   * Get CVRF-informed optimization constraints
   *
   * Use these constraints to guide the PortfolioOptimizer
   */
  getOptimizationConstraints(): {
    factorTargets: Map<string, { target: number; tolerance: number }>;
    maxWeight: number;
    minWeight: number;
    volatilityTarget: number;
    riskBudget: number;
  } {
    const beliefs = this.beliefUpdater.getCurrentBeliefs();

    // Convert factor weights to targets
    const factorTargets = new Map<string, { target: number; tolerance: number }>();
    for (const [factor, weight] of beliefs.factorWeights) {
      const confidence = beliefs.factorConfidences.get(factor) || 0.5;
      factorTargets.set(factor, {
        target: weight * 2 - 0.5, // Convert to exposure scale (-0.5 to 0.5)
        tolerance: 0.3 * (1 - confidence), // Tighter tolerance for high confidence
      });
    }

    // Adjust constraints based on regime
    let riskMultiplier = 1.0;
    switch (beliefs.currentRegime) {
      case 'bull':
        riskMultiplier = 1.1;
        break;
      case 'bear':
        riskMultiplier = 0.8;
        break;
      case 'volatile':
        riskMultiplier = 0.7;
        break;
      default:
        riskMultiplier = 1.0;
    }

    return {
      factorTargets,
      maxWeight: beliefs.concentrationLimit,
      minWeight: beliefs.minPositionSize,
      volatilityTarget: beliefs.volatilityTarget * riskMultiplier,
      riskBudget: beliefs.riskTolerance * riskMultiplier,
    };
  }

  // ============================================================================
  // PERFORMANCE METRICS
  // ============================================================================

  /**
   * Calculate CVRF performance metrics
   */
  getPerformanceMetrics(): CVRFPerformanceMetrics {
    if (this.cycleHistory.length < 2) {
      return {
        totalCycles: this.cycleHistory.length,
        averageLearningRate: 0,
        beliefStability: 1,
        insightQuality: 0,
        overfitRisk: 0,
        adaptationSpeed: 0,
      };
    }

    // Calculate average learning rate
    const avgLearningRate = this.cycleHistory.reduce(
      (sum, c) => sum + (1 - c.episodeComparison.decisionOverlap),
      0
    ) / this.cycleHistory.length;

    // Get belief stability
    const beliefStability = this.beliefUpdater.getBeliefStability();

    // Calculate insight quality (correlation between insights and performance)
    const insightQuality = this.calculateInsightQuality();

    // Calculate overfit risk
    const overfitRisk = this.calculateOverfitRisk();

    // Calculate adaptation speed
    const adaptationSpeed = this.calculateAdaptationSpeed();

    return {
      totalCycles: this.cycleHistory.length,
      averageLearningRate: avgLearningRate,
      beliefStability,
      insightQuality,
      overfitRisk,
      adaptationSpeed,
    };
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private calculateCVaR(returns: number[], confidenceLevel: number): number {
    if (returns.length === 0) return 0;

    // Sort returns ascending
    const sorted = [...returns].sort((a, b) => a - b);

    // Find VaR index
    const varIndex = Math.floor(returns.length * (1 - confidenceLevel));

    // CVaR is average of returns below VaR
    const tailReturns = sorted.slice(0, Math.max(1, varIndex));
    return tailReturns.reduce((a, b) => a + b, 0) / tailReturns.length;
  }

  private calculateInsightQuality(): number {
    if (this.cycleHistory.length < 3) return 0.5;

    // Compare insight predictions with actual outcomes
    let correctPredictions = 0;
    let totalPredictions = 0;

    for (let i = 1; i < this.cycleHistory.length; i++) {
      const prevCycle = this.cycleHistory[i - 1];
      const currCycle = this.cycleHistory[i];

      const prevInsights = prevCycle.extractedInsights;
      const currPerformance = currCycle.episodeComparison.betterEpisode.portfolioReturn;

      for (const insight of prevInsights) {
        if (insight.impactDirection === 'positive' && currPerformance > 0) {
          correctPredictions++;
        } else if (insight.impactDirection === 'negative' && currPerformance < 0) {
          correctPredictions++;
        }
        totalPredictions++;
      }
    }

    return totalPredictions > 0 ? correctPredictions / totalPredictions : 0.5;
  }

  private calculateOverfitRisk(): number {
    if (this.cycleHistory.length < 3) return 0;

    // Check if beliefs are changing too rapidly
    const beliefChanges = this.cycleHistory.map(c => c.beliefUpdates.length);
    const avgChanges = beliefChanges.reduce((a, b) => a + b, 0) / beliefChanges.length;

    // High change frequency = high overfit risk
    return Math.min(1, avgChanges / 10);
  }

  private calculateAdaptationSpeed(): number {
    if (this.cycleHistory.length < 2) return 0;

    // Measure how quickly beliefs adapted to regime changes
    const regimeChanges = this.cycleHistory.filter((c, i) => {
      if (i === 0) return false;
      const prev = this.cycleHistory[i - 1];
      const prevRegime = prev.newBeliefState.currentRegime;
      const currRegime = c.newBeliefState.currentRegime;
      return prevRegime !== currRegime;
    });

    // More regime adaptations relative to cycles = faster adaptation
    return Math.min(1, regimeChanges.length / this.cycleHistory.length * 5);
  }

  private generateCycleExplanation(
    comparison: EpisodeComparison,
    insights: ConceptualInsight[],
    metaPrompt: MetaPrompt,
    newBeliefs: BeliefState
  ): string {
    const perfDelta = (comparison.performanceDelta * 100).toFixed(2);
    const learningRate = ((1 - comparison.decisionOverlap) * 100).toFixed(1);
    const numInsights = insights.length;
    const numUpdates = metaPrompt.factorAdjustments.size;

    const topInsight = insights[0];
    const topAdjustment = Array.from(metaPrompt.factorAdjustments.entries())[0];

    return `🧠 **CVRF Cycle Complete**

**Episode Comparison:**
- Better episode: ${comparison.betterEpisode.id}
- Performance delta: ${perfDelta}%
- Decision overlap: ${(comparison.decisionOverlap * 100).toFixed(1)}%
- Effective learning rate: ${learningRate}%

**Conceptual Insights:** ${numInsights} extracted
${topInsight ? `- Top insight: ${topInsight.concept}` : '- No significant insights'}

**Belief Updates:** ${numUpdates} factor adjustments
${topAdjustment ? `- Primary: ${topAdjustment[0]} ${topAdjustment[1] > 0 ? '↑' : '↓'} ${(Math.abs(topAdjustment[1]) * 100).toFixed(1)}%` : '- No adjustments needed'}

**New Regime:** ${newBeliefs.currentRegime} (${(newBeliefs.regimeConfidence * 100).toFixed(0)}% confidence)

**Optimization Direction:**
${metaPrompt.optimizationDirection}`;
  }

  // ============================================================================
  // GETTERS
  // ============================================================================

  getCurrentBeliefs(): BeliefState {
    return this.beliefUpdater.getCurrentBeliefs();
  }

  getCycleHistory(): CVRFCycleResult[] {
    return [...this.cycleHistory];
  }

  getEpisodeHistory(): Episode[] {
    return this.episodeManager.getAllEpisodes();
  }

  getCurrentEpisode(): Episode | null {
    return this.episodeManager.getCurrentEpisode();
  }

  // ============================================================================
  // PERSISTENCE
  // ============================================================================

  /**
   * Export full CVRF state for persistence
   */
  exportState(): {
    config: CVRFConfig;
    beliefs: ReturnType<BeliefUpdater['exportBeliefs']>;
    episodes: ReturnType<EpisodeManager['exportEpisodeHistory']>;
    cycles: CVRFCycleResult[];
  } {
    return {
      config: this.config,
      beliefs: this.beliefUpdater.exportBeliefs(),
      episodes: this.episodeManager.exportEpisodeHistory(),
      cycles: this.cycleHistory,
    };
  }

  /**
   * Import CVRF state from persistence
   */
  importState(state: ReturnType<CVRFManager['exportState']>): void {
    this.config = { ...DEFAULT_CVRF_CONFIG, ...state.config };
    this.beliefUpdater.importBeliefs(state.beliefs);
    this.episodeManager.importEpisodeHistory(state.episodes);
    this.cycleHistory = state.cycles;
    this.cycleCounter = state.cycles.length;
  }
}

export const cvrfManager = new CVRFManager();
