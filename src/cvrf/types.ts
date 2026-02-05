/**
 * FRONTIER ALPHA - CVRF (Conceptual Verbal Reinforcement Framework) Types
 *
 * Implements the FinCon-style episodic verbal reinforcement system for
 * investment belief optimization via textual gradients.
 *
 * Based on: arXiv:2407.06567 - FinCon: A Synthesized LLM Multi-Agent System
 * with Conceptual Verbal Reinforcement for Enhanced Financial Decision Making
 */

import type { FactorExposure, OptimizationResult, SentimentScore } from '../types/index.js';

// ============================================================================
// EPISODE TYPES
// ============================================================================

/**
 * A single trading decision within an episode
 */
export interface TradingDecision {
  id: string;
  timestamp: Date;
  symbol: string;
  action: 'buy' | 'sell' | 'hold' | 'rebalance';
  weightBefore: number;
  weightAfter: number;
  reason: string;
  factors: FactorExposure[];
  sentiment?: SentimentScore;
  confidence: number;
}

/**
 * An episode represents a trading period (e.g., a walk-forward window)
 */
export interface Episode {
  id: string;
  startDate: Date;
  endDate: Date;
  decisions: TradingDecision[];
  portfolioReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  factorExposures: FactorExposure[];
  optimizationResult?: OptimizationResult;
}

/**
 * Comparison of two consecutive episodes
 */
export interface EpisodeComparison {
  betterEpisode: Episode;
  worseEpisode: Episode;
  performanceDelta: number;
  decisionOverlap: number; // τ - learning rate
  profitableTrades: TradingDecision[];
  losingTrades: TradingDecision[];
}

// ============================================================================
// CONCEPTUAL INSIGHT TYPES
// ============================================================================

/**
 * A conceptual insight extracted from episode analysis
 */
export interface ConceptualInsight {
  id: string;
  type: 'factor' | 'sentiment' | 'timing' | 'risk' | 'allocation' | 'regime';
  concept: string;
  evidence: string[];
  confidence: number;
  sourceEpisode: string;
  impactDirection: 'positive' | 'negative' | 'neutral';
}

/**
 * Investment concepts organized by analyst perspective
 */
export interface AnalystPerspective {
  analyst: 'momentum' | 'value' | 'risk' | 'sentiment' | 'macro' | 'technical';
  insights: ConceptualInsight[];
  keyIndicators: string[];
}

/**
 * Meta-prompt generated from conceptual comparison
 */
export interface MetaPrompt {
  optimizationDirection: string;
  keyLearnings: string[];
  factorAdjustments: Map<string, number>;
  riskGuidance: string;
  timingInsights: string;
  generatedAt: Date;
}

// ============================================================================
// BELIEF STATE TYPES
// ============================================================================

/**
 * Current investment beliefs (θ in CVRF)
 */
export interface BeliefState {
  id: string;
  version: number;
  updatedAt: Date;

  // Factor beliefs
  factorWeights: Map<string, number>;
  factorConfidences: Map<string, number>;

  // Risk beliefs
  riskTolerance: number;
  maxDrawdownThreshold: number;
  volatilityTarget: number;

  // Timing beliefs
  momentumHorizon: number; // days
  meanReversionThreshold: number;

  // Allocation beliefs
  concentrationLimit: number;
  minPositionSize: number;
  rebalanceThreshold: number;

  // Regime beliefs
  currentRegime: 'bull' | 'bear' | 'sideways' | 'volatile';
  regimeConfidence: number;

  // Meta beliefs (learned from CVRF)
  conceptualPriors: ConceptualInsight[];
}

/**
 * Belief update operation
 */
export interface BeliefUpdate {
  field: keyof BeliefState | string;
  oldValue: unknown;
  newValue: unknown;
  learningRate: number; // τ
  metaPrompt: string;
  timestamp: Date;
}

// ============================================================================
// CVRF CONFIGURATION
// ============================================================================

export interface CVRFConfig {
  // Episode configuration
  episodeLengthDays: number;
  minEpisodesForComparison: number;

  // Learning configuration
  baseLearningRate: number;
  minLearningRate: number;
  maxLearningRate: number;

  // Concept extraction
  minInsightConfidence: number;
  maxInsightsPerEpisode: number;

  // Belief update constraints
  maxBeliefChangePerUpdate: number;
  beliefDecayRate: number;

  // Risk control
  enableWithinEpisodeCVaR: boolean;
  cvarConfidenceLevel: number;
  maxRiskAdjustment: number;
}

export const DEFAULT_CVRF_CONFIG: CVRFConfig = {
  episodeLengthDays: 21, // ~1 month
  minEpisodesForComparison: 2,
  baseLearningRate: 0.1,
  minLearningRate: 0.01,
  maxLearningRate: 0.5,
  minInsightConfidence: 0.6,
  maxInsightsPerEpisode: 10,
  maxBeliefChangePerUpdate: 0.3,
  beliefDecayRate: 0.95,
  enableWithinEpisodeCVaR: true,
  cvarConfidenceLevel: 0.95,
  maxRiskAdjustment: 0.2,
};

// ============================================================================
// CVRF RESULT TYPES
// ============================================================================

/**
 * Result of a single CVRF optimization cycle
 */
export interface CVRFCycleResult {
  cycleId: string;
  timestamp: Date;
  episodeComparison: EpisodeComparison;
  extractedInsights: ConceptualInsight[];
  metaPrompt: MetaPrompt;
  beliefUpdates: BeliefUpdate[];
  newBeliefState: BeliefState;
  explanation: string;
}

/**
 * Long-term CVRF performance tracking
 */
export interface CVRFPerformanceMetrics {
  totalCycles: number;
  averageLearningRate: number;
  beliefStability: number; // How stable beliefs are over time
  insightQuality: number; // Correlation between insights and performance
  overfitRisk: number; // Risk of overfitting to recent data
  adaptationSpeed: number; // How quickly beliefs adapt to regime changes
}

// ============================================================================
// DUAL-LEVEL RISK CONTROL TYPES
// ============================================================================

/**
 * Within-episode CVaR-based risk control
 */
export interface WithinEpisodeRiskControl {
  currentCVaR: number;
  threshold: number;
  triggered: boolean;
  adjustment: {
    type: 'reduce_exposure' | 'hedge' | 'rebalance' | 'none';
    magnitude: number;
    targets: string[];
  };
}

/**
 * Over-episode belief adjustment based on CVRF
 */
export interface OverEpisodeBeliefAdjustment {
  conceptualInsights: ConceptualInsight[];
  metaPrompt: MetaPrompt;
  learningRate: number;
  beliefDeltas: Map<string, number>;
}
