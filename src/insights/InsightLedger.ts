/**
 * Insight Provenance Ledger (IDEA-CIN-2)
 *
 * Persists a provenance receipt for every Cognitive Insight: which model and
 * substrate produced it, whether the request escaped to a fallback, its cost
 * and latency, the factor snapshot it was grounded on, and an optional user
 * rating. Surfaced to the user via the Insight History page so they can replay
 * or dispute a past explanation.
 *
 * Two hard rules:
 *   1. FIRE-AND-FORGET — `record()` never throws and never blocks the
 *      explanation response. Callers `void`-call it; any failure is swallowed
 *      after logging.
 *   2. SCHEMA-DRIFT SAFE — the `frontier_insight_ledger` table does not exist
 *      in production until Dico applies the migration. When the table is
 *      missing we log ONCE and no-op every subsequent call, so a fresh deploy
 *      against an un-migrated database behaves exactly as it did before.
 */

import { supabaseAdmin } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { createHash } from 'node:crypto';

const TABLE = 'frontier_insight_ledger';

/** A persisted ledger row as returned to the history API. */
export interface InsightLedgerEntry {
  id: string;
  user_id: string;
  generated_at: string;
  prompt_hash: string;
  factors_snapshot: Record<string, unknown>;
  model: string | null;
  substrate: string | null;
  escaped: boolean;
  escape_reason: string | null;
  output: string | null;
  cost_cents: number | null;
  latency_ms: number | null;
  user_rating: number | null;
  created_at: string;
}

/**
 * Routing/result metadata emitted by the explainer. Deliberately flexible —
 * builder-ai owns `src/explanation/*` and the exact field set may grow. Only
 * the fields the ledger persists are typed here; unknown extras are ignored.
 */
export interface InsightMetadata {
  model?: string | null;
  substrate?: string | null;
  escaped?: boolean;
  escapeReason?: string | null;
  latencyMs?: number | null;
  costCents?: number | null;
  [key: string]: unknown;
}

/** What a caller hands the ledger to record one insight. */
export interface RecordInsightInput {
  userId: string;
  /** The prompt/question the insight answered. Hashed, never stored raw. */
  prompt?: string;
  /** Pre-computed prompt hash; takes precedence over `prompt` if provided. */
  promptHash?: string;
  /** Factor exposures the insight was grounded on. */
  factorsSnapshot?: unknown;
  /** The generated explanation text. */
  output?: string | null;
  /** Routing/result metadata from the explainer. */
  metadata?: InsightMetadata;
}

export interface HistoryQuery {
  limit?: number;
  offset?: number;
}

export interface HistoryResult {
  entries: InsightLedgerEntry[];
  total: number;
  limit: number;
  offset: number;
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

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

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export class InsightLedger {
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
   * Fire-and-forget write of one insight provenance row.
   *
   * Never throws, never rejects in a way the caller must handle, never blocks
   * the explanation response. Returns the persisted id on success, or `null`
   * when the write was skipped or failed.
   */
  async record(input: RecordInsightInput): Promise<string | null> {
    if (this.tableMissing) return null;

    try {
      const meta = input.metadata ?? {};
      const promptHash =
        input.promptHash ?? (input.prompt ? sha256(input.prompt) : sha256(''));

      const row = {
        user_id: input.userId,
        prompt_hash: promptHash,
        factors_snapshot: normalizeSnapshot(input.factorsSnapshot),
        model: meta.model ?? null,
        substrate: meta.substrate ?? null,
        escaped: meta.escaped ?? false,
        escape_reason: meta.escapeReason ?? null,
        output: input.output ?? null,
        cost_cents: meta.costCents ?? null,
        latency_ms: meta.latencyMs ?? null,
      };

      const { data, error } = await supabaseAdmin
        .from(TABLE)
        .insert(row)
        .select('id')
        .single();

      if (error) {
        if (isMissingTableError(error)) {
          this.tableMissing = true;
          logger.info(
            { table: TABLE },
            'Insight ledger table not present — skipping writes until migration is applied',
          );
          return null;
        }
        logger.error({ err: error, userId: input.userId }, 'Failed to record insight ledger entry');
        return null;
      }

      return (data as { id: string } | null)?.id ?? null;
    } catch (err) {
      // Belt-and-suspenders: a thrown error here must never escape into the
      // explanation response path.
      logger.error({ err, userId: input.userId }, 'Insight ledger record threw unexpectedly');
      return null;
    }
  }

  /**
   * Paginated, per-user history (newest first). Returns an empty result when
   * the table is absent rather than erroring.
   */
  async getHistory(userId: string, query: HistoryQuery = {}): Promise<HistoryResult> {
    const limit = clampLimit(query.limit);
    const offset = Math.max(0, query.offset ?? 0);

    if (this.tableMissing) {
      return { entries: [], total: 0, limit, offset };
    }

    const { data, error, count } = await supabaseAdmin
      .from(TABLE)
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('generated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      if (isMissingTableError(error)) {
        this.tableMissing = true;
        logger.info(
          { table: TABLE },
          'Insight ledger table not present — returning empty history until migration is applied',
        );
        return { entries: [], total: 0, limit, offset };
      }
      logger.error({ err: error, userId }, 'Failed to fetch insight ledger history');
      return { entries: [], total: 0, limit, offset };
    }

    return {
      entries: (data as InsightLedgerEntry[]) ?? [],
      total: count ?? 0,
      limit,
      offset,
    };
  }

  /**
   * Set the user rating on one of the user's own ledger entries. RLS plus the
   * explicit `user_id` filter prevent rating another user's row. Returns the
   * updated entry, or `null` when not found / not owned / table absent.
   */
  async rate(userId: string, id: string, rating: number): Promise<InsightLedgerEntry | null> {
    if (this.tableMissing) return null;

    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .update({ user_rating: rating })
      .eq('id', id)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (error) {
      if (isMissingTableError(error)) {
        this.tableMissing = true;
        logger.info(
          { table: TABLE },
          'Insight ledger table not present — cannot rate until migration is applied',
        );
        return null;
      }
      // PGRST116 = no rows returned (not found / not owned). Not an error worth
      // logging at error level.
      if (error.code !== 'PGRST116') {
        logger.error({ err: error, userId, id }, 'Failed to rate insight ledger entry');
      }
      return null;
    }

    return (data as InsightLedgerEntry) ?? null;
  }
}

function clampLimit(limit?: number): number {
  if (!limit || limit <= 0) return DEFAULT_LIMIT;
  return Math.min(limit, MAX_LIMIT);
}

/** Coerce an arbitrary snapshot into a JSONB-safe object. */
function normalizeSnapshot(snapshot: unknown): Record<string, unknown> {
  if (snapshot == null) return {};
  if (Array.isArray(snapshot)) return { items: snapshot };
  if (typeof snapshot === 'object') return snapshot as Record<string, unknown>;
  return { value: snapshot };
}

export const insightLedger = new InsightLedger();
