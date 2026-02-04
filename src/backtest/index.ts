export { Backtester, backtester } from './Backtester.js';
export type {
  BacktestConfig,
  BacktestResult,
  PerformanceMetrics,
  FactorAttribution,
  Trade
} from './Backtester.js';

export { HistoricalDataLoader } from './HistoricalDataLoader.js';
export type {
  OHLCV,
  FactorReturns,
  SymbolData,
  BacktestDataSet,
} from './HistoricalDataLoader.js';

export { WalkForwardEngine } from './WalkForwardEngine.js';
export type {
  WalkForwardConfig,
  WalkForwardWindow,
  WalkForwardResult,
  OptimizationObjective,
  StrategyConfig,
} from './WalkForwardEngine.js';
