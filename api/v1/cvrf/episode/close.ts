/**
 * POST /api/v1/cvrf/episode/close - Close episode and run CVRF cycle
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cvrfManager } from '../../../../src/cvrf/CVRFManager.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST' } });
  }

  const start = Date.now();
  const { runCvrfCycle = true } = req.body || {};

  try {
    const { episode, cvrfResult } = await cvrfManager.closeEpisode(undefined, runCvrfCycle);

    return res.status(200).json({
      success: true,
      data: {
        episode: {
          id: episode.id,
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
      },
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      error: { code: 'CVRF_ERROR', message: error.message },
    });
  }
}
