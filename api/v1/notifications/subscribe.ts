import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../../lib/auth.js';
import { getPushService, type PushSubscriptionData } from '../../../src/notifications/PushService';

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

  const user = await requireAuth(req, res);
  if (!user) return;

  const start = Date.now();

  try {
    const { subscription } = req.body as {
      subscription?: {
        endpoint?: string;
        keys?: { auth?: string; p256dh?: string };
      };
    };

    // Validate subscription object
    if (
      !subscription ||
      !subscription.endpoint ||
      !subscription.keys?.auth ||
      !subscription.keys?.p256dh
    ) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'Valid push subscription required (endpoint, keys.auth, keys.p256dh)',
        },
      });
    }

    // userId is derived from the verified auth token — never from request body
    const effectiveUserId = user.id;

    const subscriptionData: PushSubscriptionData = {
      endpoint: subscription.endpoint,
      keys: {
        auth: subscription.keys.auth,
        p256dh: subscription.keys.p256dh,
      },
    };

    const pushService = getPushService();
    pushService.addSubscription(effectiveUserId, subscriptionData);

    return res.status(200).json({
      success: true,
      data: {
        userId: effectiveUserId,
        endpoint: subscription.endpoint,
        subscribed: true,
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: `req-${Math.random().toString(36).slice(2, 8)}`,
        latencyMs: Date.now() - start,
      },
    });
  } catch (error) {
    console.error('Push subscribe error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to store subscription',
      },
    });
  }
}
