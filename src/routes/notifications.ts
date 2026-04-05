/**
 * Notifications routes — Web Push subscribe/unsubscribe/send.
 *
 * Ported from the hand-written Vercel functions in `api/v1/notifications/*`
 * to unify on the single Fastify surface exposed via `buildApp()`.
 * Subscribe derives userId from the verified auth token — never from the
 * request body — to prevent spoofing.
 */

import type { FastifyInstance } from 'fastify';
import { getPushService, type PushSubscriptionData } from '../notifications/PushService.js';
import { authMiddleware } from '../middleware/auth.js';
import { logger } from '../observability/logger.js';
import type { APIResponse } from '../types/index.js';

interface RouteContext {
  server: unknown;
}

interface SubscribeBody {
  subscription?: {
    endpoint?: string;
    keys?: { auth?: string; p256dh?: string };
  };
}

interface UnsubscribeBody {
  endpoint?: string;
}

interface SendBody {
  userId?: string;
  title?: string;
  body?: string;
  url?: string;
  type?: string;
}

export async function notificationsRoutes(fastify: FastifyInstance, _opts: RouteContext) {
  // POST /api/v1/notifications/subscribe
  fastify.post<{ Body: SubscribeBody; Reply: APIResponse<unknown> }>(
    '/api/v1/notifications/subscribe',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const start = Date.now();
      const user = request.user!;
      const { subscription } = request.body || {};

      if (
        !subscription ||
        !subscription.endpoint ||
        !subscription.keys?.auth ||
        !subscription.keys?.p256dh
      ) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'BAD_REQUEST',
            message: 'Valid push subscription required (endpoint, keys.auth, keys.p256dh)',
          },
        });
      }

      try {
        const subscriptionData: PushSubscriptionData = {
          endpoint: subscription.endpoint,
          keys: { auth: subscription.keys.auth, p256dh: subscription.keys.p256dh },
        };

        getPushService().addSubscription(user.id, subscriptionData);

        return {
          success: true,
          data: { userId: user.id, endpoint: subscription.endpoint, subscribed: true },
          meta: { timestamp: new Date(), requestId: request.id, latencyMs: Date.now() - start },
        };
      } catch (error) {
        logger.error({ err: error }, 'Push subscribe error');
        return reply.status(500).send({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : 'Failed to store subscription',
          },
        });
      }
    }
  );

  // POST /api/v1/notifications/unsubscribe
  fastify.post<{ Body: UnsubscribeBody; Reply: APIResponse<unknown> }>(
    '/api/v1/notifications/unsubscribe',
    async (request, reply) => {
      const start = Date.now();
      const { endpoint } = request.body || {};

      if (!endpoint) {
        return reply.status(400).send({
          success: false,
          error: { code: 'BAD_REQUEST', message: 'Subscription endpoint required' },
        });
      }

      try {
        const removed = getPushService().removeSubscription(endpoint);
        return {
          success: true,
          data: { endpoint, removed },
          meta: { timestamp: new Date(), requestId: request.id, latencyMs: Date.now() - start },
        };
      } catch (error) {
        logger.error({ err: error }, 'Push unsubscribe error');
        return reply.status(500).send({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : 'Failed to remove subscription',
          },
        });
      }
    }
  );

  // POST /api/v1/notifications/send
  fastify.post<{ Body: SendBody; Reply: APIResponse<unknown> }>(
    '/api/v1/notifications/send',
    async (request, reply) => {
      const start = Date.now();
      const { userId, title, body, url, type } = request.body || {};

      if (!userId) {
        return reply.status(400).send({
          success: false,
          error: { code: 'BAD_REQUEST', message: 'userId is required' },
        });
      }
      if (!title || !body) {
        return reply.status(400).send({
          success: false,
          error: { code: 'BAD_REQUEST', message: 'title and body are required' },
        });
      }

      try {
        const pushService = getPushService();

        if (!pushService.hasSubscriptions(userId)) {
          return {
            success: true,
            data: { delivered: 0, failed: 0, reason: 'No active push subscriptions for this user' },
            meta: { timestamp: new Date(), requestId: request.id, latencyMs: Date.now() - start },
          };
        }

        const results = await pushService.broadcastToUser(userId, {
          title,
          body,
          tag: type ? `${type}-${Date.now()}` : `manual-${Date.now()}`,
          data: { url: url || '/', type: type || 'manual' },
        });

        const delivered = results.filter((r) => r.success).length;
        const failed = results.filter((r) => !r.success).length;

        return {
          success: true,
          data: { delivered, failed, results },
          meta: { timestamp: new Date(), requestId: request.id, latencyMs: Date.now() - start },
        };
      } catch (error) {
        logger.error({ err: error }, 'Push send error');
        return reply.status(500).send({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : 'Failed to send push notification',
          },
        });
      }
    }
  );
}
