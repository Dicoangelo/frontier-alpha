/**
 * Unit tests: Workstream E — observability + alerting.
 *
 *   E4  reconcile the two Polygon health-check paths — HTTP 429 must read as
 *       `degraded` in BOTH probePolygon (/health/integrations) and
 *       checkExternalApis (/api/v1/health), never as "ok / rate limited (normal)".
 *   E2  weekly digest surfaces per-provider quota + error-kind stats and a REAL
 *       (non-null) cache hit ratio computed from CompositeCache telemetry.
 *   E1  debounced Polygon health alerting off the synthetic monitor — no alert
 *       before the threshold, one alert AT the threshold, no duplicate spam,
 *       reset on a clean poll, and immediate escalation on an alertable error
 *       kind (401 auth / 403 plan-tier).
 *
 * MSW intercepts outbound HTTP. Resend/PushService are never hit — AlertDelivery
 * is mocked at the module level so no real mail/push is sent.
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';
import type { FastifyInstance } from 'fastify';
import { http, HttpResponse } from 'msw';
import { server } from '../setup.js';
import { _probeCacheForTests } from '../../src/routes/health.js';
import { renderWeeklyHealthDigest } from '../../src/notifications/email-templates/weekly-health-digest.js';
import {
  recordProviderError,
  resetQuotaStats,
} from '../../src/data/QuotaClassifier.js';
import { marketDataCache } from '../../src/data/cache/index.js';

// supabase.ts throws on import without these — set before any import resolves.
vi.hoisted(() => {
  process.env.SUPABASE_URL ??= 'http://localhost:54321';
  process.env.SUPABASE_SERVICE_KEY ??= 'test-service-key';
});

// Capture-only email spy so no real Resend/PushService call is made.
const { sendEmailSpy } = vi.hoisted(() => ({ sendEmailSpy: vi.fn() }));

vi.mock('../../src/notifications/AlertDelivery.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/notifications/AlertDelivery.js')>();
  return {
    ...actual,
    getAlertDelivery: vi.fn(() => ({ sendEmail: sendEmailSpy })),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function buildTestApp(): Promise<FastifyInstance> {
  const { buildApp } = await import('../../src/app.js');
  const { app } = await buildApp({ websockets: false, enableLogger: false });
  await app.ready();
  return app;
}

const savedEnv: Record<string, string | undefined> = {};
function saveEnv(...keys: string[]) {
  for (const k of keys) savedEnv[k] = process.env[k];
}
function restoreEnv(...keys: string[]) {
  for (const k of keys) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
}

const POLYGON_AGGS = 'https://api.polygon.io/v2/aggs/ticker/AAPL/range/1/day/:from/:to';
const SUPABASE_REST = 'http://localhost:54321/rest/v1/';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  _probeCacheForTests.clear();
  sendEmailSpy.mockReset();
  sendEmailSpy.mockResolvedValue({ success: true, messageId: 'test' });
});

// ===========================================================================
// E4 — 429 → degraded consistency across BOTH health-check paths
// ===========================================================================

describe('E4: Polygon 429 is degraded in both health-check paths', () => {
  beforeEach(() => {
    saveEnv('POLYGON_API_KEY');
    process.env.POLYGON_API_KEY = 'test-polygon-key';
    _probeCacheForTests.clear();
  });
  afterEach(() => {
    restoreEnv('POLYGON_API_KEY');
    _probeCacheForTests.clear();
  });

  it('probePolygon path (/health/integrations): 429 → degraded', async () => {
    server.use(
      http.get(POLYGON_AGGS, () => new HttpResponse(null, { status: 429 })),
    );
    const res = await app.inject({ method: 'GET', url: '/api/v1/health/integrations' });
    const body = res.json() as {
      integrations: Record<string, { status: string; reason?: string }>;
    };
    expect(body.integrations.polygon.status).toBe('degraded');
    expect(body.integrations.polygon.reason).toContain('429');
  });

  it('checkExternalApis path (/api/v1/health): 429 → error (not "ok / normal") → overall degraded', async () => {
    server.use(
      http.get(POLYGON_AGGS, () => new HttpResponse(null, { status: 429 })),
      // Keep the DB check green so the ONLY error is the external Polygon 429,
      // which must drop overall health to `degraded` (one error), proving the
      // 429 is no longer swallowed as "ok".
      http.get(SUPABASE_REST, () => HttpResponse.json({}, { status: 200 })),
    );
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
    const body = res.json() as {
      status: string;
      checks: {
        database?: { status: string };
        external?: { status: string; message?: string };
      };
    };
    expect(body.checks.external?.status).toBe('error');
    // The message must reflect the rate-limit signal, not "normal".
    expect(body.checks.external?.message ?? '').toMatch(/429/);
    expect(body.checks.external?.message ?? '').not.toMatch(/normal/i);
    expect(body.checks.database?.status).toBe('ok');
    expect(body.status).toBe('degraded');
  });

  it('checkExternalApis path: healthy Polygon → external ok', async () => {
    server.use(
      http.get(POLYGON_AGGS, () =>
        HttpResponse.json({ status: 'OK', resultsCount: 1, results: [{ o: 1, h: 2, l: 1, c: 1.5, v: 10, t: Date.now() }] }),
      ),
      http.get(SUPABASE_REST, () => HttpResponse.json({}, { status: 200 })),
    );
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
    const body = res.json() as { status: string; checks: { external?: { status: string } } };
    expect(body.checks.external?.status).toBe('ok');
    expect(body.status).toBe('healthy');
  });
});

// ===========================================================================
// E2 — digest quota stats + real cache hit ratio
// ===========================================================================

describe('E2: weekly digest renders quota + cache ratio', () => {
  const baseDigest = {
    dateRange: 'May 4 – May 10, 2026',
    totalErrors: 0,
    topRoutes: [],
    integrations: { live: 5, degraded: 1, offline: 0, badEntries: [] },
    deployId: 'abc123',
    sentryConfigured: false,
    errorsEndpointUrl: 'https://example.com/api/v1/health/errors',
  };

  it('template: renders per-provider rate/auth/plan counts + computed cache %', () => {
    const payload = renderWeeklyHealthDigest({
      ...baseDigest,
      cacheHitRatio: 0.75,
      quota: {
        since: '2026-05-04T00:00:00.000Z',
        providers: {
          polygon: {
            quota_burned: 3,
            quota_free: 2,
            provider_fault: 0,
            guidance: 'back off the full rate window before retrying',
            errorKinds: {
              rate_limit: 3,
              auth: 2,
              plan_tier: 1,
              client_error: 2,
              server_fault: 0,
            },
          },
        },
      },
    });
    // Cache ratio is computed, not "pending".
    expect(payload.html).toContain('75.0%');
    expect(payload.html).not.toContain('pending US-006');
    // Quota card present with the three headline error-kind counts.
    expect(payload.html).toContain('Upstream Quota');
    expect(payload.html).toContain('rate 3');
    expect(payload.html).toContain('auth 2');
    expect(payload.html).toContain('plan 1');
    // Text mirror carries it too.
    expect(payload.text).toContain('Cache hit ratio: 75.0%');
    expect(payload.text).toMatch(/polygon\s+rate 3 · auth 2 · plan 1/);
  });

  it('template: null quota omits the card; null ratio renders n/a', () => {
    const payload = renderWeeklyHealthDigest({ ...baseDigest, cacheHitRatio: null });
    expect(payload.html).not.toContain('Upstream Quota');
    expect(payload.html).toContain('n/a');
  });

  it('route: /digest/health-summary computes a NON-null cache ratio and includes quota', async () => {
    saveEnv('CRON_SECRET', 'EMAIL_PROVIDER');
    process.env.CRON_SECRET = 'test-cron-secret';
    process.env.EMAIL_PROVIDER = 'resend';

    // Seed real quota state (alertable auth kind on polygon).
    resetQuotaStats();
    recordProviderError('polygon', 401);
    recordProviderError('polygon', 429);

    // Seed real CompositeCache telemetry so hits+misses > 0 → ratio is non-null.
    marketDataCache.resetCounters();
    marketDataCache.memory.set('AAPL:7', []);
    marketDataCache.memory.get('AAPL:7'); // hit
    marketDataCache.memory.get('MISS:7'); // miss

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/digest/health-summary?key=test-cron-secret',
    });

    expect(res.statusCode).toBe(200);
    expect(sendEmailSpy).toHaveBeenCalledTimes(1);
    const payload = sendEmailSpy.mock.calls[0][0] as { html: string; text: string };
    // Non-null ratio: 1 hit / 2 reads = 50.0%.
    expect(payload.html).toContain('50.0%');
    expect(payload.html).not.toContain('pending US-006');
    // Quota card carries the seeded polygon counts.
    expect(payload.html).toContain('Upstream Quota');
    expect(payload.text).toMatch(/polygon\s+rate 1 · auth 1 · plan 0/);

    resetQuotaStats();
    marketDataCache.resetCounters();
    restoreEnv('CRON_SECRET', 'EMAIL_PROVIDER');
  });
});

// ===========================================================================
// E1 — debounced Polygon health alerting
// ===========================================================================

describe('E1: debounced Polygon health alerter', () => {
  let evaluatePolygonHealth: typeof import('../../src/observability/PolygonHealthAlerter.js')['evaluatePolygonHealth'];
  let resetPolygonHealthAlerter: typeof import('../../src/observability/PolygonHealthAlerter.js')['resetPolygonHealthAlerter'];

  beforeAll(async () => {
    const mod = await import('../../src/observability/PolygonHealthAlerter.js');
    evaluatePolygonHealth = mod.evaluatePolygonHealth;
    resetPolygonHealthAlerter = mod.resetPolygonHealthAlerter;
  });

  const failingPoll = { failed: 1, passed: 9, failingRoutes: [{ route: 'quotesHistory', error: 'non-200 (500)' }] };
  const cleanPoll = { failed: 0, passed: 10, failingRoutes: [] };

  beforeEach(() => {
    resetPolygonHealthAlerter();
    resetQuotaStats();
    sendEmailSpy.mockReset();
    sendEmailSpy.mockResolvedValue({ success: true, messageId: 'test' });
  });

  it('does NOT alert before the threshold (default 3)', async () => {
    const r1 = await evaluatePolygonHealth(failingPoll);
    const r2 = await evaluatePolygonHealth(failingPoll);
    expect(r1.alerted).toBe(false);
    expect(r2.alerted).toBe(false);
    expect(sendEmailSpy).not.toHaveBeenCalled();
  });

  it('alerts exactly AT the threshold with reason=debounce-threshold', async () => {
    await evaluatePolygonHealth(failingPoll);
    await evaluatePolygonHealth(failingPoll);
    const r3 = await evaluatePolygonHealth(failingPoll);
    expect(r3.alerted).toBe(true);
    expect(r3.reason).toBe('debounce-threshold');
    expect(r3.consecutiveFailures).toBe(3);
    expect(sendEmailSpy).toHaveBeenCalledTimes(1);
  });

  it('does NOT re-alert on subsequent failing polls (no spam)', async () => {
    await evaluatePolygonHealth(failingPoll);
    await evaluatePolygonHealth(failingPoll);
    await evaluatePolygonHealth(failingPoll); // alert #1
    const r4 = await evaluatePolygonHealth(failingPoll);
    const r5 = await evaluatePolygonHealth(failingPoll);
    expect(r4.alerted).toBe(false);
    expect(r5.alerted).toBe(false);
    expect(sendEmailSpy).toHaveBeenCalledTimes(1);
  });

  it('resets the counter (and re-arms) on a clean poll', async () => {
    await evaluatePolygonHealth(failingPoll);
    await evaluatePolygonHealth(failingPoll);
    const clean = await evaluatePolygonHealth(cleanPoll);
    expect(clean.consecutiveFailures).toBe(0);

    // Must take a fresh full run of 3 to alert again.
    await evaluatePolygonHealth(failingPoll);
    await evaluatePolygonHealth(failingPoll);
    expect(sendEmailSpy).not.toHaveBeenCalled();
    const third = await evaluatePolygonHealth(failingPoll);
    expect(third.alerted).toBe(true);
    expect(sendEmailSpy).toHaveBeenCalledTimes(1);
  });

  it('escalates IMMEDIATELY (no debounce) on an alertable auth kind', async () => {
    recordProviderError('polygon', 401); // revoked/invalid key
    const r1 = await evaluatePolygonHealth(failingPoll);
    expect(r1.alerted).toBe(true);
    expect(r1.reason).toBe('alertable-kind');
    expect(r1.consecutiveFailures).toBe(1); // fired well before threshold
    expect(sendEmailSpy).toHaveBeenCalledTimes(1);
    const subject = (sendEmailSpy.mock.calls[0][0] as { subject: string }).subject;
    expect(subject).toMatch(/action required/i);
  });

  it('escalates immediately on a plan-tier (403) block', async () => {
    recordProviderError('polygon', 403);
    const r1 = await evaluatePolygonHealth(failingPoll);
    expect(r1.alerted).toBe(true);
    expect(r1.reason).toBe('alertable-kind');
    expect(sendEmailSpy).toHaveBeenCalledTimes(1);
  });

  it('does not re-escalate on the same alertable count across polls', async () => {
    recordProviderError('polygon', 401);
    await evaluatePolygonHealth(failingPoll); // alertable alert #1
    const r2 = await evaluatePolygonHealth(failingPoll); // same 401 count, no new alert
    expect(r2.reason).not.toBe('alertable-kind');
    expect(sendEmailSpy).toHaveBeenCalledTimes(1);
  });
});
