/**
 * FRONTIER ALPHA - ML Training Pipeline Orchestrator
 *
 * Orchestrates training, validation, and deployment of ML models
 * (RegimeDetector + NeuralFactorModel) on historical factor data.
 *
 * Pipeline stages:
 * 1. Data splitting: walk-forward cross-validation windows
 * 2. Training: fit RegimeDetector (HMM) and NeuralFactorModel (EWMA) per window
 * 3. Validation: evaluate predictions on held-out data
 * 4. Metrics: accuracy, Sharpe improvement, max drawdown reduction
 * 5. Persistence: store model versions in Supabase
 *
 * Pure TypeScript — no external ML libraries required.
 */

import type { Price } from '../types/index.js';
import { RegimeDetector } from './RegimeDetector.js';
import type { MarketRegime, RegimeDetectorConfig } from './RegimeDetector.js';
import { NeuralFactorModel } from './NeuralFactorModel.js';
import type { NeuralFactorModelConfig } from './NeuralFactorModel.js';

// ============================================================================
// TYPES
// ============================================================================

export type ModelType = 'regime_detector' | 'neural_factor';

export type ModelStatus = 'training' | 'validated' | 'deployed' | 'archived';

export interface WalkForwardSplit {
  /** Window index (0-based) */
  windowIndex: number;
  /** Training data (in-sample) */
  trainStart: number;
  trainEnd: number;
  /** Validation data (out-of-sample) */
  validateStart: number;
  validateEnd: number;
  /** Test data (final hold-out) — only present in the last window */
  testStart?: number;
  testEnd?: number;
}

export interface ModelPerformanceMetrics {
  /** Regime prediction accuracy (fraction correct on validation set) */
  accuracy: number;
  /** Sharpe ratio improvement: (strategy Sharpe - baseline Sharpe) */
  sharpeImprovement: number;
  /** Max drawdown reduction: (baseline maxDD - strategy maxDD), positive = better */
  maxDrawdownReduction: number;
  /** Mean absolute error of momentum signal vs realized return */
  momentumMAE: number;
  /** Information coefficient: rank correlation of predictions vs realized */
  informationCoefficient: number;
  /** Number of validation observations */
  validationSamples: number;
}

export interface PipelineResult {
  /** Overall pipeline status */
  status: 'success' | 'partial' | 'failed';
  /** Per-window results */
  windowResults: WindowResult[];
  /** Aggregated metrics across all windows */
  aggregateMetrics: ModelPerformanceMetrics;
  /** Best model version (highest Sharpe improvement) */
  bestWindowIndex: number;
  /** Model version metadata for persistence */
  modelVersion: ModelVersionRecord;
  /** Total training time in milliseconds */
  trainingTimeMs: number;
}

export interface WindowResult {
  /** Window split info */
  split: WalkForwardSplit;
  /** Performance on this window's validation set */
  metrics: ModelPerformanceMetrics;
  /** Regime detected on training data */
  trainRegime: MarketRegime;
  /** Regime detected on validation data */
  validationRegime: MarketRegime;
}

export interface ModelVersionRecord {
  /** Model identifier (generated) */
  id: string;
  /** Model type */
  modelType: ModelType;
  /** Semantic version */
  version: string;
  /** Pipeline configuration used */
  config: TrainingPipelineConfig;
  /** Aggregated metrics */
  metrics: ModelPerformanceMetrics;
  /** Model status */
  status: ModelStatus;
  /** Serialized model parameters (JSON) */
  parameters: Record<string, unknown>;
  /** Training timestamp */
  trainedAt: Date;
  /** Number of data points used */
  dataPoints: number;
  /** Data date range */
  dataRange: { start: Date; end: Date };
}

