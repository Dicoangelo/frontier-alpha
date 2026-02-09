/**
 * GET /api/v1/cvrf/meta-prompt - Get the latest meta-prompt
 *
 * Returns the most recent meta-prompt generated from the last CVRF cycle,
 * including optimization direction, key learnings, and factor adjustments.
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

    if (history.length === 0) {
      return res.status(200).json({
        success: true,
        data: null,
        meta: {
          timestamp: new Date(),
          latencyMs: Date.now() - start,
          persistent: true,
          message: 'No CVRF cycles completed yet. Complete an episode to generate a meta-prompt.',
        },
      });
    }

    // Get the most recent cycle's meta-prompt
    const latestCycle = history[history.length - 1];
    const metaPrompt = latestCycle.metaPrompt;

    // Convert factorAdjustments Map to object if needed
    const factorAdjustments = metaPrompt.factorAdjustments instanceof Map
      ? Object.fromEntries(metaPrompt.factorAdjustments)
      : metaPrompt.factorAdjustments || {};

    return res.status(200).json({
      success: true,
      data: {
        optimizationDirection: metaPrompt.optimizationDirection,
        keyLearnings: metaPrompt.keyLearnings,
        factorAdjustments,
        riskGuidance: metaPrompt.riskGuidance,
        timingInsights: metaPrompt.timingInsights,
        generatedAt: metaPrompt.generatedAt,
        cycleNumber: history.length,
        sourceEpisodes: {
          previous: latestCycle.episodeComparison.previousEpisodeReturn,
          current: latestCycle.episodeComparison.currentEpisodeReturn,
          delta: latestCycle.episodeComparison.performanceDelta,
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
