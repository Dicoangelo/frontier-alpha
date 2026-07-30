/**
 * Factor Drift Monitor
 * Detects when portfolio factor exposures drift from user-defined targets
 */

interface FactorTarget {
  factor: string;
  target: number;
  tolerance: number; // Percentage deviation allowed (0.1 = 10%)
}

interface FactorExposure {
  factor: string;
  exposure: number;
  tStat?: number;
  contribution?: number;
}

interface DriftAlert {
  id: string;
  type: 'factor_drift';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  message: string;
  timestamp: Date;
  acknowledged: boolean;
  factor: string;
  currentExposure: number;
  targetExposure: number;
  driftPct: number;
  suggestedAction: string;
}

interface DriftResult {
  factor: string;
  current: number;
  target: number;
  drift: number; // Absolute drift
  driftPct: number; // Percentage drift from target
  withinTolerance: boolean;
}

export class FactorDriftMonitor {
  private targets: Map<string, FactorTarget> = new Map();
  private alertHistory: DriftAlert[] = [];
  private lastCheckTime: Date | null = null;

  // Default factor targets for common strategies
  static readonly DEFAULT_TARGETS: Record<string, FactorTarget[]> = {
    balanced: [
      { factor: 'momentum_12m', target: 0, tolerance: 0.3 },
      { factor: 'value', target: 0, tolerance: 0.3 },
      { factor: 'low_vol', target: 0, tolerance: 0.3 },
      { factor: 'roe', target: 0.2, tolerance: 0.25 },
      { factor: 'market', target: 1.0, tolerance: 0.15 },
    ],
    momentum: [
      { factor: 'momentum_12m', target: 0.5, tolerance: 0.2 },
      { factor: 'momentum_6m', target: 0.4, tolerance: 0.2 },
      { factor: 'low_vol', target: -0.2, tolerance: 0.3 },
    ],
    quality: [
      { factor: 'roe', target: 0.6, tolerance: 0.2 },
      { factor: 'roa', target: 0.4, tolerance: 0.25 },
      { factor: 'gross_margin', target: 0.3, tolerance: 0.25 },
      { factor: 'debt_to_equity', target: -0.3, tolerance: 0.3 },
    ],
    lowVol: [
      { factor: 'low_vol', target: 0.6, tolerance: 0.15 },
      { factor: 'volatility', target: -0.4, tolerance: 0.2 },
      { factor: 'market', target: 0.7, tolerance: 0.15 },
    ],
  };

  /**
   * Set factor targets from a predefined strategy or custom targets
   */
  setTargets(targets: FactorTarget[] | string): void {
    this.targets.clear();

    const targetList =
      typeof targets === 'string'
        ? FactorDriftMonitor.DEFAULT_TARGETS[targets] || []
        : targets;

    for (const target of targetList) {
      this.targets.set(target.factor, target);
    }
  }

  /**
   * Update a single factor target
   */
  updateTarget(factor: string, target: number, tolerance: number = 0.25): void {
    this.targets.set(factor, { factor, target, tolerance });
  }

  /**
   * Remove a factor target
   */
  removeTarget(factor: string): void {
    this.targets.delete(factor);
  }

  /**
   * Get all current targets
   */
  getTargets(): FactorTarget[] {
    return Array.from(this.targets.values());
  }

  /**
   * Check for factor drift given current exposures
   */
  checkDrift(currentExposures: FactorExposure[]): DriftResult[] {
    this.lastCheckTime = new Date();
    const results: DriftResult[] = [];

    const exposureMap = new Map<string, number>();
    for (const exp of currentExposures) {
      exposureMap.set(exp.factor, exp.exposure);
    }

    for (const [factor, target] of this.targets) {
      const current = exposureMap.get(factor) ?? 0;
      const drift = current - target.target;
      const driftPct =
        target.target !== 0 ? Math.abs(drift / target.target) : Math.abs(drift);

      results.push({
        factor,
        current,
        target: target.target,
        drift,
        driftPct,
        withinTolerance: driftPct <= target.tolerance,
      });
    }

    return results;
  }

