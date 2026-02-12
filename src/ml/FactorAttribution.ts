/**
 * FRONTIER ALPHA - Factor Attribution Engine
 *
 * Gradient-based feature importance with Shapley-inspired attribution for
 * understanding which factors drive portfolio performance the most.
 *
 * Approach:
 * 1. Gradient-based attribution: Compute partial derivatives of portfolio return
 *    with respect to each factor exposure, measuring marginal impact.
 * 2. Shapley-inspired contribution: Evaluate each factor's contribution by
 *    measuring the difference in predicted return with vs without the factor,
 *    averaged across all subsets (approximated via leave-one-out for efficiency).
 * 3. Waterfall chart data: Rank factors by signed contribution, with cumulative
 *    running totals for visualization.
 *
 * Pure TypeScript — no external ML libraries required.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface FactorAttributionResult {
  /** Total portfolio return explained by the model */
  totalReturn: number;
  /** Portion of return explained by factors */
  factorReturn: number;
  /** Residual (idiosyncratic) return not explained by factors */
  residualReturn: number;
  /** Ranked factor contributions (descending by |contribution|) */
  factors: FactorContribution[];
  /** Waterfall chart data structure for visualization */
  waterfall: WaterfallItem[];
  /** Summary statistics */
  summary: AttributionSummary;
}

export interface FactorContribution {
  /** Factor name */
  factor: string;
  /** Factor exposure (loading) */
  exposure: number;
  /** Factor return over the period */
  factorReturn: number;
  /** Contribution = exposure × factorReturn */
  contribution: number;
  /** Gradient-based importance: |∂portfolioReturn/∂exposure| */
  gradientImportance: number;
  /** Shapley-inspired attribution value */
  shapleyValue: number;
  /** Whether this factor contributes positively or negatively */
  direction: 'positive' | 'negative';
  /** Percentage of total factor return attributed to this factor */
  percentOfTotal: number;
}

export interface WaterfallItem {
  /** Factor name (or 'start'/'residual'/'total') */
  label: string;
  /** Starting value for the bar */
  start: number;
  /** Ending value for the bar */
  end: number;
  /** Contribution (signed) */
  value: number;
  /** Whether this is a positive, negative, or total bar */
  type: 'positive' | 'negative' | 'total' | 'residual';
}

export interface AttributionSummary {
  /** Number of factors with positive contribution */
  positiveCount: number;
  /** Number of factors with negative contribution */
  negativeCount: number;
  /** Sum of all positive contributions */
  totalPositive: number;
  /** Sum of all negative contributions */
  totalNegative: number;
  /** Factor with the largest positive contribution */
  topPositive: string | null;
  /** Factor with the largest negative contribution */
  topNegative: string | null;
  /** R-squared: fraction of total return explained by factors */
  rSquared: number;
}

export interface FactorAttributionConfig {
  /** Perturbation size for numerical gradient computation */
  epsilon: number;
  /** Minimum absolute contribution to include in results */
  minContribution: number;
  /** Maximum number of factors to include in waterfall */
  maxWaterfallFactors: number;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: FactorAttributionConfig = {
  epsilon: 1e-6,
  minContribution: 0,
  maxWaterfallFactors: 15,
};

// ============================================================================
// FACTOR ATTRIBUTION CLASS
// ============================================================================

export class FactorAttribution {
  private config: FactorAttributionConfig;

