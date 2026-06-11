/**
 * Provenance DAG (IDEA-FF-3)
 *
 * PROV-O-style decision lineage. Every pipeline stage becomes a DAG node
 * pointing at its parents:
 *
 *   market_data → factor_compute → optimizer_run → recommendation
 *   market_data → factor_compute → insight
 *   recommendation → user_action
 *
 * "How did the AI decide?" becomes a literal graph traversal — the lineage
 * endpoint walks a node's ancestry and returns the full derivation chain.
 * Pattern from FriendlyFace's ProvenanceNode (W3C PROV-O).
 *
 * Same hard rules as ForensicChain / InsightLedger:
 *   1. FIRE-AND-FORGET — `record()` never throws; callers chain node ids
 *      inside a void-called async block, never on the response path.
 *   2. SCHEMA-DRIFT SAFE — no-ops (logged once) until the
 *      `frontier_provenance_nodes` migration is applied.
 */

import { supabaseAdmin } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';

const TABLE = 'frontier_provenance_nodes';

export type ProvenanceNodeType =
  | 'market_data'
  | 'factor_compute'
  | 'optimizer_run'
  | 'recommendation'
  | 'insight'
  | 'user_action';

export const PROVENANCE_NODE_TYPES: ProvenanceNodeType[] = [
  'market_data',
  'factor_compute',
  'optimizer_run',
  'recommendation',
  'insight',
  'user_action',
];

export interface ProvenanceNodeRow {
  id: string;
  user_id: string | null;
  node_type: ProvenanceNodeType;
  label: string;
  payload: Record<string, unknown>;
  parents: string[];
  created_at: string;
}

export interface RecordNodeInput {
  userId: string | null;
  nodeType: ProvenanceNodeType;
  /** Human-readable one-liner shown in the lineage viewer. */
  label: string;
  payload?: unknown;
  /** Parent node ids. Invalid/null entries are dropped. */
  parents?: Array<string | null | undefined>;
}

export interface LineageResult {
  /** All ancestry nodes, including the requested node, newest-first. */
  nodes: ProvenanceNodeRow[];
  /** Derivation edges: child → parent. */
  edges: Array<{ from: string; to: string }>;
  /** True when the walk stopped at a depth/size cap, not at the roots. */
  truncated: boolean;
}

export interface RecentQuery {
  limit?: number;
  offset?: number;
  nodeType?: ProvenanceNodeType;
}

export interface RecentResult {
  nodes: ProvenanceNodeRow[];
  total: number;
  limit: number;
  offset: number;
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const MAX_LINEAGE_DEPTH = 12;
const MAX_LINEAGE_NODES = 200;

function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === 'PGRST205' || error.code === '42P01') return true;
  const msg = error.message?.toLowerCase() ?? '';
  return msg.includes('does not exist') || msg.includes('could not find the table');
}

