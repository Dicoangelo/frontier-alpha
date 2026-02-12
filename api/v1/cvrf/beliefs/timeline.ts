/**
 * GET /api/v1/cvrf/beliefs/timeline?days=30 — Daily belief snapshots
 *
 * Returns the evolution of CVRF beliefs over a configurable time window,
 * sourced from CVRF cycle history stored in Supabase.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../../../lib/auth.js';
import { methodNotAllowed, badRequest, internalError } from '../../../lib/errorHandler.js';
import { createPersistentCVRFManager } from '../../../../src/cvrf/PersistentCVRFManager.js';

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

  // Parse days parameter (default 30, max 365)
  const daysParam = req.query.days;
  const days = typeof daysParam === 'string' ? parseInt(daysParam, 10) : 30;

  if (isNaN(days) || days < 1 || days > 365) {
    return badRequest(res, 'days must be between 1 and 365');
  }

  const start = Date.now();

  try {
    const manager = await createPersistentCVRFManager(user.id);
    const history = manager.getCycleHistory();

    // Filter cycles within the requested time window
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const filteredCycles = history.filter((c) => c.timestamp >= cutoff);

    // Build daily snapshots from cycle belief states
    const snapshots = filteredCycles.map((cycle) => {
      const bs = cycle.newBeliefState;
      return {
        date: cycle.timestamp.toISOString().split('T')[0],
        timestamp: cycle.timestamp,
        cycleId: cycle.cycleId,
        factorWeights: Object.fromEntries(
          bs.factorWeights instanceof Map
            ? bs.factorWeights
            : Object.entries(bs.factorWeights || {})
        ),
        factorConfidences: Object.fromEntries(
          bs.factorConfidences instanceof Map
            ? bs.factorConfidences
            : Object.entries(bs.factorConfidences || {})
        ),
        regime: bs.currentRegime,
        regimeConfidence: bs.regimeConfidence,
        riskTolerance: bs.riskTolerance,
        volatilityTarget: bs.volatilityTarget,
        performanceDelta: cycle.episodeComparison.performanceDelta,
        insightCount: cycle.extractedInsights.length,
      };
    });

    // Collect all factor names across snapshots
    const allFactors = new Set<string>();
    for (const snap of snapshots) {
      for (const key of Object.keys(snap.factorWeights)) {
        allFactors.add(key);
      }
    }

    const dataSource = 'live';
    res.setHeader('X-Data-Source', dataSource);

    return res.status(200).json({
      success: true,
      data: {
        snapshots,
        totalSnapshots: snapshots.length,
        days,
        factors: [...allFactors],
        regimeTransitions: snapshots.reduce((count, snap, idx) => {
          if (idx === 0) return 0;
          return snap.regime !== snapshots[idx - 1].regime ? count + 1 : count;
        }, 0),
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
