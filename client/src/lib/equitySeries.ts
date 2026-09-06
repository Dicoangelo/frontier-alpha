/**
 * Build a real equity curve from cached daily closes.
 *
 * The Dashboard's EquityCurve used to receive only `portfolioValue` and fell
 * back to a seeded random walk, so every account (demo or funded) showed the
 * same "+11.22% vs S&P +10.34%" under a LIVE badge. This module marks TODAY'S
 * holdings to each day's close over the window — "if you had held these
 * positions for the period" — and scales the benchmark to the same starting
 * value so the two lines are comparable. It is not transaction history and
 * the chart says so.
 */

import type { HistoricalPrices } from '@/api/quotes';

export interface EquityPoint {
  /** YYYY-MM-DD */
  date: string;
  portfolio: number;
  benchmark: number;
}

export interface EquityHolding {
  symbol: string;
  shares: number;
}

export interface EquitySeriesInput {
  /** Per-symbol daily history keyed by upper-case symbol; null = unavailable. */
  histories: Record<string, HistoricalPrices | null | undefined>;
  holdings: EquityHolding[];
  cash: number;
  benchmarkSymbol?: string;
}

const dayKey = (iso: string): string => iso.slice(0, 10);

/**
 * Returns null when the series cannot be built honestly: no holdings, a held
 * symbol with no history, no benchmark history, or fewer than two aligned
 * days. Callers render an "unavailable" state on null — never a mock curve.
 */
export function buildEquitySeries(input: EquitySeriesInput): EquityPoint[] | null {
  const benchmarkSymbol = (input.benchmarkSymbol ?? 'SPY').toUpperCase();
  const holdings = input.holdings.filter((h) => h.shares > 0 && h.symbol);
  if (holdings.length === 0) return null;

  const closeByDate = (h: HistoricalPrices | null | undefined): Map<string, number> | null => {
    if (!h || !Array.isArray(h.closes) || !Array.isArray(h.timestamps)) return null;
    const m = new Map<string, number>();
    const n = Math.min(h.closes.length, h.timestamps.length);
    for (let i = 0; i < n; i++) {
      const c = h.closes[i];
      if (Number.isFinite(c) && c > 0) m.set(dayKey(h.timestamps[i]), c);
    }
    return m.size > 0 ? m : null;
  };

  const benchmark = closeByDate(input.histories[benchmarkSymbol]);
  if (!benchmark) return null;

  const perHolding: Array<{ shares: number; closes: Map<string, number> }> = [];
  for (const h of holdings) {
    const closes = closeByDate(input.histories[h.symbol.toUpperCase()]);
    if (!closes) return null;
    perHolding.push({ shares: h.shares, closes });
  }

  // Intersection of dates across every held symbol and the benchmark.
  let dates = [...benchmark.keys()];
  for (const { closes } of perHolding) dates = dates.filter((d) => closes.has(d));
  dates.sort();
  if (dates.length < 2) return null;

  const cash = Number.isFinite(input.cash) ? input.cash : 0;
  const points: EquityPoint[] = dates.map((date) => ({
    date,
    portfolio: cash + perHolding.reduce((sum, { shares, closes }) => sum + shares * (closes.get(date) as number), 0),
    benchmark: benchmark.get(date) as number,
  }));

  // Scale the benchmark to start where the portfolio starts so both lines
  // read as "growth of the same dollars".
  const scale = points[0].portfolio / points[0].benchmark;
  for (const p of points) p.benchmark *= scale;

  return points;
}

/** Keep only points within the last `days` calendar days (plus the anchor point). */
export function sliceSeriesByDays(series: EquityPoint[], days: number, now: Date = new Date()): EquityPoint[] {
  if (series.length === 0) return series;
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const cutoffKey = cutoff.toISOString().slice(0, 10);
  const idx = series.findIndex((p) => p.date >= cutoffKey);
  if (idx <= 0) return series;
  // Include the last point before the cutoff so the window has a real start.
  return series.slice(idx - 1);
}

/** Percentage return of a series' portfolio line and its alpha vs benchmark. */
export function seriesReturns(series: EquityPoint[]): { totalReturn: number; alpha: number } {
  if (series.length < 2) return { totalReturn: 0, alpha: 0 };
  const first = series[0];
  const last = series[series.length - 1];
  const totalReturn = ((last.portfolio - first.portfolio) / first.portfolio) * 100;
  const benchReturn = ((last.benchmark - first.benchmark) / first.benchmark) * 100;
  return { totalReturn, alpha: totalReturn - benchReturn };
}