/** Coerce an arbitrary payload into a JSONB-safe object. */
function normalizePayload(payload: unknown): Record<string, unknown> {
  if (payload == null) return {};
  if (Array.isArray(payload)) return { items: payload };
  if (typeof payload === 'object') return payload as Record<string, unknown>;
  return { value: payload };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ProvenanceDag {
  private tableMissing = false;

  /** Reset the missing-table latch (test seam). */
  reset(): void {
    this.tableMissing = false;
  }

  /**
   * Fire-and-forget insert of one DAG node. Returns the new node id (so a
   * void-called async block can thread it into children), or `null` when the
   * write was skipped or failed.
   */
  async record(input: RecordNodeInput): Promise<string | null> {
    if (this.tableMissing) return null;

    try {
      const parents = (input.parents ?? []).filter(
        (p): p is string => typeof p === 'string' && UUID_RE.test(p),
      );

      const { data, error } = await supabaseAdmin
        .from(TABLE)
        .insert({
          user_id: input.userId,
          node_type: input.nodeType,
          label: input.label.slice(0, 500),
          payload: normalizePayload(input.payload),
          parents,
        })
        .select('id')
        .single();

      if (error) {
        if (isMissingTableError(error)) {
          this.markTableMissing('record');
          return null;
        }
        logger.error({ err: error, nodeType: input.nodeType }, 'Failed to record provenance node');
        return null;
      }

      return (data as { id: string } | null)?.id ?? null;
    } catch (err) {
      logger.error({ err, nodeType: input.nodeType }, 'Provenance record threw unexpectedly');
      return null;
    }
  }

  /**
   * Walk a node's ancestry breadth-first (one query per generation) up to
   * MAX_LINEAGE_DEPTH / MAX_LINEAGE_NODES. The user filter is applied on
   * every fetch so a user can never traverse into another user's nodes.
   */
  async lineage(userId: string | null, nodeId: string): Promise<LineageResult | null> {
    const empty: LineageResult = { nodes: [], edges: [], truncated: false };
    if (this.tableMissing) return empty;
    if (!UUID_RE.test(nodeId)) return null;

    const seen = new Map<string, ProvenanceNodeRow>();
    const edges: Array<{ from: string; to: string }> = [];
    let frontier = [nodeId];
    let truncated = false;

    for (let depth = 0; depth <= MAX_LINEAGE_DEPTH && frontier.length > 0; depth++) {
      const toFetch = frontier.filter((id) => !seen.has(id));
      if (toFetch.length === 0) break;

      let query = supabaseAdmin.from(TABLE).select('*').in('id', toFetch);
      query = userId === null ? query.is('user_id', null) : query.eq('user_id', userId);
      const { data, error } = await query;

      if (error) {
        if (isMissingTableError(error)) {
          this.markTableMissing('lineage');
          return empty;
        }
        logger.error({ err: error, nodeId }, 'Failed to walk provenance lineage');
        return empty;
      }

      const rows = (data as ProvenanceNodeRow[]) ?? [];
      // The requested node itself wasn't found (or isn't this user's).
      if (depth === 0 && rows.length === 0) return null;

      const nextFrontier: string[] = [];
      for (const row of rows) {
        seen.set(row.id, row);
        for (const parent of row.parents ?? []) {
          edges.push({ from: row.id, to: parent });
          nextFrontier.push(parent);
        }
      }

      if (seen.size >= MAX_LINEAGE_NODES) {
        truncated = nextFrontier.length > 0;
        break;
      }
      if (depth === MAX_LINEAGE_DEPTH && nextFrontier.length > 0) {
        truncated = true;
      }
      frontier = nextFrontier;
    }

    const nodes = [...seen.values()].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    // Keep only edges whose parent landed inside the walked window.
    const resolvedEdges = edges.filter((e) => seen.has(e.to));
    if (resolvedEdges.length < edges.length) truncated = true;

    return { nodes, edges: resolvedEdges, truncated };
  }

  /** Paginated, per-user node listing (newest first), optionally by type. */
  async recent(userId: string | null, query: RecentQuery = {}): Promise<RecentResult> {
    const limit = clampLimit(query.limit);
    const offset = Math.max(0, query.offset ?? 0);
    const empty: RecentResult = { nodes: [], total: 0, limit, offset };
    if (this.tableMissing) return empty;

    let builder = supabaseAdmin
      .from(TABLE)
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    builder = userId === null ? builder.is('user_id', null) : builder.eq('user_id', userId);
    if (query.nodeType) builder = builder.eq('node_type', query.nodeType);

    const { data, error, count } = await builder;

    if (error) {
      if (isMissingTableError(error)) {
        this.markTableMissing('recent');
        return empty;
      }
      logger.error({ err: error }, 'Failed to list provenance nodes');
      return empty;
    }

    return { nodes: (data as ProvenanceNodeRow[]) ?? [], total: count ?? 0, limit, offset };
  }

  private markTableMissing(operation: string): void {
    if (!this.tableMissing) {
      this.tableMissing = true;
      logger.info(
        { table: TABLE, operation },
        'Provenance table not present — DAG is a no-op until migration is applied',
      );
    }
  }
}

function clampLimit(limit?: number): number {
  if (!limit || limit <= 0) return DEFAULT_LIMIT;
  return Math.min(limit, MAX_LIMIT);
}

export const provenanceDag = new ProvenanceDag();