  constructor(config: Partial<FactorAttributionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Calculate full factor attribution for a portfolio.
   *
   * @param portfolioReturn - Total portfolio return over the period
   * @param factorExposures - Map of factor name → exposure (loading)
   * @param factorReturns - Map of factor name → return over the period
   * @returns FactorAttributionResult with ranked contributions and waterfall data
   */
  calculateAttribution(
    portfolioReturn: number,
    factorExposures: Record<string, number>,
    factorReturns: Record<string, number>,
  ): FactorAttributionResult {
    const factors = Object.keys(factorExposures);

    if (factors.length === 0) {
      return this.emptyResult(portfolioReturn);
    }

    // Step 1: Compute direct contributions (exposure × return)
    const contributions = this.computeDirectContributions(
      factors,
      factorExposures,
      factorReturns,
    );

    // Step 2: Compute gradient-based importance
    const gradients = this.computeGradientImportance(
      factors,
      factorExposures,
      factorReturns,
    );

    // Step 3: Compute Shapley-inspired values (leave-one-out approximation)
    const shapleyValues = this.computeShapleyValues(
      factors,
      factorExposures,
      factorReturns,
      portfolioReturn,
    );

    // Step 4: Assemble ranked factor contributions
    const totalFactorReturn = contributions.reduce((sum, c) => sum + c.contribution, 0);
    const absTotalFactorReturn = Math.abs(totalFactorReturn);

    const factorContributions: FactorContribution[] = contributions.map((c) => ({
      factor: c.factor,
      exposure: c.exposure,
      factorReturn: c.factorReturn,
      contribution: c.contribution,
      gradientImportance: gradients.get(c.factor) || 0,
      shapleyValue: shapleyValues.get(c.factor) || 0,
      direction: c.contribution >= 0 ? 'positive' as const : 'negative' as const,
      percentOfTotal: absTotalFactorReturn > 0
        ? (c.contribution / absTotalFactorReturn) * 100
        : 0,
    }));

    // Sort by absolute contribution descending
    factorContributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

    // Filter by minimum contribution
    const filtered = this.config.minContribution > 0
      ? factorContributions.filter(f => Math.abs(f.contribution) >= this.config.minContribution)
      : factorContributions;

    // Step 5: Build waterfall chart data
    const residualReturn = portfolioReturn - totalFactorReturn;
    const waterfall = this.buildWaterfall(filtered, residualReturn, portfolioReturn);

    // Step 6: Compute summary
    const summary = this.computeSummary(filtered, portfolioReturn, totalFactorReturn);

    return {
      totalReturn: portfolioReturn,
      factorReturn: totalFactorReturn,
      residualReturn,
      factors: filtered,
      waterfall,
      summary,
    };
  }

  /**
   * Get the current configuration.
   */
  getConfig(): FactorAttributionConfig {
    return { ...this.config };
  }

  // ============================================================================
  // DIRECT CONTRIBUTION
  // ============================================================================

  /**
   * Compute contribution = exposure × factorReturn for each factor.
   */
  private computeDirectContributions(
    factors: string[],
    exposures: Record<string, number>,
    returns: Record<string, number>,
  ): Array<{ factor: string; exposure: number; factorReturn: number; contribution: number }> {
    return factors.map(factor => {
      const exposure = exposures[factor] || 0;
      const factorReturn = returns[factor] || 0;
      return {
        factor,
        exposure,
        factorReturn,
        contribution: exposure * factorReturn,
      };
    });
  }

  // ============================================================================
  // GRADIENT-BASED IMPORTANCE
  // ============================================================================

  /**
   * Compute numerical gradient of portfolio return w.r.t. each factor exposure.
   *
   * For a linear factor model: R_portfolio = Σ(exposure_i × return_i)
   * The gradient ∂R/∂exposure_i = return_i (exactly).
   *
   * We use numerical differentiation for generality (supports non-linear models),
   * computing central differences: (f(x+ε) - f(x-ε)) / 2ε.
   */
  computeGradientImportance(
    factors: string[],
    exposures: Record<string, number>,
    returns: Record<string, number>,
  ): Map<string, number> {
    const gradients = new Map<string, number>();
    const eps = this.config.epsilon;

    for (const factor of factors) {
      // Central difference approximation
      const exposurePlus = { ...exposures, [factor]: (exposures[factor] || 0) + eps };
      const exposureMinus = { ...exposures, [factor]: (exposures[factor] || 0) - eps };

      const returnPlus = this.computeModelReturn(exposurePlus, returns);
      const returnMinus = this.computeModelReturn(exposureMinus, returns);

      const gradient = (returnPlus - returnMinus) / (2 * eps);
      gradients.set(factor, Math.abs(gradient));
    }

    return gradients;
  }

  // ============================================================================
  // SHAPLEY-INSPIRED ATTRIBUTION
  // ============================================================================

  /**
   * Approximate Shapley values using leave-one-out method.
   *
   * True Shapley values require evaluating all 2^N subsets. For efficiency,
   * we approximate using:
   * 1. Leave-one-out: φ_i ≈ v(N) - v(N \ {i})
   * 2. Normalization to ensure Shapley values sum to total factor return.
   *
   * This captures each factor's marginal contribution to the full model.
   */
  computeShapleyValues(
    factors: string[],
    exposures: Record<string, number>,
    returns: Record<string, number>,
    _portfolioReturn: number,
  ): Map<string, number> {
    const shapley = new Map<string, number>();

    if (factors.length === 0) return shapley;

    // Full model return
    const fullReturn = this.computeModelReturn(exposures, returns);

    // Leave-one-out contributions
    const marginals: Map<string, number> = new Map();
    let marginalSum = 0;

    for (const factor of factors) {
      const withoutFactor: Record<string, number> = {};
      for (const f of factors) {
        if (f !== factor) {
          withoutFactor[f] = exposures[f] || 0;
        }
      }

      const leaveOutReturn = this.computeModelReturn(withoutFactor, returns);
      const marginal = fullReturn - leaveOutReturn;
      marginals.set(factor, marginal);
      marginalSum += marginal;
    }

    // Normalize to ensure Shapley values sum to total factor return
    const totalFactorReturn = fullReturn;
    const scale = marginalSum !== 0 ? totalFactorReturn / marginalSum : 0;

    for (const factor of factors) {
      shapley.set(factor, (marginals.get(factor) || 0) * scale);
    }

    return shapley;
  }

  // ============================================================================
  // MODEL COMPUTATION
  // ============================================================================

  /**
   * Compute portfolio return from factor model: R = Σ(exposure_i × return_i)
   */
  private computeModelReturn(
    exposures: Record<string, number>,
    returns: Record<string, number>,
  ): number {
    let total = 0;
    for (const factor of Object.keys(exposures)) {
      total += (exposures[factor] || 0) * (returns[factor] || 0);
    }
    return total;
  }

  // ============================================================================
  // WATERFALL CHART
  // ============================================================================

  /**
   * Build waterfall chart data structure.
   *
   * Format: [start=0] → [+factor1] → [+factor2] → ... → [residual] → [total]
   * Each bar shows the cumulative running total.
   */
  private buildWaterfall(
    factors: FactorContribution[],
    residualReturn: number,
    totalReturn: number,
  ): WaterfallItem[] {
    const waterfall: WaterfallItem[] = [];
    let running = 0;

    // Limit to top N factors for readability
    const topFactors = factors.slice(0, this.config.maxWaterfallFactors);

    // Factor contributions
    for (const f of topFactors) {
      const start = running;
      running += f.contribution;
      waterfall.push({
        label: f.factor,
        start,
        end: running,
        value: f.contribution,
        type: f.contribution >= 0 ? 'positive' : 'negative',
      });
    }

    // Residual (aggregate of truncated factors + idiosyncratic)
    const truncatedContribution = factors.slice(this.config.maxWaterfallFactors)
      .reduce((sum, f) => sum + f.contribution, 0);
    const totalResidual = residualReturn + truncatedContribution;

    if (Math.abs(totalResidual) > 1e-12) {
      const start = running;
      running += totalResidual;
      waterfall.push({
        label: 'residual',
        start,
        end: running,
        value: totalResidual,
        type: 'residual',
      });
    }

    // Total bar
    waterfall.push({
      label: 'total',
      start: 0,
      end: totalReturn,
      value: totalReturn,
      type: 'total',
    });

    return waterfall;
  }

  // ============================================================================
  // SUMMARY STATISTICS
  // ============================================================================

  private computeSummary(
    factors: FactorContribution[],
    portfolioReturn: number,
    totalFactorReturn: number,
  ): AttributionSummary {
    const positive = factors.filter(f => f.contribution > 0);
    const negative = factors.filter(f => f.contribution < 0);

    const totalPositive = positive.reduce((sum, f) => sum + f.contribution, 0);
    const totalNegative = negative.reduce((sum, f) => sum + f.contribution, 0);

    // R-squared: how much of total return is explained by factors
    // For a factor model, R² = factorReturn / portfolioReturn (when signs match)
    // Clamped to [0, 1]
    const rSquared = portfolioReturn !== 0
      ? Math.max(0, Math.min(1, 1 - Math.abs(portfolioReturn - totalFactorReturn) / Math.abs(portfolioReturn)))
      : (totalFactorReturn === 0 ? 1 : 0);

    return {
      positiveCount: positive.length,
      negativeCount: negative.length,
      totalPositive,
      totalNegative,
      topPositive: positive.length > 0
        ? positive.reduce((best, f) => f.contribution > best.contribution ? f : best).factor
        : null,
      topNegative: negative.length > 0
        ? negative.reduce((worst, f) => f.contribution < worst.contribution ? f : worst).factor
        : null,
      rSquared,
    };
  }

  // ============================================================================
  // EMPTY RESULT
  // ============================================================================

  private emptyResult(portfolioReturn: number): FactorAttributionResult {
    return {
      totalReturn: portfolioReturn,
      factorReturn: 0,
      residualReturn: portfolioReturn,
      factors: [],
      waterfall: [
        {
          label: 'residual',
          start: 0,
          end: portfolioReturn,
          value: portfolioReturn,
          type: 'residual',
        },
        {
          label: 'total',
          start: 0,
          end: portfolioReturn,
          value: portfolioReturn,
          type: 'total',
        },
      ],
      summary: {
        positiveCount: 0,
        negativeCount: 0,
        totalPositive: 0,
        totalNegative: 0,
        topPositive: null,
        topNegative: null,
        rSquared: 0,
      },
    };
  }
}
