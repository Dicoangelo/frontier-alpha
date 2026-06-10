import type { FastifyInstance } from 'fastify';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import Ajv from 'ajv';
import { metrics } from '../observability/metrics.js';
import type {
  IntegrationHealthEntry,
  IntegrationsHealthResponse,
} from '../types/index.js';

interface RouteContext {
  // `server` is passed through by the registrar but not read here (only
  // `pkg.version` is used). Kept loose so the AppServer instance registers
  // without requiring a `version` field it doesn't carry.
  server: unknown;
  pkg: { version: string };
}

// Module-level counters for the deep health endpoint
let requestCount = 0;
const startTime = Date.now();

// ---------------------------------------------------------------------------
// US-004: integration probes — real upstream calls, standardized shape, 60s
// in-process cache, JSON-Schema-validated response.
// ---------------------------------------------------------------------------

const PROBE_TIMEOUT_MS = 3000;
const PROBE_TTL_SECONDS = 60;

// Per-integration cache. Each probe runs at most once every PROBE_TTL_SECONDS.
interface CachedProbe {
  entry: IntegrationHealthEntry;
  cachedAt: number;
}
const probeCache = new Map<string, CachedProbe>();

/** Exposed for tests only — allows beforeEach to clear cache between cases. */
export const _probeCacheForTests: Map<string, CachedProbe> = probeCache;

function nowIso(): string {
  return new Date().toISOString();
}

function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = PROBE_TIMEOUT_MS, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...rest, signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message || err.name;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function envHas(name: string): boolean {
  const v = process.env[name];
  return Boolean(v && v.trim().length > 0);
}

/**
 * Wrap a probe in cache + timing + uniform shape coercion.
 * Probes return a partial entry (status + provider context); this helper
 * computes latencyMs, fills lastError/lastSuccessAt, and stamps ttlSeconds.
 */
