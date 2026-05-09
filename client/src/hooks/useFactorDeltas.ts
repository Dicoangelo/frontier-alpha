/**
 * useFactorDeltas — DASH3-005 (Cognitive Insight v2)
 *
 * Surfaces the top-3 factor changes vs a trailing baseline, wrapped in the
 * `DataSource<T>` discriminated union so empty / demo / real renders are a
 * compile-time concern, not a runtime audit.
 *
 * Why client-computed instead of a new `/api/ml/factor-deltas` endpoint?
 *
 *   - The server already exposes the current factor exposures via
 *     `/portfolio/factors/:symbols`. That's the authoritative read.
 *   - A second endpoint would have to either re-derive deltas server-side
 *     from the same data, or persist a per-user trailing baseline. Both add
 *     server surface for what is fundamentally a client-side diff.
 *   - The trailing baseline lives naturally in localStorage keyed by
 *     `frontier:factor-baseline:{portfolioId}`. Once-per-UTC-day rotation
 *     gives a stable 1-day prior without a DB write.
 *   - When a real ML endpoint exists later, this hook's signature stays
 *     identical; only the internal implementation changes.
 *
 * Baseline strategy (in priority order):
 *   1. If the factors API ever returns historical exposure (today it does
 *      not, see `client/src/api/factors.ts`), diff vs the `window`-prior
 *      snapshot. Wired as a no-op fall-through for forward compatibility.
 *   2. Otherwise, persist the prior-session exposures to localStorage and
 *      diff current vs stored. Roll the baseline once per UTC day on first
 *      load so reloads inside the same UTC day don't smear the diff.
 *   3. If no baseline yet (first-time user / fresh signup), return `EMPTY`.
 *      The DataSource contract handles the empty render.
 *
 * Top-3 selection: sort by `|deltaPct|` desc, take 3.
 *
 * Pure helpers (utcDayKey, readBaseline, writeBaseline, aggregateExposures,
 * computeDeltas, explainDelta) live in `factorDeltas.helpers.ts` so the test
 * suite can exercise them without importing the hook's React Query +
 * authStore + Supabase chain.
 */

import { useEffect, useMemo } from 'react';
import { useFactors } from './useFactors';
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
 *
 * The window argument is preserved for the future-history strategy. Today
 * only the localStorage-baseline path runs; window is a no-op until the
 * server-side history field lands.
 */
export function useFactorDeltas(
  portfolioId: string,
  window: FactorDeltaWindow = '1d',
  symbols: string[] = [],
): UseFactorDeltasResult {
  const factorsQuery = useFactors(symbols);

  // Derive the delta envelope as a pure read off the React Query cache + the
  // localStorage baseline. Keeping this in useMemo (not setState-in-useEffect)
  // avoids the cascading-render lint and keeps the render deterministic for
  // the same inputs.
  //
  // Strategy 1: API-provided history. Today the API has none. When it gains
  // a `history` field (server-side change, future story), this is where we'd
  // pick the `window`-prior snapshot. Until then, fall through to strategy 2.
  const data = useMemo<DataSource<FactorDelta[]>>(() => {
    void window;
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
    // Same-day baseline OR no baseline: render the empty state. The baseline
    // capture / rotation is handled in the side-effect below.
    return EMPTY;
  }, [factorsQuery.data, portfolioId, window]);

  // Side effect: capture / rotate the baseline once per UTC day. This is the
  // only legitimate effect; it writes to localStorage, which is exactly the
  // "synchronize React state with an external system" pattern useEffect is
  // for. The render path above does not depend on this write.
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
    isLoading: factorsQuery.isLoading,
  };
}
