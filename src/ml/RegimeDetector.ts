/**
 * FRONTIER ALPHA - Regime Detection Engine
 *
 * Hidden Markov Model (HMM) implementation for detecting market regimes.
 * Uses rolling returns, volatility, and correlation as observation features
 * to classify market states into: bull, bear, sideways, volatile.
 *
 * The HMM uses the Baum-Welch (EM) algorithm for parameter estimation
 * and the Viterbi algorithm for optimal state sequence decoding.
 */

import type { Price } from '../types/index.js';

// ============================================================================
// TYPES
// ============================================================================

export type MarketRegime = 'bull' | 'bear' | 'sideways' | 'volatile';

export interface RegimeDetectionResult {
  regime: MarketRegime;
  confidence: number;
  probabilities: Record<MarketRegime, number>;
  timestamp: Date;
}

export interface TransitionMatrix {
  from: MarketRegime;
  to: Record<MarketRegime, number>;
}

export interface ObservationFeatures {
  rollingReturn: number;
  rollingVolatility: number;
  rollingCorrelation: number;
}

export interface RegimeDetectorConfig {
  /** Window size in days for rolling calculations */
  rollingWindow: number;
  /** Number of EM iterations for Baum-Welch */
  maxIterations: number;
  /** Convergence threshold for EM */
  convergenceThreshold: number;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: RegimeDetectorConfig = {
  rollingWindow: 21,
  maxIterations: 50,
  convergenceThreshold: 1e-6,
};

// ============================================================================
// REGIME DETECTOR CLASS
// ============================================================================

export class RegimeDetector {
  private config: RegimeDetectorConfig;

  /** State labels in canonical order */
  static readonly REGIMES: MarketRegime[] = ['bull', 'bear', 'sideways', 'volatile'];

  /** Number of hidden states */
  private readonly numStates = 4;

  /** Number of observation features */
  private readonly numFeatures = 3;

  /** Initial state probabilities π */
  private pi: number[];

  /** Transition probability matrix A[i][j] = P(state_j | state_i) */
  private transitionMatrix: number[][];

  /** Emission parameters: mean and variance per state per feature */
  private emissionMeans: number[][];
  private emissionVariances: number[][];

