/**
 * GET /api/v1/cvrf/belief-history - Get historical belief state snapshots
 *
 * Returns the evolution of factor weights and regime beliefs across CVRF cycles,
 * enabling heatmap and timeline visualizations.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createPersistentCVRFManager } from '../../../src/cvrf/PersistentCVRFManager.js';
import { methodNotAllowed, internalError } from '../../lib/errorHandler.js';

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

  const start = Date.now();

  try {
    const manager = await createPersistentCVRFManager();
    const history = manager.getCycleHistory();

    // Extract belief state snapshots from each cycle
    const beliefSnapshots = history.map((cycle, idx) => ({
      cycleNumber: idx + 1,
      timestamp: cycle.timestamp,
      factorWeights: Object.fromEntries(
        cycle.newBeliefState.factorWeights instanceof Map
          ? cycle.newBeliefState.factorWeights
          : Object.entries(cycle.newBeliefState.factorWeights || {})
      ),
      factorConfidences: Object.fromEntries(
        cycle.newBeliefState.factorConfidences instanceof Map
          ? cycle.newBeliefState.factorConfidences
          : Object.entries(cycle.newBeliefState.factorConfidences || {})
      ),
      regime: cycle.newBeliefState.currentRegime,
      regimeConfidence: cycle.newBeliefState.regimeConfidence,
      riskTolerance: cycle.newBeliefState.riskTolerance,
      volatilityTarget: cycle.newBeliefState.volatilityTarget,
      beliefUpdates: cycle.beliefUpdates.map((update) => ({
        factor: update.factor || update.dimension,
        oldValue: update.oldValue,
        newValue: update.newValue,
        delta: update.delta || (update.newValue - update.oldValue),
      })),
      insights: cycle.extractedInsights.map((insight) => ({
        type: insight.type,
        concept: insight.concept,
        confidence: insight.confidence,
        impactDirection: insight.impactDirection,
      })),
    }));

    return res.status(200).json({
      success: true,
      data: {
        snapshots: beliefSnapshots,
        totalCycles: beliefSnapshots.length,
        factors: beliefSnapshots.length > 0
          ? Object.keys(beliefSnapshots[beliefSnapshots.length - 1].factorWeights)
          : [],
        regimeTransitions: beliefSnapshots.reduce((count, snap, idx) => {
          if (idx === 0) return 0;
          return snap.regime !== beliefSnapshots[idx - 1].regime ? count + 1 : count;
        }, 0),
      },
      meta: {
        timestamp: new Date(),
        latencyMs: Date.now() - start,
        persistent: true,
      },
    });
  } catch (_error: any) {
    return internalError(res);
  }
}
