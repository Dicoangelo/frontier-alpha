/**
 * GET /api/v1/cvrf/beliefs - Get current CVRF belief state
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cvrfManager } from '../../../src/cvrf/CVRFManager.js';

export default function handler(req: VercelRequest, res: VercelResponse) {
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
  const beliefs = cvrfManager.getCurrentBeliefs();

  return res.status(200).json({
    success: true,
    data: {
      ...beliefs,
      factorWeights: Object.fromEntries(beliefs.factorWeights),
      factorConfidences: Object.fromEntries(beliefs.factorConfidences),
    },
    meta: {
      timestamp: new Date(),
      latencyMs: Date.now() - start,
    },
  });
}
