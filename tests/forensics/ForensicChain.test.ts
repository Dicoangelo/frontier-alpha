/**
 * Unit tests for the Forensic Event Chain (IDEA-FF-1 / IDEA-FF-5).
 *
 * Supabase is fully mocked. Invariants under test:
 *   1. append() is fire-and-forget — never throws, returns null on failure.
 *   2. A missing table (PGRST205 / 42P01) latches the service into no-op mode.
 *   3. Hash chaining is correct: genesis link, head linking, sequence retry
 *      under unique-index contention.
 *   4. verify() detects sequence gaps, broken prev links, payload tampering,
 *      and seal tampering.
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

// Each awaited query chain consumes the next queued response in FIFO order.
// append() runs two chains per attempt (head read, then insert), so tests
// queue responses in execution order.
let responseQueue: MockResponse[] = [];
const insertSpy = vi.fn();
const fromSpy = vi.fn();
const loggerInfo = vi.fn();
const loggerError = vi.fn();

function createQueryBuilder() {
  const builder: Record<string, unknown> = {};
  const methods = ['select', 'eq', 'is', 'order', 'range', 'limit', 'single'];
  for (const m of methods) {
    builder[m] = vi.fn().mockReturnValue(builder);
  }
  builder.insert = vi.fn((row: unknown) => {
    insertSpy(row);
    return builder;
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

import {
  ForensicChain,
  GENESIS_HASH,
  canonicalize,
  computeEventHash,
  type ForensicEventRow,
} from '../../src/forensics/ForensicChain.js';
import { createHash } from 'node:crypto';

const USER = 'user-123';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Build a correctly sealed event row for verify() fixtures. */
function buildEvent(
  sequence: number,
  prevHash: string,
  payload: Record<string, unknown>,
  occurredAt = `2026-06-10T0${sequence}:00:00.000Z`,
): ForensicEventRow {
  const payloadHash = sha256(canonicalize(payload));
  return {
    id: `evt-${sequence}`,
    user_id: USER,
    stream: 'cvrf',
    sequence,
    event_type: 'belief_update',
    payload,
    payload_hash: payloadHash,
    prev_hash: prevHash,
    hash: computeEventHash({
      sequence,
      prevHash,
      eventType: 'belief_update',
      payloadHash,
      occurredAt,
    }),
    occurred_at: occurredAt,
    created_at: occurredAt,
  };
}

function buildChain(length: number): ForensicEventRow[] {
  const events: ForensicEventRow[] = [];
  let prev = GENESIS_HASH;
  for (let i = 1; i <= length; i++) {
    const event = buildEvent(i, prev, { version: i });
    events.push(event);
    prev = event.hash;
  }
  return events;
}

let chain: ForensicChain;

beforeEach(() => {
  chain = new ForensicChain();
  responseQueue = [];
  insertSpy.mockClear();
  fromSpy.mockClear();
  loggerInfo.mockClear();
  loggerError.mockClear();
});

