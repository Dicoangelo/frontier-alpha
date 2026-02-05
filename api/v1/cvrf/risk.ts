/**
 * POST /api/v1/cvrf/risk - Get CVRF risk assessment
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cvrfManager } from '../../../src/cvrf/CVRFManager.js';
import { getCVRFRiskAssessment } from '../../../src/cvrf/integration.js';

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
  const { portfolioValue, portfolioReturns, positions } = req.body || {};

  if (!portfolioValue || !positions) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'portfolioValue and positions are required' },
    });
  }

  const assessment = getCVRFRiskAssessment(
    portfolioValue,
    portfolioReturns || [],
    positions,
    cvrfManager
  );

  return res.status(200).json({
    success: true,
    data: assessment,
    meta: {
      timestamp: new Date(),
      latencyMs: Date.now() - start,
    },
  });
}
