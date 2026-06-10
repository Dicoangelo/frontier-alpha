/**
 * Unit tests: /api/v1/health/integrations (US-004)
 *
 * Strategy:
 *   - Spin up a real Fastify app via buildApp() so the full route is exercised.
 *   - MSW intercepts every outbound HTTP call to external upstreams (Polygon,
 *     AlphaVantage, Resend, Supabase REST).  Stripe uses the SDK which is
 *     mocked at the module level with vi.mock.
 *   - Each test group controls env vars + MSW overrides, then clears
 *     _probeCacheForTests in beforeEach so cache never leaks across cases.
 *
 * Coverage targets:
 *   - unconfigured  → status: 'degraded', lastError describes what is missing
 *   - live          → status: 'live', upstream returns 200/valid
 *   - degraded      → status: 'degraded', e.g. HTTP 429 from Polygon
 *   - offline       → status: 'offline', upstream returns 4xx/5xx
 *   - cache         → second request returns same result; upstream called once
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { http, HttpResponse } from 'msw';
import { server } from '../setup.js';
import { _probeCacheForTests } from '../../src/routes/health.js';

// Set env vars before any module is imported — this mirrors the pattern in
// cache.test.ts and digest-metrics.test.ts. supabase.ts throws on import
// if SUPABASE_URL/SUPABASE_SERVICE_KEY are absent.
vi.hoisted(() => {
  process.env.SUPABASE_URL ??= 'http://localhost:54321';
  process.env.SUPABASE_SERVICE_KEY ??= 'test-service-key';
});

// Stripe is lazy-imported inside probeStripe(). Mock the module so tests
// never need a real Stripe key and we can control balance.retrieve().
vi.mock('stripe', () => {
  const balanceRetrieveFn = vi.fn().mockResolvedValue({ object: 'balance' });
  const StripeMock = vi.fn().mockImplementation(() => ({
    balance: { retrieve: balanceRetrieveFn },
  }));
  // Expose the inner fn so tests can override it per case.
  (StripeMock as unknown as Record<string, unknown>)._balanceRetrieve = balanceRetrieveFn;
  return { default: StripeMock };
});

// crypto.isCryptoReady — default to true; tests override as needed.
vi.mock('../../src/lib/crypto.js', () => ({
  isCryptoReady: vi.fn().mockReturnValue(true),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function buildTestApp(): Promise<FastifyInstance> {
  // Import here so vi.mock() is already in place.
  const { buildApp } = await import('../../src/app.js');
  const { app } = await buildApp({ websockets: false, enableLogger: false });
  await app.ready();
  return app;
}

/** GET /api/v1/health/integrations via Fastify inject (no real network). */
async function getIntegrations(app: FastifyInstance) {
  const response = await app.inject({
    method: 'GET',
    url: '/api/v1/health/integrations',
  });
  return {
    status: response.statusCode,
    body: response.json() as {
      checkedAt: string;
      integrations: Record<string, {
        status: 'live' | 'degraded' | 'offline';
        latencyMs: number;
        lastError: string | null;
        lastSuccessAt: string | null;
        ttlSeconds: number;
        via?: string | null;
        mode?: string;
        provider?: string;
        reason?: string;
        fallback?: string;
        impact?: string;
      }>;
      summary: { live: number; degraded: number; offline: number; total: number };
    },
    headers: response.headers,
  };
}

// Saved original env so we can restore after each test.
const savedEnv: Record<string, string | undefined> = {};
function saveEnv(...keys: string[]) {
  for (const k of keys) savedEnv[k] = process.env[k];
}
function restoreEnv(...keys: string[]) {
  for (const k of keys) {
    if (savedEnv[k] === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = savedEnv[k];
    }
  }
}

// ---------------------------------------------------------------------------
// Suite setup
// ---------------------------------------------------------------------------

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  // Clear the probe cache so every test starts from a clean state.
  _probeCacheForTests.clear();
});

