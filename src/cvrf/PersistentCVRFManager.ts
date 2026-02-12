/**
 * FRONTIER ALPHA - Persistent CVRF Manager
 *
 * Extends CVRFManager with Supabase persistence for stateless serverless environments.
 * All state is loaded from and saved to Supabase on each operation.
 */

import type {
  CVRFConfig,
  CVRFCycleResult,
  Episode,
  BeliefState,
  TradingDecision,
  WithinEpisodeRiskControl,
  OverEpisodeBeliefAdjustment,
  EpisodeComparison,
  ConceptualInsight,
  MetaPrompt,
} from './types.js';
import { DEFAULT_CVRF_CONFIG } from './types.js';
import { ConceptExtractor } from './ConceptExtractor.js';
import { BeliefUpdater } from './BeliefUpdater.js';
import * as persistence from './persistence.js';
import { logger } from '../lib/logger.js';

// ============================================================================
// PERSISTENT CVRF MANAGER
// ============================================================================

export class PersistentCVRFManager {
  private config: CVRFConfig;
  private conceptExtractor: ConceptExtractor;
  private userId: string | null;
  private initialized: boolean = false;

  // Cached state (loaded from Supabase)
  private currentEpisode: Episode | null = null;
  private recentEpisodes: Episode[] = [];
  private beliefs: BeliefState;
  private cycleHistory: CVRFCycleResult[] = [];
  private cycleCounter = 0;

