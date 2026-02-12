/**
 * Options Module - Implied Volatility, Options Chain Data, Greeks, Strategy Builder, and Options Analytics
 *
 * Provides options chain analysis, IV calculations, Greeks computation,
 * strategy building and analysis, and earnings volatility context.
 */

export {
  ImpliedVolatilityService,
  ivService,
  type IVData,
  type EarningsIVContext,
  type OptionData,
  type OptionsChain,
} from './ImpliedVolatility.js';

export {
  OptionsDataProvider,
  optionsDataProvider,
  type OptionsDataProviderConfig,
} from './OptionsDataProvider.js';

export {
  GreeksCalculator,
  greeksCalculator,
  normalCDF,
  normalPDF,
  type GreeksResult,
  type ContractGreeks,
  type PortfolioGreeks,
  type PortfolioGreeksPosition,
  type HeatmapCell,
  type GreeksHeatmap,
  type GreeksCalculatorConfig,
  type OptionPosition,
} from './GreeksCalculator.js';

export {
  StrategyBuilder,
  strategyBuilder,
  type StrategyType,
  type MarketOutlook,
  type StrategyLeg,
  type StrategyDefinition,
  type PnLPoint,
  type StrategyAnalysis,
  type StrategyRecommendation,
  type StrategyBuilderConfig,
} from './StrategyBuilder.js';
