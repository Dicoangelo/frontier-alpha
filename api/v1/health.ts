import type { VercelRequest, VercelResponse } from '@vercel/node';

interface HealthCheck {
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
}

// Simple in-memory request counter
let requestCount = 0;
const startTime = Date.now();

// Check Supabase connection
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
  } catch (error) {
    return { status: 'error', message: 'Connection failed' };
  }
}

// Check external API (Polygon)
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
  } catch (error) {
    return { status: 'error', message: 'Connection failed' };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  requestCount++;
  const apiStart = Date.now();

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Quick mode - just API status
  const quick = req.query.quick === 'true';

  const apiLatency = Date.now() - apiStart;
  const uptime = Math.floor((Date.now() - startTime) / 1000);

  // Basic health check
  const healthCheck: HealthCheck = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    checks: {
      api: { status: 'ok', latencyMs: apiLatency },
    },
    metrics: {
      uptime,
      requestCount,
    },
  };

  // Extended checks (skip if quick mode)
  if (!quick) {
    // Check database
    const dbCheck = await checkDatabase();
    healthCheck.checks.database = dbCheck;

    // Check external APIs
    const externalCheck = await checkExternalApis();
    healthCheck.checks.external = externalCheck;

    // Determine overall status
    const allChecks = Object.values(healthCheck.checks);
    const errors = allChecks.filter((c) => c.status === 'error');

    if (errors.length >= 2) {
      healthCheck.status = 'unhealthy';
    } else if (errors.length === 1) {
      healthCheck.status = 'degraded';
    }
  }

  // Memory usage (if available)
  if (typeof process.memoryUsage === 'function') {
    const mem = process.memoryUsage();
    healthCheck.metrics.memoryUsage = Math.round(mem.heapUsed / 1024 / 1024); // MB
  }

  // Set appropriate status code
  const statusCode =
    healthCheck.status === 'healthy' ? 200 :
    healthCheck.status === 'degraded' ? 200 : 503;

  return res.status(statusCode).json(healthCheck);
}
