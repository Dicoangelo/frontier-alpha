import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getCache } from '../../../src/cache/RedisCache';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const cache = getCache();

  // GET - Get cache statistics
  if (req.method === 'GET') {
    const stats = cache.getStats();

    return res.status(200).json({
      success: true,
      data: {
        enabled: cache.isAvailable(),
        connected: cache.isConnected(),
        stats: {
          hits: stats.hits,
          misses: stats.misses,
          hitRate: `${(stats.hitRate * 100).toFixed(1)}%`,
          sets: stats.sets,
          deletes: stats.deletes,
          errors: stats.errors,
        },
        memory: {
          entries: stats.memorySize,
        },
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }

  // POST - Invalidate specific cache types
  if (req.method === 'POST') {
    const { action, type } = req.body as { action: string; type?: string };

    if (action !== 'invalidate') {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Invalid action' },
      });
    }

    let deleted = 0;

    switch (type) {
      case 'quotes':
        deleted = await cache.invalidateQuotes();
        break;
      case 'factors':
        deleted = await cache.invalidateFactors();
        break;
      case 'api':
        deleted = await cache.invalidateApiCache();
        break;
      case 'all':
        await cache.clear();
        deleted = -1; // Unknown exact count
        break;
      default:
        return res.status(400).json({
          success: false,
          error: { code: 'BAD_REQUEST', message: 'Invalid type: quotes, factors, api, or all' },
        });
    }

    return res.status(200).json({
      success: true,
      data: {
        type,
        deleted: deleted === -1 ? 'all' : deleted,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }

  // DELETE - Clear all cache
  if (req.method === 'DELETE') {
    await cache.clear();

    return res.status(200).json({
      success: true,
      data: { cleared: true },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }

  return res.status(405).json({
    success: false,
    error: { code: 'METHOD_NOT_ALLOWED', message: 'GET, POST, or DELETE required' },
  });
}