// ---------------------------------------------------------------------------
// Structural contract
// ---------------------------------------------------------------------------

describe('GET /api/v1/health/integrations — response shape', () => {
  it('always returns HTTP 200 regardless of upstream failures', async () => {
    const { status } = await getIntegrations(app);
    expect(status).toBe(200);
  });

  it('returns top-level checkedAt, integrations, summary fields', async () => {
    const { body } = await getIntegrations(app);
    expect(body.checkedAt).toBeDefined();
    expect(new Date(body.checkedAt).getTime()).not.toBeNaN();
    expect(body.integrations).toBeDefined();
    expect(body.summary).toBeDefined();
    expect(typeof body.summary.live).toBe('number');
    expect(typeof body.summary.degraded).toBe('number');
    expect(typeof body.summary.offline).toBe('number');
    expect(typeof body.summary.total).toBe('number');
    expect(body.summary.live + body.summary.degraded + body.summary.offline).toBe(body.summary.total);
  });

  it('x-schema-validation header is present', async () => {
    const { headers } = await getIntegrations(app);
    expect(headers['x-schema-validation']).toBeDefined();
  });

  it('every integration entry has required shape fields', async () => {
    const { body } = await getIntegrations(app);
    for (const [name, entry] of Object.entries(body.integrations)) {
      expect(['live', 'degraded', 'offline'], `${name}.status`).toContain(entry.status);
      expect(typeof entry.latencyMs, `${name}.latencyMs`).toBe('number');
      expect(entry.ttlSeconds, `${name}.ttlSeconds`).toBe(60);
    }
  });
});

// ---------------------------------------------------------------------------
// Polygon REST probe
// ---------------------------------------------------------------------------

describe('polygon probe', () => {
  const POLYGON_KEY = 'POLYGON_API_KEY';

  beforeEach(() => {
    saveEnv(POLYGON_KEY);
    delete process.env[POLYGON_KEY];
    _probeCacheForTests.clear();
  });

  afterEach(() => {
    restoreEnv(POLYGON_KEY);
  });

  it('unconfigured → degraded with reason', async () => {
    const { body } = await getIntegrations(app);
    const p = body.integrations.polygon;
    expect(p.status).toBe('degraded');
    expect(p.lastError).toContain('POLYGON_API_KEY');
    expect(p.reason).toContain('POLYGON_API_KEY');
  });

  it('live → live when upstream returns {status:"OK"}', async () => {
    process.env[POLYGON_KEY] = 'test-polygon-key';
    _probeCacheForTests.clear();

    server.use(
      http.get('https://api.polygon.io/v2/aggs/ticker/AAPL/prev', () =>
        HttpResponse.json({ status: 'OK', resultsCount: 1, results: [] }),
      ),
    );

    const { body } = await getIntegrations(app);
    expect(body.integrations.polygon.status).toBe('live');
  });

  it('rate limited → degraded on HTTP 429', async () => {
    process.env[POLYGON_KEY] = 'test-polygon-key';
    _probeCacheForTests.clear();

    server.use(
      http.get('https://api.polygon.io/v2/aggs/ticker/AAPL/prev', () =>
        new HttpResponse(null, { status: 429 }),
      ),
    );

    const { body } = await getIntegrations(app);
    const p = body.integrations.polygon;
    expect(p.status).toBe('degraded');
    expect(p.reason).toContain('429');
  });

  it('upstream 5xx → offline', async () => {
    process.env[POLYGON_KEY] = 'test-polygon-key';
    _probeCacheForTests.clear();

    server.use(
      http.get('https://api.polygon.io/v2/aggs/ticker/AAPL/prev', () =>
        new HttpResponse(null, { status: 503 }),
      ),
    );

    const { body } = await getIntegrations(app);
    expect(body.integrations.polygon.status).toBe('offline');
  });

  it('body status not OK → offline', async () => {
    process.env[POLYGON_KEY] = 'test-polygon-key';
    _probeCacheForTests.clear();

    server.use(
      http.get('https://api.polygon.io/v2/aggs/ticker/AAPL/prev', () =>
        HttpResponse.json({ status: 'ERROR', error: 'invalid api key' }),
      ),
    );

    const { body } = await getIntegrations(app);
    expect(body.integrations.polygon.status).toBe('offline');
  });
});

