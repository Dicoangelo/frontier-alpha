/**
 * GET /api/v1/cvrf/stats - Get CVRF system statistics
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createPersistentCVRFManager } from '../../../src/cvrf/PersistentCVRFManager.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Use GET' } });
  }

  const start = Date.now();

  try {
    const manager = await createPersistentCVRFManager();
    const beliefs = manager.getCurrentBeliefs();
    const episodes = manager.getRecentEpisodes();
    const cycles = manager.getCycleHistory();

    // Calculate aggregate stats
    const totalDecisions = episodes.reduce((sum, ep) => sum + ep.decisions.length, 0);
    const avgReturn = episodes.length > 0
      ? episodes.reduce((sum, ep) => sum + (ep.portfolioReturn || 0), 0) / episodes.length
      : 0;
    const avgSharpe = episodes.length > 0
      ? episodes.reduce((sum, ep) => sum + (ep.sharpeRatio || 0), 0) / episodes.length
      : 0;

    // CVRF learning metrics
    const avgDecisionOverlap = cycles.length > 0
      ? cycles.reduce((sum, c) => sum + c.episodeComparison.decisionOverlap, 0) / cycles.length
      : 0;
    const avgLearningRate = 1 - avgDecisionOverlap;
    const totalInsights = cycles.reduce((sum, c) => sum + c.extractedInsights.length, 0);
    const totalBeliefUpdates = cycles.reduce((sum, c) => sum + c.beliefUpdates.length, 0);

    return res.status(200).json({
      success: true,
      data: {
        episodes: {
          total: episodes.length,
          totalDecisions,
          avgReturn: (avgReturn * 100).toFixed(2) + '%',
          avgSharpe: avgSharpe.toFixed(2),
        },
        cvrf: {
          totalCycles: cycles.length,
          avgDecisionOverlap: (avgDecisionOverlap * 100).toFixed(1) + '%',
          avgLearningRate: (avgLearningRate * 100).toFixed(1) + '%',
          totalInsights,
          totalBeliefUpdates,
        },
        beliefs: {
          version: beliefs.version,
          regime: beliefs.currentRegime,
          regimeConfidence: (beliefs.regimeConfidence * 100).toFixed(0) + '%',
          riskTolerance: (beliefs.riskTolerance * 100).toFixed(0) + '%',
          volatilityTarget: (beliefs.volatilityTarget * 100).toFixed(0) + '%',
        },
        factors: {
          weights: Object.fromEntries(
            Array.from(beliefs.factorWeights.entries()).map(([k, v]) => [k, (v * 100).toFixed(0) + '%'])
          ),
          confidences: Object.fromEntries(
            Array.from(beliefs.factorConfidences.entries()).map(([k, v]) => [k, (v * 100).toFixed(0) + '%'])
          ),
        },
      },
      meta: {
        timestamp: new Date(),
        latencyMs: Date.now() - start,
        persistent: true,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'CVRF_ERROR', message: error.message },
    });
  }
}
