/**
 * GET /api/v1/cron/synthetic-monitor — production smoke runner (US-007).
 *
 * Fills in the US-008 stub. Vercel cron hits this endpoint every 15 minutes
 * (gated by CRON_SECRET). The handler runs the SAME route-shape assertions
 * as `tests/integration/protected-routes.test.ts` against the live deploy,
 * so test failures and production incidents look identical.
 *
 * Auth (matches the rest of the cron family):
 *   - Vercel cron auto-injects `Authorization: Bearer ${CRON_SECRET}`
 *   - Manual debugging accepts `?key=${CRON_SECRET}`
 *
 * Failure handling:
 *   - Any route that returns non-2xx OR fails shape validation increments
 *     `errorCounter` (US-008) under the synthetic-monitor-prefixed key, so
 *     `/api/v1/health/errors` and the weekly digest surface the failure.
 *   - Per-route failures are recorded in the response payload with
 *     `error: <message>` so an external uptime probe can render details
 *     without re-querying the error endpoint.
 *   - The endpoint itself ALWAYS returns 200 (with `success: true`) when
 *     the cron auth passes — it's a status report, not a gate. Treat it
 *     like a CI test reporter: a green response with passed=10/failed=0
 *     is the success signal; passed=8/failed=2 is the alert signal.
 *
 * Substrate sharing (P3):
 *   - Schema lives at `schemas/api-shape.json` (US-007).
 *   - Auth helper at `tests/integration/auth-helper.ts` is shared, but to
 *     keep this module lean and avoid pulling test-only modules into the
 *     server bundle, we re-implement the minimum surface inline.
 */

import type {
  FastifyInstance,
  FastifyRequest,
  FastifyReply,
} from 'fastify';
import Ajv, { type ValidateFunction } from 'ajv';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { errorCounter } from '../observability/ErrorCounter.js';
import { logger } from '../observability/logger.js';
import type { APIResponse } from '../types/index.js';

interface RouteContext {
  server: unknown;
}

interface SyntheticMonitorQuery {
  key?: string;
}

interface ProbeResult {
  /** Route key (matches schemas/api-shape.json `properties` key). */
  route: string;
  /** Path probed on the live deploy. */
  pathname: string;
  /** HTTP status returned by the upstream. */
  status: number;
  /** Wall-clock latency of the probe. */
  latencyMs: number;
  /** Whether response body validates against the per-route api-shape schema. */
  schemaValid: boolean;
  /** Failure reason if any. */
  error: string | null;
}

interface SyntheticMonitorResponse {
  passed: number;
  failed: number;
  totalLatencyMs: number;
  results: ProbeResult[];
  /** When the monitor itself ran. */
  ranAt: string;
  /** True when any prerequisite (env, auth) was missing → all skipped. */
  skipped?: boolean;
  skippedReason?: string;
}

const TEST_USER_EMAIL = 'dicoangelo+test@metaventionsai.com';
const TEST_USER_PASSWORD = 'frontier-alpha-test-2026!';

// ─── Auth ─────────────────────────────────────────────────────────────────

function authorize(request: FastifyRequest, reply: FastifyReply): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    reply.status(503).send({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message:
          'Synthetic monitor not configured (CRON_SECRET env var missing)',
      },
    });
    return false;
  }
  const auth = request.headers.authorization;
  const bearer = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const queryKey =
    (request.query as SyntheticMonitorQuery | undefined)?.key ?? null;
  const presented = bearer ?? queryKey;
  if (presented !== cronSecret) {
    reply.status(401).send({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message:
          'Invalid or missing cron key (provide ?key={CRON_SECRET} or Authorization: Bearer {CRON_SECRET})',
      },
    });
    return false;
  }
  return true;
}

// ─── Schema loader (cached) ────────────────────────────────────────────────

let cachedValidators: Record<string, ValidateFunction> | null = null;

function loadValidators(): Record<string, ValidateFunction> | null {
  if (cachedValidators) return cachedValidators;
  // Resolve schemas/api-shape.json relative to this source file. In dist/
  // the relative path is preserved; from the repo root it's `schemas/...`.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, '..', '..', 'schemas', 'api-shape.json'),
    path.resolve(here, '..', '..', '..', 'schemas', 'api-shape.json'),
    path.resolve(process.cwd(), 'schemas', 'api-shape.json'),
  ];
  const schemaPath = candidates.find((p) => existsSync(p));
  if (!schemaPath) {
    logger.warn(
      { candidates },
      'synthetic-monitor: schemas/api-shape.json not found, shape validation disabled',
    );
    return null;
  }
  try {
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    // ajv@6 (resolved via fastify dependency tree) uses `allErrors` + `nullable`;
    // strict mode is ajv@8 only. Tolerate both by using the loose option set.
    type AjvCtor = new (opts: { allErrors: boolean }) => {
      compile(s: unknown): ValidateFunction;
    };
    const AjvCtorRef = Ajv as unknown as AjvCtor;
    const ajv = new AjvCtorRef({ allErrors: true });
    const compiled: Record<string, ValidateFunction> = {};
    for (const [key, sub] of Object.entries(
      schema.properties as Record<string, object>,
    )) {
      compiled[key] = ajv.compile({ ...sub, definitions: schema.definitions });
    }
    cachedValidators = compiled;
    return compiled;
  } catch (err) {
    logger.warn({ err }, 'synthetic-monitor: failed to compile api-shape.json');
    return null;
  }
}

