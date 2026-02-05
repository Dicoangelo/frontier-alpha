/**
 * POST /api/v1/cvrf/decision - Record a trading decision
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cvrfManager } from '../../../src/cvrf/CVRFManager.js';

export default function handler(req: VercelRequest, res: VercelResponse) {
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
  const { symbol, action, weightBefore, weightAfter, reason, confidence, factors } = req.body || {};

  if (!symbol || !action) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'symbol and action are required' },
    });
  }

  try {
    const decision = cvrfManager.recordDecision({
      timestamp: new Date(),
      symbol,
      action,
      weightBefore: weightBefore || 0,
      weightAfter: weightAfter || 0,
      reason: reason || '',
      confidence: confidence || 0.5,
      factors: factors || [],
    });

    return res.status(200).json({
      success: true,
      data: decision,
      meta: {
        timestamp: new Date(),
        latencyMs: Date.now() - start,
      },
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      error: { code: 'DECISION_ERROR', message: error.message },
    });
  }
}
