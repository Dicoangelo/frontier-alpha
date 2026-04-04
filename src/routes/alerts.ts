import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { logger } from '../observability/logger.js';
import type { APIResponse } from '../types/index.js';

interface RouteContext {
  server: unknown;
}

export async function alertsRoutes(fastify: FastifyInstance, _opts: RouteContext) {
  // GET /api/v1/alerts
  fastify.get<{ Reply: APIResponse<unknown[]> }>(
    '/api/v1/alerts',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const start = Date.now();
      // authMiddleware ensures request.user is always defined

      const { data, error } = await supabaseAdmin
        .from('frontier_risk_alerts')
        .select('*')
        .eq('user_id', request.user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        logger.error({ err: error }, 'Failed to fetch alerts');
        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Failed to load alerts' },
        });
      }

      return {
        success: true,
        data: data || [],
        meta: {
          timestamp: new Date(),
          requestId: request.id,
          latencyMs: Date.now() - start,
        },
      };
    }
  );

  // PUT /api/v1/alerts/:id/acknowledge
  fastify.put<{
    Params: { id: string };
    Reply: APIResponse<unknown>;
  }>(
    '/api/v1/alerts/:id/acknowledge',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const start = Date.now();
      const { id } = request.params;
      // authMiddleware ensures request.user is always defined

      const { data, error } = await supabaseAdmin
        .from('frontier_risk_alerts')
        .update({ acknowledged_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', request.user.id)
        .select()
        .single();

      if (error) {
        logger.error({ err: error }, 'Failed to acknowledge alert');
        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Failed to acknowledge alert' },
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
