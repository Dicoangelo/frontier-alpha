import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { logger } from '../observability/logger.js';
import type { APIResponse } from '../types/index.js';

interface RouteContext {
  server: unknown;
}

export async function settingsRoutes(fastify: FastifyInstance, _opts: RouteContext) {
  // GET /api/v1/settings
  fastify.get<{ Reply: APIResponse<unknown> }>(
    '/api/v1/settings',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const start = Date.now();

      // authMiddleware ensures request.user is always defined
      const { data, error } = await supabaseAdmin
        .from('frontier_user_settings')
        .select('*')
        .eq('user_id', request.user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        logger.error({ err: error }, 'Failed to fetch user settings');
        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Failed to load settings' },
        });
      }

      return {
        success: true,
        data: data || {
          display_name: null,
          risk_tolerance: 'moderate',
          notifications_enabled: true,
          email_alerts: true,
          max_position_pct: 20,
          stop_loss_pct: 10,
          take_profit_pct: 25,
        },
        meta: {
          timestamp: new Date(),
          requestId: request.id,
          latencyMs: Date.now() - start,
        },
      };
    }
  );

  // PUT /api/v1/settings
  fastify.put<{
    Body: {
      display_name?: string;
      risk_tolerance?: 'conservative' | 'moderate' | 'aggressive';
      notifications_enabled?: boolean;
      email_alerts?: boolean;
      max_position_pct?: number;
      stop_loss_pct?: number;
      take_profit_pct?: number;
    };
    Reply: APIResponse<unknown>;
  }>(
    '/api/v1/settings',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const start = Date.now();

      // authMiddleware ensures request.user is always defined
      const { data, error } = await supabaseAdmin
        .from('frontier_user_settings')
        .upsert({
          user_id: request.user.id,
          ...request.body,
        })
        .select()
        .single();

      if (error) {
        logger.error({ err: error }, 'Failed to update settings');
        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Failed to update settings' },
        });
      }

      return {
        success: true,
        data,
        meta: {
          timestamp: new Date(),
          requestId: request.id,
          latencyMs: Date.now() - start,
        },
      };
    }
  );
}