// ─── Test session minting (in-process, no external test deps) ─────────────

async function mintMonitorSession(): Promise<string | null> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceKey || !anonKey) {
    return null;
  }

  // Provision the user (idempotent).
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: createErr } = await admin.auth.admin.createUser({
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: 'Synthetic Monitor', role: 'synthetic_monitor' },
  });
  if (createErr && !/already registered|already been registered|email_exists/i.test(createErr.message)) {
    logger.warn({ err: createErr.message }, 'synthetic-monitor: createUser failed');
    return null;
  }

  // Sign in to obtain a real JWT.
  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: signIn, error: signInErr } = await userClient.auth.signInWithPassword({
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
  });
  if (signInErr || !signIn.session) {
    logger.warn({ err: signInErr?.message }, 'synthetic-monitor: signIn failed');
    return null;
  }
  return signIn.session.access_token;
}

// ─── Probe table ──────────────────────────────────────────────────────────

interface Probe {
  /** Schema key. */
  shape: string;
  /** Path on the API. */
  pathname: string;
  /** Auth mode: user JWT (default), cron secret, or service-role key. */
  authMode?: 'user' | 'cron' | 'service-role';
  /** Allow 404 (US-006 routes that may not have shipped yet). */
  allowNotShipped?: boolean;
}

function buildProbes(): Probe[] {
  const cronSecret = encodeURIComponent(process.env.CRON_SECRET ?? '');
  return [
    { shape: 'portfolio', pathname: '/api/v1/portfolio' },
    { shape: 'portfolioFactors', pathname: '/api/v1/portfolio/factors/AAPL,NVDA' },
    { shape: 'quotesHistory', pathname: '/api/v1/quotes/AAPL/history?days=7' },
    { shape: 'cvrfBeliefs', pathname: '/api/v1/cvrf/beliefs' },
    { shape: 'cvrfStats', pathname: '/api/v1/cvrf/stats' },
    { shape: 'healthIntegrations', pathname: '/api/v1/health/integrations' },
    { shape: 'billingSubscription', pathname: '/api/v1/billing/subscription' },
    { shape: 'brokerStatus', pathname: '/api/v1/broker/status' },
    { shape: 'alerts', pathname: '/api/v1/alerts' },
    { shape: 'earningsUpcoming', pathname: '/api/v1/earnings/upcoming' },
    { shape: 'digestRun', pathname: `/api/v1/digest/run?key=${cronSecret}`, authMode: 'cron' },
    { shape: 'healthErrors', pathname: '/api/v1/health/errors', authMode: 'service-role' },
    { shape: 'warmCache', pathname: `/api/v1/cron/warm-cache?key=${cronSecret}`, authMode: 'cron', allowNotShipped: true },
  ];
}

function resolveBaseUrl(): string {
  // Synthetic monitor runs against the live deploy by default. Override via
  // SYNTHETIC_BASE_URL for staging probes.
  return (
    process.env.SYNTHETIC_BASE_URL ??
    process.env.FRONTEND_URL ??
    'https://frontier-alpha.metaventionsai.com'
  );
}

