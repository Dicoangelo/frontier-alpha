import type { FastifyInstance } from 'fastify';
import { authMiddleware, hashApiKey } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { logger } from '../observability/logger.js';
import { randomBytes } from 'crypto';
import type { APIResponse } from '../types/index.js';

interface RouteContext {
  server: unknown;
}

export async function apiKeysRoutes(fastify: FastifyInstance, _opts: RouteContext) {
  // GET /api/v1/api-keys
  fastify.get<{ Reply: APIResponse<unknown[]> }>(
    '/api/v1/api-keys',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const start = Date.now();
      // authMiddleware ensures request.user is always defined

      const { data, error } = await supabaseAdmin
        .from('frontier_api_keys')
        .select('id, name, permissions, rate_limit, created_at, last_used_at, revoked_at')
        .eq('user_id', request.user.id)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error({ err: error }, 'Failed to fetch API keys');
        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Failed to load API keys' },
        });
      }

      // Fetch usage stats per key
      const keysWithStats = await Promise.all(
        (data || []).map(async (key) => {
          const { count } = await supabaseAdmin
            .from('frontier_api_key_usage')
            .select('*', { count: 'exact', head: true })
            .eq('api_key_id', key.id);

          return {
            ...key,
            usage_count: count || 0,
          };
        })
      );

      return {
        success: true,
        data: keysWithStats,
        meta: {
          timestamp: new Date(),
          requestId: request.id,
          latencyMs: Date.now() - start,
        },
      };
    }
  );

  // POST /api/v1/api-keys
  fastify.post<{
    Body: { name: string; permissions?: Record<string, boolean>; rate_limit?: number };
    Reply: APIResponse<unknown>;
  }>(
    '/api/v1/api-keys',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const start = Date.now();
      // authMiddleware ensures request.user is always defined

      const { name, permissions, rate_limit } = request.body;

      if (!name || name.trim().length === 0) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Key name is required' },
        });
      }

      // Generate a unique API key with fa_ prefix
      const rawKey = `fa_${randomBytes(32).toString('hex')}`;
      const keyHash = hashApiKey(rawKey);

      const { data, error } = await supabaseAdmin
        .from('frontier_api_keys')
        .insert({
          user_id: request.user.id,
          key_hash: keyHash,
          name: name.trim(),
          permissions: permissions || { read: true, write: false },
          rate_limit: rate_limit || 1000,
        })
        .select('id, name, permissions, rate_limit, created_at')
        .single();

      if (error) {
        logger.error({ err: error }, 'Failed to create API key');
        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Failed to create API key' },
        });
      }

      return {
        success: true,
        data: {
          ...data,
          // Return the raw key ONLY on creation -- it will never be shown again
          key: rawKey,
        },
        meta: {
          timestamp: new Date(),
          requestId: request.id,
          latencyMs: Date.now() - start,
        },
      };
    }
  );

  // DELETE /api/v1/api-keys/:id
  fastify.delete<{
    Params: { id: string };
    Reply: APIResponse<{ revoked: boolean }>;
  }>(
    '/api/v1/api-keys/:id',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const start = Date.now();
      const { id } = request.params;
      // authMiddleware ensures request.user is always defined

      const { data, error } = await supabaseAdmin
        .from('frontier_api_keys')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', request.user.id)
        .is('revoked_at', null)
        .select()
        .single();

      if (error || !data) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'API key not found or already revoked' },
        });
      }

      return {
        success: true,
        data: { revoked: true },
        meta: {
          timestamp: new Date(),
          requestId: request.id,
          latencyMs: Date.now() - start,
        },
      };
    }
  );
}