  constructor(config: Partial<RegimeDetectorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize with informed priors based on market regime characteristics
    this.pi = [0.35, 0.15, 0.35, 0.15]; // Markets are often bull or sideways

    // Transition matrix: regimes tend to persist (diagonal-heavy)
    this.transitionMatrix = [
      // To:  bull   bear   side   vol
      [0.80, 0.05, 0.10, 0.05], // From: bull
      [0.05, 0.75, 0.10, 0.10], // From: bear
      [0.10, 0.10, 0.70, 0.10], // From: sideways
      [0.10, 0.15, 0.15, 0.60], // From: volatile
    ];

    // Emission parameters: [rollingReturn, rollingVolatility, rollingCorrelation]
    // Mean for each state × feature
    this.emissionMeans = [
      [0.08, 0.12, 0.60],  // Bull: positive returns, low vol, high correlation
      [-0.10, 0.25, 0.70], // Bear: negative returns, high vol, high correlation
      [0.02, 0.10, 0.30],  // Sideways: near-zero returns, low vol, low correlation
      [0.00, 0.35, 0.50],  // Volatile: near-zero returns, very high vol, moderate correlation
    ];

    // Variance for each state × feature
    this.emissionVariances = [
      [0.01, 0.005, 0.04],  // Bull: tight return distribution
      [0.02, 0.010, 0.04],  // Bear: wider return distribution
      [0.005, 0.003, 0.05], // Sideways: tight distribution
      [0.03, 0.020, 0.06],  // Volatile: wide distribution
    ];
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Detect the current market regime from price data.
   *
   * @param marketData - Array of Price objects (daily OHLCV), sorted chronologically
   * @returns RegimeDetectionResult with regime label, confidence, and state probabilities
   */
  detectRegime(marketData: Price[]): RegimeDetectionResult {
    if (marketData.length < this.config.rollingWindow + 1) {
      // Not enough data — return sideways with low confidence
      return {
        regime: 'sideways',
        confidence: 0,
        probabilities: { bull: 0.25, bear: 0.25, sideways: 0.25, volatile: 0.25 },
        timestamp: marketData.length > 0 ? marketData[marketData.length - 1].timestamp : new Date(),
      };
    }

    // Extract observation sequence
    const observations = this.extractObservations(marketData);

    if (observations.length === 0) {
      return {
        regime: 'sideways',
        confidence: 0,
        probabilities: { bull: 0.25, bear: 0.25, sideways: 0.25, volatile: 0.25 },
        timestamp: marketData[marketData.length - 1].timestamp,
      };
    }

    // Train HMM parameters on the observation sequence (Baum-Welch)
    if (observations.length >= 10) {
      this.baumWelch(observations);
    }

    // Compute posterior probabilities for the last observation using forward algorithm
    const posteriors = this.forwardFilter(observations);
    const lastPosterior = posteriors[posteriors.length - 1];

    // Find most likely state
    let bestState = 0;
    let bestProb = 0;
    for (let s = 0; s < this.numStates; s++) {
      if (lastPosterior[s] > bestProb) {
        bestProb = lastPosterior[s];
        bestState = s;
      }
    }

    const probabilities: Record<MarketRegime, number> = {
      bull: lastPosterior[0],
      bear: lastPosterior[1],
      sideways: lastPosterior[2],
      volatile: lastPosterior[3],
    };

    return {
      regime: RegimeDetector.REGIMES[bestState],
      confidence: bestProb,
      probabilities,
      timestamp: marketData[marketData.length - 1].timestamp,
    };
  }

  /**
   * Get regime-to-regime transition probabilities.
   */
  getTransitionProbabilities(): TransitionMatrix[] {
    return RegimeDetector.REGIMES.map((from, i) => ({
      from,
      to: {
        bull: this.transitionMatrix[i][0],
        bear: this.transitionMatrix[i][1],
        sideways: this.transitionMatrix[i][2],
        volatile: this.transitionMatrix[i][3],
      },
    }));
  }

  /**
   * Decode the most likely sequence of regimes using the Viterbi algorithm.
   */
  decodeRegimeSequence(marketData: Price[]): MarketRegime[] {
    const observations = this.extractObservations(marketData);
    if (observations.length === 0) return [];

    const stateSequence = this.viterbi(observations);
    return stateSequence.map(s => RegimeDetector.REGIMES[s]);
  }

  // ============================================================================
  // OBSERVATION EXTRACTION
  // ============================================================================

  /**
   * Extract observation feature vectors from raw price data.
   */
  extractObservations(prices: Price[]): ObservationFeatures[] {
    const observations: ObservationFeatures[] = [];
    const window = this.config.rollingWindow;

    if (prices.length < window + 1) return [];

    const closePrices = prices.map(p => p.close);
    const returns = this.computeReturns(closePrices);

    for (let t = window; t <= returns.length; t++) {
      const windowReturns = returns.slice(t - window, t);

      const rollingReturn = this.annualizeReturn(
        windowReturns.reduce((a, b) => a + b, 0) / window
      );

      const rollingVolatility = this.annualizeVolatility(
        this.standardDeviation(windowReturns)
      );

      // Correlation between first and second half of the window
      const halfWindow = Math.floor(window / 2);
      const firstHalf = windowReturns.slice(0, halfWindow);
      const secondHalf = windowReturns.slice(halfWindow, halfWindow * 2);
      const rollingCorrelation = this.correlation(firstHalf, secondHalf);

      observations.push({ rollingReturn, rollingVolatility, rollingCorrelation });
    }

    return observations;
  }

  // ============================================================================
  // HMM: FORWARD ALGORITHM (FILTERING)
  // ============================================================================

  /**
   * Forward algorithm: compute P(state_t | obs_1:t) for all t.
   * Returns matrix of posterior state probabilities [T × numStates].
   */
  private forwardFilter(observations: ObservationFeatures[]): number[][] {
    const T = observations.length;
    const alpha: number[][] = [];

    // Initialization: α_0(s) = π(s) * b(s, obs_0)
    const alpha0: number[] = [];
    let scale0 = 0;
    for (let s = 0; s < this.numStates; s++) {
      alpha0[s] = this.pi[s] * this.emissionProbability(s, observations[0]);
      scale0 += alpha0[s];
    }
    // Normalize to prevent underflow
    if (scale0 > 0) {
      for (let s = 0; s < this.numStates; s++) alpha0[s] /= scale0;
    }
    alpha.push(alpha0);

    // Recursion: α_t(j) = [Σ_i α_{t-1}(i) * A(i,j)] * b(j, obs_t)
    for (let t = 1; t < T; t++) {
      const alphaT: number[] = [];
      let scaleT = 0;
      for (let j = 0; j < this.numStates; j++) {
        let sum = 0;
        for (let i = 0; i < this.numStates; i++) {
          sum += alpha[t - 1][i] * this.transitionMatrix[i][j];
        }
        alphaT[j] = sum * this.emissionProbability(j, observations[t]);
        scaleT += alphaT[j];
      }
      // Normalize
      if (scaleT > 0) {
        for (let j = 0; j < this.numStates; j++) alphaT[j] /= scaleT;
      }
      alpha.push(alphaT);
    }

    return alpha;
  }

  // ============================================================================
  // HMM: BACKWARD ALGORITHM
  // ============================================================================

  /**
   * Backward algorithm: compute β_t(s) ∝ P(obs_{t+1:T} | state_t = s).
   */
  private backwardFilter(observations: ObservationFeatures[]): number[][] {
    const T = observations.length;
    const beta: number[][] = new Array(T);

    // Initialization: β_T(s) = 1 for all s
    beta[T - 1] = new Array(this.numStates).fill(1);

    // Recursion: β_t(i) = Σ_j A(i,j) * b(j, obs_{t+1}) * β_{t+1}(j)
    for (let t = T - 2; t >= 0; t--) {
      const betaT: number[] = [];
      let scaleT = 0;
      for (let i = 0; i < this.numStates; i++) {
        let sum = 0;
        for (let j = 0; j < this.numStates; j++) {
          sum += this.transitionMatrix[i][j]
            * this.emissionProbability(j, observations[t + 1])
            * beta[t + 1][j];
        }
        betaT[i] = sum;
        scaleT += betaT[i];
      }
      // Normalize
      if (scaleT > 0) {
        for (let i = 0; i < this.numStates; i++) betaT[i] /= scaleT;
      }
      beta[t] = betaT;
    }

    return beta;
  }

  // ============================================================================
  // HMM: BAUM-WELCH (EM) ALGORITHM
  // ============================================================================

  /**
   * Baum-Welch algorithm: re-estimate HMM parameters from observations.
   */
  private baumWelch(observations: ObservationFeatures[]): void {
    const T = observations.length;

    for (let iter = 0; iter < this.config.maxIterations; iter++) {
      // E-step: compute forward/backward probabilities
      const alpha = this.forwardFilter(observations);
      const beta = this.backwardFilter(observations);

      // Compute γ_t(i) = P(state_t = i | observations)
      const gamma: number[][] = [];
      for (let t = 0; t < T; t++) {
        const gammaT: number[] = [];
        let sum = 0;
        for (let i = 0; i < this.numStates; i++) {
          gammaT[i] = alpha[t][i] * beta[t][i];
          sum += gammaT[i];
        }
        if (sum > 0) {
          for (let i = 0; i < this.numStates; i++) gammaT[i] /= sum;
        }
        gamma.push(gammaT);
      }

      // Compute ξ_t(i,j) = P(state_t = i, state_{t+1} = j | observations)
      const xi: number[][][] = [];
      for (let t = 0; t < T - 1; t++) {
        const xiT: number[][] = [];
        let sum = 0;
        for (let i = 0; i < this.numStates; i++) {
          xiT[i] = [];
          for (let j = 0; j < this.numStates; j++) {
            xiT[i][j] = alpha[t][i]
              * this.transitionMatrix[i][j]
              * this.emissionProbability(j, observations[t + 1])
              * beta[t + 1][j];
            sum += xiT[i][j];
          }
        }
        if (sum > 0) {
          for (let i = 0; i < this.numStates; i++) {
            for (let j = 0; j < this.numStates; j++) {
              xiT[i][j] /= sum;
            }
          }
        }
        xi.push(xiT);
      }

      // M-step: re-estimate parameters

      // Store old transition matrix for convergence check
      const oldTransition = this.transitionMatrix.map(row => [...row]);

      // Re-estimate initial distribution
      for (let i = 0; i < this.numStates; i++) {
        this.pi[i] = gamma[0][i];
      }

      // Re-estimate transition matrix
      for (let i = 0; i < this.numStates; i++) {
        let gammaSum = 0;
        for (let t = 0; t < T - 1; t++) {
          gammaSum += gamma[t][i];
        }
        for (let j = 0; j < this.numStates; j++) {
          let xiSum = 0;
          for (let t = 0; t < T - 1; t++) {
            xiSum += xi[t][i][j];
          }
          this.transitionMatrix[i][j] = gammaSum > 0 ? xiSum / gammaSum : 1 / this.numStates;
        }
      }

      // Re-estimate emission parameters (Gaussian)
      const obsVectors = observations.map(o => [o.rollingReturn, o.rollingVolatility, o.rollingCorrelation]);
      for (let s = 0; s < this.numStates; s++) {
        let gammaSum = 0;
        for (let t = 0; t < T; t++) gammaSum += gamma[t][s];

        if (gammaSum > 0) {
          for (let f = 0; f < this.numFeatures; f++) {
            // Mean
            let weightedSum = 0;
            for (let t = 0; t < T; t++) {
              weightedSum += gamma[t][s] * obsVectors[t][f];
            }
            this.emissionMeans[s][f] = weightedSum / gammaSum;

            // Variance (with floor to prevent numerical issues)
            let weightedVarSum = 0;
            for (let t = 0; t < T; t++) {
              const diff = obsVectors[t][f] - this.emissionMeans[s][f];
              weightedVarSum += gamma[t][s] * diff * diff;
            }
            this.emissionVariances[s][f] = Math.max(1e-6, weightedVarSum / gammaSum);
          }
        }
      }

      // Check convergence
      let maxDiff = 0;
      for (let i = 0; i < this.numStates; i++) {
        for (let j = 0; j < this.numStates; j++) {
          maxDiff = Math.max(maxDiff, Math.abs(this.transitionMatrix[i][j] - oldTransition[i][j]));
        }
      }
      if (maxDiff < this.config.convergenceThreshold) break;
    }
  }

  // ============================================================================
  // HMM: VITERBI ALGORITHM
  // ============================================================================

  /**
   * Viterbi algorithm: find the most likely state sequence.
   */
  private viterbi(observations: ObservationFeatures[]): number[] {
    const T = observations.length;

    // δ_t(s) = max probability of reaching state s at time t
    const delta: number[][] = [];
    // ψ_t(s) = backpointer: which state at t-1 led to max at state s at t
    const psi: number[][] = [];

    // Initialization
    const delta0: number[] = [];
    const psi0: number[] = [];
    for (let s = 0; s < this.numStates; s++) {
      // Use log probabilities to prevent underflow
      const logPi = Math.log(Math.max(this.pi[s], 1e-300));
      const logEmission = this.logEmissionProbability(s, observations[0]);
      delta0[s] = logPi + logEmission;
      psi0[s] = 0;
    }
    delta.push(delta0);
    psi.push(psi0);

    // Recursion
    for (let t = 1; t < T; t++) {
      const deltaT: number[] = [];
      const psiT: number[] = [];
      for (let j = 0; j < this.numStates; j++) {
        let bestVal = -Infinity;
        let bestState = 0;
        for (let i = 0; i < this.numStates; i++) {
          const val = delta[t - 1][i] + Math.log(Math.max(this.transitionMatrix[i][j], 1e-300));
          if (val > bestVal) {
            bestVal = val;
            bestState = i;
          }
        }
        deltaT[j] = bestVal + this.logEmissionProbability(j, observations[t]);
        psiT[j] = bestState;
      }
      delta.push(deltaT);
      psi.push(psiT);
    }

    // Termination: find best final state
    let bestFinalState = 0;
    let bestFinalVal = -Infinity;
    for (let s = 0; s < this.numStates; s++) {
      if (delta[T - 1][s] > bestFinalVal) {
        bestFinalVal = delta[T - 1][s];
        bestFinalState = s;
      }
    }

    // Backtrack
    const path: number[] = new Array(T);
    path[T - 1] = bestFinalState;
    for (let t = T - 2; t >= 0; t--) {
      path[t] = psi[t + 1][path[t + 1]];
    }

    return path;
  }

  // ============================================================================
  // EMISSION PROBABILITY
  // ============================================================================

  /**
   * Compute the emission probability P(observation | state) assuming
   * independent Gaussian features.
   */
  private emissionProbability(state: number, obs: ObservationFeatures): number {
    const features = [obs.rollingReturn, obs.rollingVolatility, obs.rollingCorrelation];
    let prob = 1;

    for (let f = 0; f < this.numFeatures; f++) {
      const mean = this.emissionMeans[state][f];
      const variance = this.emissionVariances[state][f];
      const diff = features[f] - mean;
      const gaussian = Math.exp(-0.5 * (diff * diff) / variance) / Math.sqrt(2 * Math.PI * variance);
      prob *= Math.max(gaussian, 1e-300); // Floor to prevent zero
    }

    return prob;
  }

  /**
   * Log emission probability for Viterbi (prevents underflow).
   */
  private logEmissionProbability(state: number, obs: ObservationFeatures): number {
    const features = [obs.rollingReturn, obs.rollingVolatility, obs.rollingCorrelation];
    let logProb = 0;

    for (let f = 0; f < this.numFeatures; f++) {
      const mean = this.emissionMeans[state][f];
      const variance = this.emissionVariances[state][f];
      const diff = features[f] - mean;
      logProb += -0.5 * Math.log(2 * Math.PI * variance) - 0.5 * (diff * diff) / variance;
    }

    return logProb;
  }

  // ============================================================================
  // STATISTICAL HELPERS
  // ============================================================================

  private computeReturns(prices: number[]): number[] {
    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      if (prices[i - 1] > 0) {
        returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
      } else {
        returns.push(0);
      }
    }
    return returns;
  }

  private standardDeviation(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    return Math.sqrt(variance);
  }

  private correlation(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    if (n < 2) return 0;

    const xMean = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
    const yMean = y.slice(0, n).reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denomX = 0;
    let denomY = 0;

    for (let i = 0; i < n; i++) {
      const dx = x[i] - xMean;
      const dy = y[i] - yMean;
      numerator += dx * dy;
      denomX += dx * dx;
      denomY += dy * dy;
    }

    const denom = Math.sqrt(denomX * denomY);
    return denom > 0 ? numerator / denom : 0;
  }

  private annualizeReturn(dailyReturn: number): number {
    return dailyReturn * 252;
  }

  private annualizeVolatility(dailyVol: number): number {
    return dailyVol * Math.sqrt(252);
  }
}
