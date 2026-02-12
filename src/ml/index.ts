export { RegimeDetector } from './RegimeDetector.js';
export type {
  MarketRegime,
  RegimeDetectionResult,
  TransitionMatrix,
  ObservationFeatures,
  RegimeDetectorConfig,
} from './RegimeDetector.js';

export { NeuralFactorModel } from './NeuralFactorModel.js';
export type {
  MomentumPrediction,
  ScaleSignal,
  FeatureVector,
  NeuralFactorModelConfig,
} from './NeuralFactorModel.js';

export { FactorAttribution } from './FactorAttribution.js';
export type {
  FactorAttributionResult,
  FactorContribution,
  WaterfallItem,
  AttributionSummary,
  FactorAttributionConfig,
} from './FactorAttribution.js';

export { TrainingPipeline } from './TrainingPipeline.js';
export type {
  ModelType,
  ModelStatus,
  WalkForwardSplit,
  ModelPerformanceMetrics,
  PipelineResult,
  WindowResult,
  ModelVersionRecord,
  TrainingPipelineConfig,
  SupabaseModelRow,
} from './TrainingPipeline.js';
