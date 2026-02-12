/**
 * POST /api/v1/cvrf/episode/close - Close episode and run CVRF cycle
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createPersistentCVRFManager } from '../../../../src/cvrf/PersistentCVRFManager.js';
import { methodNotAllowed, internalError } from '../../../lib/errorHandler.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return methodNotAllowed(res);
  }

  const start = Date.now();
  const { runCvrfCycle = true, metrics } = req.body || {};

  try {
    const manager = await createPersistentCVRFManager();
    const { episode, cvrfResult } = await manager.closeEpisode(metrics, runCvrfCycle);

    return res.status(200).json({
      success: true,
      data: {
        episode: {
          id: episode.id,
          episodeNumber: episode.episodeNumber,
          startDate: episode.startDate,
          endDate: episode.endDate,
          decisionsCount: episode.decisions.length,
          portfolioReturn: episode.portfolioReturn,
          sharpeRatio: episode.sharpeRatio,
        },
        cvrfResult: cvrfResult ? {
          performanceDelta: cvrfResult.episodeComparison.performanceDelta,
          decisionOverlap: cvrfResult.episodeComparison.decisionOverlap,
          insightsExtracted: cvrfResult.extractedInsights.length,
          beliefUpdates: cvrfResult.beliefUpdates.length,
          newRegime: cvrfResult.newBeliefState.currentRegime,
        } : null,
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
