/**
 * useFactorDeltas — DASH3-005 (Cognitive Insight v2)
 *
 * Surfaces the top-3 factor changes vs a trailing baseline, wrapped in the
 * `DataSource<T>` discriminated union so empty / demo / real renders are a
 * compile-time concern, not a runtime audit.
 *
 * Two strategies, in priority order:
 *
 *   Strategy 1 — server-derived history (preferred):
 *     `GET /api/v1/portfolio/factors/history/:symbols?window=1d|5d` returns
 *     both the current snapshot and a `window`-prior snapshot in one round
 *     trip. The prior snapshot is computed by truncating the same Price[]
 *     series the current snapshot uses (see `src/factors/historySlice.ts`),
 *     so the user gets a real day-1 delta without waiting for localStorage
 *     to accumulate. This is the "remove the wait til tomorrow" UX gap that
 *     the original DASH3-005 deferred.
 *
 *   Strategy 2 — localStorage baseline (fallback):
 *     Persist the prior-session exposures to localStorage and diff current
 *     vs stored. Roll the baseline once per UTC day on first load. Used
 *     only when the server endpoint is unreachable, errors out, or returns
 *     an empty prior snapshot. This preserves the original DASH3-005
 *     behavior so the card never regresses below "client-only" coverage.
 *
 *   Strategy 3 — empty:
 *     Neither strategy yielded a delta. The DataSource contract handles the
 *     empty render.
 *
 * Top-3 selection: sort by `|deltaPct|` desc, take 3.
 *
 * Pure helpers (utcDayKey, readBaseline, writeBaseline, aggregateExposures,
 * computeDeltas, explainDelta) live in `factorDeltas.helpers.ts` so the test
 * suite can exercise them without importing the hook's React Query +
 * authStore + Supabase chain.
 */

import { useEffect, useMemo } from 'react';
import { useFactors, useFactorsHistory } from './useFactors';
import { type DataSource, EMPTY, wrapReal } from '@/lib/dataSource';
import {
  aggregateExposures,
  computeDeltas,
  readBaseline,
  utcDayKey,
  writeBaseline,
} from './factorDeltas.helpers';

export type {
  FactorDelta,
  BaselineRecord,
} from './factorDeltas.helpers';
export { BASELINE_PREFIX } from './factorDeltas.helpers';

import type { FactorDelta } from './factorDeltas.helpers';

export type FactorDeltaWindow = '1d' | '5d';

export interface UseFactorDeltasResult {
  data: DataSource<FactorDelta[]>;
  isLoading: boolean;
}

/**
 * Public hook signature per DASH3-005:
 *
 *   useFactorDeltas(portfolioId, window?)
 *
 * `symbols` is an internal-but-exposed third argument the parent component
 * passes in alongside portfolioId. We don't read it from a global store
 * because Dashboard.tsx today owns its symbols list locally; coupling this
 * hook to a store the dashboard doesn't currently write would be a hidden
 * refactor that violates the "no incidental refactors" constraint.
 */
export function useFactorDeltas(
  portfolioId: string,
  window: FactorDeltaWindow = '1d',
  symbols: string[] = [],
): UseFactorDeltasResult {
  const factorsQuery = useFactors(symbols);
  const historyQuery = useFactorsHistory(symbols, window);

  const data = useMemo<DataSource<FactorDelta[]>>(() => {
    // ── Strategy 1: server-derived current + prior snapshot ─────────────
    const history = historyQuery.data;
    if (history && history.current.length > 0 && history.prior.length > 0) {
      const priorAggregated = aggregateExposures(history.prior);
      const deltas = computeDeltas(history.current, priorAggregated);
      if (deltas.length > 0) {
        return wrapReal(deltas);
      }
      // Server returned both snapshots but they aggregate to identical
      // exposures (rare; usually means the price series didn't actually
      // change between snapshot dates — e.g., over a weekend with window=1d).
      // Fall through to localStorage so we don't render a falsely-empty card
      // when a longer-horizon baseline exists locally.
    }

    // ── Strategy 2: localStorage baseline ───────────────────────────────
    const factorsResp = factorsQuery.data;
    if (!factorsResp || !factorsResp.factors || factorsResp.factors.length === 0) {
      return EMPTY;
    }
    if (!portfolioId) {
      return EMPTY;
    }
    const current = factorsResp.factors;
    const today = utcDayKey();
    const baseline = readBaseline(portfolioId);

    if (baseline && baseline.capturedOn !== today) {
      const deltas = computeDeltas(current, baseline.exposures);
      return deltas.length > 0 ? wrapReal(deltas) : EMPTY;
    }
    return EMPTY;
  }, [historyQuery.data, factorsQuery.data, portfolioId]);

  // Side effect: capture / rotate the localStorage baseline once per UTC
  // day. Continues to run even when Strategy 1 succeeds, because the local
  // baseline is the offline fallback — losing it would re-introduce a
  // wait-til-tomorrow gap if the server endpoint ever degrades.
  useEffect(() => {
    const factorsResp = factorsQuery.data;
    if (!factorsResp || !factorsResp.factors || factorsResp.factors.length === 0) return;
    if (!portfolioId) return;

    const current = factorsResp.factors;
    const today = utcDayKey();
    const baseline = readBaseline(portfolioId);

    if (!baseline || baseline.capturedOn !== today) {
      writeBaseline(portfolioId, {
        capturedOn: today,
        exposures: aggregateExposures(current),
      });
    }
  }, [factorsQuery.data, portfolioId]);

  return {
    data,
    isLoading: factorsQuery.isLoading || historyQuery.isLoading,
  };
}
