/**
 * POST /api/v1/cvrf/episode/start - Start a new CVRF episode
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cvrfManager } from '../../../../src/cvrf/CVRFManager.js';

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
  const episode = cvrfManager.startEpisode();

  return res.status(200).json({
    success: true,
    data: {
      id: episode.id,
      startDate: episode.startDate,
      message: 'CVRF episode started. Record decisions and close when complete.',
    },
    meta: {
      timestamp: new Date(),
      latencyMs: Date.now() - start,
    },
  });
}
