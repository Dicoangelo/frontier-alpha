/**
 * POST /api/v1/cvrf/risk - Get CVRF risk assessment
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createPersistentCVRFManager } from '../../../src/cvrf/PersistentCVRFManager.js';
import { methodNotAllowed, validationError, internalError } from '../../lib/errorHandler.js';

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
  const { portfolioValue, portfolioReturns, positions } = req.body || {};

  if (!portfolioValue || !positions) {
    return validationError(res, 'portfolioValue and positions are required');
  }

  try {
    const manager = await createPersistentCVRFManager();

    // Get within-episode risk assessment
    const withinEpisode = manager.checkWithinEpisodeRisk(
      portfolioValue,
      portfolioReturns || [],
      positions
    );

    // Get over-episode belief adjustments
    const overEpisode = manager.getOverEpisodeAdjustment();

    // Generate combined recommendation
    let recommendation = '✅ No immediate adjustments needed. Portfolio aligned with CVRF beliefs.';
    if (withinEpisode.triggered) {
      recommendation = `⚠️ Within-episode risk triggered. CVaR: ${(withinEpisode.currentCVaR * 100).toFixed(2)}% exceeds threshold. ${withinEpisode.adjustment.type === 'reduce_exposure' ? 'Reduce exposure recommended.' : withinEpisode.adjustment.type === 'hedge' ? 'Consider hedging.' : 'Rebalance needed.'}`;
    }

    return res.status(200).json({
      success: true,
      data: {
        withinEpisode,
        overEpisode: {
          conceptualInsights: overEpisode.conceptualInsights,
          metaPrompt: {
            optimizationDirection: overEpisode.metaPrompt.optimizationDirection,
            keyLearnings: overEpisode.metaPrompt.keyLearnings,
            factorAdjustments: Object.fromEntries(overEpisode.metaPrompt.factorAdjustments),
            riskGuidance: overEpisode.metaPrompt.riskGuidance,
            timingInsights: overEpisode.metaPrompt.timingInsights,
            generatedAt: overEpisode.metaPrompt.generatedAt,
          },
          learningRate: overEpisode.learningRate,
          beliefDeltas: Object.fromEntries(overEpisode.beliefDeltas),
        },
        combinedRecommendation: recommendation,
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
