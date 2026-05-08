/**
 * Unit tests for SimulatedBroker.
 *
 * Mocks:
 *  - marketDataProvider.getQuote(): returns controlled bid/ask quotes.
 *  - supabaseAdmin: in-memory tables (paper_accounts, paper_orders,
 *    paper_positions) backed by Maps, with a thenable query builder that
 *    handles select/insert/update/delete + eq/in/order/limit/single/maybeSingle.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Hoisted env so importing the supabase module never throws.
vi.hoisted(() => {
  process.env.SUPABASE_URL ??= 'http://localhost:54321';
  process.env.SUPABASE_SERVICE_KEY ??= 'test-service-key';
});

// vi.mock() factories are hoisted to the top of the file, so the supabase
// mock + the in-memory tables must live inside vi.hoisted() to be available
// when the SUT module is imported.
const h = vi.hoisted(() => {
  // ------ in-memory tables ------
  const accounts = new Map<string, Record<string, unknown>>();
  const orders: Record<string, unknown>[] = [];
  const positions = new Map<string, Record<string, unknown>>();

  const posKey = (uid: string, sym: string) => `${uid}|${sym.toUpperCase()}`;

  type Filter =
    | { kind: 'eq'; col: string; val: unknown }
    | { kind: 'in'; col: string; vals: unknown[] };

  function rowMatches(row: Record<string, unknown>, filters: Filter[]): boolean {
    for (const f of filters) {
      if (f.kind === 'eq' && row[f.col] !== f.val) return false;
      if (f.kind === 'in' && !f.vals.includes(row[f.col])) return false;
    }
    return true;
  }

  function tableRows(table: string): Record<string, unknown>[] {
    if (table === 'paper_accounts') return Array.from(accounts.values());
    if (table === 'paper_orders') return orders;
    if (table === 'paper_positions') return Array.from(positions.values());
    throw new Error(`unknown table ${table}`);
  }

  function applyInsert(table: string, row: Record<string, unknown>): Record<string, unknown> {
    const now = new Date().toISOString();
    if (table === 'paper_accounts') {
      const r = {
        user_id: row.user_id,
        cash_usd: row.cash_usd,
        starting_cash: row.starting_cash,
        created_at: now,
        updated_at: now,
      };
      accounts.set(r.user_id as string, r);
      return r;
    }
    if (table === 'paper_orders') {
      const r = { ...row, submitted_at: row.submitted_at ?? now };
      orders.push(r);
      return r;
    }
    if (table === 'paper_positions') {
      const r = {
        user_id: row.user_id,
        symbol: (row.symbol as string).toUpperCase(),
        qty: row.qty,
        avg_entry_price: row.avg_entry_price,
        cost_basis: row.cost_basis,
        opened_at: row.opened_at ?? now,
        updated_at: row.updated_at ?? now,
      };
      positions.set(posKey(r.user_id as string, r.symbol as string), r);
      return r;
    }
    throw new Error(`insert: unknown table ${table}`);
  }

  function applyUpdate(table: string, patch: Record<string, unknown>, filters: Filter[]): Record<string, unknown>[] {
    const updated: Record<string, unknown>[] = [];
    if (table === 'paper_accounts') {
      for (const [k, row] of accounts.entries()) {
        if (rowMatches(row, filters)) {
          const next = { ...row, ...patch };
          accounts.set(k, next);
          updated.push(next);
        }
      }
    } else if (table === 'paper_orders') {
      for (let i = 0; i < orders.length; i++) {
        if (rowMatches(orders[i], filters)) {
          orders[i] = { ...orders[i], ...patch };
          updated.push(orders[i]);
        }
      }
    } else if (table === 'paper_positions') {
      for (const [k, row] of positions.entries()) {
        if (rowMatches(row, filters)) {
          const next = { ...row, ...patch };
          positions.set(k, next);
          updated.push(next);
        }
      }
    }
    return updated;
  }

  function applyDelete(table: string, filters: Filter[]): void {
    if (table === 'paper_positions') {
      for (const [k, row] of positions.entries()) {
        if (rowMatches(row, filters)) positions.delete(k);
      }
    } else if (table === 'paper_orders') {
      for (let i = orders.length - 1; i >= 0; i--) {
        if (rowMatches(orders[i], filters)) orders.splice(i, 1);
      }
    } else if (table === 'paper_accounts') {
      for (const [k, row] of accounts.entries()) {
        if (rowMatches(row, filters)) accounts.delete(k);
      }
    }
  }

  type Op = 'select' | 'insert' | 'update' | 'delete';
  interface BuilderState {
    table: string;
    op: Op;
    filters: Filter[];
    insertRow?: Record<string, unknown>;
    updatePatch?: Record<string, unknown>;
    postSelect?: boolean;
    single?: boolean;
    maybeSingle?: boolean;
  }

  function makeBuilder(state: BuilderState): unknown {
    const finalize = (): { data: unknown; error: unknown } => {
      if (state.op === 'insert') {
        const inserted = applyInsert(state.table, state.insertRow!);
        if (state.postSelect) {
          if (state.single || state.maybeSingle) return { data: inserted, error: null };
          return { data: [inserted], error: null };
        }
        return { data: null, error: null };
      }
      if (state.op === 'update') {
        const updated = applyUpdate(state.table, state.updatePatch!, state.filters);
        if (state.postSelect) return { data: updated, error: null };
        return { data: null, error: null };
      }
      if (state.op === 'delete') {
        applyDelete(state.table, state.filters);
        return { data: null, error: null };
      }
      const matched = tableRows(state.table).filter((r) => rowMatches(r, state.filters));
      if (state.single) {
        if (matched.length === 0) return { data: null, error: { message: 'no rows', code: 'PGRST116' } };
        return { data: matched[0], error: null };
      }
      if (state.maybeSingle) return { data: matched[0] ?? null, error: null };
      return { data: matched, error: null };
    };

    const builder: Record<string, unknown> = {
      select(_cols?: string) {
        if (state.op === 'insert' || state.op === 'update') state.postSelect = true;
        return builder;
      },
      insert(row: Record<string, unknown>) {
        state.op = 'insert';
        state.insertRow = row;
        return builder;
      },
      update(patch: Record<string, unknown>) {
        state.op = 'update';
        state.updatePatch = patch;
        return builder;
      },
      delete() {
        state.op = 'delete';
        return builder;
      },
      eq(col: string, val: unknown) {
        state.filters.push({ kind: 'eq', col, val });
        return builder;
      },
      in(col: string, vals: unknown[]) {
        state.filters.push({ kind: 'in', col, vals });
        return builder;
      },
      order(_col: string, _opts?: unknown) {
        return builder;
      },
      limit(_n: number) {
        return builder;
      },
      single() {
        state.single = true;
        return Promise.resolve(finalize());
      },
      maybeSingle() {
        state.maybeSingle = true;
        return Promise.resolve(finalize());
      },
      then(resolve: (v: { data: unknown; error: unknown }) => unknown, reject?: (e: unknown) => unknown) {
        return Promise.resolve(finalize()).then(resolve, reject);
      },
    };
    return builder;
  }

  const supabaseAdmin = {
    from(table: string) {
      return makeBuilder({ table, op: 'select', filters: [] });
    },
  };

  const getQuoteMock = vi.fn();

  return { accounts, orders, positions, posKey, supabaseAdmin, getQuoteMock };
});

// ---------------------------------------------------------------------------
// Local types (for test seed clarity only)
// ---------------------------------------------------------------------------

interface PaperAccountRow {
  user_id: string;
  cash_usd: number;
  starting_cash: number;
  created_at: string;
  updated_at: string;
}
interface PaperOrderRow {
  id: string;
  user_id: string;
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  type: 'market' | 'limit' | 'stop' | 'stop_limit';
  limit_price: number | null;
  stop_price: number | null;
  time_in_force: string | null;
  status: 'pending' | 'filled' | 'partially_filled' | 'canceled' | 'rejected' | 'expired';
  filled_qty: number | null;
  filled_avg_price: number | null;
  submitted_at: string;
  filled_at: string | null;
  canceled_at: string | null;
  reject_reason: string | null;
  client_order_id: string | null;
}
// ---------------------------------------------------------------------------
// Mocks — vi.mock factories run before imports
// ---------------------------------------------------------------------------

vi.mock('../../src/lib/supabase.js', () => ({
  supabaseAdmin: h.supabaseAdmin,
}));

vi.mock('../../src/data/MarketDataProvider.js', () => ({
  marketDataProvider: { getQuote: (sym: string) => h.getQuoteMock(sym) },
}));

vi.mock('../../src/lib/logger.js', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { SimulatedBroker } from '../../src/trading/SimulatedBroker.js';

// Bring hoisted state into local scope for tests.
const accounts = h.accounts as Map<string, PaperAccountRow>;
const orders = h.orders as unknown as PaperOrderRow[];
const positions = h.positions as Map<string, PaperPositionRow>;
const posKey = h.posKey;
const getQuoteMock = h.getQuoteMock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function quote(symbol: string, bid: number, ask: number) {
  return {
    symbol: symbol.toUpperCase(),
    bid,
    ask,
    last: (bid + ask) / 2,
    timestamp: new Date(),
    change: 0,
    changePercent: 0,
  };
}

const UID = 'user-test-001';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SimulatedBroker', () => {
  beforeEach(() => {
    accounts.clear();
    orders.length = 0;
    positions.clear();
    getQuoteMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // getAccount
  // -------------------------------------------------------------------------

  describe('getAccount', () => {
    it('first call lazy-creates paper_accounts row with $100k starting cash', async () => {
      getQuoteMock.mockResolvedValue(null); // no positions to mark
      const broker = new SimulatedBroker({ apiKey: '', apiSecret: '', userId: UID });

      expect(accounts.size).toBe(0);
      const acct = await broker.getAccount();

      expect(accounts.size).toBe(1);
      expect(acct.cash).toBe(100_000);
      expect(acct.buyingPower).toBe(200_000); // 2x margin
      expect(acct.portfolioValue).toBe(100_000);
    });
  });

  // -------------------------------------------------------------------------
  // submitOrder — fills & rejections
  // -------------------------------------------------------------------------

  describe('submitOrder', () => {
    it('buy market fills at ask, position created with avg_entry=ask, cash decremented', async () => {
      getQuoteMock.mockResolvedValue(quote('AAPL', 99, 101));
      const broker = new SimulatedBroker({ apiKey: '', apiSecret: '', userId: UID });

      const order = await broker.submitOrder({
        symbol: 'AAPL',
        side: 'buy',
        type: 'market',
        qty: 10,
      });

      expect(order.status).toBe('filled');
      expect(order.filledAvgPrice).toBe(101);
      expect(order.filledQty).toBe(10);

      const pos = positions.get(posKey(UID, 'AAPL'));
      expect(pos?.qty).toBe(10);
      expect(pos?.avg_entry_price).toBe(101);
      expect(pos?.cost_basis).toBe(1010);

      expect(accounts.get(UID)?.cash_usd).toBe(100_000 - 1010);
    });

    it('sell market without position is rejected (no shorting)', async () => {
      getQuoteMock.mockResolvedValue(quote('AAPL', 99, 101));
      const broker = new SimulatedBroker({ apiKey: '', apiSecret: '', userId: UID });

      await expect(
        broker.submitOrder({ symbol: 'AAPL', side: 'sell', type: 'market', qty: 5 }),
      ).rejects.toThrow(/insufficient position/i);

      const rej = orders.find((o) => o.status === 'rejected');
      expect(rej).toBeDefined();
      expect(rej?.reject_reason).toMatch(/insufficient position/i);
    });

    it('buy limit at marketable price (ask <= limit) fills immediately at limit price', async () => {
      getQuoteMock.mockResolvedValue(quote('AAPL', 99, 100));
      const broker = new SimulatedBroker({ apiKey: '', apiSecret: '', userId: UID });

      const order = await broker.submitOrder({
        symbol: 'AAPL',
        side: 'buy',
        type: 'limit',
        qty: 5,
        limitPrice: 105,
      });

      expect(order.status).toBe('filled');
      expect(order.filledAvgPrice).toBe(105); // fills at limit, not at ask
      const pos = positions.get(posKey(UID, 'AAPL'));
      expect(pos?.avg_entry_price).toBe(105);
    });

    it('buy limit at non-marketable price persists as pending, no position created', async () => {
      getQuoteMock.mockResolvedValue(quote('AAPL', 99, 110));
      const broker = new SimulatedBroker({ apiKey: '', apiSecret: '', userId: UID });

      const order = await broker.submitOrder({
        symbol: 'AAPL',
        side: 'buy',
        type: 'limit',
        qty: 3,
        limitPrice: 100, // ask (110) > limit (100) -> not marketable
      });

      expect(order.status).toBe('new'); // 'pending' mapped to 'new'
      expect(positions.size).toBe(0);
      expect(orders.find((o) => o.status === 'pending')).toBeDefined();
    });

    it('buying-power: cash 1000, 2x margin = 2000, $3000 buy is rejected', async () => {
      getQuoteMock.mockResolvedValue(quote('AAPL', 99, 100));
      const broker = new SimulatedBroker({
        apiKey: '',
        apiSecret: '',
        userId: UID,
        startingCash: 1000,
      });

      await expect(
        broker.submitOrder({ symbol: 'AAPL', side: 'buy', type: 'market', qty: 30 }),
      ).rejects.toThrow(/insufficient buying power/i);

      expect(orders.some((o) => o.status === 'rejected' && /buying power/i.test(o.reject_reason ?? ''))).toBe(true);
      expect(positions.size).toBe(0);
    });

    it('trailing_stop type is rejected with reject_reason', async () => {
      getQuoteMock.mockResolvedValue(quote('AAPL', 99, 100));
      const broker = new SimulatedBroker({ apiKey: '', apiSecret: '', userId: UID });

      await expect(
        broker.submitOrder({
          symbol: 'AAPL',
          side: 'buy',
          type: 'trailing_stop',
          qty: 5,
          trailPercent: 5,
        }),
      ).rejects.toThrow(/trailing_stop/i);

      const rej = orders.find((o) => o.status === 'rejected');
      expect(rej?.reject_reason).toMatch(/trailing_stop/i);
    });

    it('position averaging: buy 100 @ $50 then 100 @ $60 -> avg=$55, qty=200, cost=$11000', async () => {
      const broker = new SimulatedBroker({ apiKey: '', apiSecret: '', userId: UID });

      // First buy at ask=$50
      getQuoteMock.mockResolvedValue(quote('AAPL', 49, 50));
      await broker.submitOrder({ symbol: 'AAPL', side: 'buy', type: 'market', qty: 100 });

      // Second buy at ask=$60 — every getQuote call during this submit returns $60
      getQuoteMock.mockResolvedValue(quote('AAPL', 59, 60));
      await broker.submitOrder({ symbol: 'AAPL', side: 'buy', type: 'market', qty: 100 });

      const pos = positions.get(posKey(UID, 'AAPL'));
      expect(pos?.qty).toBe(200);
      expect(pos?.avg_entry_price).toBe(55);
      expect(pos?.cost_basis).toBe(11000);
    });
  });

  // -------------------------------------------------------------------------
  // getPositions — mark to market
  // -------------------------------------------------------------------------

  describe('getPositions', () => {
    it('marks-to-market against current quote, unrealized P/L computed', async () => {
      // Seed a position directly
      positions.set(posKey(UID, 'AAPL'), {
        user_id: UID,
        symbol: 'AAPL',
        qty: 10,
        avg_entry_price: 100,
        cost_basis: 1000,
        opened_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      getQuoteMock.mockResolvedValue(quote('AAPL', 119, 121)); // last ~120

      const broker = new SimulatedBroker({ apiKey: '', apiSecret: '', userId: UID });
      const pos = await broker.getPositions();

      expect(pos).toHaveLength(1);
      expect(pos[0].symbol).toBe('AAPL');
      expect(pos[0].currentPrice).toBe(120);
      expect(pos[0].marketValue).toBe(1200);
      expect(pos[0].unrealizedPnL).toBe(200);
      expect(pos[0].unrealizedPnLPercent).toBeCloseTo(20, 5);
    });
  });

  // -------------------------------------------------------------------------
  // cancelOrder
  // -------------------------------------------------------------------------

  describe('cancelOrder', () => {
    it('pending -> canceled (status flipped, canceled_at set)', async () => {
      orders.push({
        id: 'ord-1',
        user_id: UID,
        symbol: 'AAPL',
        side: 'buy',
        qty: 5,
        type: 'limit',
        limit_price: 50,
        stop_price: null,
        time_in_force: 'day',
        status: 'pending',
        filled_qty: 0,
        filled_avg_price: null,
        submitted_at: new Date().toISOString(),
        filled_at: null,
        canceled_at: null,
        reject_reason: null,
        client_order_id: null,
      });

      const broker = new SimulatedBroker({ apiKey: '', apiSecret: '', userId: UID });
      const ok = await broker.cancelOrder('ord-1');

      expect(ok).toBe(true);
      const row = orders.find((o) => o.id === 'ord-1')!;
      expect(row.status).toBe('canceled');
      expect(row.canceled_at).not.toBeNull();
    });

    it('already-filled order cannot be canceled (idempotent fail)', async () => {
      orders.push({
        id: 'ord-2',
        user_id: UID,
        symbol: 'AAPL',
        side: 'buy',
        qty: 5,
        type: 'market',
        limit_price: null,
        stop_price: null,
        time_in_force: 'day',
        status: 'filled',
        filled_qty: 5,
        filled_avg_price: 100,
        submitted_at: new Date().toISOString(),
        filled_at: new Date().toISOString(),
        canceled_at: null,
        reject_reason: null,
        client_order_id: null,
      });

      const broker = new SimulatedBroker({ apiKey: '', apiSecret: '', userId: UID });
      const ok = await broker.cancelOrder('ord-2');

      expect(ok).toBe(false);
      const row = orders.find((o) => o.id === 'ord-2')!;
      expect(row.status).toBe('filled'); // unchanged
    });
  });

  // -------------------------------------------------------------------------
  // getOrders status filter
  // -------------------------------------------------------------------------

  describe('getOrders', () => {
    function seed(id: string, status: PaperOrderRow['status']) {
      orders.push({
        id,
        user_id: UID,
        symbol: 'AAPL',
        side: 'buy',
        qty: 1,
        type: 'market',
        limit_price: null,
        stop_price: null,
        time_in_force: 'day',
        status,
        filled_qty: 0,
        filled_avg_price: null,
        submitted_at: new Date().toISOString(),
        filled_at: null,
        canceled_at: null,
        reject_reason: null,
        client_order_id: null,
      });
    }

    it("status='open' returns pending orders", async () => {
      seed('p1', 'pending');
      seed('p2', 'partially_filled');
      seed('f1', 'filled');
      seed('c1', 'canceled');

      const broker = new SimulatedBroker({ apiKey: '', apiSecret: '', userId: UID });
      const open = await broker.getOrders('open');

      const ids = open.map((o) => o.id).sort();
      expect(ids).toEqual(['p1']); // 'open' maps to status='pending'
    });

    it("status='closed' returns filled+canceled+rejected+expired orders", async () => {
      seed('f1', 'filled');
      seed('c1', 'canceled');
      seed('r1', 'rejected');
      seed('e1', 'expired');
      seed('p1', 'pending');

      const broker = new SimulatedBroker({ apiKey: '', apiSecret: '', userId: UID });
      const closed = await broker.getOrders('closed');

      const ids = closed.map((o) => o.id).sort();
      expect(ids).toEqual(['c1', 'e1', 'f1', 'r1']);
    });
  });
});