  constructor(config: Partial<CVRFConfig> = {}, userId: string | null = null) {
    this.config = { ...DEFAULT_CVRF_CONFIG, ...config };
    this.conceptExtractor = new ConceptExtractor(this.config);
    this.userId = userId;
    this.beliefs = this.createDefaultBeliefs();
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Load state from Supabase - call this before any operation
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Load current episode
      this.currentEpisode = await persistence.getActiveEpisode(this.userId);

      // Load recent completed episodes
      this.recentEpisodes = await persistence.getRecentEpisodes(this.userId, 10);

      // Load beliefs
      const loadedBeliefs = await persistence.getBeliefs(this.userId);
      if (loadedBeliefs) {
        this.beliefs = loadedBeliefs;
      }

      // Load cycle history
      this.cycleHistory = await persistence.getCycleHistory(this.userId, 20);
      this.cycleCounter = this.cycleHistory.length;

      this.initialized = true;
    } catch (error) {
      logger.error({ err: error }, 'Failed to initialize CVRF from Supabase');
      // Continue with defaults
      this.initialized = true;
    }
  }

  private createDefaultBeliefs(): BeliefState {
    return {
      id: `beliefs_${Date.now()}`,
      version: 1,
      updatedAt: new Date(),
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
      riskTolerance: 0.15,
      maxDrawdownThreshold: 0.10,
      volatilityTarget: 0.15,
      momentumHorizon: 21,
      meanReversionThreshold: 2.0,
      concentrationLimit: 0.20,
      minPositionSize: 0.02,
      rebalanceThreshold: 0.05,
      currentRegime: 'sideways',
      regimeConfidence: 0.5,
      conceptualPriors: [],
    };
  }

  // ============================================================================
  // EPISODE MANAGEMENT
  // ============================================================================

  /**
   * Start a new trading episode
   */
  async startEpisode(): Promise<Episode> {
    await this.initialize();

    // Close any existing active episode first
    if (this.currentEpisode) {
      await this.closeEpisode();
    }

    // Calculate episode number
    const episodeNumber = this.recentEpisodes.length + 1;

    // Create new episode in Supabase
    const episode = await persistence.createEpisode(episodeNumber, this.userId);

    this.currentEpisode = episode;
    return episode;
  }

  /**
   * Record a trading decision
   */
  async recordDecision(decision: Omit<TradingDecision, 'id'>): Promise<TradingDecision> {
    await this.initialize();

    if (!this.currentEpisode) {
      // Auto-start episode if needed
      await this.startEpisode();
    }

    // Save to Supabase
    const savedDecision = await persistence.saveDecision(
      decision as TradingDecision,
      this.currentEpisode!.id,
      this.userId
    );

    // Update local cache
    this.currentEpisode!.decisions.push(savedDecision);

    return savedDecision;
  }

  /**
   * Close current episode and optionally trigger CVRF cycle
   */
  async closeEpisode(
    metrics?: {
      portfolioReturn?: number;
      sharpeRatio?: number;
      maxDrawdown?: number;
      volatility?: number;
    },
    triggerCVRF: boolean = true
  ): Promise<{ episode: Episode; cvrfResult: CVRFCycleResult | null }> {
    await this.initialize();

    if (!this.currentEpisode) {
      throw new Error('No active episode to close');
    }

    // Update episode with metrics
    this.currentEpisode.endDate = new Date();
    if (metrics) {
      this.currentEpisode.portfolioReturn = metrics.portfolioReturn;
      this.currentEpisode.sharpeRatio = metrics.sharpeRatio;
      this.currentEpisode.maxDrawdown = metrics.maxDrawdown;
      this.currentEpisode.volatility = metrics.volatility;
    }

    // Save to Supabase
    await persistence.updateEpisode(this.currentEpisode);

    // Move to recent episodes
    const closedEpisode = this.currentEpisode;
    this.recentEpisodes.unshift(closedEpisode);
    this.currentEpisode = null;

    // Run CVRF cycle if requested and we have enough data
    let cvrfResult: CVRFCycleResult | null = null;
    if (triggerCVRF && this.recentEpisodes.length >= 2) {
      cvrfResult = await this.runCVRFCycle();
    }

    return { episode: closedEpisode, cvrfResult };
  }

  // ============================================================================
  // CVRF CYCLE
  // ============================================================================

  /**
   * Run a complete CVRF optimization cycle
   */
  async runCVRFCycle(): Promise<CVRFCycleResult | null> {
    if (this.recentEpisodes.length < 2) {
      logger.info('CVRF: Insufficient episodes for comparison, need at least 2');
      return null;
    }

    // Get the two most recent episodes
    const currentEp = this.recentEpisodes[0];
    const previousEp = this.recentEpisodes[1];

    // Create episode comparison
    const comparison = this.createEpisodeComparison(previousEp, currentEp);

    // Extract conceptual insights
    const insights = this.conceptExtractor.extractInsights(comparison);

    // Generate meta-prompt
    const metaPrompt = this.conceptExtractor.generateMetaPrompt(comparison, insights);

    // Create belief updater with current beliefs
    const beliefUpdater = new BeliefUpdater(this.config);
    beliefUpdater.importBeliefs({
      current: this.beliefs,
      history: [],
    });

    // Update beliefs
    const { newBeliefs, updates } = beliefUpdater.updateBeliefs(
      comparison,
      insights,
      metaPrompt
    );

    // Create result
    const result: CVRFCycleResult = {
      cycleId: `cycle_${this.cycleCounter + 1}_${Date.now()}`,
      timestamp: new Date(),
      episodeComparison: comparison,
      extractedInsights: insights,
      metaPrompt,
      beliefUpdates: updates,
      newBeliefState: newBeliefs,
      explanation: this.generateCycleExplanation(comparison, insights, metaPrompt, newBeliefs),
    };

    // Save to Supabase
    await persistence.saveCycleResult(result, ++this.cycleCounter, this.userId);
    await persistence.saveBeliefs(newBeliefs, this.userId);

    // Update local state
    this.beliefs = newBeliefs;
    this.cycleHistory.unshift(result);

    return result;
  }

  private createEpisodeComparison(previous: Episode, current: Episode): EpisodeComparison {
    // Calculate decision overlap (τ)
    const prevDecisions = new Set(previous.decisions.map(d => `${d.symbol}_${d.action}`));
    const currDecisions = current.decisions.map(d => `${d.symbol}_${d.action}`);

    const overlap = currDecisions.filter(d => prevDecisions.has(d)).length;
    const total = Math.max(prevDecisions.size, currDecisions.length, 1);
    const decisionOverlap = overlap / total;

    // Find shared symbols
    const prevSymbols = new Set(previous.decisions.map(d => d.symbol));
    const currSymbols = new Set(current.decisions.map(d => d.symbol));
    const sharedSymbols = [...prevSymbols].filter(s => currSymbols.has(s));

    // Calculate performance delta
    const prevReturn = previous.portfolioReturn || 0;
    const currReturn = current.portfolioReturn || 0;
    const performanceDelta = currReturn - prevReturn;

    // Determine better episode (with safe defaults)
    const isCurrBetter = currReturn >= prevReturn;

    // Ensure episodes have required properties for ConceptExtractor
    const enrichEpisode = (ep: Episode) => ({
      ...ep,
      factorExposures: ep.factorExposures || [],
      maxDrawdown: ep.maxDrawdown || 0,
    });

    const betterEpisode = enrichEpisode(isCurrBetter ? current : previous);
    const worseEpisode = enrichEpisode(isCurrBetter ? previous : current);

    // Categorize trades as profitable or losing based on simple heuristics
    const profitableTrades = betterEpisode.decisions.filter(d =>
      d.action === 'buy' || (d.action === 'hold' && d.confidence > 0.5)
    );
    const losingTrades = worseEpisode.decisions.filter(d =>
      d.action === 'sell' || (d.action === 'hold' && d.confidence <= 0.5)
    );

    const result = {
      previousEpisodeId: previous.id,
      currentEpisodeId: current.id,
      previousEpisodeReturn: prevReturn,
      currentEpisodeReturn: currReturn,
      performanceDelta,
      decisionOverlap,
      sharedSymbols,
      divergentDecisions: [],
      betterEpisode,
      worseEpisode,
      profitableTrades,
      losingTrades,
    };
    return result as EpisodeComparison;
  }

  private generateCycleExplanation(
    comparison: EpisodeComparison,
    insights: ConceptualInsight[],
    metaPrompt: MetaPrompt,
    newBeliefs: BeliefState
  ): string {
    const perfDelta = (comparison.performanceDelta * 100).toFixed(2);
    const learningRate = ((1 - comparison.decisionOverlap) * 100).toFixed(1);

    return `🧠 **CVRF Cycle Complete**

**Episode Comparison:**
- Performance delta: ${perfDelta}%
- Decision overlap: ${(comparison.decisionOverlap * 100).toFixed(1)}%
- Effective learning rate: ${learningRate}%

**Insights:** ${insights.length} extracted
**New Regime:** ${newBeliefs.currentRegime} (${(newBeliefs.regimeConfidence * 100).toFixed(0)}% confidence)

${metaPrompt.optimizationDirection}`;
  }

  // ============================================================================
  // RISK CONTROL
  // ============================================================================

  checkWithinEpisodeRisk(
    portfolioValue: number,
    portfolioReturns: number[],
    positions: Array<{ symbol: string; weight: number }>
  ): WithinEpisodeRiskControl {
    if (!this.config.enableWithinEpisodeCVaR || portfolioReturns.length === 0) {
      return {
        currentCVaR: 0,
        threshold: this.beliefs.maxDrawdownThreshold,
        triggered: false,
        adjustment: { type: 'none', magnitude: 0, targets: [] },
      };
    }

    // Calculate CVaR
    const sorted = [...portfolioReturns].sort((a, b) => a - b);
    const varIndex = Math.floor(sorted.length * (1 - this.config.cvarConfidenceLevel));
    const tailReturns = sorted.slice(0, Math.max(1, varIndex));
    const cvar = tailReturns.reduce((a, b) => a + b, 0) / tailReturns.length;

    const threshold = this.beliefs.maxDrawdownThreshold;
    const triggered = Math.abs(cvar) > threshold;

    let adjustment: WithinEpisodeRiskControl['adjustment'] = {
      type: 'none',
      magnitude: 0,
      targets: [],
    };

    if (triggered) {
      const severity = Math.abs(cvar) / threshold;
      if (severity > 1.5) {
        adjustment = {
          type: 'reduce_exposure',
          magnitude: Math.min(0.3, (severity - 1) * 0.2),
          targets: positions.sort((a, b) => b.weight - a.weight).slice(0, 3).map(p => p.symbol),
        };
      } else if (severity > 1.2) {
        adjustment = {
          type: 'hedge',
          magnitude: Math.min(0.2, (severity - 1) * 0.15),
          targets: ['SPY_PUT', 'VIX_CALL'],
        };
      } else {
        adjustment = {
          type: 'rebalance',
          magnitude: Math.min(0.1, (severity - 1) * 0.1),
          targets: positions.filter(p => p.weight > this.beliefs.concentrationLimit).map(p => p.symbol),
        };
      }
    }

    return { currentCVaR: cvar, threshold, triggered, adjustment };
  }

  getOverEpisodeAdjustment(): OverEpisodeBeliefAdjustment {
    const lastCycle = this.cycleHistory[0];

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
  // OPTIMIZATION CONSTRAINTS
  // ============================================================================

  getOptimizationConstraints(): {
    factorTargets: Map<string, { target: number; tolerance: number }>;
    maxWeight: number;
    minWeight: number;
    volatilityTarget: number;
    riskBudget: number;
  } {
    const factorTargets = new Map<string, { target: number; tolerance: number }>();

    for (const [factor, weight] of this.beliefs.factorWeights) {
      const confidence = this.beliefs.factorConfidences.get(factor) || 0.5;
      factorTargets.set(factor, {
        target: weight * 2 - 0.5,
        tolerance: 0.3 * (1 - confidence),
      });
    }

    let riskMultiplier = 1.0;
    switch (this.beliefs.currentRegime) {
      case 'bull': riskMultiplier = 1.1; break;
      case 'bear': riskMultiplier = 0.8; break;
      case 'volatile': riskMultiplier = 0.7; break;
    }

    return {
      factorTargets,
      maxWeight: this.beliefs.concentrationLimit,
      minWeight: this.beliefs.minPositionSize,
      volatilityTarget: this.beliefs.volatilityTarget * riskMultiplier,
      riskBudget: this.beliefs.riskTolerance * riskMultiplier,
    };
  }

  // ============================================================================
  // GETTERS
  // ============================================================================

  getCurrentBeliefs(): BeliefState {
    return this.beliefs;
  }

  getCycleHistory(): CVRFCycleResult[] {
    return [...this.cycleHistory];
  }

  getCurrentEpisode(): Episode | null {
    return this.currentEpisode;
  }

  getRecentEpisodes(): Episode[] {
    return [...this.recentEpisodes];
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let _persistentManager: PersistentCVRFManager | null = null;

export async function getPersistentCVRFManager(
  userId: string | null = null
): Promise<PersistentCVRFManager> {
  if (!_persistentManager || _persistentManager['userId'] !== userId) {
    _persistentManager = new PersistentCVRFManager({}, userId);
    await _persistentManager.initialize();
  }
  return _persistentManager;
}

// For serverless: always create fresh and initialize
export async function createPersistentCVRFManager(
  userId: string | null = null
): Promise<PersistentCVRFManager> {
  const manager = new PersistentCVRFManager({}, userId);
  await manager.initialize();
  return manager;
}
