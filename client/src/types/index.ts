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
  timestamp: Date;
  bid: number;
  ask: number;
  last: number;
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

export interface OptimizationConfig {
  objective: 'max_sharpe' | 'min_volatility' | 'risk_parity';
  riskFreeRate: number;
  targetVolatility?: number;
}

export interface OptimizationResult {
  weights: Record<string, number>;
  expectedReturn: number;
  expectedVolatility: number;
  sharpeRatio: number;
  factorExposures: FactorExposure[];
  explanation: string;
  monteCarlo: {
    var95: number;
    cvar95: number;
    medianReturn: number;
    probPositive: number;
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
