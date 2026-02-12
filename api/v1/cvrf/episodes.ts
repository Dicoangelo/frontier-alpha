/**
 * GET /api/v1/cvrf/episodes - Get CVRF episode history (paginated)
 *
 * Query params:
 *   ?limit=50      — max episodes per page (default 50, max 200)
 *   ?offset=0      — skip N completed episodes (default 0)
 *   ?expand=decisions — include full decision objects (default: count only)
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../../lib/auth.js';
import { createPersistentCVRFManager } from '../../../src/cvrf/PersistentCVRFManager.js';
import * as persistence from '../../../src/cvrf/persistence.js';
import { methodNotAllowed, internalError } from '../../lib/errorHandler.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

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

  // Require authentication
  const user = await requireAuth(req, res);
  if (!user) {
    return; // requireAuth already sent 401 response
  }

  const start = Date.now();

  try {
    // Parse pagination params
    const rawLimit = parseInt(req.query.limit as string, 10);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_LIMIT)
      : DEFAULT_LIMIT;

    const rawOffset = parseInt(req.query.offset as string, 10);
    const offset = Number.isFinite(rawOffset) && rawOffset >= 0
      ? rawOffset
      : 0;

    const expandDecisions = req.query.expand === 'decisions';

    // Fetch data in parallel
    const manager = await createPersistentCVRFManager();
    const currentEpisode = manager.getCurrentEpisode();

    const [completedEpisodes, totalCompleted] = await Promise.all([
      persistence.getRecentEpisodes(null, limit, offset, expandDecisions),
      persistence.getCompletedEpisodesCount(null),
    ]);

    const total = totalCompleted + (currentEpisode ? 1 : 0);
    const hasMore = offset + limit < totalCompleted;

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
        completed: completedEpisodes.map(ep => {
          const base: Record<string, unknown> = {
            id: ep.id,
            episodeNumber: ep.episodeNumber,
            startDate: ep.startDate,
            endDate: ep.endDate,
            decisionsCount: ep.decisions.length,
            portfolioReturn: ep.portfolioReturn,
            sharpeRatio: ep.sharpeRatio,
            maxDrawdown: ep.maxDrawdown,
            status: 'completed',
          };
          if (expandDecisions) {
            base.decisions = ep.decisions;
          }
          return base;
        }),
        totalEpisodes: total,
        pagination: {
          total: totalCompleted,
          limit,
          offset,
          hasMore,
        },
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