// ---------------------------------------------------------------------------
// AlphaVantage probe
// ---------------------------------------------------------------------------

describe('alphaVantage probe', () => {
  const AV_KEY = 'ALPHA_VANTAGE_API_KEY';

  beforeEach(() => {
    saveEnv(AV_KEY);
    delete process.env[AV_KEY];
    _probeCacheForTests.clear();
  });

  afterEach(() => {
    restoreEnv(AV_KEY);
  });

  it('unconfigured → degraded', async () => {
    const { body } = await getIntegrations(app);
    const av = body.integrations.alphaVantage;
    expect(av.status).toBe('degraded');
    expect(av.reason).toContain('ALPHA_VANTAGE_API_KEY');
  });

  it('live response → live', async () => {
    process.env[AV_KEY] = 'test-av-key';
    _probeCacheForTests.clear();

    server.use(
      http.get('https://www.alphavantage.co/query', () =>
        HttpResponse.json({ 'Global Quote': { '01. symbol': 'AAPL' } }),
      ),
    );

    const { body } = await getIntegrations(app);
    expect(body.integrations.alphaVantage.status).toBe('live');
  });

  it('AV soft-error Information key → degraded', async () => {
    process.env[AV_KEY] = 'test-av-key';
    _probeCacheForTests.clear();

    server.use(
      http.get('https://www.alphavantage.co/query', () =>
        HttpResponse.json({
          Information:
            'Thank you for using Alpha Vantage! Our standard API rate limit is 25 requests per day.',
        }),
      ),
    );

    const { body } = await getIntegrations(app);
    const av = body.integrations.alphaVantage;
    expect(av.status).toBe('degraded');
    expect(av.reason).toContain('Thank you');
  });

  it('AV Note key → degraded', async () => {
    process.env[AV_KEY] = 'test-av-key';
    _probeCacheForTests.clear();

    server.use(
      http.get('https://www.alphavantage.co/query', () =>
        HttpResponse.json({ Note: 'API call frequency exceeded.' }),
      ),
    );

    const { body } = await getIntegrations(app);
    expect(body.integrations.alphaVantage.status).toBe('degraded');
  });

  it('HTTP 4xx → offline', async () => {
    process.env[AV_KEY] = 'test-av-key';
    _probeCacheForTests.clear();

    server.use(
      http.get('https://www.alphavantage.co/query', () =>
        new HttpResponse(null, { status: 403 }),
      ),
    );

    const { body } = await getIntegrations(app);
    expect(body.integrations.alphaVantage.status).toBe('offline');
  });
});

// ---------------------------------------------------------------------------
// Resend / email probe
// ---------------------------------------------------------------------------

