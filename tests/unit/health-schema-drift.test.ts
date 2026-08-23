/**
 * databaseSchema probe — column-level drift.
 *
 * The probe had no tests at all, and it checked table PRESENCE only. That gap
 * is not hypothetical. On 2026-08-23 the integration smoke suite failed with
 *
 *   Could not find the 'portfolio_id' column of 'frontier_risk_alerts'
 *   in the schema cache
 *
 * while /api/v1/health/integrations reported `databaseSchema: live`. The table
 * existed; the column did not. `001_initial_schema.sql:72` declares it, so
 * production has drifted from the tracked migration.
 *
 * What makes it worth a health check rather than a test fix:
 * RiskAlertSystem.persistAlert writes that exact shape inside a try/catch,
 * inside a `.catch()`. Every production alert insert fails and is swallowed
 * twice. Nothing surfaces it — which is the same class of silent-failure trap
 * CLAUDE.md already records for Polygon 403s.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { http, HttpResponse } from 'msw';
import { server } from '../setup.js';
import { _probeCacheForTests } from '../../src/routes/health.js';

vi.hoisted(() => {
  process.env.SUPABASE_URL ??= 'http://localhost:54321';
  process.env.SUPABASE_SERVICE_KEY ??= 'test-service-key';
});

const SUPABASE = 'http://localhost:54321';

/** Every table the probe requires, so only column drift can trip the assertions. */
const REQUIRED_TABLES = [
  'frontier_portfolios', 'frontier_positions', 'frontier_risk_alerts',
  'frontier_subscriptions', 'frontier_user_settings', 'frontier_historical_prices',
  'frontier_quote_cache', 'frontier_tax_lots', 'frontier_tax_events',
  'frontier_shared_portfolios', 'frontier_portfolio_shares', 'portfolio_shares',
  'frontier_model_versions',
];

/** Columns RiskAlertSystem.persistAlert writes. */
const ALERT_COLUMNS = [
  'id', 'user_id', 'portfolio_id', 'alert_type', 'severity',
  'title', 'message', 'metadata', 'created_at',
];

function openapiSpec(alertColumns: string[]) {
  const definitions: Record<string, { properties: Record<string, unknown> }> = {};
  for (const t of REQUIRED_TABLES) {
    definitions[t] = { properties: { id: { type: 'string' } } };
  }
  definitions.frontier_risk_alerts = {
    properties: Object.fromEntries(alertColumns.map((c) => [c, { type: 'string' }])),
  };
  return { definitions, paths: Object.fromEntries(REQUIRED_TABLES.map((t) => [`/${t}`, {}])) };
}

function stubSchema(alertColumns: string[]) {
  server.use(
    http.get(`${SUPABASE}/rest/v1/`, () => HttpResponse.json(openapiSpec(alertColumns))),
  );
}

async function schemaEntry(app: FastifyInstance) {
  const res = await app.inject({ method: 'GET', url: '/api/v1/health/integrations' });
  const body = res.json() as {
    integrations: Record<string, { status: string; reason?: string; lastError?: string; impact?: string }>;
  };
  return body.integrations.databaseSchema;
}

describe('databaseSchema probe — column drift', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const { buildApp } = await import('../../src/app.js');
    ({ app } = await buildApp({ websockets: false, enableLogger: false }));
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    _probeCacheForTests.clear();
  });

  it('reports live when every required column is present', async () => {
    stubSchema(ALERT_COLUMNS);
    expect((await schemaEntry(app)).status).toBe('live');
  });

  it('catches the real 2026-08-23 drift: portfolio_id missing from an EXISTING table', async () => {
    stubSchema(ALERT_COLUMNS.filter((c) => c !== 'portfolio_id'));
    const entry = await schemaEntry(app);

    expect(entry.status).toBe('degraded');
    expect(entry.reason).toContain('frontier_risk_alerts');
    expect(entry.reason).toContain('portfolio_id');
    // The old probe returned `live` for exactly this input — that is the bug.
    expect(entry.reason).toContain('column drift');
  });

  it('names every missing column, not just the first', async () => {
    stubSchema(ALERT_COLUMNS.filter((c) => c !== 'portfolio_id' && c !== 'metadata'));
    const entry = await schemaEntry(app);
    expect(entry.reason).toContain('portfolio_id');
    expect(entry.reason).toContain('metadata');
  });

  it('explains that the failure is silent, so the reason is actionable', async () => {
    stubSchema(ALERT_COLUMNS.filter((c) => c !== 'portfolio_id'));
    const entry = await schemaEntry(app);
    expect(entry.impact).toMatch(/silent/i);
  });

  it('still reports missing TABLES, and does not let column checks mask them', async () => {
    const spec = openapiSpec(ALERT_COLUMNS);
    delete spec.definitions.frontier_model_versions;
    delete (spec.paths as Record<string, unknown>)['/frontier_model_versions'];
    server.use(http.get(`${SUPABASE}/rest/v1/`, () => HttpResponse.json(spec)));

    const entry = await schemaEntry(app);
    expect(entry.status).toBe('degraded');
    expect(entry.reason).toContain('frontier_model_versions');
  });
});