  /**
   * Generate alerts for factors that have drifted beyond tolerance
   */
  generateAlerts(currentExposures: FactorExposure[]): DriftAlert[] {
    const driftResults = this.checkDrift(currentExposures);
    const alerts: DriftAlert[] = [];

    for (const result of driftResults) {
      if (result.withinTolerance) continue;

      const severity = this.calculateSeverity(result.driftPct);
      const suggestedAction = this.suggestAction(result);

      const alert: DriftAlert = {
        id: `drift-${result.factor}-${Date.now()}`,
        type: 'factor_drift',
        severity,
        title: `${this.formatFactorName(result.factor)} Drift Alert`,
        message: this.formatMessage(result),
        timestamp: new Date(),
        acknowledged: false,
        factor: result.factor,
        currentExposure: result.current,
        targetExposure: result.target,
        driftPct: result.driftPct,
        suggestedAction,
      };

      alerts.push(alert);
      this.alertHistory.push(alert);
    }

    // Keep only last 100 alerts in history
    if (this.alertHistory.length > 100) {
      this.alertHistory = this.alertHistory.slice(-100);
    }

    return alerts;
  }

  /**
   * Get drift summary for all tracked factors
   */
  getDriftSummary(currentExposures: FactorExposure[]): {
    totalFactorsTracked: number;
    factorsWithinTolerance: number;
    factorsOutsideTolerance: number;
    worstDrift: DriftResult | null;
    overallHealth: 'healthy' | 'warning' | 'critical';
    drifts: DriftResult[];
  } {
    const drifts = this.checkDrift(currentExposures);
    const withinTolerance = drifts.filter((d) => d.withinTolerance);
    const outsideTolerance = drifts.filter((d) => !d.withinTolerance);
    const worstDrift =
      drifts.length > 0
        ? drifts.reduce((worst, d) =>
            d.driftPct > worst.driftPct ? d : worst
          )
        : null;

    let overallHealth: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (outsideTolerance.length > 0) {
      overallHealth = outsideTolerance.some((d) => d.driftPct > 0.5)
        ? 'critical'
        : 'warning';
    }

    return {
      totalFactorsTracked: drifts.length,
      factorsWithinTolerance: withinTolerance.length,
      factorsOutsideTolerance: outsideTolerance.length,
      worstDrift,
      overallHealth,
      drifts,
    };
  }

  private calculateSeverity(
    driftPct: number
  ): 'critical' | 'high' | 'medium' | 'low' {
    if (driftPct > 0.75) return 'critical';
    if (driftPct > 0.5) return 'high';
    if (driftPct > 0.35) return 'medium';
    return 'low';
  }

  private formatFactorName(factor: string): string {
    const names: Record<string, string> = {
      momentum_12m: '12-Month Momentum',
      momentum_6m: '6-Month Momentum',
      value: 'Value',
      low_vol: 'Low Volatility',
      roe: 'Return on Equity',
      roa: 'Return on Assets',
      gross_margin: 'Gross Margin',
      debt_to_equity: 'Debt to Equity',
      market: 'Market Beta',
      volatility: 'Volatility',
      sector_tech: 'Technology Sector',
      sector_finance: 'Financial Sector',
      sector_healthcare: 'Healthcare Sector',
    };
    return names[factor] || factor.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  private formatMessage(result: DriftResult): string {
    const direction = result.drift > 0 ? 'above' : 'below';
    const factorName = this.formatFactorName(result.factor);

    return `Your ${factorName} exposure (${result.current.toFixed(2)}) is ${(
      result.driftPct * 100
    ).toFixed(0)}% ${direction} your target of ${result.target.toFixed(2)}.`;
  }

  private suggestAction(result: DriftResult): string {
    const factorName = this.formatFactorName(result.factor);

    if (result.drift > 0) {
      // Over-exposed
      return `Consider reducing positions with high ${factorName} exposure or adding positions with low/negative exposure to rebalance.`;
    } else {
      // Under-exposed
      return `Consider adding positions with high ${factorName} exposure or reducing positions with negative exposure to rebalance.`;
    }
  }

  /**
   * Get recent alert history
   */
  getAlertHistory(limit: number = 20): DriftAlert[] {
    return this.alertHistory.slice(-limit);
  }

  /**
   * Export configuration for persistence
   */
  exportConfig(): {
    targets: FactorTarget[];
    lastCheckTime: string | null;
  } {
    return {
      targets: Array.from(this.targets.values()),
      lastCheckTime: this.lastCheckTime?.toISOString() ?? null,
    };
  }

  /**
   * Import configuration from persistence
   */
  importConfig(config: { targets: FactorTarget[] }): void {
    this.setTargets(config.targets);
  }
}

// Export singleton instance
export const factorDriftMonitor = new FactorDriftMonitor();