export interface TrainingPipelineConfig {
  /** Number of walk-forward windows */
  numWindows: number;
  /** Fraction of data for training in each window (0-1) */
  trainRatio: number;
  /** Fraction of data for validation in each window (0-1) */
  validateRatio: number;
  /** Fraction of data reserved for final test (0-1) */
  testRatio: number;
  /** RegimeDetector configuration overrides */
  regimeConfig: Partial<RegimeDetectorConfig>;
  /** NeuralFactorModel configuration overrides */
  factorModelConfig: Partial<NeuralFactorModelConfig>;
  /** Minimum training samples per window */
  minTrainSamples: number;
  /** Risk-free rate for Sharpe calculation (annualized) */
  riskFreeRate: number;
}

export interface SupabaseModelRow {
  id: string;
  model_type: string;
  version: string;
  status: string;
  config: Record<string, unknown>;
  metrics: Record<string, unknown>;
  parameters: Record<string, unknown>;
  data_points: number;
  data_range_start: string;
  data_range_end: string;
  trained_at: string;
  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: TrainingPipelineConfig = {
  numWindows: 5,
  trainRatio: 0.6,
  validateRatio: 0.2,
  testRatio: 0.2,
  regimeConfig: {},
  factorModelConfig: {},
  minTrainSamples: 63,
  riskFreeRate: 0.05,
};

// ============================================================================
// TRAINING PIPELINE CLASS
// ============================================================================

export class TrainingPipeline {
  private config: TrainingPipelineConfig;
  private versionCounter = 0;

