import { describe, it, expect } from 'vitest';
import { buildEquitySeries, sliceSeriesByDays, seriesReturns } from './equitySeries';

const hist = (symbol: string, rows: Array<[string, number]>) => ({
  symbol,
  closes: rows.map((r) => r[1]),
  timestamps: rows.map((r) => `${r[0]}T04:00:00.000Z`),
});

describe('buildEquitySeries', () => {
  it('marks today\'s holdings to each aligned close, plus cash', () => {
    const series = buildEquitySeries({
      histories: {
        NVDA: hist('NVDA', [['2026-09-01', 100], ['2026-09-02', 110], ['2026-09-03', 120]]),
        SPY: hist('SPY', [['2026-09-01', 500], ['2026-09-02', 505], ['2026-09-03', 510]]),
      },
      holdings: [{ symbol: 'NVDA', shares: 10 }],
      cash: 1000,
    });
    expect(series).not.toBeNull();
    expect(series!.map((p) => p.portfolio)).toEqual([2000, 2100, 2200]);
    expect(series!.map((p) => p.date)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
  });

  it('scales the benchmark to the portfolio\'s starting value', () => {
    const series = buildEquitySeries({
      histories: {
        AAPL: hist('AAPL', [['2026-09-01', 10], ['2026-09-02', 10]]),
        SPY: hist('SPY', [['2026-09-01', 500], ['2026-09-02', 550]]),
      },
      holdings: [{ symbol: 'AAPL', shares: 1 }],
      cash: 0,
    })!;
    expect(series[0].benchmark).toBeCloseTo(10);
    expect(series[1].benchmark).toBeCloseTo(11);
  });

  it('aligns on the intersection of dates across holdings and benchmark', () => {
    const series = buildEquitySeries({
      histories: {
        A: hist('A', [['2026-09-01', 1], ['2026-09-02', 1], ['2026-09-03', 1]]),
        B: hist('B', [['2026-09-02', 2], ['2026-09-03', 2]]),
        SPY: hist('SPY', [['2026-09-01', 5], ['2026-09-02', 5], ['2026-09-03', 5]]),
      },
      holdings: [{ symbol: 'A', shares: 1 }, { symbol: 'B', shares: 1 }],
      cash: 0,
    })!;
    expect(series.map((p) => p.date)).toEqual(['2026-09-02', '2026-09-03']);
  });

  it('returns null (never a mock) when a held symbol has no history', () => {
    expect(buildEquitySeries({
      histories: { SPY: hist('SPY', [['2026-09-01', 5], ['2026-09-02', 5]]), X: null },
      holdings: [{ symbol: 'X', shares: 1 }],
      cash: 0,
    })).toBeNull();
  });

  it('returns null when the benchmark is missing, when there are no holdings, or too few days', () => {
    const a = hist('A', [['2026-09-01', 1], ['2026-09-02', 1]]);
    expect(buildEquitySeries({ histories: { A: a }, holdings: [{ symbol: 'A', shares: 1 }], cash: 0 })).toBeNull();
    expect(buildEquitySeries({ histories: { A: a, SPY: a }, holdings: [], cash: 0 })).toBeNull();
    expect(buildEquitySeries({
      histories: { A: hist('A', [['2026-09-01', 1]]), SPY: hist('SPY', [['2026-09-01', 1]]) },
      holdings: [{ symbol: 'A', shares: 1 }],
      cash: 0,
    })).toBeNull();
  });

  it('is deterministic for the same inputs (no randomness)', () => {
    const input = {
      histories: {
        A: hist('A', [['2026-09-01', 1], ['2026-09-02', 2]] as Array<[string, number]>),
        SPY: hist('SPY', [['2026-09-01', 1], ['2026-09-02', 1]] as Array<[string, number]>),
      },
      holdings: [{ symbol: 'a', shares: 3 }],
      cash: 1,
    };
    expect(buildEquitySeries(input)).toEqual(buildEquitySeries(input));
  });
});

describe('sliceSeriesByDays', () => {
  const series = ['2026-08-01', '2026-08-15', '2026-09-01', '2026-09-04'].map((date, i) => ({ date, portfolio: i, benchmark: i }));
  it('keeps the window plus one anchor point before the cutoff', () => {
    const out = sliceSeriesByDays(series, 7, new Date('2026-09-06T12:00:00Z'));
    expect(out.map((p) => p.date)).toEqual(['2026-08-15', '2026-09-01', '2026-09-04']);
  });
  it('returns everything when the window covers the whole series', () => {
    expect(sliceSeriesByDays(series, 365, new Date('2026-09-06T12:00:00Z'))).toHaveLength(4);
  });
});

describe('seriesReturns', () => {
  it('computes total return and alpha vs benchmark', () => {
    const r = seriesReturns([
      { date: 'a', portfolio: 100, benchmark: 100 },
      { date: 'b', portfolio: 110, benchmark: 105 },
    ]);
    expect(r.totalReturn).toBeCloseTo(10);
    expect(r.alpha).toBeCloseTo(5);
  });
});
