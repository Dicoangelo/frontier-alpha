/**
 * EarningsOracle — buildEarningsPattern against real-shaped upstream data.
 *
 * The existing suite never mocked fetch, so every call 401'd against the live
 * providers and only the mock-pattern FALLBACK was ever exercised. The
 * statistics path — the map/filter/reduce that turn raw quarters into beat
 * rates and average moves — ran zero times, while vitest 1 reported 100%
 * function coverage on this file.
 *
 * Two things follow. The arithmetic is now actually asserted, and these tests
 * make no network calls: CI was hitting Alpha Vantage and Polygon for real, on
 * the credential that is currently public.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EarningsOracle } from './EarningsOracle.js';

/** Daily bars for all of 2025, flat at 100 except where a move is injected. */
function priceBars(moves: Record<string, number>) {
  const bars: Array<{ t: number; o: number; h: number; l: number; c: number; v: number }> = [];
  const day = new Date(Date.UTC(2025, 0, 1));
  const end = new Date(Date.UTC(2025, 11, 31));
  while (day <= end) {
    const iso = day.toISOString().split('T')[0];
    // Baseline 100 means the previous close is always 100, so an injected close
    // of 110 is exactly a +10% move — the assertions below can be exact.
    const close = moves[iso] !== undefined ? 100 * (1 + moves[iso] / 100) : 100;
    bars.push({ t: day.getTime(), o: close, h: close, l: close, c: close, v: 1_000_000 });
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return bars;
}

/** Alpha Vantage returns most-recent-first, and the oracle relies on that order. */
function quarter(reportedDate: string, estimatedEPS: string, reportedEPS: string) {
  return { fiscalDateEnding: reportedDate, reportedDate, estimatedEPS, reportedEPS };
}

function stubUpstream(opts: {
  earnings?: unknown;
  earningsOk?: boolean;
  prices?: unknown;
  pricesOk?: boolean;
} = {}) {
  const earnings = opts.earnings ?? {
    quarterlyEarnings: [
      quarter('2025-10-15', '1.00', '1.20'), // beat,  +10% move
      quarter('2025-07-15', '1.00', '0.80'), // miss,  -10% move
      quarter('2025-04-15', '1.00', '1.10'), // beat,   +2% move
      quarter('2025-01-15', '1.00', '0.90'), // miss,   -2% move
    ],
  };
  const prices = opts.prices ?? {
    status: 'OK',
    results: priceBars({
      '2025-10-15': 10,
      '2025-07-15': -10,
      '2025-04-15': 2,
      '2025-01-15': -2,
    }),
  };

  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const isEarnings = String(url).includes('alphavantage');
    return {
      ok: isEarnings ? (opts.earningsOk ?? true) : (opts.pricesOk ?? true),
      status: 200,
      json: async () => (isEarnings ? earnings : prices),
    };
  }));
}

