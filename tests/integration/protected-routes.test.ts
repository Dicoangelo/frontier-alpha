/**
 * Integration smoke tests for every protected route (US-007).
 *
 * Goals:
 *   1. Every Bearer-gated endpoint returns 200 for the seeded test user.
 *   2. Response shape validates against `schemas/api-shape.json` per route.
 *   3. No `mockMode: true` leaks for the test user (whose data is real).
 *   4. The same assertions run as a production synthetic monitor (US-008)
 *      via the route stub at `src/routes/synthetic-monitor.ts`.
 *
 * Skip behaviour:
 *   - Suite is excluded from default `npm test`. Only runs when
 *     `INTEGRATION=true` is set (see vitest.config.ts).
 *   - If the dev server isn't running OR Supabase env is missing, the
 *     suite gracefully `it.skip`s every case with an informative message
 *     — no false positives in CI when infra isn't wired.
 *
 * See `tests/integration/auth-helper.ts` for the golden-state contract.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Ajv, { type ValidateFunction } from 'ajv';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  mintTestSession,
  seedGoldenState,
  clearGoldenState,
  authedFetch,
  resolveBaseUrl,
  type TestSession,
} from './auth-helper.js';

// ─── Skip-gate ──────────────────────────────────────────────────────────────
//
// Three independent preconditions must hold for the suite to run:
//   1. INTEGRATION=true env var (operator opts in)
//   2. Supabase admin env (URL + service key + anon key)
//   3. Dev server reachable at INTEGRATION_BASE_URL || http://localhost:3000

function checkEnv(): { ok: boolean; reason?: string } {
  if (process.env.INTEGRATION !== 'true') {
    return {
      ok: false,
      reason: 'INTEGRATION=true not set; suite is opt-in. Run `INTEGRATION=true npm run test:integration`.',
    };
  }
  for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY']) {
    if (!process.env[k]) {
      return { ok: false, reason: `Missing env var: ${k}` };
    }
  }
  if (!process.env.SUPABASE_ANON_KEY && !process.env.VITE_SUPABASE_ANON_KEY) {
    return { ok: false, reason: 'Missing SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY)' };
  }
  return { ok: true };
}

async function probeServer(): Promise<{ ok: boolean; reason?: string }> {
  const baseUrl = resolveBaseUrl();
  // Try /api/v1/health first (the canonical health endpoint), fall back to
  // /health for older deployments. Either responding with a non-5xx status
  // means the server is up enough to run the smoke suite against.
  const candidates = ['/api/v1/health', '/health'];
  for (const path of candidates) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 3000);
      const r = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
        signal: controller.signal,
      });
      clearTimeout(t);
      if (r.status >= 200 && r.status < 500) {
        return { ok: true };
      }
    } catch {
      // try next candidate
    }
  }
  return {
    ok: false,
    reason: `Server at ${baseUrl} unreachable on /api/v1/health or /health`,
  };
}

// ─── ajv setup ─────────────────────────────────────────────────────────────

interface AjvLike {
  compile(s: unknown): ValidateFunction;
}

function loadShapeSchema(): { validators: Record<string, ValidateFunction> } {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const schemaPath = path.resolve(here, '..', '..', 'schemas', 'api-shape.json');
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  // Cross-version compat: ajv@6 (default in this project) uses `allErrors`
  // only; ajv@8 introduced `strict`. Constructing with the union of safe
  // options would error on v6. Stick with v6 defaults.
  type AjvCtor = new (opts: { allErrors: boolean }) => AjvLike;
  const AjvCtorRef = Ajv as unknown as AjvCtor;
  const ajv = new AjvCtorRef({ allErrors: true });
  const validators: Record<string, ValidateFunction> = {};
  for (const [key, sub] of Object.entries(schema.properties as Record<string, object>)) {
    // Each top-level property is itself a complete sub-schema.
    validators[key] = ajv.compile({ ...sub, definitions: schema.definitions });
  }
  return { validators };
}

// ─── Utility ───────────────────────────────────────────────────────────────

function assertNoMockLeak(body: unknown, route: string): void {
  // The test user's data is real, so the response must not advertise mock mode.
  // Server-side mockMode flags appear in two shapes: top-level `mockMode: true`
  // OR a `dataSource: 'mock'` envelope (see portfolio attribution).
  const o = body as Record<string, unknown> | null;
  if (!o || typeof o !== 'object') return;
  if ((o as { mockMode?: boolean }).mockMode === true) {
    throw new Error(`Route ${route} returned mockMode:true for the seeded test user`);
  }
  // dataSource:'mock' is only emitted by attribution endpoints we don't smoke,
  // but check defensively for future-proofing.
  if ((o as { dataSource?: string }).dataSource === 'mock' && route.includes('/portfolio')) {
    throw new Error(`Route ${route} emitted dataSource:'mock' for the seeded test user`);
  }
}

interface Probe {
  /** Schema key in api-shape.json. */
  shape: string;
  /** Path on the API (with query string). */
  pathFn: () => string;
  /** Optional override of how to resolve auth (default: bearer = test user JWT). */
  authMode?: 'user' | 'cron' | 'service-role';
  /** Whether 404 should be treated as "not yet shipped" rather than failure. */
  allowNotShipped?: boolean;
}

