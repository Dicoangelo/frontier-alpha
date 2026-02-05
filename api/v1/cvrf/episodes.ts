/**
 * GET /api/v1/cvrf/episodes - Get CVRF episode history
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
    const currentEpisode = manager.getCurrentEpisode();
    const recentEpisodes = manager.getRecentEpisodes();

    return res.status(200).json({
      success: true,
      data: {
        current: currentEpisode ? {
          id: currentEpisode.id,
          episodeNumber: currentEpisode.episodeNumber,
          startDate: currentEpisode.startDate,
          decisionsCount: currentEpisode.decisions.length,
          status: 'active',
        } : null,
        completed: recentEpisodes.map(ep => ({
          id: ep.id,
          episodeNumber: ep.episodeNumber,
          startDate: ep.startDate,
          endDate: ep.endDate,
          decisionsCount: ep.decisions.length,
          portfolioReturn: ep.portfolioReturn,
          sharpeRatio: ep.sharpeRatio,
          maxDrawdown: ep.maxDrawdown,
          status: 'completed',
        })),
        totalEpisodes: recentEpisodes.length + (currentEpisode ? 1 : 0),
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
