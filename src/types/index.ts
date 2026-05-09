/**
 * FRONTIER ALPHA - Type Definitions
 * AI-Powered Cognitive Factor Intelligence Platform
 */

export interface Asset {
  symbol: string;
  name: string;
  sector: string;
  exchange: string;
  currency: string;
}

export interface Price {
  symbol: string;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Quote {
  symbol: string;
  timestamp: Date;
  bid: number;
  ask: number;
  last: number;
  change: number;
  changePercent: number;
}

export type FactorCategory = 'style' | 'macro' | 'sector' | 'volatility' | 'sentiment' | 'quality';

export interface Factor {
  name: string;
  category: FactorCategory;
  description: string;
  halfLife: number;
}

export interface FactorExposure {
  factor: string;
  exposure: number;
  tStat: number;
  confidence: number;
  contribution: number;
}

export interface Position {
  id: string;
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

export interface PortfolioMetrics {
  totalReturn: number;
  annualizedReturn: number;
  volatility: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  beta: number;
  alpha: number;
}

export type OptimizationObjective = 
  | 'max_sharpe' 
  | 'min_volatility' 
  | 'risk_parity' 
  | 'max_return' 
  | 'target_volatility';

export interface OptimizationConfig {
  objective: OptimizationObjective;
  riskFreeRate: number;
  targetVolatility?: number;
  maxTurnover?: number;
}

export interface MonteCarloResult {
  simulations: number;
  var95: number;
  cvar95: number;
  medianReturn: number;
  probPositive: number;
}

export interface OptimizationResult {
  weights: Map<string, number>;
  expectedReturn: number;
  expectedVolatility: number;
  sharpeRatio: number;
  factorExposures: FactorExposure[];
  monteCarlo: MonteCarloResult;
  explanation: string;
}

export type SentimentLabel = 'positive' | 'neutral' | 'negative';

export interface SentimentScore {
  label: SentimentLabel;
  confidence: number;
  scores: { positive: number; neutral: number; negative: number };
}

export interface EarningsEvent {
  symbol: string;
  reportDate: Date;
  fiscalQuarter: string;
  estimatedEPS?: number;
  epsEstimate?: number;
  revenueEstimate?: number;
  actualEPS?: number;
}

export interface EarningsReaction {
  symbol: string;
  reportDate: Date;
  surprise?: number;
  priceChange?: number;
  priceChangePre?: number;
  priceChangePost: number;
  volumeChange?: number;
  volumeRatio?: number;
  impliedMove?: number;
  actualMove: number;
}

export interface EarningsImpactForecast {
  symbol: string;
  reportDate: Date;
  expectedMove: number;
  expectedDirection: 'up' | 'down' | 'neutral';
  confidence: number;
  historicalAvgMove: number;
  recommendation: 'hold' | 'reduce' | 'hedge';
  explanation: string;
}

export interface CognitiveExplanation {
  action: 'buy' | 'sell' | 'hold' | 'rebalance';
  symbol: string;
  weightChange: number;
  narrative: string;
  confidence: number;
  timestamp: Date;
}

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    /** Per-symbol fetch failures (factors handler — see US-001 in v1.2.6 PRD). */
    skipped?: string[];
  };
  meta?: {
    timestamp: Date;
    requestId: string;
    latencyMs: number;
    /** Per-symbol fetch failures when partial result is returned. */
    skipped?: string[];
  };
}

// ============================================================================
// INTEGRATION HEALTH (ops diagnostic — see /api/v1/health/integrations)
// ============================================================================

export type IntegrationStatus = 'live' | 'degraded';

/**
 * Wiring status of a single external integration.
 *
 * - `status: 'live'` → required env var(s) present (presence-only check,
 *   no network calls).
 * - `status: 'degraded'` → env not set; `reason` always populated, plus
 *   `fallback` (when traffic still serves) or `impact` (when it does not).
 *
 * `via` lists the env var name(s) that gate the integration so ops can
 * trace the wiring without exposing actual secret values.
 */
export interface IntegrationHealthEntry {
  status: IntegrationStatus;
  via?: string | null;
  mode?: string;
  provider?: string;
  reason?: string;
  fallback?: string;
  impact?: string;
}

export interface IntegrationsHealthResponse {
  checkedAt: string;
  integrations: Record<string, IntegrationHealthEntry>;
  summary: {
    live: number;
    degraded: number;
    total: number;
  };
}