describe('canonicalize', () => {
  it('produces identical output regardless of key order', () => {
    expect(canonicalize({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalize({ a: { c: 3, d: 2 }, b: 1 }));
  });

  it('preserves array order', () => {
    expect(canonicalize([2, 1])).not.toBe(canonicalize([1, 2]));
  });
});

describe('append', () => {
  it('seals the first event against the genesis hash', async () => {
    responseQueue = [
      { data: [], error: null }, // head read: empty chain
      { data: null, error: null }, // insert: success
    ];

    const hash = await chain.append({
      userId: USER,
      stream: 'cvrf',
      eventType: 'belief_update',
      payload: { version: 1 },
    });

    expect(hash).not.toBeNull();
    const row = insertSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(row.sequence).toBe(1);
    expect(row.prev_hash).toBe(GENESIS_HASH);
    expect(row.hash).toBe(hash);
    expect(row.hash).toBe(
      computeEventHash({
        sequence: 1,
        prevHash: GENESIS_HASH,
        eventType: 'belief_update',
        payloadHash: row.payload_hash as string,
        occurredAt: row.occurred_at as string,
      }),
    );
  });

  it('links a new event to the existing chain head', async () => {
    responseQueue = [
      { data: [{ sequence: 3, hash: 'head-hash-3' }], error: null },
      { data: null, error: null },
    ];

    await chain.append({ userId: USER, stream: 'cvrf', eventType: 'cycle_complete' });

    const row = insertSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(row.sequence).toBe(4);
    expect(row.prev_hash).toBe('head-hash-3');
  });

  it('retries once when a concurrent append wins the sequence race', async () => {
    responseQueue = [
      { data: [{ sequence: 1, hash: 'h1' }], error: null },
      { data: null, error: { code: '23505', message: 'duplicate key value' } },
      { data: [{ sequence: 2, hash: 'h2' }], error: null },
      { data: null, error: null },
    ];

    const hash = await chain.append({ userId: USER, stream: 'trading', eventType: 'order_submitted' });

    expect(hash).not.toBeNull();
    expect(insertSpy).toHaveBeenCalledTimes(2);
    const retryRow = insertSpy.mock.calls[1][0] as Record<string, unknown>;
    expect(retryRow.sequence).toBe(3);
    expect(retryRow.prev_hash).toBe('h2');
  });

  it('never throws and returns null on insert failure', async () => {
    responseQueue = [
      { data: [], error: null },
      { data: null, error: { code: '500', message: 'boom' } },
    ];

    await expect(
      chain.append({ userId: USER, stream: 'cvrf', eventType: 'belief_update' }),
    ).resolves.toBeNull();
    expect(loggerError).toHaveBeenCalled();
  });

  it('latches into no-op mode when the table is missing', async () => {
    responseQueue = [{ data: null, error: { code: 'PGRST205', message: 'schema cache' } }];

    const first = await chain.append({ userId: USER, stream: 'cvrf', eventType: 'belief_update' });
    expect(first).toBeNull();
    expect(loggerInfo).toHaveBeenCalledTimes(1);

    fromSpy.mockClear();
    const second = await chain.append({ userId: USER, stream: 'cvrf', eventType: 'belief_update' });
    expect(second).toBeNull();
    expect(fromSpy).not.toHaveBeenCalled(); // no further Supabase traffic
    expect(loggerInfo).toHaveBeenCalledTimes(1); // logged exactly once
  });
});

describe('verify', () => {
  it('accepts an empty chain', async () => {
    responseQueue = [{ data: [], error: null }];
    const result = await chain.verify(USER, 'cvrf');
    expect(result).toEqual({ valid: true, length: 0, headHash: null, brokenAt: null });
  });

  it('accepts a correctly linked chain and reports the head hash', async () => {
    const events = buildChain(3);
    responseQueue = [{ data: events, error: null }];

    const result = await chain.verify(USER, 'cvrf');

    expect(result.valid).toBe(true);
    expect(result.length).toBe(3);
    expect(result.headHash).toBe(events[2].hash);
  });

  it('detects a sequence gap', async () => {
    const events = buildChain(3);
    responseQueue = [{ data: [events[0], events[2]], error: null }];

    const result = await chain.verify(USER, 'cvrf');

    expect(result.valid).toBe(false);
    expect(result.brokenAt).toEqual({ sequence: 3, reason: 'sequence_gap_expected_2' });
  });

  it('detects a broken prev link', async () => {
    const events = buildChain(2);
    events[1] = { ...events[1], prev_hash: 'f'.repeat(64) };
    responseQueue = [{ data: events, error: null }];

    const result = await chain.verify(USER, 'cvrf');

    expect(result.valid).toBe(false);
    expect(result.brokenAt).toEqual({ sequence: 2, reason: 'broken_prev_link' });
  });

  it('detects payload tampering', async () => {
    const events = buildChain(2);
    events[1] = { ...events[1], payload: { version: 999 } }; // payload_hash now stale
    responseQueue = [{ data: events, error: null }];

    const result = await chain.verify(USER, 'cvrf');

    expect(result.valid).toBe(false);
    expect(result.brokenAt).toEqual({ sequence: 2, reason: 'payload_tampered' });
  });

  it('detects seal tampering (re-hashed payload but forged seal)', async () => {
    const events = buildChain(2);
    const tamperedPayload = { version: 999 };
    events[1] = {
      ...events[1],
      payload: tamperedPayload,
      payload_hash: sha256(canonicalize(tamperedPayload)), // attacker fixed payload_hash
      // ...but the sealed event hash still covers the original payload_hash
    };
    responseQueue = [{ data: events, error: null }];

    const result = await chain.verify(USER, 'cvrf');

    expect(result.valid).toBe(false);
    expect(result.brokenAt).toEqual({ sequence: 2, reason: 'seal_tampered' });
  });

  it('returns empty-valid when the table is missing', async () => {
    responseQueue = [{ data: null, error: { code: '42P01', message: 'does not exist' } }];
    const result = await chain.verify(USER, 'cvrf');
    expect(result).toEqual({ valid: true, length: 0, headHash: null, brokenAt: null });
  });
});

describe('list', () => {
  it('returns paginated events newest-first', async () => {
    const events = buildChain(2).reverse();
    responseQueue = [{ data: events, error: null, count: 2 }];

    const result = await chain.list(USER, 'cvrf', { limit: 10 });

    expect(result.total).toBe(2);
    expect(result.events[0].sequence).toBe(2);
  });

  it('returns empty when the table is missing', async () => {
    responseQueue = [{ data: null, error: { code: 'PGRST205', message: 'missing' } }];
    const result = await chain.list(USER, 'cvrf');
    expect(result.events).toEqual([]);
    expect(result.total).toBe(0);
  });
});
