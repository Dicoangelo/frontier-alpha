import type { FastifyInstance } from 'fastify';
import { metrics } from '../observability/metrics.js';
import { logger } from '../observability/logger.js';
import type {
  IntegrationHealthEntry,
  IntegrationsHealthResponse,
} from '../types/index.js';

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

  // GET /api/v1/health/integrations — read-only wiring status for every
  // external integration. Pure env inspection (no network calls, no
  // side effects). Always returns 200 — degraded is informational.
  fastify.get('/api/v1/health/integrations', async (_request, reply) => {
    const env = process.env;
    const has = (name: string): boolean => Boolean(env[name] && env[name]!.length > 0);

    const integrations: Record<string, IntegrationHealthEntry> = {};

    // --- Supabase (database + RLS) -----------------------------------------
    // Mirrors checkDatabase() above: service key OR anon key gates access.
    const supabaseKeyVar = has('SUPABASE_SERVICE_KEY')
      ? 'SUPABASE_SERVICE_KEY'
      : has('NEXT_PUBLIC_SUPABASE_ANON_KEY')
        ? 'NEXT_PUBLIC_SUPABASE_ANON_KEY'
        : null;
    const supabaseUrlPresent = has('NEXT_PUBLIC_SUPABASE_URL');
    if (supabaseKeyVar && supabaseUrlPresent) {
      integrations.supabase = {
        status: 'live',
        via: supabaseKeyVar,
      };
    } else {
      integrations.supabase = {
        status: 'degraded',
        via: null,
        reason: !supabaseUrlPresent
          ? 'NEXT_PUBLIC_SUPABASE_URL not set'
          : 'No Supabase key (SUPABASE_SERVICE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY) set',
        impact: 'database reads/writes unavailable; RLS-gated endpoints return 503',
      };
    }

    // --- Polygon (REST) -----------------------------------------------------
    if (has('POLYGON_API_KEY')) {
      integrations.polygon = {
        status: 'live',
        via: 'POLYGON_API_KEY',
        mode: 'rest',
      };
    } else {
      integrations.polygon = {
        status: 'degraded',
        via: null,
        reason: 'POLYGON_API_KEY not set',
        fallback: 'mock quotes (dev only)',
      };
    }

    // --- Polygon WebSocket --------------------------------------------------
    // Vercel serverless runtimes cannot host long-lived WS connections,
    // so this is structurally degraded on Vercel regardless of key presence.
    if (env.VERCEL) {
      integrations.polygonWebSocket = {
        status: 'degraded',
        reason: 'Vercel serverless cannot host long-lived WS',
        fallback: 'rest polling + mock stream',
      };
    } else if (has('POLYGON_API_KEY')) {
      integrations.polygonWebSocket = {
        status: 'live',
        via: 'POLYGON_API_KEY',
        mode: 'websocket',
      };
    } else {
      integrations.polygonWebSocket = {
        status: 'degraded',
        via: null,
        reason: 'POLYGON_API_KEY not set',
        fallback: 'mock stream',
      };
    }

    // --- Alpha Vantage ------------------------------------------------------
    if (has('ALPHA_VANTAGE_API_KEY')) {
      integrations.alphaVantage = {
        status: 'live',
        via: 'ALPHA_VANTAGE_API_KEY',
      };
    } else {
      integrations.alphaVantage = {
        status: 'degraded',
        via: null,
        reason: 'ALPHA_VANTAGE_API_KEY not set',
        fallback: 'polygon-only fundamentals (where available)',
      };
    }

    // --- LLM Explainer ------------------------------------------------------
    // Mirrors ExplanationService.resolveLLMProvider(): DeepSeek preferred,
    // OpenAI second, template fallback last.
    if (has('DEEPSEEK_API_KEY')) {
      integrations.llmExplainer = {
        status: 'live',
        via: 'DEEPSEEK_API_KEY',
        provider: 'deepseek',
      };
    } else if (has('OPENAI_API_KEY')) {
      integrations.llmExplainer = {
        status: 'live',
        via: 'OPENAI_API_KEY',
        provider: 'openai',
      };
    } else {
      integrations.llmExplainer = {
        status: 'degraded',
        via: null,
        reason: 'Neither DEEPSEEK_API_KEY nor OPENAI_API_KEY set',
        fallback: 'template',
      };
    }

    // --- Stripe -------------------------------------------------------------
    // BILLING_ENABLED gate: even when the Stripe key is wired, billing is OFF
    // by default (BILLING_ENABLED must be explicitly 'true' to enable
    // checkout). Triggers the Pricing page graceful-degrade UI ("Get Notified"
    // mailto fallback) so accidental live charges aren't possible during dev.
    const billingEnabled = (env.BILLING_ENABLED ?? '').toLowerCase() === 'true';
    if (!has('STRIPE_SECRET_KEY')) {
      integrations.stripe = {
        status: 'degraded',
        via: null,
        reason: 'STRIPE_SECRET_KEY not set',
        impact: 'checkout endpoint returns 503',
      };
    } else if (!billingEnabled) {
      integrations.stripe = {
        status: 'degraded',
        via: 'STRIPE_SECRET_KEY',
        reason: 'BILLING_ENABLED is not set to "true"',
        impact: 'Pricing CTAs fall back to mailto; live charges blocked',
      };
    } else {
      integrations.stripe = {
        status: 'live',
        via: 'STRIPE_SECRET_KEY',
      };
    }

    // --- Alpaca / SimulatedBroker (broker) ---------------------------------
    // When ALPACA_API_KEY + ALPACA_API_SECRET are both set we route trading
    // through AlpacaAdapter. Otherwise the internal SimulatedBroker takes
    // over: live Polygon quote stream for fills, Supabase-persisted accounts /
    // orders / positions. Both modes report `status: 'live'` because a real
    // broker is wired either way.
    const alpacaKey = has('ALPACA_API_KEY');
    const alpacaSecret = has('ALPACA_API_SECRET');
    const alpacaPaper = (env.ALPACA_PAPER_TRADING ?? 'true') !== 'false';
    if (alpacaKey && alpacaSecret) {
      integrations.alpaca = {
        status: 'live',
        via: 'ALPACA_API_KEY',
        mode: alpacaPaper ? 'paper' : 'live',
      };
    } else {
      integrations.alpaca = {
        status: 'live',
        via: null,
        mode: 'simulated',
        provider: 'frontier-alpha-internal',
        reason: 'Internal simulated broker (live quotes, Supabase-persisted positions)',
      };
    }

    // --- VAPID Web Push -----------------------------------------------------
    const vapidPub = has('VAPID_PUBLIC_KEY');
    const vapidPriv = has('VAPID_PRIVATE_KEY');
    if (vapidPub && vapidPriv) {
      integrations.vapidPush = {
        status: 'live',
        via: 'VAPID_PUBLIC_KEY+VAPID_PRIVATE_KEY',
      };
    } else {
      integrations.vapidPush = {
        status: 'degraded',
        via: null,
        reason: !vapidPub && !vapidPriv
          ? 'VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY not set'
          : !vapidPub
            ? 'VAPID_PUBLIC_KEY not set'
            : 'VAPID_PRIVATE_KEY not set',
        fallback: 'SSE-only delivery (no native push notifications)',
      };
    }

    // --- Email delivery -----------------------------------------------------
    // AlertDelivery: provider defaults to 'console' when EMAIL_PROVIDER unset.
    // Treat 'console' (or unset) as degraded — it doesn't actually send mail.
    const emailProvider = env.EMAIL_PROVIDER;
    // Trim the env value — Vercel CLI occasionally injects trailing newlines
    // when env vars are added via `echo | vercel env add`, and surfacing
    // "resend\n" via the JSON makes the health probe look broken.
    const emailProviderClean = emailProvider?.trim();
    if (has('EMAIL_API_KEY') && emailProviderClean && emailProviderClean !== 'console') {
      integrations.emailDelivery = {
        status: 'live',
        via: 'EMAIL_API_KEY',
        provider: emailProviderClean,
      };
    } else {
      integrations.emailDelivery = {
        status: 'degraded',
        via: null,
        provider: emailProviderClean || 'console',
        reason: !has('EMAIL_API_KEY')
          ? 'EMAIL_API_KEY not set'
          : 'EMAIL_PROVIDER unset or set to "console"',
        fallback: 'log-to-console (no real mail sent)',
      };
    }

    // --- Rate limiter (Redis) ----------------------------------------------
    // Either REDIS_URL (self-hosted) or UPSTASH_REDIS_REST_URL (serverless)
    // satisfies the rate limiter. In-memory fallback resets per cold start.
    const redisVar = has('REDIS_URL')
      ? 'REDIS_URL'
      : has('UPSTASH_REDIS_REST_URL')
        ? 'UPSTASH_REDIS_REST_URL'
        : null;
    if (redisVar) {
      integrations.rateLimiter = {
        status: 'live',
        via: redisVar,
      };
    } else {
      integrations.rateLimiter = {
        status: 'degraded',
        via: null,
        reason: 'Neither REDIS_URL nor UPSTASH_REDIS_REST_URL set',
        fallback: 'in-memory (resets per cold start)',
      };
    }

    // --- Connect Alpaca encryption (Pro+ feature) --------------------------
    // BROKER_CRED_ENC_KEY is a 64-char hex (32 byte AES-256 key). Without it,
    // POST /api/v1/broker/connect returns 503 because we refuse to persist
    // plaintext credentials. The probe round-trips an encrypt/decrypt to
    // catch malformed keys early instead of waiting for first user attempt.
    const brokerEncKey = env.BROKER_CRED_ENC_KEY;
    let cryptoReady = false;
    if (brokerEncKey && brokerEncKey.trim().length === 64) {
      try {
        const { isCryptoReady } = await import('../lib/crypto.js');
        cryptoReady = isCryptoReady();
      } catch {
        cryptoReady = false;
      }
    }
    if (cryptoReady) {
      integrations.connectAlpaca = {
        status: 'live',
        via: 'BROKER_CRED_ENC_KEY',
        provider: 'AES-256-GCM at rest',
      };
    } else {
      integrations.connectAlpaca = {
        status: 'degraded',
        via: null,
        reason: !brokerEncKey
          ? 'BROKER_CRED_ENC_KEY not set'
          : 'BROKER_CRED_ENC_KEY malformed (must be 64-char hex / 32 bytes)',
        fallback: 'POST /api/v1/broker/connect returns 503',
      };
    }

    // --- Weekly digest cron ------------------------------------------------
    // Vercel cron hits /api/v1/digest/run on Mondays 13:00 UTC. CRON_SECRET
    // gates the endpoint — without it the endpoint 503s and the cron silently
    // fails. Surface here so operators see at a glance whether the schedule
    // can actually authorize.
    if (has('CRON_SECRET')) {
      integrations.weeklyDigestCron = {
        status: 'live',
        via: 'CRON_SECRET',
        provider: 'vercel-cron',
        mode: 'mon-13-00-utc',
      };
    } else {
      integrations.weeklyDigestCron = {
        status: 'degraded',
        via: null,
        reason: 'CRON_SECRET not set',
        fallback: 'Vercel cron will fire but endpoint returns 503',
      };
    }

    // --- Comp-customer guard (always live, code-only) ----------------------
    // Stripe webhook branches and POST /billing/checkout refuse to clobber
    // rows whose stripe_customer_id starts with `comp_`. No env var, but
    // surfacing the guard makes the protection visible in /health output.
    integrations.compGuard = {
      status: 'live',
      via: null,
      provider: 'code-level',
      mode: 'comp_* sentinel ids immune to webhooks',
    };

    // --- ML Sentiment endpoint ---------------------------------------------
    // Tier 1: dedicated FinBERT/Python service via ML_SENTIMENT_ENDPOINT
    // Tier 2: DeepSeek/OpenAI sentiment classification (cheaper, no Python)
    // Tier 3: keyword lexicon fallback (always available)
    if (has('ML_SENTIMENT_ENDPOINT')) {
      integrations.mlSentiment = {
        status: 'live',
        via: 'ML_SENTIMENT_ENDPOINT',
        mode: 'finbert',
      };
    } else if (has('DEEPSEEK_API_KEY')) {
      integrations.mlSentiment = {
        status: 'live',
        via: 'DEEPSEEK_API_KEY',
        mode: 'llm-classification',
      };
    } else if (has('OPENAI_API_KEY')) {
      integrations.mlSentiment = {
        status: 'live',
        via: 'OPENAI_API_KEY',
        mode: 'llm-classification',
      };
    } else {
      integrations.mlSentiment = {
        status: 'degraded',
        via: null,
        reason: 'No ML endpoint or LLM key',
        fallback: 'lexicon-based sentiment scoring',
      };
    }

    // --- Summary -----------------------------------------------------------
    const entries = Object.values(integrations);
    const live = entries.filter((e) => e.status === 'live').length;
    const degraded = entries.filter((e) => e.status === 'degraded').length;

    const response: IntegrationsHealthResponse = {
      checkedAt: new Date().toISOString(),
      integrations,
      summary: {
        live,
        degraded,
        total: entries.length,
      },
    };

    return reply.status(200).send(response);
  });
}
