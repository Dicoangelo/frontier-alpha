/**
 * FRONTIER ALPHA — Multi-anchor temporal factor analysis (IDEA-CIN-3)
 *
 * Gives the cognitive explainer *temporal grounding*: instead of describing a
 * single factor snapshot (and letting the LLM invent a trend), we feed it the
 * current snapshot plus window-prior snapshots (5d, 30d) and a server-computed
 * delta summary. The LLM then reports real, pre-computed motion.
 *
 * ## Reuse, not new fetches
 *
 * Prior snapshots are derived by truncating the SAME `Price[]` series the
 * current snapshot uses (`sliceAsOf` in src/factors/historySlice.ts) and
 * re-running the factor engine. This is the exact pattern the
 * `/api/v1/portfolio/factors/history` endpoint (v1.3.4) uses. The caller passes
 * already-fetched prices and the factor engine; this module makes ZERO market
 * data calls of its own, so it cannot trip the Polygon free-tier 5-req/min
 * ceiling.
 *
 * ## Bounded token growth
 *
 * The summary is rendered as compact one-line-per-factor deltas, never raw
 * price series. Output is capped at the top-N moving factors per window.
 */

import { sliceAsOf } from '../factors/historySlice.js';
import type { FactorExposure, Price } from '../types/index.js';

/** Temporal anchor windows fed to the explainer, in trading days back. */
export const ANCHOR_WINDOWS = [
  { label: '5d', daysBack: 5 },
  { label: '30d', daysBack: 30 },
] as const;

export type AnchorLabel = (typeof ANCHOR_WINDOWS)[number]['label'];

/** A single window-prior factor snapshot for one symbol. */
export interface FactorAnchor {
  /** Window label relative to the current snapshot (e.g. '5d', '30d'). */
  window: AnchorLabel;
  /** Exposures as of that window-prior trading day. Empty when insufficient. */
  factors: FactorExposure[];
}

/** Current snapshot plus its prior anchors for one symbol. */
export interface TemporalFactorContext {
  current: FactorExposure[];
  anchors: FactorAnchor[];
}

/**
 * Minimal factor-engine surface this module needs. Matches the route-layer
 * `calculateExposures` signature so the real FactorEngine satisfies it.
 */
export interface FactorEngineLike {
  calculateExposures(
    symbols: string[],
    prices: Map<string, Price[]>,
  ): Promise<Map<string, unknown[]>>;
}

/** Max factors surfaced per window in the compact summary. Bounds tokens. */
const MAX_FACTORS_PER_WINDOW = 4;
/** Below this absolute exposure delta a factor is "flat" and dropped. */
const FLAT_DELTA_THRESHOLD = 0.05;

/**
 * Assemble the temporal factor context for a single symbol by reusing the
 * already-fetched price map. Slices the price series at each anchor window and
 * recomputes exposures via the supplied factor engine.
 *
 * Returns `null` when the current snapshot itself can't be computed
 * (INSUFFICIENT_DATA) so the caller falls back to the single-snapshot prompt.
 * Individual anchors that lack enough history are simply omitted (graceful
 * partial degradation) — the current snapshot is what matters most.
 *
 * @param symbol  the symbol to ground (must be a key in `prices`)
 * @param prices  the SAME price map fetched for the current snapshot, including
 *                the 'SPY' benchmark, sliced symmetrically per historySlice.
 * @param factorEngine  recomputes exposures off sliced series. No data fetched.
 */
export async function assembleTemporalContext(
  symbol: string,
  prices: Map<string, Price[]>,
  factorEngine: FactorEngineLike,
): Promise<TemporalFactorContext | null> {
  if (!prices.has(symbol)) return null;

  const currentMap = await factorEngine.calculateExposures([symbol], prices);
  const current = (currentMap.get(symbol) ?? []) as FactorExposure[];
  // INSUFFICIENT_DATA: no current exposures -> caller uses single-snapshot path.
  if (current.length === 0) return null;

  const anchors: FactorAnchor[] = [];
  for (const { label, daysBack } of ANCHOR_WINDOWS) {
    // sliceAsOf truncates SPY symmetrically; symbols without enough history are
    // dropped from the sliced map, so a short series yields an empty anchor.
    const prior = sliceAsOf(prices, daysBack);
    if (!prior.has(symbol)) continue;
    const priorMap = await factorEngine.calculateExposures([symbol], prior);
    const priorFactors = (priorMap.get(symbol) ?? []) as FactorExposure[];
    if (priorFactors.length === 0) continue;
    anchors.push({ window: label, factors: priorFactors });
  }

  return { current, anchors };
}

/**
 * Render a compact, bounded delta summary the LLM prompt can embed verbatim.
 * One line per moving factor per window; flat factors dropped. Returns an empty
 * array when there are no anchors or no material moves (the prompt then omits
 * the temporal block entirely).
 *
 * Example output line:
 *   `momentum: +0.70 now vs +0.30 5d ago (+0.40)`
 */
export function buildAnchorSummaryLines(ctx: TemporalFactorContext): string[] {
  if (ctx.anchors.length === 0) return [];

  const currentByFactor = new Map<string, FactorExposure>();
  for (const f of ctx.current) currentByFactor.set(f.factor, f);

  const lines: string[] = [];
  for (const anchor of ctx.anchors) {
    const moves: Array<{ factor: string; now: number; then: number; delta: number }> = [];
    for (const prior of anchor.factors) {
      const now = currentByFactor.get(prior.factor);
      if (!now) continue;
      const delta = now.exposure - prior.exposure;
      if (Math.abs(delta) < FLAT_DELTA_THRESHOLD) continue;
      moves.push({ factor: prior.factor, now: now.exposure, then: prior.exposure, delta });
    }

    moves.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    for (const m of moves.slice(0, MAX_FACTORS_PER_WINDOW)) {
      lines.push(
        `${m.factor}: ${fmt(m.now)} now vs ${fmt(m.then)} ${anchor.window} ago (${fmt(m.delta, true)})`,
      );
    }
  }

  return lines;
}

/** Signed two-decimal formatter. `forceSign` always prints +/- for deltas. */
function fmt(n: number, forceSign = false): string {
  const s = n.toFixed(2);
  if (forceSign && n >= 0) return `+${s}`;
  if (!forceSign && n > 0) return `+${s}`;
  return s;
}
