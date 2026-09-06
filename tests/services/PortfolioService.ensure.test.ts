/**
 * PortfolioService.ensurePortfolio — the create-on-first-touch path.
 *
 * Before this existed NO code path inserted a `frontier_portfolios` row, so a
 * new account could never add a position (addPosition returned null → 400) and
 * GET /portfolio 404'd, which the Dashboard turned into $125K of demo data
 * under a LIVE badge. These tests pin the lazy-create contract.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.SUPABASE_URL ??= 'http://localhost:54321';
  process.env.SUPABASE_SERVICE_KEY ??= 'test-service-key';
});

const state = vi.hoisted(() => ({
  portfolioRow: null as null | { id: string; user_id: string; name: string; cash_balance: number },
  inserts: [] as Array<Record<string, unknown>>,
  insertError: null as null | { code: string; message: string },
}));

vi.mock('../../src/lib/supabase.js', () => {
  const chain = (table: string) => {
    const q: Record<string, unknown> = {};
    const self = () => q;
    q.select = self;
    q.eq = self;
    q.order = () => Promise.resolve({ data: [], error: null });
    q.single = () =>
      Promise.resolve(
        table === 'frontier_portfolios' && state.portfolioRow
          ? { data: state.portfolioRow, error: null }
          : { data: null, error: { code: 'PGRST116', message: 'no rows' } },
      );
    q.insert = (row: Record<string, unknown>) => {
      state.inserts.push(row);
      if (state.insertError) return Promise.resolve({ data: null, error: state.insertError });
      state.portfolioRow = {
        id: 'pf-1',
        user_id: String(row.user_id),
        name: String(row.name),
        cash_balance: Number(row.cash_balance),
      };
      return Promise.resolve({ data: null, error: null });
    };
    return q;
  };
  return { supabaseAdmin: { from: (t: string) => chain(t) } };
});

vi.mock('../../src/lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { PortfolioService, DEFAULT_STARTING_CASH } from '../../src/services/PortfolioService.js';

beforeEach(() => {
  state.portfolioRow = null;
  state.inserts = [];
  state.insertError = null;
});

describe('PortfolioService.ensurePortfolio', () => {
  it('creates the row with the default starting cash when none exists', async () => {
    const svc = new PortfolioService();
    const pf = await svc.ensurePortfolio('user-new');

    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]).toMatchObject({
      user_id: 'user-new',
      name: 'Main Portfolio',
      cash_balance: DEFAULT_STARTING_CASH,
    });
    expect(pf).not.toBeNull();
    expect(pf!.positions).toEqual([]);
    expect(Number(pf!.cash_balance)).toBe(DEFAULT_STARTING_CASH);
  });

  it('returns the existing row without inserting', async () => {
    state.portfolioRow = { id: 'pf-0', user_id: 'user-old', name: 'Main Portfolio', cash_balance: 42 };
    const svc = new PortfolioService();
    const pf = await svc.ensurePortfolio('user-old');

    expect(state.inserts).toHaveLength(0);
    expect(pf!.id).toBe('pf-0');
  });

  it('treats a unique-violation race as success and re-reads', async () => {
    state.insertError = { code: '23505', message: 'duplicate key' };
    const svc = new PortfolioService();
    // Simulate the other writer having landed the row by the time we re-read.
    const origSingle = state.portfolioRow;
    void origSingle;
    const p = svc.ensurePortfolio('user-race');
    state.portfolioRow = { id: 'pf-race', user_id: 'user-race', name: 'Main Portfolio', cash_balance: 100000 };
    const pf = await p;

    expect(pf!.id).toBe('pf-race');
  });

  it('returns null (not throw) on any other insert error', async () => {
    state.insertError = { code: '42501', message: 'permission denied' };
    const svc = new PortfolioService();
    expect(await svc.ensurePortfolio('user-denied')).toBeNull();
  });

  it('DEFAULT_STARTING_CASH matches the $100K paper-account convention', () => {
    expect(DEFAULT_STARTING_CASH).toBe(100_000);
  });
});
