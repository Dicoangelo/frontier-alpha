/**
 * FRONTIER ALPHA - Neural Factor Model
 *
 * LSTM-inspired momentum predictor using exponential weighted moving averages (EWMA)
 * as a lightweight alternative to recurrent neural networks. Extracts sliding window
 * features from factor time series and produces 1-month forward momentum signals
 * with confidence intervals.
 *
 * Architecture:
 * 1. Sliding window feature extraction (returns, volatility, trend strength, mean reversion)
 * 2. Multi-scale EWMA layers that mimic LSTM forget/remember gates
 * 3. Signal combination via weighted ensemble of EWMA scales
 * 4. Confidence estimation from signal agreement across scales
 *
 * Pure TypeScript — no TensorFlow.js or external ML libraries required.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface MomentumPrediction {
  /** Predicted 1-month forward return (annualized) */
  signal: number;
  /** Prediction confidence in [0, 1] */
  confidence: number;
  /** Upper bound of 95% confidence interval */
  upperBound: number;
  /** Lower bound of 95% confidence interval */
  lowerBound: number;
  /** Individual EWMA scale signals for transparency */
  scaleSignals: ScaleSignal[];
  /** Timestamp of prediction */
  timestamp: Date;
}

export interface ScaleSignal {
  /** EWMA half-life in days */
  halfLife: number;
  /** Signal from this scale */
  signal: number;
  /** Weight assigned to this scale */
  weight: number;
}

export interface FeatureVector {
  /** Windowed return */
  return_: number;
  /** Windowed volatility */
  volatility: number;
  /** Trend strength (return / volatility) — analogous to information ratio */
  trendStrength: number;
  /** Mean reversion signal (z-score of current vs long-term mean) */
  meanReversion: number;
  /** Acceleration (change in momentum) */
  acceleration: number;
}

export interface NeuralFactorModelConfig {
  /** Sliding window size for feature extraction (days) */
  windowSize: number;
  /** EWMA half-lives (days) — each represents a "layer" */
  ewmaHalfLives: number[];
  /** Forward prediction horizon (trading days) */
  predictionHorizon: number;
  /** Minimum data points required for prediction */
  minDataPoints: number;
  /** Z-score for confidence interval (1.96 = 95%) */
  confidenceZ: number;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: NeuralFactorModelConfig = {
  windowSize: 21,
  ewmaHalfLives: [5, 10, 21, 63],
  predictionHorizon: 21,
  minDataPoints: 63,
  confidenceZ: 1.96,
};

// ============================================================================
// NEURAL FACTOR MODEL CLASS
// ============================================================================

export class NeuralFactorModel {
  private config: NeuralFactorModelConfig;
  /** Decay factors derived from half-lives: α = 1 - exp(-ln2 / halfLife) */
  private decayFactors: number[];

  constructor(config: Partial<NeuralFactorModelConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.decayFactors = this.config.ewmaHalfLives.map(
      hl => 1 - Math.exp(-Math.LN2 / hl)
    );
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Predict 1-month forward momentum signal from factor return history.
   *
   * @param factorHistory - Array of daily factor returns (most recent last)
   * @returns MomentumPrediction with signal, confidence, and intervals
   */
  predictMomentum(factorHistory: number[]): MomentumPrediction {
    if (factorHistory.length < this.config.minDataPoints) {
      return this.insufficientDataResult(factorHistory);
    }

    // Step 1: Extract sliding window features
    const features = this.extractFeatures(factorHistory);

    // Step 2: Compute EWMA signals at each scale
    const scaleSignals = this.computeEWMASignals(features);

    // Step 3: Combine signals via confidence-weighted ensemble
    const { signal, confidence } = this.combineSignals(scaleSignals);

    // Step 4: Estimate confidence intervals
    const recentVol = this.computeVolatility(
      factorHistory.slice(-this.config.windowSize)
    );
    const annualizedVol = recentVol * Math.sqrt(252);
    const horizonVol = annualizedVol * Math.sqrt(this.config.predictionHorizon / 252);

    const intervalWidth = this.config.confidenceZ * horizonVol;

    return {
      signal,
      confidence,
      upperBound: signal + intervalWidth,
      lowerBound: signal - intervalWidth,
      scaleSignals,
      timestamp: new Date(),
    };
  }

  /**
   * Extract feature vectors from factor return history.
   * Visible for testing.
   */
  extractFeatures(factorHistory: number[]): FeatureVector[] {
    const features: FeatureVector[] = [];
    const window = this.config.windowSize;

    if (factorHistory.length < window + 1) return [];

    // Compute long-term mean for mean-reversion signal
    const longTermMean = factorHistory.reduce((a, b) => a + b, 0) / factorHistory.length;
    const longTermStd = this.computeStd(factorHistory);

    for (let t = window; t < factorHistory.length; t++) {
      const windowData = factorHistory.slice(t - window, t);
      const prevWindow = t >= window + window
        ? factorHistory.slice(t - 2 * window, t - window)
        : factorHistory.slice(0, t - window);

      const return_ = windowData.reduce((a, b) => a + b, 0);
      const volatility = this.computeVolatility(windowData);

      // Trend strength: information-ratio-like measure
      const trendStrength = volatility > 0 ? return_ / (volatility * Math.sqrt(window)) : 0;

      // Mean reversion: z-score of recent mean vs long-term mean
      const recentMean = return_ / window;
      const meanReversion = longTermStd > 0
        ? -(recentMean - longTermMean) / longTermStd
        : 0;

      // Acceleration: change in momentum between windows
      const prevReturn = prevWindow.length > 0
        ? prevWindow.reduce((a, b) => a + b, 0)
        : 0;
      const acceleration = return_ - prevReturn;

      features.push({
        return_,
        volatility,
        trendStrength,
        meanReversion,
        acceleration,
      });
    }

    return features;
  }

  /**
   * Get the model configuration.
   */
  getConfig(): NeuralFactorModelConfig {
    return { ...this.config };
  }

  // ============================================================================
  // EWMA SIGNAL COMPUTATION
  // ============================================================================

  /**
   * Compute EWMA-smoothed momentum signals at each scale.
   *
   * Each EWMA scale acts like an LSTM cell with a fixed forget gate:
   * - Short half-life → fast response (like a low forget gate bias)
   * - Long half-life → slow response (like a high forget gate bias)
   *
   * The "cell state" is the EWMA of trend strength features,
   * and the "output" is the final smoothed value.
   */
  private computeEWMASignals(features: FeatureVector[]): ScaleSignal[] {
    if (features.length === 0) return [];

    const signals: ScaleSignal[] = [];

    for (let s = 0; s < this.decayFactors.length; s++) {
      const alpha = this.decayFactors[s];
      const halfLife = this.config.ewmaHalfLives[s];

      // EWMA of trend strength (primary signal)
      let ewmaTrend = features[0].trendStrength;
      // EWMA of acceleration (secondary signal for regime change detection)
      let ewmaAccel = features[0].acceleration;

      for (let t = 1; t < features.length; t++) {
        ewmaTrend = alpha * features[t].trendStrength + (1 - alpha) * ewmaTrend;
        ewmaAccel = alpha * features[t].acceleration + (1 - alpha) * ewmaAccel;
      }

      // Combine trend and acceleration signals (80/20 blend)
      const rawSignal = 0.8 * ewmaTrend + 0.2 * this.normalizeAcceleration(ewmaAccel, features);

      // Weight assignment: shorter scales get higher weight (more recent data matters more)
      // but also factor in agreement — handled in combineSignals
      const weight = 1 / Math.sqrt(halfLife);

      signals.push({
        halfLife,
        signal: rawSignal,
        weight,
      });
    }

    // Normalize weights to sum to 1
    const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0);
    if (totalWeight > 0) {
      for (const s of signals) {
        s.weight /= totalWeight;
      }
    }

    return signals;
  }