async function runProbe(
  probe: Probe,
  baseUrl: string,
  userToken: string | null,
  validators: Record<string, ValidateFunction> | null,
): Promise<ProbeResult> {
  const url = `${baseUrl.replace(/\/$/, '')}${probe.pathname}`;
  let token: string | null = userToken;
  if (probe.authMode === 'cron') token = process.env.CRON_SECRET ?? null;
  if (probe.authMode === 'service-role') token = process.env.SUPABASE_SERVICE_KEY ?? null;

  if (!token) {
    return {
      route: probe.shape,
      pathname: probe.pathname,
      status: 0,
      latencyMs: 0,
      schemaValid: false,
      error: `No credentials available for authMode=${probe.authMode ?? 'user'}`,
    };
  }

  const start = Date.now();
  let status = 0;
  let body: unknown = null;
  let networkError: string | null = null;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 10_000);
    const r = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Synthetic-Monitor': 'frontier-alpha',
      },
      signal: controller.signal,
    });
    clearTimeout(t);
    status = r.status;
    try {
      body = await r.json();
    } catch {
      // Some 4xx returns are JSON-empty; tolerate.
      body = null;
    }
  } catch (err) {
    networkError = err instanceof Error ? err.message : String(err);
  }
  const latencyMs = Date.now() - start;

  // 404 on US-006-pending routes is not a failure.
  if (status === 404 && probe.allowNotShipped) {
    return {
      route: probe.shape,
      pathname: probe.pathname,
      status,
      latencyMs,
      schemaValid: true,
      error: null,
    };
  }

  if (networkError) {
    return {
      route: probe.shape,
      pathname: probe.pathname,
      status,
      latencyMs,
      schemaValid: false,
      error: `network: ${networkError}`,
    };
  }

  if (status !== 200) {
    return {
      route: probe.shape,
      pathname: probe.pathname,
      status,
      latencyMs,
      schemaValid: false,
      error: `non-200 status (${status})`,
    };
  }

  // Shape validation
  if (!validators) {
    return {
      route: probe.shape,
      pathname: probe.pathname,
      status,
      latencyMs,
      schemaValid: false,
      error: 'shape validators unavailable (api-shape.json missing)',
    };
  }
  const validate = validators[probe.shape];
  if (!validate) {
    return {
      route: probe.shape,
      pathname: probe.pathname,
      status,
      latencyMs,
      schemaValid: false,
      error: `no validator for shape '${probe.shape}'`,
    };
  }
  const ok = validate(body);
  if (!ok) {
    const errs = (validate.errors ?? [])
      .map((e) => {
        // ajv@6 uses `dataPath`, ajv@8 uses `instancePath`.
        const ee = e as unknown as { instancePath?: string; dataPath?: string; message?: string };
        return `${ee.instancePath ?? ee.dataPath ?? ''} ${ee.message ?? ''}`.trim();
      })
      .join('; ');
    return {
      route: probe.shape,
      pathname: probe.pathname,
      status,
      latencyMs,
      schemaValid: false,
      error: `shape: ${errs}`,
    };
  }

  return {
    route: probe.shape,
    pathname: probe.pathname,
    status,
    latencyMs,
    schemaValid: true,
    error: null,
  };
}

// ─── Route ────────────────────────────────────────────────────────────────

export async function syntheticMonitorRoutes(
  fastify: FastifyInstance,
  _opts: RouteContext,
) {
  fastify.get<{
    Querystring: SyntheticMonitorQuery;
    Reply: APIResponse<SyntheticMonitorResponse>;
  }>('/api/v1/cron/synthetic-monitor', async (request, reply) => {
    const start = Date.now();
    if (!authorize(request, reply)) return reply;

    // Mint a user JWT for the test user. If env is incomplete we still run
    // the cron-only and service-role-only probes; user-auth probes get
    // skipped with a clear `error` message.
    const userToken = await mintMonitorSession().catch((err) => {
      logger.warn({ err: err?.message }, 'synthetic-monitor: session mint failed');
      return null;
    });

    const validators = loadValidators();
    const baseUrl = resolveBaseUrl();
    const probes = buildProbes();

    // Run probes in parallel — bounded by network, not CPU.
    const results = await Promise.all(
      probes.map((p) => runProbe(p, baseUrl, userToken, validators)),
    );

    let passed = 0;
    let failed = 0;
    let totalLatencyMs = 0;
    for (const r of results) {
      totalLatencyMs += r.latencyMs;
      if (r.error === null && r.schemaValid) {
        passed += 1;
      } else {
        failed += 1;
        // Increment ErrorCounter so /api/v1/health/errors and the weekly
        // digest surface the failure (US-008 contract).
        errorCounter.increment(
          'GET',
          `/synthetic-monitor:${r.pathname}`,
          new Error(r.error ?? `status ${r.status}`),
        );
      }
    }

    if (failed > 0) {
      logger.warn(
        {
          passed,
          failed,
          baseUrl,
          failures: results.filter((r) => r.error).map((r) => ({ route: r.route, error: r.error })),
        },
        'synthetic-monitor: probe failures',
      );
    } else {
      logger.info(
        { passed, failed, totalLatencyMs, baseUrl },
        'synthetic-monitor: all probes green',
      );
    }

    return {
      success: true,
      data: {
        passed,
        failed,
        totalLatencyMs,
        results,
        ranAt: new Date().toISOString(),
      },
      meta: {
        timestamp: new Date(),
        requestId: request.id,
        latencyMs: Date.now() - start,
      },
    };
  });
}
