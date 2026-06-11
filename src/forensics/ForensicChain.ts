/**
 * Forensic Event Chain (IDEA-FF-1 / IDEA-FF-5)
 *
 * Tamper-evident, append-only audit trail for the CVRF belief system and the
 * trading order book. Every event is SHA-256 hash-chained to the previous
 * event in its (user, stream) chain, so "yes, on 2026-06-10 the model believed
 * X" is verifiable by recomputing the chain instead of trusting the database.
 *
 * Pattern transferred from FriendlyFace's ForensicEvent
 * (friendlyface/core/models.py, Mohammed ICDF2C 2024).
 *
 * Same two hard rules as InsightLedger:
 *   1. FIRE-AND-FORGET — `append()` never throws and never blocks the caller's
 *      response path. Callers `void`-call it; failures are swallowed after
 *      logging.
 *   2. SCHEMA-DRIFT SAFE — the `frontier_forensic_events` table does not exist
 *      in production until Dico applies the migration. When the table is
 *      missing we log ONCE and no-op every subsequent call.
 */

import { supabaseAdmin } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { createHash } from 'node:crypto';

const TABLE = 'frontier_forensic_events';

/** Genesis link for the first event in any chain. */
export const GENESIS_HASH = '0'.repeat(64);

/** Each (user, stream) pair is an independent hash chain. */
export type ForensicStream = 'cvrf' | 'trading';

export type ForensicEventType =
  | 'episode_started'
  | 'episode_closed'
  | 'belief_update'
  | 'cycle_complete'
  | 'order_submitted'
  | 'order_canceled';

export interface ForensicEventRow {
  id: string;
  user_id: string | null;
  stream: ForensicStream;
  sequence: number;
  event_type: ForensicEventType;
  payload: Record<string, unknown>;
  payload_hash: string;
  prev_hash: string;
  hash: string;
  occurred_at: string;
  created_at: string;
}

export interface AppendInput {
  /** Null for the global (pre-auth) CVRF belief chain. */
  userId: string | null;
  stream: ForensicStream;
  eventType: ForensicEventType;
  payload?: unknown;
}

export interface VerifyResult {
  valid: boolean;
  /** Number of events checked. 0-length chains are trivially valid. */
  length: number;
  /** Hash of the newest event — the chain head a client can pin. */
  headHash: string | null;
  /** First broken link, when invalid. */
  brokenAt: { sequence: number; reason: string } | null;
}

export interface ChainListResult {
  events: ForensicEventRow[];
  total: number;
  limit: number;
  offset: number;
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
/** Verification walks the full chain but refuses unbounded reads. */
const VERIFY_MAX_EVENTS = 10_000;
/** Concurrent appends can collide on the (user, stream, sequence) unique index. */
const APPEND_RETRIES = 3;

/**
 * PostgREST surfaces a missing table as code `PGRST205` (schema cache miss) or
 * Postgres `42P01` (undefined_table). Either means "not migrated yet".
 */
function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === 'PGRST205' || error.code === '42P01') return true;
  const msg = error.message?.toLowerCase() ?? '';
  return msg.includes('does not exist') || msg.includes('could not find the table');
}

function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '23505') return true;
  return (error.message?.toLowerCase() ?? '').includes('duplicate key');
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Deterministic JSON: object keys sorted recursively so the same payload
 * always hashes to the same digest regardless of construction order.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/**
 * The sealed event hash. Covers everything that defines the event's place and
 * content in the chain; recomputable by any verifier from the stored row.
 */
export function computeEventHash(fields: {
  sequence: number;
  prevHash: string;
  eventType: string;
  payloadHash: string;
  occurredAt: string;
}): string {
  return sha256(
    `${fields.sequence}|${fields.prevHash}|${fields.eventType}|${fields.payloadHash}|${fields.occurredAt}`,
  );
}

