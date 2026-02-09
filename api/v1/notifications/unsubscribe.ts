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
    const { endpoint } = req.body as { endpoint?: string };

    if (!endpoint) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'Subscription endpoint required',
        },
      });
    }

    const pushService = getPushService();
    const removed = pushService.removeSubscription(endpoint);

    return res.status(200).json({
      success: true,
      data: {
        endpoint,
        removed,
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: `req-${Math.random().toString(36).slice(2, 8)}`,
        latencyMs: Date.now() - start,
      },
    });
  } catch (error) {
    console.error('Push unsubscribe error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to remove subscription',
      },
    });
  }
}
