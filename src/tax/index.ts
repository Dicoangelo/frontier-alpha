export {
  TaxLotTracker,
  type CostBasisMethod,
  type TaxEventType,
  type TaxLot,
  type TaxEvent,
  type SaleResult,
  type UnrealizedGain,
  type TaxSummary,
  type TaxLotTrackerConfig,
} from './TaxLotTracker.js';

export {
  HarvestingScanner,
  type HarvestingOpportunity,
  type ReplacementSecurity,
  type HarvestingLot,
  type HarvestingScanResult,
  type HarvestingScannerConfig,
} from './HarvestingScanner.js';

export {
  WashSaleDetector,
  type WashSaleViolation,
  type WashSaleScanResult,
  type TradeWashSaleWarning,
  type AdjustedCostBasisResult,
  type WashSaleDetectorConfig,
} from './WashSaleDetector.js';

export {
  TaxEfficientRebalancer,
  type TargetAllocation,
  type RebalanceTrade,
  type LotSelection,
  type RebalanceResult,
  type TaxEfficientRebalancerConfig,
} from './TaxEfficientRebalancer.js';

export {
  TaxReportGenerator,
  type Form8949Row,
  type AnnualTaxReport,
  type TaxReportGeneratorConfig,
} from './TaxReportGenerator.js';
