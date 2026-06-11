/**
 * Unit tests for the Provenance DAG service (IDEA-FF-3).
 *
 * Supabase is fully mocked. Invariants under test:
 *   1. record() is fire-and-forget — never throws, returns null on failure,
 *      drops invalid parent ids, latches no-op on missing table.
 *   2. lineage() walks ancestry breadth-first with user scoping, returns null
 *      for an unknown root, and reports truncation honestly.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.hoisted(() => {
  process.env.SUPABASE_URL ??= 'http://localhost:54321';
  process.env.SUPABASE_SERVICE_KEY ??= 'test-service-key';
});

interface MockResponse {
  data: unknown;
  error: unknown;
  count?: number | null;
}

let responseQueue: MockResponse[] = [];
const insertSpy = vi.fn();
const fromSpy = vi.fn();
const loggerInfo = vi.fn();
const loggerError = vi.fn();

function createQueryBuilder() {
  const builder: Record<string, unknown> = {};
  const methods = ['select', 'eq', 'is', 'in', 'order', 'range', 'limit'];
  for (const m of methods) {
    builder[m] = vi.fn().mockReturnValue(builder);
  }
  builder.insert = vi.fn((row: unknown) => {
    insertSpy(row);
    return builder;
  });
  builder.single = vi.fn(() => {
    const next = responseQueue.shift() ?? { data: null, error: null };
    return Promise.resolve(next);
  });
  builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
    const next = responseQueue.shift() ?? { data: null, error: null };
    return Promise.resolve(next).then(resolve, reject);
  };
  return builder;
}

vi.mock('../../src/lib/supabase.js', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => {
      fromSpy(...args);
      return createQueryBuilder();
    },
  },
}));

vi.mock('../../src/lib/logger.js', () => ({
  logger: {
    info: (...a: unknown[]) => loggerInfo(...a),
    error: (...a: unknown[]) => loggerError(...a),
    warn: vi.fn(),
  },
}));

import { ProvenanceDag, type ProvenanceNodeRow } from '../../src/forensics/ProvenanceDag.js';

const USER = 'user-123';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function node(n: number, parents: number[] = [], type = 'insight'): ProvenanceNodeRow {
  return {
    id: uuid(n),
    user_id: USER,
    node_type: type as ProvenanceNodeRow['node_type'],
    label: `node-${n}`,
    payload: {},
    parents: parents.map(uuid),
    created_at: `2026-06-11T00:00:0${n}.000Z`,
  };
}

let dag: ProvenanceDag;

beforeEach(() => {
  dag = new ProvenanceDag();
  responseQueue = [];
  insertSpy.mockClear();
  fromSpy.mockClear();
  loggerInfo.mockClear();
  loggerError.mockClear();
});

describe('record', () => {
  it('persists a node and returns its id', async () => {
    responseQueue = [{ data: { id: uuid(1) }, error: null }];

    const id = await dag.record({
      userId: USER,
      nodeType: 'factor_compute',
      label: 'Factor snapshot',
      payload: { symbol: 'NVDA' },
    });

    expect(id).toBe(uuid(1));
    const row = insertSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(row.node_type).toBe('factor_compute');
    expect(row.parents).toEqual([]);
  });

  it('keeps valid parent uuids and drops nulls/garbage', async () => {
    responseQueue = [{ data: { id: uuid(2) }, error: null }];

    await dag.record({
      userId: USER,
      nodeType: 'insight',
      label: 'Insight',
      parents: [uuid(1), null, undefined, 'not-a-uuid'],
    });

    const row = insertSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(row.parents).toEqual([uuid(1)]);
  });

  it('never throws and returns null on insert failure', async () => {
    responseQueue = [{ data: null, error: { code: '500', message: 'boom' } }];
    await expect(
      dag.record({ userId: USER, nodeType: 'insight', label: 'x' }),
    ).resolves.toBeNull();
    expect(loggerError).toHaveBeenCalled();
  });

  it('latches into no-op mode when the table is missing', async () => {
    responseQueue = [{ data: null, error: { code: 'PGRST205', message: 'schema cache' } }];

    expect(await dag.record({ userId: USER, nodeType: 'insight', label: 'x' })).toBeNull();
    expect(loggerInfo).toHaveBeenCalledTimes(1);

    fromSpy.mockClear();
    expect(await dag.record({ userId: USER, nodeType: 'insight', label: 'x' })).toBeNull();
    expect(fromSpy).not.toHaveBeenCalled();
    expect(loggerInfo).toHaveBeenCalledTimes(1);
  });
});

describe('lineage', () => {
  it('returns null for a malformed node id without querying', async () => {
    expect(await dag.lineage(USER, 'not-a-uuid')).toBeNull();
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it('returns null when the root node is not found / not owned', async () => {
    responseQueue = [{ data: [], error: null }];
    expect(await dag.lineage(USER, uuid(9))).toBeNull();
  });

  it('walks a three-generation chain and returns nodes + edges', async () => {
    // user_action(3) → recommendation(2) → market_data(1)
    responseQueue = [
      { data: [node(3, [2], 'user_action')], error: null },
      { data: [node(2, [1], 'recommendation')], error: null },
      { data: [node(1, [], 'market_data')], error: null },
    ];

    const result = await dag.lineage(USER, uuid(3));

    expect(result).not.toBeNull();
    expect(result!.nodes.map((n) => n.id)).toEqual([uuid(3), uuid(2), uuid(1)]);
    expect(result!.edges).toEqual([
      { from: uuid(3), to: uuid(2) },
      { from: uuid(2), to: uuid(1) },
    ]);
    expect(result!.truncated).toBe(false);
  });

  it('handles diamond ancestry without duplicating nodes', async () => {
    // 4 → [2, 3]; 2 → 1; 3 → 1
    responseQueue = [
      { data: [node(4, [2, 3])], error: null },
      { data: [node(2, [1]), node(3, [1])], error: null },
      { data: [node(1, [])], error: null },
    ];

    const result = await dag.lineage(USER, uuid(4));

    expect(result!.nodes).toHaveLength(4);
    expect(result!.edges).toHaveLength(4);
  });

  it('marks truncated when a parent falls outside the walked window', async () => {
    // Node points at a parent the user cannot read (filtered out by RLS scope)
    responseQueue = [
      { data: [node(2, [1])], error: null },
      { data: [], error: null }, // parent fetch returns nothing
    ];

    const result = await dag.lineage(USER, uuid(2));

    expect(result!.nodes).toHaveLength(1);
    expect(result!.edges).toHaveLength(0);
    expect(result!.truncated).toBe(true);
  });

  it('returns empty-valid when the table is missing', async () => {
    responseQueue = [{ data: null, error: { code: '42P01', message: 'does not exist' } }];
    const result = await dag.lineage(USER, uuid(1));
    expect(result).toEqual({ nodes: [], edges: [], truncated: false });
  });
});

describe('recent', () => {
  it('returns paginated nodes newest-first', async () => {
    responseQueue = [{ data: [node(2), node(1)], error: null, count: 2 }];
    const result = await dag.recent(USER, { limit: 10 });
    expect(result.total).toBe(2);
    expect(result.nodes[0].id).toBe(uuid(2));
  });

  it('returns empty when the table is missing', async () => {
    responseQueue = [{ data: null, error: { code: 'PGRST205', message: 'missing' } }];
    const result = await dag.recent(USER);
    expect(result.nodes).toEqual([]);
  });
});