const PROBES: Record<string, Probe> = {
  portfolio: {
    shape: 'portfolio',
    pathFn: () => '/api/v1/portfolio',
  },
  portfolioFactors: {
    shape: 'portfolioFactors',
    pathFn: () => '/api/v1/portfolio/factors/AAPL,NVDA',
  },
  quotesHistory: {
    shape: 'quotesHistory',
    pathFn: () => '/api/v1/quotes/AAPL/history?days=7',
  },
  cvrfBeliefs: {
    shape: 'cvrfBeliefs',
    pathFn: () => '/api/v1/cvrf/beliefs',
  },
  cvrfStats: {
    shape: 'cvrfStats',
    pathFn: () => '/api/v1/cvrf/stats',
  },
  healthIntegrations: {
    shape: 'healthIntegrations',
    pathFn: () => '/api/v1/health/integrations',
  },
  billingSubscription: {
    shape: 'billingSubscription',
    pathFn: () => '/api/v1/billing/subscription',
  },
  brokerStatus: {
    shape: 'brokerStatus',
    pathFn: () => '/api/v1/broker/status',
  },
  alerts: {
    shape: 'alerts',
    pathFn: () => '/api/v1/alerts',
  },
  earningsUpcoming: {
    shape: 'earningsUpcoming',
    pathFn: () => '/api/v1/earnings/upcoming',
  },
  digestRun: {
    shape: 'digestRun',
    pathFn: () => `/api/v1/digest/run?key=${encodeURIComponent(process.env.CRON_SECRET ?? '')}`,
    authMode: 'cron',
  },
  healthErrors: {
    shape: 'healthErrors',
    pathFn: () => '/api/v1/health/errors',
    authMode: 'service-role',
  },
  warmCache: {
    shape: 'warmCache',
    pathFn: () => `/api/v1/cron/warm-cache?key=${encodeURIComponent(process.env.CRON_SECRET ?? '')}`,
    authMode: 'cron',
    allowNotShipped: true, // US-006 ships this concurrently
  },
};

// ─── Suite ─────────────────────────────────────────────────────────────────

const envCheck = checkEnv();
const describeOrSkip = envCheck.ok ? describe : describe.skip;

