export interface Position {
  symbol: string;
  shares: number;
  weight: number;
  costBasis: number;
  currentPrice: number;
  unrealizedPnL: number;
}

export interface Portfolio {
  id: string;
  name: string;
  positions: Position[];
  cash: number;
  totalValue: number;
  currency: string;
}

export interface Quote {
  symbol: string;
  timestamp: number | Date;
  bid: number;
  ask: number;
  last: number;
  volume: number;
  change: number;
  changePercent: number;
}

export interface FactorExposure {
  factor: string;
  exposure: number;
  tStat: number;
  confidence: number;
  contribution: number;
}

export interface RiskMetrics {
  sharpeRatio: number;
  volatility: number;
  maxDrawdown: number;
  beta: number;
  var95: number;
  cvar95: number;
}

export interface RiskAlert {
  id: string;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  message: string;
  timestamp: Date;
  acknowledged: boolean;
}

export interface EarningsEvent {
  symbol: string;
  reportDate: Date;
  expectedMove: number;
  recommendation: 'hold' | 'reduce' | 'hedge';
  explanation: string;
}

export interface EarningsImpactForecast {
  symbol: string;
  reportDate: Date;
  expectedMove: number;
  expectedDirection: 'up' | 'down' | 'neutral';
  confidence: number;
  historicalAvgMove?: number;
  beatRate?: number;
  recommendation: 'hold' | 'reduce' | 'hedge' | 'add';
  explanation: string;
  factors?: {
    historicalPattern: string;
    recentTrend: string;
    riskAssessment: string;
  };
}

export interface HistoricalEarningsReaction {
  reportDate: string;
  fiscalQuarter: string;
  estimatedEps: number;
  actualEps: number | null;
  surprise: number | null;
  priceMove: number | null;
  postEarningsDrift: number | null;
  outcome: 'beat' | 'miss' | 'inline' | 'unknown';
}

export interface OptimizationConfig {
  objective: 'max_sharpe' | 'min_volatility' | 'risk_parity' | 'target_volatility';
  riskFreeRate: number;
  targetVolatility?: number;
  constraints?: {
    maxWeight?: number;
    targetVolatility?: number;
  };
}

export interface OptimizationResult {
  weights: Record<string, number>;
  expectedReturn: number;
  expectedVolatility: number;
  sharpeRatio: number;
  factorExposures: FactorExposure[];
  // The page may render results before the explainer LLM completes; keep
  // explanation optional so the result type doesn't lock the page render
  // path behind a slow upstream.
  explanation?: string;
  // Server-side optimizer always emits monteCarlo. The Optimize page
  // synthesizes a fallback when the chart wants confidenceInterval-style
  // shape from a min-fields response (see MonteCarloChart). Extended fields
  // are optional on the canonical type so both consumers type-check.
  monteCarlo?: {
    var95: number;
    cvar95: number;
    medianReturn: number;
    probPositive: number;
    simulations?: number[];
    confidenceInterval?: {
      p5: number;
      p25: number;
      p50: number;
      p75: number;
      p95: number;
    };
  };
}

export interface CognitiveExplanation {
  action: 'buy' | 'sell' | 'hold' | 'rebalance';
  symbol: string;
  weightChange: number;
  narrative: string;
  confidence: number;
  timestamp: Date;
}

// Portfolio Sharing Types
export interface PortfolioShare {
  id: string;
  portfolioId: string;
  portfolioName: string;
  shareUrl: string;
  permissions: 'view' | 'edit';
  sharedWithEmail: string | null;
  createdAt: string;
  expiresAt: string | null;
  accessCount: number;
  lastAccessed: string | null;
  isExpired: boolean;
}

export interface CreateShareRequest {
  portfolioId: string;
  permissions: 'view' | 'edit';
  expiresIn?: number;
  shareWithEmail?: string;
}

export interface CreateShareResponse {
  id: string;
  shareToken: string;
  shareUrl: string;
  permissions: 'view' | 'edit';
  expiresAt: string | null;
  sharedWithEmail: string | null;
  createdAt: string;
}

export interface SharedPortfolioData {
  portfolio: {
    id: string;
    name: string;
    ownerName: string;
    positions: Position[];
    cash: number;
    totalValue: number;
    currency: string;
    benchmark: string;
  };
  share: {
    permissions: 'view' | 'edit';
    expiresAt: string | null;
  };
  factorExposures: FactorExposure[];
  metrics: {
    positionCount: number;
    totalPnL: number;
    topHolding: Position | null;
  };
}
