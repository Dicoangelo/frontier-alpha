/**
 * Temporal Saliency for Factor Signals (IDEAS Topic D — arXiv:2509.22839 UX)
 *
 * Answers "WHICH days drove this signal?" with an honest analytic
 * decomposition over the price series the factor engine already uses —
 * no model, no new data calls.
 *
 *   - Momentum: total log return over the lookback is EXACTLY the sum of
 *     per-day log returns, so each window's share of the total is a true
 *     additive attribution.
 *   - Volatility: realized variance is the sum of squared daily log
 *     returns, so window shares of total variance are likewise additive.
 *
 * Windows are "recent" (last 14 trading days), "mid" (15-63d), and "far"
 * (64-252d) — chosen to align with the factor engine's 21/63/252-day
 * horizons while keeping the copy human ("driven 73% by the last 14 days").
 */

import type { Price } from '../types/index.js';

export interface SaliencyWindow {
  /** Window key, stable for the UI. */
  key: 'recent' | 'mid' | 'far';
  label: string;
  /** Trading days covered (recent edge first). */
  days: number;
  /** Share of the signal magnitude attributed to this window, 0-100. */
  sharePct: number;
  /** Signed contribution for momentum (log-return sum); variance for vol. */
  contribution: number;
}

export interface FactorSaliency {
  factor: 'momentum' | 'volatility';
  windows: SaliencyWindow[];
  /** The window contributing the largest absolute share. */
  dominantWindow: SaliencyWindow;
  /** Ready-to-render sentence, also fed to the insight prompt. */
  copy: string;
}

export interface SaliencyResult {
  symbol: string;
  /** Trading days actually available/used (may be < 252 for young series). */
  lookbackDays: number;
  factors: FactorSaliency[];
}

const RECENT_DAYS = 14;
const MID_DAYS = 63; // recent + mid boundary
const FAR_DAYS = 252; // full lookback

/** Minimum series length to say anything honest. */
export const MIN_SALIENCY_DAYS = 30;

function logReturns(prices: Price[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1].close;
    const curr = prices[i].close;
    if (prev > 0 && curr > 0) out.push(Math.log(curr / prev));
  }
  return out;
}

/**
 * Slice a newest-last return series into the three windows.
 * Returns [recent, mid, far] where each is a (possibly empty) sub-array.
 */
function windowSlices(returns: number[]): [number[], number[], number[]] {
  const n = returns.length;
  const recent = returns.slice(Math.max(0, n - RECENT_DAYS));
  const mid = returns.slice(Math.max(0, n - MID_DAYS), Math.max(0, n - RECENT_DAYS));
  const far = returns.slice(0, Math.max(0, n - MID_DAYS));
  return [recent, mid, far];
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

function sumSq(xs: number[]): number {
  return xs.reduce((a, b) => a + b * b, 0);
}

function buildWindows(
  contributions: [number, number, number],
  dayCounts: [number, number, number],
): SaliencyWindow[] {
  const totalAbs = Math.abs(contributions[0]) + Math.abs(contributions[1]) + Math.abs(contributions[2]);
  const meta: Array<{ key: SaliencyWindow['key']; label: string }> = [
    { key: 'recent', label: `last ${dayCounts[0]} days` },
    { key: 'mid', label: `${RECENT_DAYS + 1}-${MID_DAYS} days ago` },
    { key: 'far', label: `beyond ${MID_DAYS} days` },
  ];
  return meta.map((m, i) => ({
    key: m.key,
    label: m.label,
    days: dayCounts[i],
    sharePct: totalAbs > 0 ? Math.round((Math.abs(contributions[i]) / totalAbs) * 100) : 0,
    contribution: contributions[i],
  }));
}

function dominant(windows: SaliencyWindow[]): SaliencyWindow {
  return windows.reduce((best, w) => (w.sharePct > best.sharePct ? w : best), windows[0]);
}

/**
 * Decompose a symbol's momentum and volatility signals into temporal
 * windows. Returns null when the series is too short to be honest.
 *
 * `prices` must be oldest-first (the data provider's contract). Only the
 * trailing FAR_DAYS+1 entries are used.
 */
export function computeTemporalSaliency(symbol: string, prices: Price[]): SaliencyResult | null {
  if (!prices || prices.length < MIN_SALIENCY_DAYS) return null;

  const trailing = prices.slice(-(FAR_DAYS + 1));
  const returns = logReturns(trailing);
  if (returns.length < MIN_SALIENCY_DAYS - 1) return null;

  const [recent, mid, far] = windowSlices(returns);
  const dayCounts: [number, number, number] = [recent.length, mid.length, far.length];

  // Momentum: additive in log-return space.
  const momentumContrib: [number, number, number] = [sum(recent), sum(mid), sum(far)];
  const momentumWindows = buildWindows(momentumContrib, dayCounts);
  const momentumDominant = dominant(momentumWindows);
  const totalReturn = sum(returns);
  const momentum: FactorSaliency = {
    factor: 'momentum',
    windows: momentumWindows,
    dominantWindow: momentumDominant,
    copy:
      `${symbol}'s ${returns.length}-day ${totalReturn >= 0 ? 'gain' : 'decline'} is driven ` +
      `${momentumDominant.sharePct}% by the ${momentumDominant.label}.`,
  };

  // Volatility: additive in squared-return (realized variance) space.
  const volContrib: [number, number, number] = [sumSq(recent), sumSq(mid), sumSq(far)];
  const volWindows = buildWindows(volContrib, dayCounts);
  const volDominant = dominant(volWindows);
  const volatility: FactorSaliency = {
    factor: 'volatility',
    windows: volWindows,
    dominantWindow: volDominant,
    copy: `${volDominant.sharePct}% of ${symbol}'s realized volatility comes from the ${volDominant.label}.`,
  };

  return {
    symbol,
    lookbackDays: returns.length,
    factors: [momentum, volatility],
  };
}

/**
 * One-line digest for the insight prompt (CIN-3 style: bounded, never raw
 * series). Empty string when saliency is unavailable.
 */
export function saliencyPromptDigest(result: SaliencyResult | null): string {
  if (!result) return '';
  return result.factors.map((f) => f.copy).join(' ');
}