  constructor(config: Partial<TrainingPipelineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Validate ratios sum to ~1
    const totalRatio = this.config.trainRatio + this.config.validateRatio + this.config.testRatio;
    if (Math.abs(totalRatio - 1.0) > 0.01) {
      throw new Error(
        `Train/validate/test ratios must sum to 1.0, got ${totalRatio.toFixed(3)}`
      );
    }
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Run the full training pipeline on market data and factor returns.
   *
   * @param marketData - Array of Price objects (daily OHLCV), sorted chronologically
   * @param factorReturns - Map of factor name → array of daily returns (aligned with marketData)
   * @returns PipelineResult with per-window and aggregate metrics
   */
  runPipeline(
    marketData: Price[],
    factorReturns: Record<string, number[]>,
  ): PipelineResult {
    const startTime = Date.now();

    if (marketData.length < this.config.minTrainSamples * 2) {
      return this.insufficientDataResult(startTime);
    }

    // Step 1: Generate walk-forward splits
    const splits = this.generateSplits(marketData.length);

    // Step 2: Train and evaluate on each window
    const windowResults: WindowResult[] = [];

    for (const split of splits) {
      const trainData = marketData.slice(split.trainStart, split.trainEnd);
      const validateData = marketData.slice(split.validateStart, split.validateEnd);

      // Extract factor returns for each split
      const trainFactorReturns: Record<string, number[]> = {};
      const validateFactorReturns: Record<string, number[]> = {};
      for (const [factor, returns] of Object.entries(factorReturns)) {
        trainFactorReturns[factor] = returns.slice(split.trainStart, split.trainEnd);
        validateFactorReturns[factor] = returns.slice(split.validateStart, split.validateEnd);
      }

      const result = this.trainAndEvaluateWindow(
        split,
        trainData,
        validateData,
        trainFactorReturns,
        validateFactorReturns,
      );

      windowResults.push(result);
    }

    // Step 3: Aggregate metrics across windows
    const aggregateMetrics = this.aggregateMetrics(windowResults);

    // Step 4: Find best window
    const bestWindowIndex = this.findBestWindow(windowResults);

    // Step 5: Build model version record
    const modelVersion = this.buildModelVersion(
      marketData,
      aggregateMetrics,
      windowResults[bestWindowIndex],
    );

    return {
      status: windowResults.length > 0 ? 'success' : 'failed',
      windowResults,
      aggregateMetrics,
      bestWindowIndex,
      modelVersion,
      trainingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Generate walk-forward cross-validation splits.
   * Visible for testing.
   */
  generateSplits(dataLength: number): WalkForwardSplit[] {
    const splits: WalkForwardSplit[] = [];
    const testSize = Math.floor(dataLength * this.config.testRatio);
    const usableLength = dataLength - testSize;

    if (usableLength < this.config.minTrainSamples) return [];

    const windowSize = Math.floor(usableLength / this.config.numWindows);
    if (windowSize < this.config.minTrainSamples) return [];

    const trainFraction = this.config.trainRatio / (this.config.trainRatio + this.config.validateRatio);

    for (let w = 0; w < this.config.numWindows; w++) {
      // Expanding window: training always starts at 0, grows with each step
      const windowEnd = Math.min((w + 1) * windowSize + windowSize, usableLength);
      const windowStart = 0;
      const totalWindowSize = windowEnd - windowStart;

      const trainSize = Math.max(
        this.config.minTrainSamples,
        Math.floor(totalWindowSize * trainFraction),
      );
      const trainEnd = windowStart + trainSize;
      const validateStart = trainEnd;
      const validateEnd = windowEnd;

      if (validateEnd - validateStart < 5) continue;

      const split: WalkForwardSplit = {
        windowIndex: w,
        trainStart: windowStart,
        trainEnd,
        validateStart,
        validateEnd,
      };

      // Add test split to the last window
      if (w === this.config.numWindows - 1 && testSize > 0) {
        split.testStart = usableLength;
        split.testEnd = dataLength;
      }

      splits.push(split);
    }

    return splits;
  }

  /**
   * Convert a PipelineResult's modelVersion to a Supabase-compatible row.
   */
  toSupabaseRow(modelVersion: ModelVersionRecord): SupabaseModelRow {
    return {
      id: modelVersion.id,
      model_type: modelVersion.modelType,
      version: modelVersion.version,
      status: modelVersion.status,
      config: modelVersion.config as unknown as Record<string, unknown>,
      metrics: modelVersion.metrics as unknown as Record<string, unknown>,
      parameters: modelVersion.parameters,
      data_points: modelVersion.dataPoints,
      data_range_start: modelVersion.dataRange.start.toISOString(),
      data_range_end: modelVersion.dataRange.end.toISOString(),
      trained_at: modelVersion.trainedAt.toISOString(),
    };
  }

  /**
   * Get the pipeline configuration.
   */
  getConfig(): TrainingPipelineConfig {
    return { ...this.config };
  }

  // ============================================================================
  // WINDOW TRAINING & EVALUATION
  // ============================================================================

  /**
   * Train models on training data and evaluate on validation data.
   */
  private trainAndEvaluateWindow(
    split: WalkForwardSplit,
    trainData: Price[],
    validateData: Price[],
    trainFactorReturns: Record<string, number[]>,
    validateFactorReturns: Record<string, number[]>,
  ): WindowResult {
    // Train regime detector on training data
    const regimeDetector = new RegimeDetector(this.config.regimeConfig);
    const trainRegimeResult = regimeDetector.detectRegime(trainData);

    // Detect regime on validation data (using model trained on training data)
    const validateRegimeResult = regimeDetector.detectRegime(
      [...trainData, ...validateData],
    );

    // Train neural factor model on each factor
    const factorModel = new NeuralFactorModel(this.config.factorModelConfig);

    // Evaluate metrics
    const metrics = this.evaluateWindow(
      regimeDetector,
      factorModel,
      trainData,
      validateData,
      trainFactorReturns,
      validateFactorReturns,
    );

    return {
      split,
      metrics,
      trainRegime: trainRegimeResult.regime,
      validationRegime: validateRegimeResult.regime,
    };
  }

  /**
   * Evaluate model performance on validation data.
   */
  private evaluateWindow(
    regimeDetector: RegimeDetector,
    factorModel: NeuralFactorModel,
    trainData: Price[],
    validateData: Price[],
    trainFactorReturns: Record<string, number[]>,
    validateFactorReturns: Record<string, number[]>,
  ): ModelPerformanceMetrics {
    // 1. Regime accuracy: compare predicted regime at each validation point
    const regimeAccuracy = this.computeRegimeAccuracy(
      regimeDetector,
      trainData,
      validateData,
    );

    // 2. Momentum prediction: MAE and information coefficient
    const { mae, ic } = this.evaluateMomentumPredictions(
      factorModel,
      trainFactorReturns,
      validateFactorReturns,
    );

    // 3. Sharpe improvement and drawdown reduction
    const validateReturns = this.computeDailyReturns(validateData);

    const baselineSharpe = this.computeSharpe(validateReturns);
    const baselineMaxDD = this.computeMaxDrawdown(validateReturns);

    // Strategy: regime-adjusted returns (scale position by regime confidence)
    const strategyReturns = this.computeStrategyReturns(
      regimeDetector,
      trainData,
      validateData,
      validateReturns,
    );

    const strategySharpe = this.computeSharpe(strategyReturns);
    const strategyMaxDD = this.computeMaxDrawdown(strategyReturns);

    return {
      accuracy: regimeAccuracy,
      sharpeImprovement: strategySharpe - baselineSharpe,
      maxDrawdownReduction: baselineMaxDD - strategyMaxDD,
      momentumMAE: mae,
      informationCoefficient: ic,
      validationSamples: validateData.length,
    };
  }

  // ============================================================================
  // REGIME ACCURACY
  // ============================================================================

  /**
   * Compute regime prediction accuracy on validation data.
   *
   * Strategy: predict regime at each step using expanding window (train + validation so far),
   * compare with a "ground truth" regime based on realized returns.
   */
  private computeRegimeAccuracy(
    regimeDetector: RegimeDetector,
    trainData: Price[],
    validateData: Price[],
  ): number {
    if (validateData.length < 22) return 0;

    const combinedData = [...trainData, ...validateData];
    const regimeSequence = regimeDetector.decodeRegimeSequence(combinedData);

    if (regimeSequence.length === 0) return 0;

    // Ground truth: classify each validation period by realized returns
    const validateReturns = this.computeDailyReturns(validateData);
    let correct = 0;
    let total = 0;

    // Check regime predictions for validation period windows
    const windowSize = 21;
    const validateOffset = trainData.length;

    for (let i = 0; i + windowSize <= validateReturns.length; i += windowSize) {
      const windowReturns = validateReturns.slice(i, i + windowSize);
      const realizedRegime = this.classifyReturns(windowReturns);

      const regimeIdx = validateOffset + i;
      if (regimeIdx < regimeSequence.length) {
        if (regimeSequence[regimeIdx] === realizedRegime) {
          correct++;
        }
        total++;
      }
    }

    return total > 0 ? correct / total : 0;
  }

  /**
   * Classify realized returns into a regime label.
   */
  private classifyReturns(returns: number[]): MarketRegime {
    if (returns.length === 0) return 'sideways';

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const annualizedReturn = mean * 252;

    const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
    const annualizedVol = Math.sqrt(variance) * Math.sqrt(252);

    if (annualizedVol > 0.30) return 'volatile';
    if (annualizedReturn > 0.05) return 'bull';
    if (annualizedReturn < -0.05) return 'bear';
    return 'sideways';
  }

  // ============================================================================
  // MOMENTUM PREDICTION EVALUATION
  // ============================================================================

  /**
   * Evaluate momentum predictions: MAE and information coefficient.
   */
  private evaluateMomentumPredictions(
    factorModel: NeuralFactorModel,
    trainFactorReturns: Record<string, number[]>,
    validateFactorReturns: Record<string, number[]>,
  ): { mae: number; ic: number } {
    const factors = Object.keys(trainFactorReturns);
    if (factors.length === 0) return { mae: 0, ic: 0 };

    const predictions: number[] = [];
    const realized: number[] = [];

    for (const factor of factors) {
      const trainReturns = trainFactorReturns[factor];
      if (!trainReturns || trainReturns.length < 63) continue;

      // Predict using training data
      const prediction = factorModel.predictMomentum(trainReturns);

      // Realized: sum of validation returns (annualized)
      const validateReturns = validateFactorReturns[factor];
      if (!validateReturns || validateReturns.length === 0) continue;

      const realizedReturn = validateReturns.reduce((a, b) => a + b, 0)
        * (252 / validateReturns.length);

      predictions.push(prediction.signal);
      realized.push(realizedReturn);
    }

    if (predictions.length === 0) return { mae: 0, ic: 0 };

    // MAE
    const mae = predictions.reduce((sum, p, i) =>
      sum + Math.abs(p - realized[i]), 0
    ) / predictions.length;

    // Information coefficient (Spearman rank correlation)
    const ic = this.spearmanRankCorrelation(predictions, realized);

    return { mae, ic };
  }

  // ============================================================================
  // STRATEGY RETURNS
  // ============================================================================

  /**
   * Compute regime-adjusted strategy returns.
   *
   * Strategy: when regime is bull/sideways → full exposure,
   * when bear → reduce exposure by 50%, when volatile → reduce by 25%.
   */
  private computeStrategyReturns(
    regimeDetector: RegimeDetector,
    trainData: Price[],
    validateData: Price[],
    validateReturns: number[],
  ): number[] {
    const combinedData = [...trainData, ...validateData];
    const regimeSequence = regimeDetector.decodeRegimeSequence(combinedData);

    const strategyReturns: number[] = [];
    const validateOffset = trainData.length;

    for (let i = 0; i < validateReturns.length; i++) {
      const regimeIdx = validateOffset + i;
      let scale = 1.0;

      if (regimeIdx < regimeSequence.length) {
        const regime = regimeSequence[regimeIdx];
        if (regime === 'bear') scale = 0.5;
        else if (regime === 'volatile') scale = 0.75;
      }

      strategyReturns.push(validateReturns[i] * scale);
    }

    return strategyReturns;
  }

  // ============================================================================
  // METRIC AGGREGATION
  // ============================================================================

  /**
   * Aggregate metrics across all walk-forward windows.
   */
  private aggregateMetrics(windowResults: WindowResult[]): ModelPerformanceMetrics {
    if (windowResults.length === 0) {
      return {
        accuracy: 0,
        sharpeImprovement: 0,
        maxDrawdownReduction: 0,
        momentumMAE: 0,
        informationCoefficient: 0,
        validationSamples: 0,
      };
    }

    // Weighted average by validation sample count
    let totalSamples = 0;
    let weightedAccuracy = 0;
    let weightedSharpe = 0;
    let weightedDD = 0;
    let weightedMAE = 0;
    let weightedIC = 0;

    for (const w of windowResults) {
      const n = w.metrics.validationSamples;
      totalSamples += n;
      weightedAccuracy += w.metrics.accuracy * n;
      weightedSharpe += w.metrics.sharpeImprovement * n;
      weightedDD += w.metrics.maxDrawdownReduction * n;
      weightedMAE += w.metrics.momentumMAE * n;
      weightedIC += w.metrics.informationCoefficient * n;
    }

    return {
      accuracy: totalSamples > 0 ? weightedAccuracy / totalSamples : 0,
      sharpeImprovement: totalSamples > 0 ? weightedSharpe / totalSamples : 0,
      maxDrawdownReduction: totalSamples > 0 ? weightedDD / totalSamples : 0,
      momentumMAE: totalSamples > 0 ? weightedMAE / totalSamples : 0,
      informationCoefficient: totalSamples > 0 ? weightedIC / totalSamples : 0,
      validationSamples: totalSamples,
    };
  }

  /**
   * Find the window with the best Sharpe improvement.
   */
  private findBestWindow(windowResults: WindowResult[]): number {
    if (windowResults.length === 0) return 0;

    let bestIdx = 0;
    let bestSharpe = -Infinity;

    for (let i = 0; i < windowResults.length; i++) {
      if (windowResults[i].metrics.sharpeImprovement > bestSharpe) {
        bestSharpe = windowResults[i].metrics.sharpeImprovement;
        bestIdx = i;
      }
    }

    return bestIdx;
  }

  // ============================================================================
  // MODEL VERSION RECORD
  // ============================================================================

  /**
   * Build a model version record for Supabase persistence.
   */
  private buildModelVersion(
    marketData: Price[],
    aggregateMetrics: ModelPerformanceMetrics,
    _bestWindow: WindowResult,
  ): ModelVersionRecord {
    this.versionCounter++;

    return {
      id: this.generateId(),
      modelType: 'regime_detector',
      version: `1.0.${this.versionCounter}`,
      config: { ...this.config },
      metrics: aggregateMetrics,
      status: 'validated',
      parameters: {
        numWindows: this.config.numWindows,
        trainRatio: this.config.trainRatio,
        regimeConfig: this.config.regimeConfig,
        factorModelConfig: this.config.factorModelConfig,
      },
      trainedAt: new Date(),
      dataPoints: marketData.length,
      dataRange: {
        start: marketData[0].timestamp,
        end: marketData[marketData.length - 1].timestamp,
      },
    };
  }

  // ============================================================================
  // STATISTICAL HELPERS
  // ============================================================================

  private computeDailyReturns(prices: Price[]): number[] {
    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      if (prices[i - 1].close > 0) {
        returns.push((prices[i].close - prices[i - 1].close) / prices[i - 1].close);
      } else {
        returns.push(0);
      }
    }
    return returns;
  }

  private computeSharpe(returns: number[]): number {
    if (returns.length < 2) return 0;

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1);
    const std = Math.sqrt(variance);

    if (std === 0) return 0;

    const annualizedReturn = mean * 252;
    const annualizedVol = std * Math.sqrt(252);

    return (annualizedReturn - this.config.riskFreeRate) / annualizedVol;
  }

  private computeMaxDrawdown(returns: number[]): number {
    if (returns.length === 0) return 0;

    let peak = 1;
    let equity = 1;
    let maxDD = 0;

    for (const r of returns) {
      equity *= (1 + r);
      if (equity > peak) peak = equity;
      const drawdown = (peak - equity) / peak;
      if (drawdown > maxDD) maxDD = drawdown;
    }

    return maxDD;
  }

  /**
   * Spearman rank correlation between two arrays.
   */
  private spearmanRankCorrelation(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    if (n < 2) return 0;

    const rankX = this.computeRanks(x.slice(0, n));
    const rankY = this.computeRanks(y.slice(0, n));

    // Pearson correlation of ranks
    const meanRX = rankX.reduce((a, b) => a + b, 0) / n;
    const meanRY = rankY.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denomX = 0;
    let denomY = 0;

    for (let i = 0; i < n; i++) {
      const dx = rankX[i] - meanRX;
      const dy = rankY[i] - meanRY;
      numerator += dx * dy;
      denomX += dx * dx;
      denomY += dy * dy;
    }

    const denom = Math.sqrt(denomX * denomY);
    return denom > 0 ? numerator / denom : 0;
  }

  private computeRanks(values: number[]): number[] {
    const indexed = values.map((v, i) => ({ value: v, index: i }));
    indexed.sort((a, b) => a.value - b.value);

    const ranks = new Array<number>(values.length);
    for (let i = 0; i < indexed.length; i++) {
      ranks[indexed[i].index] = i + 1;
    }

    return ranks;
  }

  private generateId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 8);
    return `mv_${timestamp}_${random}`;
  }

  // ============================================================================
  // INSUFFICIENT DATA FALLBACK
  // ============================================================================

  private insufficientDataResult(startTime: number): PipelineResult {
    return {
      status: 'failed',
      windowResults: [],
      aggregateMetrics: {
        accuracy: 0,
        sharpeImprovement: 0,
        maxDrawdownReduction: 0,
        momentumMAE: 0,
        informationCoefficient: 0,
        validationSamples: 0,
      },
      bestWindowIndex: 0,
      modelVersion: {
        id: this.generateId(),
        modelType: 'regime_detector',
        version: '0.0.0',
        config: this.config,
        metrics: {
          accuracy: 0,
          sharpeImprovement: 0,
          maxDrawdownReduction: 0,
          momentumMAE: 0,
          informationCoefficient: 0,
          validationSamples: 0,
        },
        status: 'archived',
        parameters: {},
        trainedAt: new Date(),
        dataPoints: 0,
        dataRange: { start: new Date(), end: new Date() },
      },
      trainingTimeMs: Date.now() - startTime,
    };
  }
}
