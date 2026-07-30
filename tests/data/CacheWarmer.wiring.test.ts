/**
 * WIRING tests for the two-tier cache warmer.
 *
 * Why this file exists separately from CacheWarmer.groupedDaily.test.ts:
 * that suite proves `warmLatestDayAllSymbols` WORKS. It passed the whole time
 * the function was dead code — Tier 2 was implemented, documented in the
 * CacheWarmer header as running on boot and on the hourly cron, and never
 * called from anywhere. Unit tests cannot catch a missing call site, so these
 * tests assert the CONNECTION rather than the behavior.
 *
 * See rules/gotchas.md: "'Unused' code is usually disconnected, not useless."
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// supabase.ts throws on import without these — set before importing the SUT.
vi.hoisted(() => {
  process.env.SUPABASE_URL ??= 'http://localhost:54321';
  process.env.SUPABASE_SERVICE_KEY ??= 'test-service-key';
  process.env.CRON_SECRET ??= 'test-cron-secret';
});

// vi.mock factories are hoisted above module scope, so the spies have to be
// created inside vi.hoisted() to exist by the time the factory runs.
const { warmTopHeldSymbols, warmLatestDayAllSymbols } = vi.hoisted(() => ({
  warmTopHeldSymbols: vi.fn(),
  warmLatestDayAllSymbols: vi.fn(),
}));

vi.mock('../../src/data/CacheWarmer.js', () => ({
  warmTopHeldSymbols,
  warmLatestDayAllSymbols,
  DEV_USER_ID: 'test-user',
  mostRecentTradingDay: (d: Date = new Date()) => d,
}));

import Fastify, { type FastifyInstance } from 'fastify';
import { cronWarmCacheRoutes } from '../../src/routes/cron-warm-cache.js';

/** Minimal server stub — the route only needs `dataProvider` to hand through. */
const serverStub = { dataProvider: {} } as never;

async function buildCronApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(async (instance) => {
    await cronWarmCacheRoutes(instance, { server: serverStub } as never);
  });
  await app.ready();
  return app;
}

async function callCron(app: FastifyInstance) {
  return app.inject({
    method: 'GET',
    url: `/api/v1/cron/warm-cache?key=${process.env.CRON_SECRET}`,
  });
}

describe('warm-cache cron — two-tier wiring', () => {
  beforeEach(() => {
    warmTopHeldSymbols.mockReset();
    warmLatestDayAllSymbols.mockReset();
    warmTopHeldSymbols.mockResolvedValue({
      attempted: 2,
      succeeded: 2,
      failed: 0,
      symbols: ['AAPL', 'MSFT'],
    });
    warmLatestDayAllSymbols.mockResolvedValue({
      date: '2026-07-29',
      tickersInGroup: 12481,
      updated: 2,
      symbols: ['AAPL', 'MSFT'],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('invokes Tier 2 grouped-daily after Tier 1 backfill', async () => {
    const app = await buildCronApp();
    const res = await callCron(app);

    expect(res.statusCode).toBe(200);
    expect(warmTopHeldSymbols).toHaveBeenCalledTimes(1);
    // The regression this file guards: Tier 2 must actually be called.
    expect(warmLatestDayAllSymbols).toHaveBeenCalledTimes(1);
    // ...and with the symbols Tier 1 just warmed, not some other list.
    expect(warmLatestDayAllSymbols).toHaveBeenCalledWith(serverStub.dataProvider, ['AAPL', 'MSFT']);

    await app.close();
  });

  it('reports the freshness result in the cron response', async () => {
    const app = await buildCronApp();
    const res = await callCron(app);

    const body = res.json() as { data: { freshness: { tickersInGroup: number; updated: number } } };
    expect(body.data.freshness.tickersInGroup).toBe(12481);
    expect(body.data.freshness.updated).toBe(2);

    await app.close();
  });

  it('still succeeds when Tier 2 throws — Tier 1 already did the real work', async () => {
    warmLatestDayAllSymbols.mockRejectedValue(new Error('grouped-daily 503'));

    const app = await buildCronApp();
    const res = await callCron(app);

    expect(res.statusCode).toBe(200);
    const body = res.json() as { success: boolean; data: { succeeded: number; freshness: null } };
    expect(body.success).toBe(true);
    expect(body.data.succeeded).toBe(2);
    expect(body.data.freshness).toBeNull();

    await app.close();
  });

  it('skips Tier 2 when Tier 1 warmed nothing (no symbols to refresh)', async () => {
    warmTopHeldSymbols.mockResolvedValue({ attempted: 0, succeeded: 0, failed: 0, symbols: [] });

    const app = await buildCronApp();
    const res = await callCron(app);

    expect(res.statusCode).toBe(200);
    expect(warmLatestDayAllSymbols).not.toHaveBeenCalled();

    await app.close();
  });
});
