/**
 * GET /api/v1/cvrf/beliefs/correlations — Factor-to-factor correlation matrix
 *
 * Computes co-movement of factor belief weights across CVRF cycle history.
 * When factors move together across cycles, they have high correlation.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../../../lib/auth.js';
import { methodNotAllowed, internalError } from '../../../lib/errorHandler.js';
import { createPersistentCVRFManager } from '../../../../src/cvrf/PersistentCVRFManager.js';

/**
 * Compute Pearson correlation between two arrays.
 */
function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 2) return 0;

  const xMean = x.reduce((a, b) => a + b, 0) / n;
  const yMean = y.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let xVar = 0;
  let yVar = 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i] - xMean;
    const dy = y[i] - yMean;
    numerator += dx * dy;
    xVar += dx * dx;
    yVar += dy * dy;
  }

  const denominator = Math.sqrt(xVar * yVar);
  return denominator === 0 ? 0 : numerator / denominator;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return methodNotAllowed(res);
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  const start = Date.now();

  try {
    const manager = await createPersistentCVRFManager(user.id);
    const history = manager.getCycleHistory();

    // Build time series of factor weights from cycle history
    const factorSeries: Record<string, number[]> = {};

    for (const cycle of history) {
      const weights = cycle.newBeliefState.factorWeights instanceof Map
        ? cycle.newBeliefState.factorWeights
        : new Map(Object.entries(cycle.newBeliefState.factorWeights || {}));

      for (const [factor, weight] of weights) {
        if (!factorSeries[factor]) factorSeries[factor] = [];
        factorSeries[factor].push(weight as number);
      }
    }

    const factorNames = Object.keys(factorSeries);

    // Pad shorter series to uniform length
    const maxLen = Math.max(...Object.values(factorSeries).map((s) => s.length), 0);
    for (const factor of factorNames) {
      while (factorSeries[factor].length < maxLen) {
        factorSeries[factor].unshift(factorSeries[factor][0] ?? 0);
      }
    }

    // Compute correlation matrix
    const matrix: Record<string, Record<string, number>> = {};

    for (const f1 of factorNames) {
      matrix[f1] = {};
      for (const f2 of factorNames) {
        if (f1 === f2) {
          matrix[f1][f2] = 1.0;
        } else if (matrix[f2]?.[f1] !== undefined) {
          // Symmetric — reuse already computed
          matrix[f1][f2] = matrix[f2][f1];
        } else {
          matrix[f1][f2] = parseFloat(
            pearsonCorrelation(factorSeries[f1], factorSeries[f2]).toFixed(4)
          );
        }
      }
    }

    // Find strongest correlations (abs > 0.5, excluding self)
    const strongCorrelations: Array<{
      factor1: string;
      factor2: string;
      correlation: number;
    }> = [];

    for (let i = 0; i < factorNames.length; i++) {
      for (let j = i + 1; j < factorNames.length; j++) {
        const corr = matrix[factorNames[i]][factorNames[j]];
        if (Math.abs(corr) > 0.5) {
          strongCorrelations.push({
            factor1: factorNames[i],
            factor2: factorNames[j],
            correlation: corr,
          });
        }
      }
    }

    strongCorrelations.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));

    const dataSource = 'live';
    res.setHeader('X-Data-Source', dataSource);

    return res.status(200).json({
      success: true,
      data: {
        matrix,
        factors: factorNames,
        cycleCount: history.length,
        strongCorrelations: strongCorrelations.slice(0, 20),
      },
      dataSource,
      meta: {
        timestamp: new Date().toISOString(),
        latencyMs: Date.now() - start,
        requestId: `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      },
    });
  } catch (_error) {
    return internalError(res);
  }
}
