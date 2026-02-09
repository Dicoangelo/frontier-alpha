import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPushService } from '../../../src/notifications/PushService';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'POST required' },
    });
  }

  const start = Date.now();

  try {
    const { userId, title, body, url, type } = req.body as {
      userId?: string;
      title?: string;
      body?: string;
      url?: string;
      type?: string;
    };

    // Validate required fields
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'userId is required' },
      });
    }

    if (!title || !body) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'title and body are required' },
      });
    }

    const pushService = getPushService();

    // Check if user has any subscriptions
    if (!pushService.hasSubscriptions(userId)) {
      return res.status(200).json({
        success: true,
        data: {
          delivered: 0,
          failed: 0,
          reason: 'No active push subscriptions for this user',
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: `req-${Math.random().toString(36).slice(2, 8)}`,
          latencyMs: Date.now() - start,
        },
      });
    }

    const results = await pushService.broadcastToUser(userId, {
      title,
      body,
      tag: type ? `${type}-${Date.now()}` : `manual-${Date.now()}`,
      data: {
        url: url || '/',
        type: type || 'manual',
      },
    });

    const delivered = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return res.status(200).json({
      success: true,
      data: {
        delivered,
        failed,
        results,
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: `req-${Math.random().toString(36).slice(2, 8)}`,
        latencyMs: Date.now() - start,
      },
    });
  } catch (error) {
    console.error('Push send error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to send push notification',
      },
    });
  }
}
