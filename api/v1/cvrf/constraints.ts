/**
 * GET /api/v1/cvrf/constraints - Get CVRF optimization constraints
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createPersistentCVRFManager } from '../../../src/cvrf/PersistentCVRFManager.js';
import { methodNotAllowed, internalError } from '../../lib/errorHandler.js';

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

  const start = Date.now();

  try {
    const manager = await createPersistentCVRFManager();
    const constraints = manager.getOptimizationConstraints();

    return res.status(200).json({
      success: true,
      data: {
        ...constraints,
        factorTargets: Object.fromEntries(constraints.factorTargets),
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
