import type { VercelRequest, VercelResponse } from '@vercel/node';

interface FactorTarget {
  factor: string;
  target: number;
  tolerance: number;
}

interface FactorExposure {
  factor: string;
  exposure: number;
}

interface DriftResult {
  factor: string;
  current: number;
  target: number;
  drift: number;
  driftPct: number;
  withinTolerance: boolean;
}

interface DriftAlert {
  id: string;
  type: 'factor_drift';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  message: string;
  timestamp: string;
  acknowledged: boolean;
  factor: string;
  currentExposure: number;
  targetExposure: number;
  driftPct: number;
  suggestedAction: string;
}

// Default factor targets
const DEFAULT_TARGETS: FactorTarget[] = [
  { factor: 'momentum_12m', target: 0, tolerance: 0.3 },
  { factor: 'value', target: 0, tolerance: 0.3 },
  { factor: 'low_vol', target: 0, tolerance: 0.3 },
  { factor: 'roe', target: 0.2, tolerance: 0.25 },
  { factor: 'market', target: 1.0, tolerance: 0.15 },
];

function formatFactorName(factor: string): string {
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
  };
  return (
    names[factor] ||
    factor.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function calculateSeverity(
  driftPct: number
): 'critical' | 'high' | 'medium' | 'low' {
  if (driftPct > 0.75) return 'critical';
  if (driftPct > 0.5) return 'high';
  if (driftPct > 0.35) return 'medium';
  return 'low';
}

function checkDrift(
  exposures: FactorExposure[],
  targets: FactorTarget[]
): DriftResult[] {
  const exposureMap = new Map<string, number>();
  for (const exp of exposures) {
    exposureMap.set(exp.factor, exp.exposure);
  }

  return targets.map((target) => {
    const current = exposureMap.get(target.factor) ?? 0;
    const drift = current - target.target;
    const driftPct =
      target.target !== 0 ? Math.abs(drift / target.target) : Math.abs(drift);

    return {
      factor: target.factor,
      current,
      target: target.target,
      drift,
      driftPct,
      withinTolerance: driftPct <= target.tolerance,
    };
  });
}

function generateAlerts(driftResults: DriftResult[]): DriftAlert[] {
  return driftResults
    .filter((result) => !result.withinTolerance)
    .map((result) => {
      const severity = calculateSeverity(result.driftPct);
      const direction = result.drift > 0 ? 'above' : 'below';
      const factorName = formatFactorName(result.factor);

      const suggestedAction =
        result.drift > 0
          ? `Consider reducing positions with high ${factorName} exposure or adding positions with low/negative exposure to rebalance.`
          : `Consider adding positions with high ${factorName} exposure or reducing positions with negative exposure to rebalance.`;

      return {
        id: `drift-${result.factor}-${Date.now()}`,
        type: 'factor_drift' as const,
        severity,
        title: `${factorName} Drift Alert`,
        message: `Your ${factorName} exposure (${result.current.toFixed(2)}) is ${(
          result.driftPct * 100
        ).toFixed(0)}% ${direction} your target of ${result.target.toFixed(2)}.`,
        timestamp: new Date().toISOString(),
        acknowledged: false,
        factor: result.factor,
        currentExposure: result.current,
        targetExposure: result.target,
        driftPct: result.driftPct,
        suggestedAction,
      };
    });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const requestId = `req-${Math.random().toString(36).slice(2, 8)}`;

  try {
    if (req.method === 'POST') {
      // Check for factor drift given current exposures and targets
      const { exposures, targets } = req.body as {
        exposures: FactorExposure[];
        targets?: FactorTarget[];
      };

      if (!exposures || !Array.isArray(exposures)) {
        return res.status(400).json({
          success: false,
          error: 'exposures array is required',
          meta: { requestId },
        });
      }

      const targetList = targets || DEFAULT_TARGETS;
      const driftResults = checkDrift(exposures, targetList);
      const alerts = generateAlerts(driftResults);

      const withinTolerance = driftResults.filter((d) => d.withinTolerance);
      const outsideTolerance = driftResults.filter((d) => !d.withinTolerance);
      const worstDrift =
        driftResults.length > 0
          ? driftResults.reduce((worst, d) =>
              d.driftPct > worst.driftPct ? d : worst
            )
          : null;

      let overallHealth: 'healthy' | 'warning' | 'critical' = 'healthy';
      if (outsideTolerance.length > 0) {
        overallHealth = outsideTolerance.some((d) => d.driftPct > 0.5)
          ? 'critical'
          : 'warning';
      }

      return res.status(200).json({
        success: true,
        data: {
          alerts,
          summary: {
            totalFactorsTracked: driftResults.length,
            factorsWithinTolerance: withinTolerance.length,
            factorsOutsideTolerance: outsideTolerance.length,
            worstDrift,
            overallHealth,
          },
          drifts: driftResults,
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
        },
      });
    }

    if (req.method === 'GET') {
      // Return default targets for configuration
      return res.status(200).json({
        success: true,
        data: {
          defaultTargets: DEFAULT_TARGETS,
          strategies: {
            balanced: DEFAULT_TARGETS,
            momentum: [
              { factor: 'momentum_12m', target: 0.5, tolerance: 0.2 },
              { factor: 'momentum_6m', target: 0.4, tolerance: 0.2 },
              { factor: 'low_vol', target: -0.2, tolerance: 0.3 },
            ],
            quality: [
              { factor: 'roe', target: 0.6, tolerance: 0.2 },
              { factor: 'roa', target: 0.4, tolerance: 0.25 },
              { factor: 'gross_margin', target: 0.3, tolerance: 0.25 },
            ],
            lowVol: [
              { factor: 'low_vol', target: 0.6, tolerance: 0.15 },
              { factor: 'volatility', target: -0.4, tolerance: 0.2 },
              { factor: 'market', target: 0.7, tolerance: 0.15 },
            ],
          },
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
        },
      });
    }

    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
      meta: { requestId },
    });
  } catch (error) {
    console.error('Factor drift alert error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      meta: { requestId },
    });
  }
}