/** Coerce an arbitrary payload into a JSONB-safe object. */
function normalizePayload(payload: unknown): Record<string, unknown> {
  if (payload == null) return {};
  if (Array.isArray(payload)) return { items: payload };
  if (typeof payload === 'object') return payload as Record<string, unknown>;
  return { value: payload };
}

export class ForensicChain {
  /**
   * Latched once we learn the table is absent, so we stop hammering Supabase
   * (and stop re-logging) for the rest of the process lifetime.
   */
  private tableMissing = false;

  /** Reset the missing-table latch (test seam). */
  reset(): void {
    this.tableMissing = false;
  }

  /**
   * Fire-and-forget append of one event to the (user, stream) chain.
   *
   * Reads the chain head, links the new event to it, and inserts. A concurrent
   * append racing for the same sequence number trips the unique index; we
   * re-read the head and retry up to APPEND_RETRIES times.
   *
   * Never throws. Returns the sealed event's hash on success, `null` otherwise.
   */
  async append(input: AppendInput): Promise<string | null> {
    if (this.tableMissing) return null;

    try {
      const payload = normalizePayload(input.payload);
      const payloadHash = sha256(canonicalize(payload));

      for (let attempt = 0; attempt < APPEND_RETRIES; attempt++) {
        const head = await this.getHead(input.userId, input.stream);
        if (head === undefined) return null; // table missing or read failed

        const sequence = head ? head.sequence + 1 : 1;
        const prevHash = head ? head.hash : GENESIS_HASH;
        const occurredAt = new Date().toISOString();
        const hash = computeEventHash({
          sequence,
          prevHash,
          eventType: input.eventType,
          payloadHash,
          occurredAt,
        });

        const { error } = await supabaseAdmin.from(TABLE).insert({
          user_id: input.userId,
          stream: input.stream,
          sequence,
          event_type: input.eventType,
          payload,
          payload_hash: payloadHash,
          prev_hash: prevHash,
          hash,
          occurred_at: occurredAt,
        });

        if (!error) return hash;

        if (isMissingTableError(error)) {
          this.markTableMissing('append');
          return null;
        }
        if (isUniqueViolation(error)) continue; // lost the race — re-read head

        logger.error(
          { err: error, stream: input.stream, eventType: input.eventType },
          'Failed to append forensic event',
        );
        return null;
      }

      logger.warn(
        { stream: input.stream, eventType: input.eventType },
        'Forensic append exhausted retries under sequence contention',
      );
      return null;
    } catch (err) {
      // Belt-and-suspenders: a thrown error here must never escape into the
      // caller's response path.
      logger.error({ err, stream: input.stream }, 'Forensic chain append threw unexpectedly');
      return null;
    }
  }

