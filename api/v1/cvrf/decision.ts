/**
 * POST /api/v1/cvrf/decision - Record a trading decision
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createPersistentCVRFManager } from '../../../src/cvrf/PersistentCVRFManager.js';
import { methodNotAllowed, badRequest } from '../../lib/errorHandler.js';
import { validateBody, schemas } from '../../lib/validation.js';

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

  // Validate & parse input with Zod
  const body = validateBody(req, res, schemas.recordDecision);
  if (!body) return;

  const { symbol, action, weightBefore, weightAfter, reason, confidence, factors } = body;

  try {
    const manager = await createPersistentCVRFManager();
    const decision = await manager.recordDecision({
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
        persistent: true,
      },
    });
  } catch (_error: any) {
    return badRequest(res, 'Failed to record decision');
  }
}