  /**
   * Normalize acceleration signal to be comparable to trend strength.
   */
  private normalizeAcceleration(ewmaAccel: number, features: FeatureVector[]): number {
    const accelValues = features.map(f => f.acceleration);
    const accelStd = this.computeStd(accelValues);
    return accelStd > 0 ? ewmaAccel / accelStd : 0;
  }

  // ============================================================================
  // SIGNAL COMBINATION
  // ============================================================================

  /**
   * Combine multi-scale signals into a single momentum prediction.
   *
   * Confidence is based on signal agreement across scales:
   * - If all scales agree on direction → high confidence
   * - If scales disagree → low confidence (conflicting signals)
   */
  private combineSignals(scaleSignals: ScaleSignal[]): { signal: number; confidence: number } {
    if (scaleSignals.length === 0) return { signal: 0, confidence: 0 };

    // Weighted average signal
    let signal = 0;
    for (const s of scaleSignals) {
      signal += s.weight * s.signal;
    }

    // Confidence from signal agreement
    // 1. Direction agreement: what fraction of scales agree on sign?
    const positiveCount = scaleSignals.filter(s => s.signal > 0).length;
    const negativeCount = scaleSignals.filter(s => s.signal < 0).length;
    const directionAgreement = Math.max(positiveCount, negativeCount) / scaleSignals.length;

    // 2. Magnitude agreement: low dispersion across scales → higher confidence
    const signalValues = scaleSignals.map(s => s.signal);
    const signalMean = signalValues.reduce((a, b) => a + b, 0) / signalValues.length;
    const signalStd = this.computeStd(signalValues);
    const magnitudeAgreement = Math.abs(signalMean) > 0
      ? Math.max(0, 1 - signalStd / Math.abs(signalMean))
      : 0;

    // 3. Signal strength: stronger absolute signal → higher confidence
    const signalStrength = Math.min(1, Math.abs(signal) / 2);

    // Weighted combination: direction 50%, magnitude 30%, strength 20%
    const confidence = Math.max(0, Math.min(1,
      0.5 * directionAgreement + 0.3 * magnitudeAgreement + 0.2 * signalStrength
    ));

    return { signal, confidence };
  }

  // ============================================================================
  // INSUFFICIENT DATA FALLBACK
  // ============================================================================

  private insufficientDataResult(factorHistory: number[]): MomentumPrediction {
    return {
      signal: 0,
      confidence: 0,
      upperBound: 0,
      lowerBound: 0,
      scaleSignals: [],
      timestamp: factorHistory.length > 0 ? new Date() : new Date(),
    };
  }

  // ============================================================================
  // STATISTICAL HELPERS
  // ============================================================================

  private computeVolatility(values: number[]): number {
    if (values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
    return Math.sqrt(variance);
  }

  private computeStd(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    return Math.sqrt(variance);
  }
}