describeOrSkip('integration: protected-routes smoke (US-007)', () => {
  let session: TestSession | null = null;
  let serverReachable = false;
  let validators: Record<string, ValidateFunction> = {};

  beforeAll(async () => {
    if (!envCheck.ok) {
      console.warn(`[US-007 smoke] suite skipped: ${envCheck.reason}`);
      return;
    }
    const probe = await probeServer();
    serverReachable = probe.ok;
    if (!probe.ok) {
      console.warn(`[US-007 smoke] suite skipped: ${probe.reason}`);
      return;
    }

    // Mint session + seed golden state once for the whole suite.
    session = await mintTestSession();
    await seedGoldenState(session.userId);

    // Compile every shape validator once.
    ({ validators } = loadShapeSchema());
  }, 60_000);

  afterAll(async () => {
    if (session) {
      await clearGoldenState(session.userId);
    }
  });

  for (const [name, probe] of Object.entries(PROBES)) {
    it(`${name} → 200 + valid shape`, async () => {
      if (!serverReachable || !session) {
        console.warn(`[US-007 smoke] skipping ${name}: server not reachable or no session`);
        return;
      }

      // Resolve bearer based on auth mode.
      let token = session.accessToken;
      if (probe.authMode === 'cron') {
        token = process.env.CRON_SECRET ?? '';
        if (!token) {
          console.warn(`[US-007 smoke] skipping ${name}: CRON_SECRET not set`);
          return;
        }
      } else if (probe.authMode === 'service-role') {
        token = process.env.SUPABASE_SERVICE_KEY ?? '';
        if (!token) {
          console.warn(`[US-007 smoke] skipping ${name}: SUPABASE_SERVICE_KEY not set`);
          return;
        }
      }

      const { response } = await authedFetch(probe.pathFn(), { accessToken: token });

      // Allow 404 ONLY for routes flagged as "not yet shipped" (US-006 stubs).
      if (response.status === 404 && probe.allowNotShipped) {
        console.warn(`[US-007 smoke] ${name}: 404 (route not yet shipped — allowed)`);
        return;
      }

      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;

      // mockMode leak check
      assertNoMockLeak(body, probe.pathFn());
      if (body.data && typeof body.data === 'object') {
        assertNoMockLeak(body.data, probe.pathFn());
      }

      // Shape validation
      const validate = validators[probe.shape];
      expect(validate, `validator missing for shape '${probe.shape}'`).toBeTruthy();
      const ok = validate(body);
      if (!ok) {
        const errs = (validate.errors ?? [])
          .map((e) => {
            // ajv@6 uses `dataPath`, ajv@8 uses `instancePath`. Tolerate both.
            const ee = e as unknown as { instancePath?: string; dataPath?: string; message?: string };
            return `${ee.instancePath ?? ee.dataPath ?? ''} ${ee.message ?? ''}`.trim();
          })
          .join('; ');
        throw new Error(`${name}: shape validation failed → ${errs}`);
      }
    }, 30_000);
  }

  it('portfolio reports the seeded $25K cash and 5 positions', async () => {
    if (!serverReachable || !session) return;
    const { response } = await authedFetch('/api/v1/portfolio', {
      accessToken: session.accessToken,
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { positions: unknown[]; cash: number } };
    expect(body.data.positions).toHaveLength(5);
    // Cash >= 25K (totalValue floats with quote prices, but cash is the seed).
    expect(body.data.cash).toBeGreaterThanOrEqual(25000);
  }, 30_000);

  it('alerts endpoint surfaces all 3 fixture alert rules', async () => {
    if (!serverReachable || !session) return;
    const { response } = await authedFetch('/api/v1/alerts', {
      accessToken: session.accessToken,
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: unknown[] };
    expect(body.data.length).toBeGreaterThanOrEqual(3);
  }, 30_000);

  it('billing subscription reports enterprise plan for the comp test user', async () => {
    if (!serverReachable || !session) return;
    const { response } = await authedFetch('/api/v1/billing/subscription', {
      accessToken: session.accessToken,
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { plan: string } };
    expect(body.data.plan).toBe('enterprise');
  }, 30_000);

  it('cvrf stats surfaces the canonical factorWeights key (catches v1.2.2 regression)', async () => {
    if (!serverReachable || !session) return;
    const { response } = await authedFetch('/api/v1/cvrf/stats', {
      accessToken: session.accessToken,
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { factors: { factorWeights: Record<string, number> } };
    };
    expect(body.data.factors).toBeDefined();
    expect(body.data.factors.factorWeights).toBeDefined();
    expect(typeof body.data.factors.factorWeights).toBe('object');
  }, 30_000);
});