  /**
   * Walk the full (user, stream) chain in sequence order and recompute every
   * link. Detects: gaps in sequence, broken prev_hash links, payload tampering
   * (payload no longer matches payload_hash), and seal tampering (stored hash
   * no longer matches the recomputed event hash).
   */
  async verify(userId: string | null, stream: ForensicStream): Promise<VerifyResult> {
    const empty: VerifyResult = { valid: true, length: 0, headHash: null, brokenAt: null };
    if (this.tableMissing) return empty;

    let query = supabaseAdmin
      .from(TABLE)
      .select('*')
      .eq('stream', stream)
      .order('sequence', { ascending: true })
      .limit(VERIFY_MAX_EVENTS);
    query = userId === null ? query.is('user_id', null) : query.eq('user_id', userId);

    const { data, error } = await query;

    if (error) {
      if (isMissingTableError(error)) {
        this.markTableMissing('verify');
        return empty;
      }
      logger.error({ err: error, stream }, 'Failed to read forensic chain for verification');
      return { valid: false, length: 0, headHash: null, brokenAt: { sequence: 0, reason: 'read_failed' } };
    }

    const events = (data as ForensicEventRow[]) ?? [];
    let prevHash = GENESIS_HASH;
    let expectedSequence = 1;

    for (const event of events) {
      if (event.sequence !== expectedSequence) {
        return {
          valid: false,
          length: events.length,
          headHash: null,
          brokenAt: { sequence: event.sequence, reason: `sequence_gap_expected_${expectedSequence}` },
        };
      }
      if (event.prev_hash !== prevHash) {
        return {
          valid: false,
          length: events.length,
          headHash: null,
          brokenAt: { sequence: event.sequence, reason: 'broken_prev_link' },
        };
      }
      const recomputedPayloadHash = sha256(canonicalize(normalizePayload(event.payload)));
      if (recomputedPayloadHash !== event.payload_hash) {
        return {
          valid: false,
          length: events.length,
          headHash: null,
          brokenAt: { sequence: event.sequence, reason: 'payload_tampered' },
        };
      }
      const recomputedHash = computeEventHash({
        sequence: event.sequence,
        prevHash: event.prev_hash,
        eventType: event.event_type,
        payloadHash: event.payload_hash,
        occurredAt: event.occurred_at,
      });
      if (recomputedHash !== event.hash) {
        return {
          valid: false,
          length: events.length,
          headHash: null,
          brokenAt: { sequence: event.sequence, reason: 'seal_tampered' },
        };
      }
      prevHash = event.hash;
      expectedSequence++;
    }

    return {
      valid: true,
      length: events.length,
      headHash: events.length > 0 ? events[events.length - 1].hash : null,
      brokenAt: null,
    };
  }

  /** Paginated, per-user event listing (newest first). */
  async list(
    userId: string | null,
    stream: ForensicStream,
    options: { limit?: number; offset?: number } = {},
  ): Promise<ChainListResult> {
    const limit = clampLimit(options.limit);
    const offset = Math.max(0, options.offset ?? 0);
    const empty: ChainListResult = { events: [], total: 0, limit, offset };
    if (this.tableMissing) return empty;

    let query = supabaseAdmin
      .from(TABLE)
      .select('*', { count: 'exact' })
      .eq('stream', stream)
      .order('sequence', { ascending: false })
      .range(offset, offset + limit - 1);
    query = userId === null ? query.is('user_id', null) : query.eq('user_id', userId);

    const { data, error, count } = await query;

    if (error) {
      if (isMissingTableError(error)) {
        this.markTableMissing('list');
        return empty;
      }
      logger.error({ err: error, stream }, 'Failed to list forensic chain events');
      return empty;
    }

    return { events: (data as ForensicEventRow[]) ?? [], total: count ?? 0, limit, offset };
  }

  /**
   * Chain head for one (user, stream). Returns `null` for an empty chain and
   * `undefined` when the read failed (caller must abort, not assume genesis —
   * assuming genesis on a flaky read would fork the chain).
   */
  private async getHead(
    userId: string | null,
    stream: ForensicStream,
  ): Promise<{ sequence: number; hash: string } | null | undefined> {
    let query = supabaseAdmin
      .from(TABLE)
      .select('sequence, hash')
      .eq('stream', stream)
      .order('sequence', { ascending: false })
      .limit(1);
    query = userId === null ? query.is('user_id', null) : query.eq('user_id', userId);

    const { data, error } = await query;

    if (error) {
      if (isMissingTableError(error)) {
        this.markTableMissing('head read');
        return undefined;
      }
      logger.error({ err: error, stream }, 'Failed to read forensic chain head');
      return undefined;
    }

    const rows = (data as Array<{ sequence: number; hash: string }>) ?? [];
    return rows.length > 0 ? rows[0] : null;
  }

  private markTableMissing(operation: string): void {
    if (!this.tableMissing) {
      this.tableMissing = true;
      logger.info(
        { table: TABLE, operation },
        'Forensic events table not present — chain is a no-op until migration is applied',
      );
    }
  }
}

function clampLimit(limit?: number): number {
  if (!limit || limit <= 0) return DEFAULT_LIMIT;
  return Math.min(limit, MAX_LIMIT);
}

export const forensicChain = new ForensicChain();