describe('emailDelivery probe (Resend)', () => {
  const API_KEY_ENV = 'EMAIL_API_KEY';
  const PROVIDER_ENV = 'EMAIL_PROVIDER';

  beforeEach(() => {
    saveEnv(API_KEY_ENV, PROVIDER_ENV);
    delete process.env[API_KEY_ENV];
    delete process.env[PROVIDER_ENV];
    _probeCacheForTests.clear();
  });

  afterEach(() => {
    restoreEnv(API_KEY_ENV, PROVIDER_ENV);
  });

  it('unconfigured (no key) → degraded', async () => {
    const { body } = await getIntegrations(app);
    const ed = body.integrations.emailDelivery;
    expect(ed.status).toBe('degraded');
    expect(ed.reason).toContain('EMAIL_API_KEY');
  });

  it('provider=console → degraded', async () => {
    process.env[API_KEY_ENV] = 'some-key';
    process.env[PROVIDER_ENV] = 'console';
    _probeCacheForTests.clear();

    const { body } = await getIntegrations(app);
    expect(body.integrations.emailDelivery.status).toBe('degraded');
    expect(body.integrations.emailDelivery.reason).toContain('console');
  });

  it('provider=resend + 200 from Resend domains → live', async () => {
    process.env[API_KEY_ENV] = 'resend-test-key';
    process.env[PROVIDER_ENV] = 'resend';
    _probeCacheForTests.clear();

    server.use(
      http.get('https://api.resend.com/domains', () =>
        HttpResponse.json({ data: [] }),
      ),
    );

    const { body } = await getIntegrations(app);
    expect(body.integrations.emailDelivery.status).toBe('live');
  });

  it('provider=resend + 401 from Resend → offline', async () => {
    process.env[API_KEY_ENV] = 'bad-key';
    process.env[PROVIDER_ENV] = 'resend';
    _probeCacheForTests.clear();

    server.use(
      http.get('https://api.resend.com/domains', () =>
        new HttpResponse(null, { status: 401 }),
      ),
    );

    const { body } = await getIntegrations(app);
    expect(body.integrations.emailDelivery.status).toBe('offline');
    expect(body.integrations.emailDelivery.reason).toContain('401');
  });

  it('non-resend provider (sendgrid) → live, env-checked', async () => {
    process.env[API_KEY_ENV] = 'sg-key';
    process.env[PROVIDER_ENV] = 'sendgrid';
    _probeCacheForTests.clear();

    const { body } = await getIntegrations(app);
    const ed = body.integrations.emailDelivery;
    expect(ed.status).toBe('live');
    expect(ed.mode).toBe('env-checked');
  });
});

// ---------------------------------------------------------------------------
// Supabase probe
// ---------------------------------------------------------------------------

