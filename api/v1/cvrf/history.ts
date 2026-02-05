/**
 * GET /api/v1/cvrf/history - Get CVRF cycle history
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
    const history = manager.getCycleHistory();

    return res.status(200).json({
      success: true,
      data: history.map(cycle => ({
        timestamp: cycle.timestamp,
        previousEpisodeReturn: cycle.episodeComparison.previousEpisodeReturn,
        currentEpisodeReturn: cycle.episodeComparison.currentEpisodeReturn,
        performanceDelta: cycle.episodeComparison.performanceDelta,
        decisionOverlap: cycle.episodeComparison.decisionOverlap,
        insightsCount: cycle.extractedInsights.length,
        beliefUpdatesCount: cycle.beliefUpdates.length,
        newRegime: cycle.newBeliefState.currentRegime,
      })),
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