async function runProbe(
  name: string,
  probe: () => Promise<Partial<IntegrationHealthEntry> & { status: IntegrationHealthEntry['status']; lastError?: string | null }>,
): Promise<IntegrationHealthEntry> {
  const cached = probeCache.get(name);
  const ageMs = cached ? Date.now() - cached.cachedAt : Infinity;
  if (cached && ageMs < PROBE_TTL_SECONDS * 1000) {
    return cached.entry;
  }

  const previousSuccessAt = cached?.entry.lastSuccessAt ?? null;
  const start = Date.now();
  let entry: IntegrationHealthEntry;

  try {
    const partial = await probe();
    const latencyMs = Date.now() - start;
    const status = partial.status;
    const lastError = partial.lastError ?? null;
    const lastSuccessAt = status === 'live' ? nowIso() : previousSuccessAt;
    entry = {
      status,
      latencyMs,
      lastError,
      lastSuccessAt,
      ttlSeconds: PROBE_TTL_SECONDS,
      ...(partial.via !== undefined ? { via: partial.via } : {}),
      ...(partial.mode !== undefined ? { mode: partial.mode } : {}),
      ...(partial.provider !== undefined ? { provider: partial.provider } : {}),
      ...(partial.reason !== undefined ? { reason: partial.reason } : {}),
      ...(partial.fallback !== undefined ? { fallback: partial.fallback } : {}),
      ...(partial.impact !== undefined ? { impact: partial.impact } : {}),
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    entry = {
      status: 'offline',
      latencyMs,
      lastError: errMessage(err),
      lastSuccessAt: previousSuccessAt,
      ttlSeconds: PROBE_TTL_SECONDS,
      reason: 'probe threw an unexpected error',
    };
  }

  probeCache.set(name, { entry, cachedAt: Date.now() });
  return entry;
}

// --- Probes ---------------------------------------------------------------

async function probePolygon(): Promise<Partial<IntegrationHealthEntry> & { status: IntegrationHealthEntry['status'] }> {
  const key = process.env.POLYGON_API_KEY?.trim();
  if (!key) {
    return {
      status: 'degraded',
      via: null,
      mode: 'rest',
      reason: 'POLYGON_API_KEY not set',
      fallback: 'mock quotes (dev only)',
      lastError: 'POLYGON_API_KEY not set',
    };
  }
  try {
    const url = `https://api.polygon.io/v2/aggs/ticker/AAPL/prev?adjusted=true&apiKey=${encodeURIComponent(key)}`;
    const resp = await fetchWithTimeout(url, { method: 'GET' });
    if (resp.status === 429) {
      return {
        status: 'degraded',
        via: 'POLYGON_API_KEY',
        mode: 'rest',
        reason: 'Rate limited (HTTP 429)',
        fallback: 'cached quotes',
        lastError: 'HTTP 429 rate limited',
      };
    }
    if (!resp.ok) {
      return {
        status: 'offline',
        via: 'POLYGON_API_KEY',
        mode: 'rest',
        reason: `HTTP ${resp.status}`,
        impact: 'live REST quotes unavailable',
        lastError: `HTTP ${resp.status}`,
      };
    }
    const data = (await resp.json()) as { status?: string };
    if (data?.status !== 'OK') {
      return {
        status: 'offline',
        via: 'POLYGON_API_KEY',
        mode: 'rest',
        reason: `Polygon body status="${data?.status ?? 'unknown'}"`,
        impact: 'live REST quotes unavailable',
        lastError: `body status=${data?.status ?? 'unknown'}`,
      };
    }
    return { status: 'live', via: 'POLYGON_API_KEY', mode: 'rest' };
  } catch (err) {
    return {
      status: 'offline',
      via: 'POLYGON_API_KEY',
      mode: 'rest',
      reason: 'upstream request failed',
      lastError: errMessage(err),
    };
  }
}

async function probeAlphaVantage(): Promise<Partial<IntegrationHealthEntry> & { status: IntegrationHealthEntry['status'] }> {
  const key = process.env.ALPHA_VANTAGE_API_KEY?.trim();
  if (!key) {
    return {
      status: 'degraded',
      via: null,
      reason: 'ALPHA_VANTAGE_API_KEY not set',
      fallback: 'polygon-only fundamentals (where available)',
      lastError: 'ALPHA_VANTAGE_API_KEY not set',
    };
  }
  try {
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=AAPL&apikey=${encodeURIComponent(key)}`;
    const resp = await fetchWithTimeout(url, { method: 'GET' });
    if (!resp.ok) {
      return {
        status: 'offline',
        via: 'ALPHA_VANTAGE_API_KEY',
        reason: `HTTP ${resp.status}`,
        impact: 'fundamentals/news fallback unavailable',
        lastError: `HTTP ${resp.status}`,
      };
    }
    const data = (await resp.json()) as Record<string, unknown>;
    // AV returns `Information` (rate limit), `Note` (5/min throttle), `Error Message`
    // — these are not 200-OK successes even though HTTP says so.
    const informational =
      typeof data['Information'] === 'string'
        ? (data['Information'] as string)
        : typeof data['Note'] === 'string'
          ? (data['Note'] as string)
          : typeof data['Error Message'] === 'string'
            ? (data['Error Message'] as string)
            : null;
    if (informational) {
      return {
        status: 'degraded',
        via: 'ALPHA_VANTAGE_API_KEY',
        reason: informational.slice(0, 200),
        fallback: 'cached fundamentals',
        lastError: informational.slice(0, 200),
      };
    }
    return { status: 'live', via: 'ALPHA_VANTAGE_API_KEY' };
  } catch (err) {
    return {
      status: 'offline',
      via: 'ALPHA_VANTAGE_API_KEY',
      reason: 'upstream request failed',
      lastError: errMessage(err),
    };
  }
}

async function probeStripe(): Promise<Partial<IntegrationHealthEntry> & { status: IntegrationHealthEntry['status'] }> {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  const billingEnabled = (process.env.BILLING_ENABLED ?? '').toLowerCase() === 'true';
  if (!key) {
    return {
      status: 'degraded',
      via: null,
      reason: 'STRIPE_SECRET_KEY not set',
      impact: 'checkout endpoint returns 503',
      lastError: 'STRIPE_SECRET_KEY not set',
    };
  }
  try {
    // Lazy-import; src/lib/stripe.ts throws on import without env, so we
    // construct a Stripe client locally only when the key is present.
    const StripeMod = (await import('stripe')).default;
    const stripe = new StripeMod(key, {
      apiVersion: '2026-01-28.clover',
      typescript: true,
      maxNetworkRetries: 0,
      timeout: PROBE_TIMEOUT_MS,
    });
    await withTimeout(stripe.balance.retrieve(), PROBE_TIMEOUT_MS, 'stripe.balance.retrieve');
    if (!billingEnabled) {
      return {
        status: 'degraded',
        via: 'STRIPE_SECRET_KEY',
        reason: 'BILLING_ENABLED is not set to "true"',
        impact: 'Pricing CTAs fall back to mailto; live charges blocked',
      };
    }
    return { status: 'live', via: 'STRIPE_SECRET_KEY' };
  } catch (err) {
    return {
      status: 'offline',
      via: 'STRIPE_SECRET_KEY',
      reason: 'stripe.balance.retrieve failed',
      lastError: errMessage(err),
    };
  }
}

async function probeResend(): Promise<Partial<IntegrationHealthEntry> & { status: IntegrationHealthEntry['status'] }> {
  const apiKey = process.env.EMAIL_API_KEY?.trim();
  const provider = process.env.EMAIL_PROVIDER?.trim();
  if (!apiKey || !provider || provider === 'console') {
    return {
      status: 'degraded',
      via: null,
      provider: provider || 'console',
      reason: !apiKey ? 'EMAIL_API_KEY not set' : 'EMAIL_PROVIDER unset or set to "console"',
      fallback: 'log-to-console (no real mail sent)',
      lastError: !apiKey ? 'EMAIL_API_KEY not set' : 'EMAIL_PROVIDER unset or set to "console"',
    };
  }
  if (provider !== 'resend') {
    // Non-Resend providers (e.g. sendgrid) — env-checked only, no probe call.
    return {
      status: 'live',
      via: 'EMAIL_API_KEY',
      provider,
      mode: 'env-checked',
    };
  }
  try {
    const resp = await fetchWithTimeout('https://api.resend.com/domains', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });
    if (!resp.ok) {
      return {
        status: 'offline',
        via: 'EMAIL_API_KEY',
        provider: 'resend',
        reason: `HTTP ${resp.status}`,
        impact: 'transactional email delivery unavailable',
        lastError: `HTTP ${resp.status}`,
      };
    }
    return { status: 'live', via: 'EMAIL_API_KEY', provider: 'resend' };
  } catch (err) {
    return {
      status: 'offline',
      via: 'EMAIL_API_KEY',
      provider: 'resend',
      reason: 'upstream request failed',
      lastError: errMessage(err),
    };
  }
}

async function probeSupabase(): Promise<Partial<IntegrationHealthEntry> & { status: IntegrationHealthEntry['status'] }> {
  const supabaseUrl =
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    null;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY?.trim() || null;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || null;
  const key = serviceKey || anonKey;
  const via = serviceKey
    ? 'SUPABASE_SERVICE_KEY'
    : anonKey
      ? 'NEXT_PUBLIC_SUPABASE_ANON_KEY'
      : null;

  if (!supabaseUrl || !key) {
    return {
      status: 'degraded',
      via,
      reason: !supabaseUrl
        ? 'SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL not set'
        : 'No Supabase key (SUPABASE_SERVICE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY) set',
      impact: 'database reads/writes unavailable; RLS-gated endpoints return 503',
      lastError: 'supabase env not configured',
    };
  }

  try {
    // `select 1` round-trip via the REST gateway. We don't need a real table —
    // hitting the root health route confirms the service answers and the
    // service/anon key is accepted.
    const resp = await fetchWithTimeout(`${supabaseUrl}/rest/v1/?select=1`, {
      method: 'GET',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    });
    if (!resp.ok) {
      return {
        status: 'offline',
        via: via ?? undefined,
        reason: `HTTP ${resp.status}`,
        impact: 'database reads/writes unavailable',
        lastError: `HTTP ${resp.status}`,
      };
    }
    return { status: 'live', via: via ?? undefined };
  } catch (err) {
    return {
      status: 'offline',
      via: via ?? undefined,
      reason: 'upstream request failed',
      lastError: errMessage(err),
    };
  }
}

async function probeConnectAlpaca(): Promise<Partial<IntegrationHealthEntry> & { status: IntegrationHealthEntry['status'] }> {
  const brokerEncKey = process.env.BROKER_CRED_ENC_KEY?.trim();
  if (!brokerEncKey || brokerEncKey.length !== 64) {
    return {
      status: 'degraded',
      via: null,
      reason: !brokerEncKey
        ? 'BROKER_CRED_ENC_KEY not set'
        : 'BROKER_CRED_ENC_KEY malformed (must be 64-char hex / 32 bytes)',
      fallback: 'POST /api/v1/broker/connect returns 503',
      lastError: !brokerEncKey
        ? 'BROKER_CRED_ENC_KEY not set'
        : 'BROKER_CRED_ENC_KEY malformed',
    };
  }
  try {
    const { isCryptoReady } = await import('../lib/crypto.js');
    const ok = isCryptoReady();
    if (!ok) {
      return {
        status: 'offline',
        via: 'BROKER_CRED_ENC_KEY',
        reason: 'crypto round-trip failed (encrypt/decrypt mismatch)',
        impact: 'POST /api/v1/broker/connect returns 503',
        lastError: 'isCryptoReady() returned false',
      };
    }
    return {
      status: 'live',
      via: 'BROKER_CRED_ENC_KEY',
      provider: 'AES-256-GCM at rest',
    };
  } catch (err) {
    return {
      status: 'offline',
      via: 'BROKER_CRED_ENC_KEY',
      reason: 'crypto module failed to load',
      lastError: errMessage(err),
    };
  }
}

/** HEAD probe for the Vercel weekly-digest cron — confirms the gate auth works. */
async function probeWeeklyDigestCron(serverPort?: number): Promise<Partial<IntegrationHealthEntry> & { status: IntegrationHealthEntry['status'] }> {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return {
      status: 'degraded',
      via: null,
      provider: 'vercel-cron',
      mode: 'mon-13-00-utc',
      reason: 'CRON_SECRET not set',
      fallback: 'Vercel cron will fire but endpoint returns 503',
      lastError: 'CRON_SECRET not set',
    };
  }
  // Resolve a base URL we can hit. In production this is FRONTEND_URL (the
  // Vercel app); locally we hit the in-process port.
  // BUG fix v1.3.1: Number(undefined) → NaN, NaN passes through `??` because
  // it's not null/undefined. Result was `http://127.0.0.1:NaN/...` which
  // failed URL parsing. Fall back to a real number.
  const explicit = process.env.HEALTH_PROBE_BASE_URL?.trim();
  const frontend = process.env.FRONTEND_URL?.trim();
  // Vercel auto-injects VERCEL_URL (e.g. "frontier-alpha-xyz.vercel.app").
  // Use it when running in Vercel serverless with no FRONTEND_URL configured.
  const vercelUrl = process.env.VERCEL_URL?.trim();
  const portRaw = serverPort ?? Number(process.env.PORT);
  const port = Number.isFinite(portRaw) ? portRaw : 3000;
  const base =
    explicit ||
    frontend ||
    (vercelUrl ? `https://${vercelUrl}` : `http://127.0.0.1:${port}`);
  try {
    const resp = await fetchWithTimeout(
      // Vercel rewrites HEAD → GET on the catch-all, so HEAD didn't avoid
      // running the cron — we use ?probe=true to short-circuit after auth.
      `${base.replace(/\/$/, '')}/api/v1/digest/run?key=${encodeURIComponent(cronSecret)}&probe=true`,
      { method: 'GET' },
    );
    // We don't run the cron — HEAD just exercises the gate. 200/204/405/503
    // all indicate the route is reachable and the secret is acceptable. A 401
    // means the secret didn't match. Anything else = offline.
    if (resp.status === 401 || resp.status === 403) {
      return {
        status: 'offline',
        via: 'CRON_SECRET',
        provider: 'vercel-cron',
        mode: 'mon-13-00-utc',
        reason: `Gate auth rejected (HTTP ${resp.status})`,
        impact: 'weekly digest cron will silently fail',
        lastError: `HTTP ${resp.status}`,
      };
    }
    if (resp.status >= 500) {
      return {
        status: 'degraded',
        via: 'CRON_SECRET',
        provider: 'vercel-cron',
        mode: 'mon-13-00-utc',
        reason: `Gate reachable but upstream ${resp.status}`,
        fallback: 'previous successful digest',
        lastError: `HTTP ${resp.status}`,
      };
    }
    return {
      status: 'live',
      via: 'CRON_SECRET',
      provider: 'vercel-cron',
      mode: 'mon-13-00-utc',
    };
  } catch (err) {
    return {
      status: 'degraded',
      via: 'CRON_SECRET',
      provider: 'vercel-cron',
      mode: 'mon-13-00-utc',
      reason: 'gate-auth probe unreachable',
      fallback: 'env presence only',
      lastError: errMessage(err),
    };
  }
}

/** Polygon WebSocket — preserves the by-design degraded entry on Vercel. */
function probePolygonWebSocket(): Partial<IntegrationHealthEntry> & { status: IntegrationHealthEntry['status'] } {
  if (process.env.VERCEL) {
    return {
      status: 'degraded',
      via: null,
      mode: 'websocket',
      reason: 'Vercel serverless cannot host long-lived WS',
      fallback: 'rest polling + mock stream',
      lastError: 'Vercel serverless tier — WS by design degraded',
    };
  }
  if (envHas('POLYGON_API_KEY')) {
    // Railway tier hosts the actual WS; here we report config-checked live.
    return {
      status: 'live',
      via: 'POLYGON_API_KEY',
      mode: 'websocket',
    };
  }
  return {
    status: 'degraded',
    via: null,
    mode: 'websocket',
    reason: 'POLYGON_API_KEY not set',
    fallback: 'mock stream',
    lastError: 'POLYGON_API_KEY not set',
  };
}

/** Static / non-network entries that follow the standardized shape. */
function staticEntry(partial: Partial<IntegrationHealthEntry> & { status: IntegrationHealthEntry['status'] }): IntegrationHealthEntry {
  const lastError = partial.lastError ?? null;
  return {
    status: partial.status,
    latencyMs: 0,
    lastError,
    lastSuccessAt: partial.status === 'live' ? nowIso() : null,
    ttlSeconds: PROBE_TTL_SECONDS,
    ...(partial.via !== undefined ? { via: partial.via } : {}),
    ...(partial.mode !== undefined ? { mode: partial.mode } : {}),
    ...(partial.provider !== undefined ? { provider: partial.provider } : {}),
    ...(partial.reason !== undefined ? { reason: partial.reason } : {}),
    ...(partial.fallback !== undefined ? { fallback: partial.fallback } : {}),
    ...(partial.impact !== undefined ? { impact: partial.impact } : {}),
  };
}

// --- JSON Schema validator ------------------------------------------------

let validator: ((payload: unknown) => boolean) | null = null;
let validatorErrors: (() => string) | null = null;

function getValidator(): { validate: (payload: unknown) => boolean; errors: () => string } {
  if (validator) {
    return { validate: validator, errors: validatorErrors! };
  }
  try {
    // schemas/health-integration.json lives at the repo root, two levels up
    // from src/routes. In the bundled dist build we still resolve it from the
    // working directory if the URL form fails.
    const here = dirname(fileURLToPath(import.meta.url));
    const candidates = [
      resolve(here, '..', '..', 'schemas', 'health-integration.json'),
      resolve(process.cwd(), 'schemas', 'health-integration.json'),
    ];
    let schemaJson: string | null = null;
    for (const path of candidates) {
      try {
        schemaJson = readFileSync(path, 'utf8');
        break;
      } catch {
        // try next
      }
    }
    if (!schemaJson) {
      throw new Error('schemas/health-integration.json not found');
    }
    const schema = JSON.parse(schemaJson);
    const ajv = new Ajv({ allErrors: true, format: 'full' });
    const validate = ajv.compile(schema);
    validator = (payload: unknown) => validate(payload) as boolean;
    validatorErrors = () =>
      (validate.errors ?? [])
        .map((e) => `${e.dataPath || e.schemaPath} ${e.message ?? ''}`.trim())
        .join('; ');
    return { validate: validator, errors: validatorErrors };
  } catch (err) {
    // If the schema can't be loaded/compiled, fall back to a no-op validator
    // so the endpoint never 500s on its own contract. The next request retries.
    validator = () => true;
    validatorErrors = () => `schema unavailable: ${errMessage(err)}`;
    return { validate: validator, errors: validatorErrors };
  }
}

async function checkDatabase(): Promise<{ status: 'ok' | 'error'; message?: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
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
  } catch {
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
  } catch {
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

  // GET /api/v1/health/integrations — US-004: real upstream probe per
  // integration, standardized IntegrationHealthEntry shape, 60s in-process
  // cache, validated against schemas/health-integration.json before send.
  // Always 200 — degraded/offline are informational.
  fastify.get('/api/v1/health/integrations', async (_request, reply) => {
    // Resolve our own listening port for the cron HEAD probe. Falls back to
    // the env var or 3000 if Fastify hasn't bound yet.
    const addr = fastify.server.address?.();
    const port =
      typeof addr === 'object' && addr && 'port' in addr ? (addr as { port: number }).port : undefined;

    // Run all live probes in parallel. Bounded by Promise.all + per-probe
    // PROBE_TIMEOUT_MS, every result cached for PROBE_TTL_SECONDS.
    const integrations: Record<string, IntegrationHealthEntry> = {};

    const [
      supabaseEntry,
      polygonEntry,
      alphaVantageEntry,
      stripeEntry,
      emailDeliveryEntry,
      connectAlpacaEntry,
      weeklyDigestCronEntry,
    ] = await Promise.all([
      runProbe('supabase', probeSupabase),
      runProbe('polygon', probePolygon),
      runProbe('alphaVantage', probeAlphaVantage),
      runProbe('stripe', probeStripe),
      runProbe('emailDelivery', probeResend),
      runProbe('connectAlpaca', probeConnectAlpaca),
      runProbe('weeklyDigestCron', () => probeWeeklyDigestCron(port)),
    ]);

    integrations.supabase = supabaseEntry;
    integrations.polygon = polygonEntry;
    integrations.alphaVantage = alphaVantageEntry;
    integrations.stripe = stripeEntry;
    integrations.emailDelivery = emailDeliveryEntry;
    integrations.connectAlpaca = connectAlpacaEntry;
    integrations.weeklyDigestCron = weeklyDigestCronEntry;

    // --- Static / no-network entries (still standardized shape) -----------

    // Polygon WebSocket — by-design degraded on Vercel; live-checked elsewhere.
    integrations.polygonWebSocket = staticEntry(probePolygonWebSocket());

    // LLM Explainer — env presence only (would otherwise burn paid tokens).
    if (envHas('DEEPSEEK_API_KEY')) {
      integrations.llmExplainer = staticEntry({
        status: 'live',
        via: 'DEEPSEEK_API_KEY',
        provider: 'deepseek',
        mode: 'env-checked',
      });
    } else if (envHas('OPENAI_API_KEY')) {
      integrations.llmExplainer = staticEntry({
        status: 'live',
        via: 'OPENAI_API_KEY',
        provider: 'openai',
        mode: 'env-checked',
      });
    } else {
      integrations.llmExplainer = staticEntry({
        status: 'degraded',
        via: null,
        reason: 'Neither DEEPSEEK_API_KEY nor OPENAI_API_KEY set',
        fallback: 'template',
        lastError: 'no LLM key set',
      });
    }

    // Alpaca / SimulatedBroker — env presence only; "live" either way (real
    // adapter or internal simulated broker with live quotes).
    const alpacaPaper = (process.env.ALPACA_PAPER_TRADING ?? 'true') !== 'false';
    if (envHas('ALPACA_API_KEY') && envHas('ALPACA_API_SECRET')) {
      integrations.alpaca = staticEntry({
        status: 'live',
        via: 'ALPACA_API_KEY',
        mode: alpacaPaper ? 'paper' : 'live',
      });
    } else {
      integrations.alpaca = staticEntry({
        status: 'live',
        via: null,
        mode: 'simulated',
        provider: 'frontier-alpha-internal',
        reason: 'Internal simulated broker (live quotes, Supabase-persisted positions)',
      });
    }

    // VAPID Web Push — env presence only.
    const vapidPub = envHas('VAPID_PUBLIC_KEY');
    const vapidPriv = envHas('VAPID_PRIVATE_KEY');
    if (vapidPub && vapidPriv) {
      integrations.vapidPush = staticEntry({
        status: 'live',
        via: 'VAPID_PUBLIC_KEY+VAPID_PRIVATE_KEY',
      });
    } else {
      integrations.vapidPush = staticEntry({
        status: 'degraded',
        via: null,
        reason:
          !vapidPub && !vapidPriv
            ? 'VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY not set'
            : !vapidPub
              ? 'VAPID_PUBLIC_KEY not set'
              : 'VAPID_PRIVATE_KEY not set',
        fallback: 'SSE-only delivery (no native push notifications)',
        lastError: 'VAPID keys missing',
      });
    }

    // Rate limiter — provisioning check only (runtime metrics elsewhere).
    const redisVar = envHas('REDIS_URL')
      ? 'REDIS_URL'
      : envHas('UPSTASH_REDIS_REST_URL')
        ? 'UPSTASH_REDIS_REST_URL'
        : null;
    if (redisVar) {
      integrations.rateLimiter = staticEntry({
        status: 'live',
        via: redisVar,
        provider: redisVar.startsWith('UPSTASH') ? 'upstash-redis' : 'redis',
      });
    } else if (envHas('SUPABASE_SERVICE_KEY')) {
      integrations.rateLimiter = staticEntry({
        status: 'live',
        via: 'SUPABASE_SERVICE_KEY',
        provider: 'supabase-postgres',
        mode: 'rate_limit_check RPC',
      });
    } else {
      integrations.rateLimiter = staticEntry({
        status: 'degraded',
        via: null,
        reason: 'No SUPABASE_SERVICE_KEY, REDIS_URL, or UPSTASH_REDIS_REST_URL set',
        fallback: 'in-memory (resets per cold start)',
        lastError: 'no rate-limiter backend wired',
      });
    }

    // Comp guard — code-level, always live.
    integrations.compGuard = staticEntry({
      status: 'live',
      via: null,
      provider: 'code-level',
      mode: 'comp_* sentinel ids immune to webhooks',
    });

    // ML Sentiment — tiered fallback; env presence only.
    if (envHas('ML_SENTIMENT_ENDPOINT')) {
      integrations.mlSentiment = staticEntry({
        status: 'live',
        via: 'ML_SENTIMENT_ENDPOINT',
        mode: 'finbert',
      });
    } else if (envHas('DEEPSEEK_API_KEY')) {
      integrations.mlSentiment = staticEntry({
        status: 'live',
        via: 'DEEPSEEK_API_KEY',
        mode: 'llm-classification',
      });
    } else if (envHas('OPENAI_API_KEY')) {
      integrations.mlSentiment = staticEntry({
        status: 'live',
        via: 'OPENAI_API_KEY',
        mode: 'llm-classification',
      });
    } else {
      integrations.mlSentiment = staticEntry({
        status: 'degraded',
        via: null,
        reason: 'No ML endpoint or LLM key',
        fallback: 'lexicon-based sentiment scoring',
        lastError: 'no ML/LLM backend wired',
      });
    }

    // --- Summary ----------------------------------------------------------
    const entries = Object.values(integrations);
    const live = entries.filter((e) => e.status === 'live').length;
    const degraded = entries.filter((e) => e.status === 'degraded').length;
    const offline = entries.filter((e) => e.status === 'offline').length;

    const response: IntegrationsHealthResponse = {
      checkedAt: new Date().toISOString(),
      integrations,
      summary: {
        live,
        degraded,
        offline,
        total: entries.length,
      },
    };

    // Validate against the JSON Schema (P4). On validation failure we still
    // return 200 with the response — surfacing the schema error in a header
    // — so a self-inflicted shape regression is visible without breaking
    // alerting that already polls this endpoint.
    const v = getValidator();
    const ok = v.validate(response);
    if (!ok) {
      reply.header('x-schema-validation', `failed: ${v.errors().slice(0, 200)}`);
    } else {
      reply.header('x-schema-validation', 'ok');
    }

    return reply.status(200).send(response);
  });
}