describe('supabase probe', () => {
  const SB_URL = 'SUPABASE_URL';
  const SB_KEY = 'SUPABASE_SERVICE_KEY';

  beforeEach(() => {
    saveEnv(SB_URL, SB_KEY);
    delete process.env[SB_URL];
    delete process.env[SB_KEY];
    // Also clear NEXT_PUBLIC_ variants used as fallbacks.
    saveEnv('NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY');
    delete process.env['NEXT_PUBLIC_SUPABASE_URL'];
    delete process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
    _probeCacheForTests.clear();
  });

  afterEach(() => {
    restoreEnv(SB_URL, SB_KEY, 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY');
  });

  it('unconfigured → degraded', async () => {
    const { body } = await getIntegrations(app);
    const sb = body.integrations.supabase;
    expect(sb.status).toBe('degraded');
    expect(sb.reason).toBeDefined();
  });

  it('live → live when REST gateway returns 200', async () => {
    const supabaseTestUrl = 'https://test-project.supabase.co';
    process.env[SB_URL] = supabaseTestUrl;
    process.env[SB_KEY] = 'test-service-key';
    _probeCacheForTests.clear();

    server.use(
      http.get(`${supabaseTestUrl}/rest/v1/`, () =>
        HttpResponse.json({ message: 'ok' }),
      ),
    );

    const { body } = await getIntegrations(app);
    expect(body.integrations.supabase.status).toBe('live');
  });

  it('offline when REST gateway returns 503', async () => {
    const supabaseTestUrl = 'https://test-project.supabase.co';
    process.env[SB_URL] = supabaseTestUrl;
    process.env[SB_KEY] = 'test-service-key';
    _probeCacheForTests.clear();

    server.use(
      http.get(`${supabaseTestUrl}/rest/v1/`, () =>
        new HttpResponse(null, { status: 503 }),
      ),
    );

    const { body } = await getIntegrations(app);
    expect(body.integrations.supabase.status).toBe('offline');
  });
});

// ---------------------------------------------------------------------------
// Stripe probe (mocked SDK)
// ---------------------------------------------------------------------------

describe('stripe probe', () => {
  const STRIPE_KEY = 'STRIPE_SECRET_KEY';
  const BILLING_KEY = 'BILLING_ENABLED';

  beforeEach(() => {
    saveEnv(STRIPE_KEY, BILLING_KEY);
    delete process.env[STRIPE_KEY];
    delete process.env[BILLING_KEY];
    _probeCacheForTests.clear();
  });

  afterEach(() => {
    restoreEnv(STRIPE_KEY, BILLING_KEY);
  });

  it('unconfigured → degraded', async () => {
    const { body } = await getIntegrations(app);
    const s = body.integrations.stripe;
    expect(s.status).toBe('degraded');
    expect(s.reason).toContain('STRIPE_SECRET_KEY');
  });

  it('key set + BILLING_ENABLED=true + SDK resolves → live', async () => {
    // The stripe module mock defaults balanceRetrieve to resolve successfully.
    process.env[STRIPE_KEY] = 'sk_test_abc';
    process.env[BILLING_KEY] = 'true';
    _probeCacheForTests.clear();

    const { body } = await getIntegrations(app);
    expect(body.integrations.stripe.status).toBe('live');
  });

  it('key set + BILLING_ENABLED unset → degraded (billing not enabled)', async () => {
    process.env[STRIPE_KEY] = 'sk_test_abc';
    _probeCacheForTests.clear();

    const { body } = await getIntegrations(app);
    const s = body.integrations.stripe;
    expect(s.status).toBe('degraded');
    expect(s.reason).toContain('BILLING_ENABLED');
  });

  it('SDK throws → offline', async () => {
    process.env[STRIPE_KEY] = 'sk_test_bad';
    process.env[BILLING_KEY] = 'true';
    _probeCacheForTests.clear();

    // Override the mock to throw for this test only.
    const { default: StripeMock } = await import('stripe');
    const balanceFn = (StripeMock as unknown as Record<string, unknown>)
      ._balanceRetrieve as ReturnType<typeof vi.fn>;
    balanceFn.mockRejectedValueOnce(new Error('Authentication error'));

    const { body } = await getIntegrations(app);
    const s = body.integrations.stripe;
    expect(s.status).toBe('offline');
    expect(s.lastError).toContain('Authentication error');
  });
});

// ---------------------------------------------------------------------------
// ConnectAlpaca probe (crypto module)
// ---------------------------------------------------------------------------

describe('connectAlpaca probe', () => {
  const BROKER_KEY = 'BROKER_CRED_ENC_KEY';

  beforeEach(() => {
    saveEnv(BROKER_KEY);
    delete process.env[BROKER_KEY];
    _probeCacheForTests.clear();
  });

  afterEach(() => {
    restoreEnv(BROKER_KEY);
  });

  it('unconfigured → degraded', async () => {
    const { body } = await getIntegrations(app);
    const ca = body.integrations.connectAlpaca;
    expect(ca.status).toBe('degraded');
    expect(ca.reason).toContain('BROKER_CRED_ENC_KEY');
  });

  it('malformed key (not 64 chars) → degraded', async () => {
    process.env[BROKER_KEY] = 'tooshort';
    _probeCacheForTests.clear();

    const { body } = await getIntegrations(app);
    const ca = body.integrations.connectAlpaca;
    expect(ca.status).toBe('degraded');
    expect(ca.reason).toContain('malformed');
  });

  it('valid 64-char key + isCryptoReady=true → live', async () => {
    process.env[BROKER_KEY] = 'a'.repeat(64);
    _probeCacheForTests.clear();

    const { isCryptoReady } = await import('../../src/lib/crypto.js');
    vi.mocked(isCryptoReady).mockReturnValue(true);

    const { body } = await getIntegrations(app);
    expect(body.integrations.connectAlpaca.status).toBe('live');
  });

  it('valid key + isCryptoReady=false → offline', async () => {
    process.env[BROKER_KEY] = 'b'.repeat(64);
    _probeCacheForTests.clear();

    const { isCryptoReady } = await import('../../src/lib/crypto.js');
    vi.mocked(isCryptoReady).mockReturnValueOnce(false);

    const { body } = await getIntegrations(app);
    const ca = body.integrations.connectAlpaca;
    expect(ca.status).toBe('offline');
    expect(ca.reason).toContain('crypto round-trip');
  });
});

// ---------------------------------------------------------------------------
// Probe cache
// ---------------------------------------------------------------------------

describe('probe cache (60s TTL)', () => {
  it('second request returns cached result without hitting upstream again', async () => {
    const POLYGON_KEY = 'POLYGON_API_KEY';
    saveEnv(POLYGON_KEY);
    process.env[POLYGON_KEY] = 'cache-test-key';
    _probeCacheForTests.clear();

    let callCount = 0;
    server.use(
      http.get('https://api.polygon.io/v2/aggs/ticker/AAPL/prev', () => {
        callCount++;
        return HttpResponse.json({ status: 'OK', resultsCount: 1, results: [] });
      }),
    );

    // First request — probe runs, upstream called once.
    await getIntegrations(app);
    const countAfterFirst = callCount;

    // Second request — cache is warm; upstream must NOT be called again.
    await getIntegrations(app);
    expect(callCount).toBe(countAfterFirst); // no additional call

    restoreEnv(POLYGON_KEY);
  });

  it('cache returns stale entry (latencyMs > 0 preserved)', async () => {
    const POLYGON_KEY = 'POLYGON_API_KEY';
    saveEnv(POLYGON_KEY);
    process.env[POLYGON_KEY] = 'cache-stale-key';
    _probeCacheForTests.clear();

    server.use(
      http.get('https://api.polygon.io/v2/aggs/ticker/AAPL/prev', () =>
        HttpResponse.json({ status: 'OK', resultsCount: 1, results: [] }),
      ),
    );

    const first = await getIntegrations(app);
    const second = await getIntegrations(app);

    // latencyMs on second hit should match first (cached value).
    expect(second.body.integrations.polygon.latencyMs).toBe(
      first.body.integrations.polygon.latencyMs,
    );

    restoreEnv(POLYGON_KEY);
  });
});

// ---------------------------------------------------------------------------
// Static entries (env-checked, no network)
// ---------------------------------------------------------------------------
// LLM Explainer probe (real upstream HTTP to models list endpoint)
// ---------------------------------------------------------------------------

describe('llmExplainer probe (DeepSeek / OpenAI models list)', () => {
  beforeEach(() => {
    saveEnv('DEEPSEEK_API_KEY', 'OPENAI_API_KEY');
    delete process.env['DEEPSEEK_API_KEY'];
    delete process.env['OPENAI_API_KEY'];
    _probeCacheForTests.clear();
  });

  afterEach(() => {
    restoreEnv('DEEPSEEK_API_KEY', 'OPENAI_API_KEY');
  });

  it('unconfigured (no keys) → degraded with reason', async () => {
    const { body } = await getIntegrations(app);
    const llm = body.integrations.llmExplainer;
    expect(llm.status).toBe('degraded');
    expect(llm.reason).toContain('DEEPSEEK_API_KEY');
  });

  it('DeepSeek key + 200 from models list → live with provider=deepseek', async () => {
    process.env['DEEPSEEK_API_KEY'] = 'ds-test-key';
    _probeCacheForTests.clear();

    server.use(
      http.get('https://api.deepseek.com/models', () =>
        HttpResponse.json({ object: 'list', data: [{ id: 'deepseek-chat' }] }),
      ),
    );

    const { body } = await getIntegrations(app);
    const llm = body.integrations.llmExplainer;
    expect(llm.status).toBe('live');
    expect(llm.provider).toBe('deepseek');
  });

  it('OpenAI key only (no DeepSeek) + 200 → live with provider=openai', async () => {
    delete process.env['DEEPSEEK_API_KEY'];
    process.env['OPENAI_API_KEY'] = 'sk-test-key';
    _probeCacheForTests.clear();

    server.use(
      http.get('https://api.openai.com/v1/models', () =>
        HttpResponse.json({ object: 'list', data: [{ id: 'gpt-4o' }] }),
      ),
    );

    const { body } = await getIntegrations(app);
    const llm = body.integrations.llmExplainer;
    expect(llm.status).toBe('live');
    expect(llm.provider).toBe('openai');
  });

  it('DeepSeek key + 401 → offline (key rejected)', async () => {
    process.env['DEEPSEEK_API_KEY'] = 'bad-key';
    _probeCacheForTests.clear();

    server.use(
      http.get('https://api.deepseek.com/models', () =>
        new HttpResponse(null, { status: 401 }),
      ),
    );

    const { body } = await getIntegrations(app);
    const llm = body.integrations.llmExplainer;
    expect(llm.status).toBe('offline');
    expect(llm.reason).toContain('401');
  });

  it('DeepSeek key + 429 → degraded (rate limited)', async () => {
    process.env['DEEPSEEK_API_KEY'] = 'rate-limited-key';
    _probeCacheForTests.clear();

    server.use(
      http.get('https://api.deepseek.com/models', () =>
        new HttpResponse(null, { status: 429 }),
      ),
    );

    const { body } = await getIntegrations(app);
    const llm = body.integrations.llmExplainer;
    expect(llm.status).toBe('degraded');
    expect(llm.reason).toContain('429');
  });

  it('DeepSeek key + 5xx → offline', async () => {
    process.env['DEEPSEEK_API_KEY'] = 'ds-key';
    _probeCacheForTests.clear();

    server.use(
      http.get('https://api.deepseek.com/models', () =>
        new HttpResponse(null, { status: 503 }),
      ),
    );

    const { body } = await getIntegrations(app);
    expect(body.integrations.llmExplainer.status).toBe('offline');
  });

  it('cache: second request reuses result without calling upstream again', async () => {
    process.env['DEEPSEEK_API_KEY'] = 'cache-key';
    _probeCacheForTests.clear();

    let callCount = 0;
    server.use(
      http.get('https://api.deepseek.com/models', () => {
        callCount++;
        return HttpResponse.json({ object: 'list', data: [] });
      }),
    );

    await getIntegrations(app);
    const countAfterFirst = callCount;
    await getIntegrations(app);
    expect(callCount).toBe(countAfterFirst);
  });
});

// ---------------------------------------------------------------------------

describe('static / env-checked integrations', () => {
  it('vapidPush → live when both VAPID keys set', async () => {
    saveEnv('VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY');
    process.env['VAPID_PUBLIC_KEY'] = 'test-pub';
    process.env['VAPID_PRIVATE_KEY'] = 'test-priv';
    _probeCacheForTests.clear();

    const { body } = await getIntegrations(app);
    expect(body.integrations.vapidPush.status).toBe('live');

    restoreEnv('VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY');
  });

  it('vapidPush → degraded when keys are missing', async () => {
    saveEnv('VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY');
    delete process.env['VAPID_PUBLIC_KEY'];
    delete process.env['VAPID_PRIVATE_KEY'];
    _probeCacheForTests.clear();

    const { body } = await getIntegrations(app);
    expect(body.integrations.vapidPush.status).toBe('degraded');

    restoreEnv('VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY');
  });

  it('compGuard is always live (code-level)', async () => {
    const { body } = await getIntegrations(app);
    expect(body.integrations.compGuard.status).toBe('live');
    expect(body.integrations.compGuard.provider).toBe('code-level');
  });

  it('polygonWebSocket → degraded on Vercel (by design)', async () => {
    saveEnv('VERCEL');
    process.env['VERCEL'] = '1';
    _probeCacheForTests.clear();

    const { body } = await getIntegrations(app);
    expect(body.integrations.polygonWebSocket.status).toBe('degraded');
    expect(body.integrations.polygonWebSocket.reason).toContain('Vercel');

    restoreEnv('VERCEL');
  });
});