describe('EarningsOracle.buildEarningsPattern', () => {
  let oracle: EarningsOracle;

  beforeEach(() => {
    oracle = new EarningsOracle('av-test-key', 'polygon-test-key');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('statistics over real-shaped quarters', () => {
    it('computes beat rate, average move, and per-side averages', async () => {
      stubUpstream();
      const pattern = await oracle.buildEarningsPattern('AAPL');

      expect(pattern).not.toBeNull();
      expect(pattern!.symbol).toBe('AAPL');
      expect(pattern!.reactions).toHaveLength(4);

      // moves +10 / -10 / +2 / -2  ->  mean absolute = 6
      expect(pattern!.avgMove).toBeCloseTo(6, 6);
      // two beats of the four quarters carrying a surprise
      expect(pattern!.beatRate).toBeCloseTo(50, 6);
      // beats moved +10 and +2; misses moved -10 and -2
      expect(pattern!.avgBeatMove).toBeCloseTo(6, 6);
      expect(pattern!.avgMissMove).toBeCloseTo(-6, 6);
    });

    it('flags an increasing volatility trend when recent moves outrun older ones', async () => {
      // recent two average 10, older two average 2; 10 > 2 * 1.3
      stubUpstream();
      const pattern = await oracle.buildEarningsPattern('AAPL');
      expect(pattern!.volatilityTrend).toBe('increasing');
    });

    it('flags a decreasing trend when the ordering is reversed', async () => {
      stubUpstream({
        prices: {
          status: 'OK',
          results: priceBars({
            '2025-10-15': 2, '2025-07-15': -2, '2025-04-15': 10, '2025-01-15': -10,
          }),
        },
      });
      const pattern = await oracle.buildEarningsPattern('AAPL');
      expect(pattern!.volatilityTrend).toBe('decreasing');
    });

    it('stays stable when recent and older moves are comparable', async () => {
      stubUpstream({
        prices: {
          status: 'OK',
          results: priceBars({
            '2025-10-15': 5, '2025-07-15': -5, '2025-04-15': 5, '2025-01-15': -5,
          }),
        },
      });
      const pattern = await oracle.buildEarningsPattern('AAPL');
      expect(pattern!.volatilityTrend).toBe('stable');
    });

    it('falls back to defaults when no quarter carries a usable price move', async () => {
      // Prices present but none reach the earnings dates, so every priceMove is
      // null and the documented defaults (5 / 3 / -3) must show through.
      stubUpstream({ prices: { status: 'OK', results: [] } });
      const pattern = await oracle.buildEarningsPattern('AAPL');
      expect(pattern!.avgMove).toBe(5);
      expect(pattern!.avgBeatMove).toBe(3);
      expect(pattern!.avgMissMove).toBe(-3);
      expect(pattern!.volatilityTrend).toBe('stable');
    });
  });

  describe('caching', () => {
    it('serves the second call from cache without touching the network again', async () => {
      stubUpstream();
      const first = await oracle.buildEarningsPattern('AAPL');
      const callsAfterFirst = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

      const second = await oracle.buildEarningsPattern('AAPL');
      expect(second).toBe(first); // same object, not merely equal
      expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length)
        .toBe(callsAfterFirst);
    });
  });

  describe('upstream failure handling', () => {
    it('returns null when the provider reports no quarters', async () => {
      stubUpstream({ earnings: { quarterlyEarnings: [] } });
      expect(await oracle.buildEarningsPattern('AAPL')).toBeNull();
    });

    it('treats an Alpha Vantage rate-limit Note as no data, not as a crash', async () => {
      stubUpstream({ earnings: { Note: 'Thank you for using Alpha Vantage! Our standard API rate limit is...' } });
      expect(await oracle.buildEarningsPattern('AAPL')).toBeNull();
    });

    it('treats an Alpha Vantage Error Message as no data', async () => {
      stubUpstream({ earnings: { 'Error Message': 'Invalid API call' } });
      expect(await oracle.buildEarningsPattern('AAPL')).toBeNull();
    });

    it('swallows a non-OK earnings response', async () => {
      stubUpstream({ earningsOk: false });
      expect(await oracle.buildEarningsPattern('AAPL')).toBeNull();
    });

    it('still builds a pattern when only the PRICE feed fails', async () => {
      // Earnings alone are enough — moves go null and the defaults apply. This
      // is the degradation path that matters operationally, since Polygon and
      // Alpha Vantage fail independently.
      stubUpstream({ pricesOk: false });
      const pattern = await oracle.buildEarningsPattern('AAPL');
      expect(pattern).not.toBeNull();
      expect(pattern!.avgMove).toBe(5);
    });

    it('handles a Polygon payload whose status is not OK', async () => {
      stubUpstream({ prices: { status: 'ERROR', results: null } });
      const pattern = await oracle.buildEarningsPattern('AAPL');
      expect(pattern).not.toBeNull();
      expect(pattern!.avgMove).toBe(5);
    });
  });
});
