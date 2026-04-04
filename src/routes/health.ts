import type { FastifyInstance } from 'fastify';
import { metrics } from '../observability/metrics.js';

interface RouteContext {
  server: { version: string };
  pkg: { version: string };
}

export async function healthRoutes(fastify: FastifyInstance, opts: RouteContext) {
  const { pkg } = opts;

  // GET /health
  fastify.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString(), version: pkg.version };
  });

  // GET /api/v1/metrics — Prometheus metrics
  fastify.get('/api/v1/metrics', async (_request, reply) => {
    reply.type('text/plain; version=0.0.4; charset=utf-8');
    return metrics.toPrometheus();
  });
}
