/**
 * GET /api/v1/cvrf/beliefs/current — Current CVRF belief state
 *
 * Returns all 80+ factor beliefs with conviction scores, directions,
 * and categories for the Belief Constellation visualization.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../../../lib/auth.js';
import { methodNotAllowed, internalError } from '../../../lib/errorHandler.js';
import { createPersistentCVRFManager } from '../../../../src/cvrf/PersistentCVRFManager.js';
import { FACTOR_DEFINITIONS } from '../../../../src/factors/FactorEngine.js';

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
    const beliefs = manager.getCurrentBeliefs();

    // Build the full factor belief array from FACTOR_DEFINITIONS + current belief state
    const factors = FACTOR_DEFINITIONS.map((def) => {
      const weight = beliefs.factorWeights.get(def.name);
      const confidence = beliefs.factorConfidences.get(def.name);

      // Derive conviction from weight and confidence (both 0–1 range)
      // Factors with explicit weights/confidences get those values;
      // factors without stored beliefs get a baseline 0.5 conviction
      const conviction = confidence ?? 0.5;

      // Derive direction from weight relative to neutral (0.2 for 5-factor equal weight)
      const neutralWeight = 0.2;
      let direction: 'bullish' | 'bearish' | 'neutral' = 'neutral';
      if (weight !== undefined) {
        if (weight > neutralWeight + 0.03) direction = 'bullish';
        else if (weight < neutralWeight - 0.03) direction = 'bearish';
      }

      return {
        factorId: def.name,
        factorName: def.description,
        category: def.category,
        conviction,
        direction,
        weight: weight ?? null,
        lastUpdated: beliefs.updatedAt,
      };
    });

    // Add regime as a special meta-factor
    factors.push({
      factorId: 'regime',
      factorName: `Market regime: ${beliefs.currentRegime}`,
      category: 'macro' as any,
      conviction: beliefs.regimeConfidence,
      direction: beliefs.currentRegime === 'bull' ? 'bullish'
        : beliefs.currentRegime === 'bear' ? 'bearish'
        : 'neutral',
      weight: null,
      lastUpdated: beliefs.updatedAt,
    });

    // Add risk parameters as additional belief factors
    const riskFactors = [
      { factorId: 'risk_tolerance', factorName: 'Risk tolerance level', category: 'volatility' as any, conviction: beliefs.riskTolerance, direction: 'neutral' as const, weight: beliefs.riskTolerance, lastUpdated: beliefs.updatedAt },
      { factorId: 'max_drawdown_threshold', factorName: 'Maximum drawdown threshold', category: 'volatility' as any, conviction: 1 - beliefs.maxDrawdownThreshold, direction: 'neutral' as const, weight: beliefs.maxDrawdownThreshold, lastUpdated: beliefs.updatedAt },
      { factorId: 'volatility_target', factorName: 'Portfolio volatility target', category: 'volatility' as any, conviction: 0.7, direction: 'neutral' as const, weight: beliefs.volatilityTarget, lastUpdated: beliefs.updatedAt },
      { factorId: 'momentum_horizon', factorName: 'Momentum lookback horizon (days)', category: 'style' as any, conviction: 0.6, direction: 'neutral' as const, weight: null, lastUpdated: beliefs.updatedAt },
      { factorId: 'mean_reversion_threshold', factorName: 'Mean reversion trigger threshold', category: 'style' as any, conviction: 0.6, direction: 'neutral' as const, weight: null, lastUpdated: beliefs.updatedAt },
      { factorId: 'concentration_limit', factorName: 'Position concentration limit', category: 'quality' as any, conviction: 0.8, direction: 'neutral' as const, weight: beliefs.concentrationLimit, lastUpdated: beliefs.updatedAt },
      { factorId: 'min_position_size', factorName: 'Minimum position size', category: 'quality' as any, conviction: 0.8, direction: 'neutral' as const, weight: beliefs.minPositionSize, lastUpdated: beliefs.updatedAt },
      { factorId: 'rebalance_threshold', factorName: 'Rebalance drift threshold', category: 'quality' as any, conviction: 0.7, direction: 'neutral' as const, weight: beliefs.rebalanceThreshold, lastUpdated: beliefs.updatedAt },
    ];

    factors.push(...riskFactors);

    const dataSource = 'live';
    res.setHeader('X-Data-Source', dataSource);

    return res.status(200).json({
      success: true,
      data: {
        beliefs: factors,
        totalFactors: factors.length,
        regime: {
          current: beliefs.currentRegime,
          confidence: beliefs.regimeConfidence,
        },
        beliefVersion: beliefs.version,
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
