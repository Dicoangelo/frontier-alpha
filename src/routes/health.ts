import type { FastifyInstance } from 'fastify';
import { metrics } from '../observability/metrics.js';
import { logger } from '../observability/logger.js';

interface RouteContext {
  server: { version: string };
  pkg: { version: string };
}

// Module-level counters for the deep health endpoint
let requestCount = 0;
const startTime = Date.now();

async function checkDatabase(): Promise<{ status: 'ok' | 'error'; message?: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return { status: 'error', message: 'Database not configured' };
  }

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: 'GET',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
    });

    if (response.ok || response.status === 200) {
      return { status: 'ok' };
    }
    return { status: 'error', message: `HTTP ${response.status}` };
  } catch (_error) {
    return { status: 'error', message: 'Connection failed' };
  }
}

async function checkExternalApis(): Promise<{ status: 'ok' | 'error'; message?: string }> {
  const polygonKey = process.env.POLYGON_API_KEY;

  if (!polygonKey) {
    return { status: 'error', message: 'Polygon API not configured' };
  }

  try {
    const response = await fetch(
      `https://api.polygon.io/v2/aggs/ticker/AAPL/prev?adjusted=true&apiKey=${polygonKey}`
    );

    if (response.ok) {
      return { status: 'ok' };
    }
    if (response.status === 429) {
      return { status: 'ok', message: 'Rate limited (normal)' };
    }
    return { status: 'error', message: `HTTP ${response.status}` };
  } catch (_error) {
    return { status: 'error', message: 'Connection failed' };
  }
}

export async function healthRoutes(fastify: FastifyInstance, opts: RouteContext) {
  const { pkg } = opts;

  // GET /health — lightweight liveness probe
  fastify.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString(), version: pkg.version };
  });

  // GET /api/health — platform-level liveness (matches old Vercel api/health.ts)
  fastify.get('/api/health', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: pkg.version,
      platform: process.env.VERCEL ? 'vercel' : 'fastify',
    };
  });

  // GET /api/v1/health — deep health check with DB + external API checks
  fastify.get<{ Querystring: { quick?: string } }>(
    '/api/v1/health',
    async (request, reply) => {
      requestCount++;
      const apiStart = Date.now();
      const quick = request.query.quick === 'true';
      const uptime = Math.floor((Date.now() - startTime) / 1000);

      const healthCheck: {
        status: 'healthy' | 'degraded' | 'unhealthy';
        timestamp: string;
        version: string;
        environment: string;
        checks: {
          api: { status: 'ok' | 'error'; latencyMs: number };
          database?: { status: 'ok' | 'error'; message?: string };
          external?: { status: 'ok' | 'error'; message?: string };
        };
        metrics: {
          uptime: number;
          memoryUsage?: number;
          requestCount?: number;
        };
      } = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: pkg.version,
        environment: process.env.NODE_ENV || 'development',
        checks: {
          api: { status: 'ok', latencyMs: Date.now() - apiStart },
        },
        metrics: {
          uptime,
          requestCount,
        },
      };

      if (!quick) {
        const [dbCheck, externalCheck] = await Promise.all([
          checkDatabase(),
          checkExternalApis(),
        ]);
        healthCheck.checks.database = dbCheck;
        healthCheck.checks.external = externalCheck;

        const allChecks = Object.values(healthCheck.checks);
        const errors = allChecks.filter((c) => c.status === 'error');
        if (errors.length >= 2) {
          healthCheck.status = 'unhealthy';
        } else if (errors.length === 1) {
          healthCheck.status = 'degraded';
        }
      }

      if (typeof process.memoryUsage === 'function') {
        const mem = process.memoryUsage();
        healthCheck.metrics.memoryUsage = Math.round(mem.heapUsed / 1024 / 1024);
      }

      const statusCode = healthCheck.status === 'unhealthy' ? 503 : 200;
      return reply.status(statusCode).send(healthCheck);
    }
  );

  // GET /api/v1/metrics — Prometheus metrics
  fastify.get('/api/v1/metrics', async (_request, reply) => {
    reply.type('text/plain; version=0.0.4; charset=utf-8');
    return metrics.toPrometheus();
  });
}
