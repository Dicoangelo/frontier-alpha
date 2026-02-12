/**
 * POST /api/v1/cvrf/episode/start - Start a new CVRF episode
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createPersistentCVRFManager } from '../../../../src/cvrf/PersistentCVRFManager.js';
import { methodNotAllowed, internalError } from '../../../lib/errorHandler.js';
import { validateBody, schemas } from '../../../lib/validation.js';

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

  try {
    // Validate optional body params (watchlist, targetReturn, maxDrawdown)
    const body = validateBody(req, res, schemas.startEpisode);
    if (!body) return;

    const manager = await createPersistentCVRFManager();
    const episode = await manager.startEpisode();

    return res.status(200).json({
      success: true,
      data: {
        id: episode.id,
        episodeNumber: episode.episodeNumber,
        startDate: episode.startDate,
        message: 'CVRF episode started. Record decisions and close when complete.',
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
