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

export type IntegrationStatus = 'live' | 'degraded' | 'offline';

/**
 * Standardized result shape for every integration probe (US-004, P1).
 *
 * Every probe — Polygon, Alpha Vantage, Stripe, Resend, Supabase, Connect Alpaca,
 * weekly digest cron, polygonWebSocket — returns this exact shape. Alerting,
 * runbooks, and downstream tooling read identical fields across all entries.
 *
 * Required fields:
 * - `status`: `'live'` (probe succeeded) | `'degraded'` (probe ran but flagged
 *   sub-optimal — e.g. by-design fallback, rate-limited but recoverable) |
 *   `'offline'` (probe failed or unreachable).
 * - `latencyMs`: wall-clock latency of the probe call in milliseconds. `0` when
 *   no upstream call was made (env-gated `degraded` and code-only entries).
 * - `lastError`: last upstream error message string, or `null` on success.
 * - `lastSuccessAt`: ISO8601 timestamp of last `'live'` probe, or `null`.
 * - `ttlSeconds`: how long this probe result is cached in process memory.
 *
 * Optional context fields (carried over from v1.2.x):
 * - `via`: env var name(s) gating the integration (no secret values).
 * - `provider`: the underlying provider name (e.g. `'deepseek'`, `'resend'`).
 * - `mode`: operational mode (e.g. `'paper'`, `'live'`, `'rest'`, `'websocket'`).
 * - `reason`: when `degraded`/`offline`, why.
 * - `fallback`: when `degraded`, what the system serves instead.
 * - `impact`: when `degraded`/`offline`, what user-visible behavior fails.
 */
export interface IntegrationHealthEntry {
  status: IntegrationStatus;
  latencyMs: number;
  lastError: string | null;
  lastSuccessAt: string | null;
  ttlSeconds: number;
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
    offline: number;
    total: number;
  };
}
