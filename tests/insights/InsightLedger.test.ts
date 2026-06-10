/**
 * Unit tests for the Insight Provenance Ledger service (IDEA-CIN-2).
 *
 * Supabase is fully mocked. The two invariants under test:
 *   1. record() is fire-and-forget — never throws, returns null on failure.
 *   2. A missing table (PGRST205 / 42P01) latches the service into no-op mode
 *      and is logged exactly once, so an un-migrated production deploy is safe.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.hoisted(() => {
  process.env.SUPABASE_URL ??= 'http://localhost:54321';
  process.env.SUPABASE_SERVICE_KEY ??= 'test-service-key';
});

// Chainable query-builder mock. Every method returns the builder; the builder
// is thenable so `await`ing the chain resolves with the configured value, and
// `.single()` resolves with it directly.
function createQueryBuilder(resolved: { data: unknown; error: unknown; count?: number | null }) {
  const builder: Record<string, ReturnType<typeof vi.fn>> & { then?: unknown } = {};
  const methods = ['select', 'insert', 'update', 'delete', 'eq', 'order', 'range', 'single'];
  for (const m of methods) {
    builder[m] = vi.fn().mockReturnValue(builder);
  }
  builder.single.mockResolvedValue(resolved);
  builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(resolved).then(resolve, reject);
  return builder;
}

let mockBuilder: ReturnType<typeof createQueryBuilder>;
const fromSpy = vi.fn(() => mockBuilder);
const loggerInfo = vi.fn();
const loggerError = vi.fn();

vi.mock('../../src/lib/supabase.js', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromSpy(...args) },
}));

vi.mock('../../src/lib/logger.js', () => ({
  logger: { info: (...a: unknown[]) => loggerInfo(...a), error: (...a: unknown[]) => loggerError(...a), warn: vi.fn() },
}));

import { InsightLedger } from '../../src/insights/InsightLedger.js';

const USER = 'user-123';

const SAMPLE_ROW = {
  id: 'ins-1',
  user_id: USER,
  generated_at: '2026-06-10T12:00:00Z',
  prompt_hash: 'abc123',
  factors_snapshot: {},
  model: 'deepseek-chat',
  substrate: 'deepseek',
  escaped: false,
  escape_reason: null,
  output: 'Momentum exposure rose.',
  cost_cents: null,
  latency_ms: 240,
  user_rating: null,
  created_at: '2026-06-10T12:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockBuilder = createQueryBuilder({ data: null, error: null });
});

describe('InsightLedger.record', () => {
  it('inserts a row and returns the new id', async () => {
    mockBuilder = createQueryBuilder({ data: { id: 'ins-1' }, error: null });
    const ledger = new InsightLedger();

    const id = await ledger.record({
      userId: USER,
      prompt: 'factor_shift:NVDA',
      factorsSnapshot: [{ factor: 'momentum', exposure: 0.4 }],
      output: 'Momentum exposure rose.',
      metadata: { substrate: 'deepseek', escaped: false, escapeReason: null, latencyMs: 240, model: 'deepseek-chat' },
    });

    expect(id).toBe('ins-1');
    expect(fromSpy).toHaveBeenCalledWith('frontier_insight_ledger');
    const inserted = mockBuilder.insert.mock.calls[0][0] as Record<string, unknown>;
    expect(inserted.user_id).toBe(USER);
    expect(inserted.substrate).toBe('deepseek');
    expect(inserted.latency_ms).toBe(240);
    // Array snapshot is wrapped, never passed raw.
    expect(inserted.factors_snapshot).toEqual({ items: [{ factor: 'momentum', exposure: 0.4 }] });
    // Prompt is hashed, never stored raw.
    expect(typeof inserted.prompt_hash).toBe('string');
    expect(inserted.prompt_hash).not.toContain('NVDA');
  });

  it('accepts a flexible metadata object and tolerates missing fields', async () => {
    mockBuilder = createQueryBuilder({ data: { id: 'ins-2' }, error: null });
    const ledger = new InsightLedger();

    const id = await ledger.record({ userId: USER, prompt: 'x', metadata: {} });

    expect(id).toBe('ins-2');
    const inserted = mockBuilder.insert.mock.calls[0][0] as Record<string, unknown>;
    expect(inserted.escaped).toBe(false);
    expect(inserted.model).toBeNull();
    expect(inserted.substrate).toBeNull();
  });

  it('returns null and never throws on a generic insert error', async () => {
    mockBuilder = createQueryBuilder({ data: null, error: { code: 'XX000', message: 'boom' } });
    const ledger = new InsightLedger();

    await expect(ledger.record({ userId: USER, prompt: 'x' })).resolves.toBeNull();
    expect(loggerError).toHaveBeenCalled();
  });

  it('latches into no-op mode when the table is missing (PGRST205), logging once', async () => {
    mockBuilder = createQueryBuilder({ data: null, error: { code: 'PGRST205', message: 'Could not find the table' } });
    const ledger = new InsightLedger();

    const first = await ledger.record({ userId: USER, prompt: 'x' });
    expect(first).toBeNull();
    expect(loggerInfo).toHaveBeenCalledTimes(1);

    // Second call short-circuits without touching supabase again.
    fromSpy.mockClear();
    const second = await ledger.record({ userId: USER, prompt: 'y' });
    expect(second).toBeNull();
    expect(fromSpy).not.toHaveBeenCalled();
    expect(loggerInfo).toHaveBeenCalledTimes(1);
  });

  it('treats Postgres undefined_table (42P01) as a missing table', async () => {
    mockBuilder = createQueryBuilder({ data: null, error: { code: '42P01', message: 'relation does not exist' } });
    const ledger = new InsightLedger();
    await expect(ledger.record({ userId: USER, prompt: 'x' })).resolves.toBeNull();
    expect(loggerInfo).toHaveBeenCalledTimes(1);
  });
});

describe('InsightLedger.getHistory', () => {
  it('returns paginated entries with total count', async () => {
    mockBuilder = createQueryBuilder({ data: [SAMPLE_ROW], error: null, count: 42 });
    const ledger = new InsightLedger();

    const result = await ledger.getHistory(USER, { limit: 10, offset: 20 });

    expect(result.entries).toHaveLength(1);
    expect(result.total).toBe(42);
    expect(result.limit).toBe(10);
    expect(result.offset).toBe(20);
    expect(mockBuilder.eq).toHaveBeenCalledWith('user_id', USER);
    expect(mockBuilder.range).toHaveBeenCalledWith(20, 29);
  });

  it('clamps limit to the max and defaults bad values', async () => {
    mockBuilder = createQueryBuilder({ data: [], error: null, count: 0 });
    const ledger = new InsightLedger();

    const big = await ledger.getHistory(USER, { limit: 9999 });
    expect(big.limit).toBe(100);

    const def = await ledger.getHistory(USER, { limit: 0 });
    expect(def.limit).toBe(25);
  });

  it('returns empty history (no throw) when the table is missing', async () => {
    mockBuilder = createQueryBuilder({ data: null, error: { code: 'PGRST205', message: 'missing' } });
    const ledger = new InsightLedger();

    const result = await ledger.getHistory(USER);
    expect(result.entries).toEqual([]);
    expect(result.total).toBe(0);
  });
});

describe('InsightLedger.rate', () => {
  it('updates the rating scoped to the owning user and returns the row', async () => {
    mockBuilder = createQueryBuilder({ data: { ...SAMPLE_ROW, user_rating: 5 }, error: null });
    const ledger = new InsightLedger();

    const updated = await ledger.rate(USER, 'ins-1', 5);

    expect(updated?.user_rating).toBe(5);
    expect(mockBuilder.update).toHaveBeenCalledWith({ user_rating: 5 });
    expect(mockBuilder.eq).toHaveBeenCalledWith('id', 'ins-1');
    expect(mockBuilder.eq).toHaveBeenCalledWith('user_id', USER);
  });

  it('returns null when the row is not found / not owned (PGRST116) without error log', async () => {
    mockBuilder = createQueryBuilder({ data: null, error: { code: 'PGRST116', message: 'no rows' } });
    const ledger = new InsightLedger();

    const updated = await ledger.rate(USER, 'nope', 5);
    expect(updated).toBeNull();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('returns null when the table is missing', async () => {
    mockBuilder = createQueryBuilder({ data: null, error: { code: '42P01', message: 'missing' } });
    const ledger = new InsightLedger();
    await expect(ledger.rate(USER, 'ins-1', 5)).resolves.toBeNull();
  });
});
