/**
 * Pure helpers for `useFactorDeltas` (DASH3-005). Extracted into a separate
 * module so the unit test suite can import them without dragging in the
 * React Query / Supabase / authStore chain.
 *
 * The hook itself lives in `useFactorDeltas.ts` and re-exports these for
 * the public API surface where helpful.
 */

import type { FactorExposureWithCategory } from '@/api/factors';

export interface FactorDelta {
  factor: string;
  category: FactorExposureWithCategory['category'];
  current: number;
  previous: number;
  /** Absolute change in exposure (current - previous). */
  delta: number;
  /** Percent change relative to the prior baseline. Falls back to absolute
   *  delta * 100 when previous is ~0 to avoid divide-by-zero blowups. */
  deltaPct: number;
  explanation: string;
}

export interface BaselineRecord {
  /** UTC-day key (YYYY-MM-DD) the baseline was captured. */
  capturedOn: string;
  /** Map of factor name -> exposure at capture time. */
  exposures: Record<string, number>;
}

export const BASELINE_PREFIX = 'frontier:factor-baseline:';

export function utcDayKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

export function readBaseline(portfolioId: string): BaselineRecord | null {
  if (!portfolioId) return null;
  try {
    const raw = localStorage.getItem(`${BASELINE_PREFIX}${portfolioId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BaselineRecord;
    if (!parsed || typeof parsed.capturedOn !== 'string' || !parsed.exposures) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeBaseline(portfolioId: string, record: BaselineRecord): void {
  if (!portfolioId) return;
  try {
    localStorage.setItem(`${BASELINE_PREFIX}${portfolioId}`, JSON.stringify(record));
  } catch {
    /* localStorage unavailable (Safari private mode etc.) — silently no-op. */
  }
}

export function aggregateExposures(
  factors: FactorExposureWithCategory[],
): Record<string, number> {
  const totals = new Map<string, { sum: number; count: number }>();
  for (const f of factors) {
    const t = totals.get(f.factor) || { sum: 0, count: 0 };
    totals.set(f.factor, { sum: t.sum + f.exposure, count: t.count + 1 });
  }
  const out: Record<string, number> = {};
  for (const [name, t] of totals) {
    out[name] = t.sum / t.count;
  }
  return out;
}

export function categoryFor(
  name: string,
  factors: FactorExposureWithCategory[],
): FactorExposureWithCategory['category'] {
  const hit = factors.find((f) => f.factor === name);
  return hit?.category ?? 'style';
}

/**
 * One-line "because" copy for a factor delta. Reuses the category buckets
 * from `client/src/api/factors.ts::categorizeFactorName` and the language
 * pattern from `CognitiveInsight.generateInsights`. No em dashes per the
 * cross-project no-em-dashes rule.
 */
export function explainDelta(d: Omit<FactorDelta, 'explanation'>): string {
  const direction = d.delta >= 0 ? 'rose' : 'fell';
  const human = d.factor.replace(/_/g, ' ');
  // Exposures are standardized loadings (roughly sigma units), so the change
  // is stated in those units with the from/to anchors. Percent-of-baseline
  // was the previous copy and produced "interest rate sens fell 313.3%" for
  // a move from 0.09 to -0.19 — arithmetically true, meaningless to a reader.
  const move = `${formatExposure(d.previous)} to ${formatExposure(d.current)}`;

  switch (d.category) {
    case 'style':
      return `${human} ${direction} from ${move}, shifting your style tilt`;
    case 'macro':
      return `${human} ${direction} from ${move}, changing macro sensitivity`;
    case 'sector':
      return `${human} exposure ${direction} from ${move}, rebalancing sector concentration`;
    case 'volatility':
      return `${human} ${direction} from ${move}, shifting the risk profile`;
    case 'sentiment':
      return `${human} ${direction} from ${move} on the latest sentiment read`;
    default:
      return `${human} ${direction} from ${move}`;
  }
}

/** Exposure formatted for copy: two decimals, explicit minus sign. */
export function formatExposure(x: number): string {
  return (Math.abs(x) < 0.005 ? 0 : x).toFixed(2);
}

/** Signed absolute change for the pill: "+0.42" / "-1.31". */
export function formatDelta(delta: number): string {
  return `${delta >= 0 ? '+' : '-'}${Math.abs(delta).toFixed(2)}`;
}

export function computeDeltas(
  current: FactorExposureWithCategory[],
  baseline: Record<string, number>,
): FactorDelta[] {
  const currentMap = aggregateExposures(current);
  const deltas: FactorDelta[] = [];

  for (const [factor, currentExposure] of Object.entries(currentMap)) {
    const previous = baseline[factor];
    if (previous === undefined) continue; // factor wasn't in the baseline (new symbol)

    const delta = currentExposure - previous;
    // Near-zero baselines make percent changes explode (a 0.23 move off a
    // 0.005 baseline read as +4606% in production). Below the noise floor,
    // fall back to delta*100 — same ordering, honest magnitude — and cap the
    // ratio branch so a just-above-floor baseline can't blow up either.
    const NOISE_FLOOR = 0.01;
    const rawPct = Math.abs(previous) >= NOISE_FLOOR
      ? (delta / Math.abs(previous)) * 100
      : delta * 100;
    const deltaPct = Math.max(-999, Math.min(999, rawPct));

    const partial = {
      factor,
      category: categoryFor(factor, current),
      current: currentExposure,
      previous,
      delta,
      deltaPct,
    };
    deltas.push({
      ...partial,
      explanation: explainDelta(partial),
    });
  }

  // Top-3 by absolute change in exposure. Ranking by percent-of-baseline
  // surfaced whichever factor happened to have the smallest prior (a 0.01 →
  // 0.04 move outranked a 1.0 → 0.5 one); absolute change is what moves the
  // portfolio.
  deltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return deltas.slice(0, 3);
}
