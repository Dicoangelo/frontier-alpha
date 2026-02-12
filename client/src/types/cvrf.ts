/**
 * CVRF Types for Frontend
 */

export interface CVRFConceptualPrior {
  id: string;
  type: string;
  concept: string;
  evidence: string[];
  confidence: number;
  sourceEpisode: string;
  impactDirection: 'positive' | 'negative' | 'neutral';
}

export interface CVRFBeliefState {
  id: string;
  version: number;
  updatedAt: string;
  factorWeights: Record<string, number>;
  factorConfidences: Record<string, number>;
  riskTolerance: number;
  maxDrawdownThreshold: number;
  volatilityTarget: number;
  momentumHorizon: number;
  meanReversionThreshold: number;
  concentrationLimit: number;
  minPositionSize: number;
  rebalanceThreshold: number;
  currentRegime: 'bull' | 'bear' | 'sideways' | 'volatile' | 'recovery';
  regimeConfidence: number;
  conceptualPriors: CVRFConceptualPrior[];
}

export interface CVRFEpisode {
  id: string;
  episodeNumber: number;
  startDate: string;
  endDate?: string;
  decisionsCount: number;
  portfolioReturn?: number;
  sharpeRatio?: number;
  maxDrawdown?: number;
  status: 'active' | 'completed';
}

export interface CVRFDecision {
  id: string;
  timestamp: string;
  symbol: string;
  action: 'buy' | 'sell' | 'hold' | 'rebalance';
  weightBefore: number;
  weightAfter: number;
  reason: string;
  confidence: number;
  factors: Array<{
    factor: string;
    exposure: number;
    tStat: number;
    confidence: number;
    contribution: number;
  }>;
}

export interface CVRFCycleResult {
  timestamp: string;
  previousEpisodeReturn: number;
  currentEpisodeReturn: number;
  performanceDelta: number;
  decisionOverlap: number;
  insightsCount: number;
  beliefUpdatesCount: number;
  newRegime: string;
}

export interface CVRFConstraints {
  factorTargets: Record<string, { target: number; tolerance: number }>;
  maxWeight: number;
  minWeight: number;
  volatilityTarget: number;
  riskBudget: number;
}

export interface CVRFRiskAssessment {
  withinEpisode: {
    currentCVaR: number;
    threshold: number;
    triggered: boolean;
    adjustment: {
      type: 'none' | 'reduce_exposure' | 'hedge' | 'rebalance';
      magnitude: number;
      targets: string[];
    };
  };
  overEpisode: {
    conceptualInsights: any[];
    metaPrompt: {
      optimizationDirection: string;
      keyLearnings: string[];
      factorAdjustments: Record<string, number>;
      riskGuidance: string;
      timingInsights: string;
      generatedAt: string;
    };
    learningRate: number;
    beliefDeltas: Record<string, number>;
  };
  combinedRecommendation: string;
}

export interface CVRFStats {
  episodes: {
    total: number;
    totalDecisions: number;
    avgReturn: string;
    avgSharpe: string;
  };
  cvrf: {
    totalCycles: number;
    avgDecisionOverlap: string;
    avgLearningRate: string;
    totalInsights: number;
    totalBeliefUpdates: number;
  };
  beliefs: {
    version: number;
    regime: string;
    regimeConfidence: string;
    riskTolerance: string;
    volatilityTarget: string;
  };
  factors: {
    weights: Record<string, string>;
    confidences: Record<string, string>;
  };
}

export interface CVRFPagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface CVRFEpisodesResponse {
  current: CVRFEpisode | null;
  completed: CVRFEpisode[];
  totalEpisodes: number;
  pagination: CVRFPagination;
}

// API Response wrapper
export interface CVRFApiResponse<T> {
  success: boolean;
  data: T;
  meta: {
    timestamp: string;
    latencyMs: number;
    persistent: boolean;
  };
  error?: {
    code: string;
    message: string;
  };
}
