import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth.js';
import { logger } from '../observability/logger.js';
import {
  provenanceDag,
  PROVENANCE_NODE_TYPES,
  type ProvenanceNodeType,
} from '../forensics/ProvenanceDag.js';
import type { APIResponse } from '../types/index.js';

/**
 * Provenance DAG routes (IDEA-FF-3).
 *
 * GET /api/v1/provenance/recent       — paginated per-user nodes (?nodeType=)
 * GET /api/v1/provenance/:id/lineage  — full ancestry walk for one node
 *
 * DAG WRITES happen at the producing routes (explain, portfolio/optimize,
 * trading/orders) — these endpoints only read. Both no-op gracefully until
 * the `frontier_provenance_nodes` migration is applied in production.
 */
export async function provenanceRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  // GET /api/v1/provenance/recent
  fastify.get<{
    Querystring: { limit?: string; offset?: string; nodeType?: string };
    Reply: APIResponse<unknown>;
  }>('/api/v1/provenance/recent', async (request, reply) => {
    const start = Date.now();
    const userId = request.user?.id;

    if (!userId) {
      return reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      });
    }

    const rawType = request.query.nodeType;
    if (rawType && !PROVENANCE_NODE_TYPES.includes(rawType as ProvenanceNodeType)) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `nodeType must be one of: ${PROVENANCE_NODE_TYPES.join(', ')}`,
        },
      });
    }

    try {
      const result = await provenanceDag.recent(userId, {
        limit: request.query.limit ? Number(request.query.limit) : undefined,
        offset: request.query.offset ? Number(request.query.offset) : undefined,
        nodeType: rawType as ProvenanceNodeType | undefined,
      });

      return {
        success: true,
        data: result,
        meta: {
          timestamp: new Date(),
          requestId: request.id,
          latencyMs: Date.now() - start,
        },
      };
    } catch (err) {
      logger.error({ err, userId }, 'Failed to list provenance nodes');
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to list provenance nodes' },
      });
    }
  });

  // GET /api/v1/provenance/:id/lineage
  fastify.get<{
    Params: { id: string };
    Reply: APIResponse<unknown>;
  }>('/api/v1/provenance/:id/lineage', async (request, reply) => {
    const start = Date.now();
    const userId = request.user?.id;

    if (!userId) {
      return reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      });
    }

    try {
      const result = await provenanceDag.lineage(userId, request.params.id);

      if (result === null) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Provenance node not found' },
        });
      }

      return {
        success: true,
        data: result,
        meta: {
          timestamp: new Date(),
          requestId: request.id,
          latencyMs: Date.now() - start,
        },
      };
    } catch (err) {
      logger.error({ err, userId, nodeId: request.params.id }, 'Failed to walk lineage');
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to walk lineage' },
      });
    }
  });
}
