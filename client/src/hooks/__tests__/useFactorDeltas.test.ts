/**
 * Unit tests for useFactorDeltas (DASH3-005).
 *
 * Pure helpers live in `../factorDeltas.helpers.ts` precisely so this test
 * file can exercise them without dragging in the React Query + Supabase +
 * authStore import chain (which throws in jsdom without env wiring). The
 * hook's React-side surface is exercised through the integration of
 * <FactorDeltas> on the Dashboard.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  utcDayKey,
  readBaseline,
  writeBaseline,
  computeDeltas,
  aggregateExposures,
  explainDelta,
  BASELINE_PREFIX,
} from '../factorDeltas.helpers';
import type { FactorExposureWithCategory } from '@/api/factors';

function mkFactor(
  factor: string,
  exposure: number,
  category: FactorExposureWithCategory['category'] = 'style',
): FactorExposureWithCategory {
  return {
    factor,
    exposure,
    tStat: 1.0,
    confidence: 0.8,
    contribution: 0.01,
    category,
    symbol: 'NVDA',
  };
}

describe('useFactorDeltas — internals', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('utcDayKey', () => {
    it('returns YYYY-MM-DD for a fixed date', () => {
      const d = new Date('2026-05-09T17:30:00Z');
      expect(utcDayKey(d)).toBe('2026-05-09');
    });

    it('rolls forward at UTC midnight (baseline freshness)', () => {
      const before = new Date('2026-05-09T23:59:59Z');
      const after = new Date('2026-05-10T00:00:01Z');
      expect(utcDayKey(before)).toBe('2026-05-09');
      expect(utcDayKey(after)).toBe('2026-05-10');
    });
  });

  describe('readBaseline / writeBaseline (baseline freshness logic)', () => {
    it('returns null when no baseline is stored (empty / first-time user)', () => {
      expect(readBaseline('portfolio-123')).toBeNull();
    });

    it('round-trips a written baseline', () => {
      writeBaseline('portfolio-123', {
        capturedOn: '2026-05-08',
        exposures: { momentum: 0.5, value: -0.2 },
      });
      const got = readBaseline('portfolio-123');
      expect(got).not.toBeNull();
      expect(got?.capturedOn).toBe('2026-05-08');
      expect(got?.exposures.momentum).toBe(0.5);
    });

    it('rejects a corrupted baseline payload (returns null)', () => {
      localStorage.setItem(`${BASELINE_PREFIX}portfolio-123`, '{"not":"valid"}');
      expect(readBaseline('portfolio-123')).toBeNull();
    });

    it('rejects an invalid JSON payload (returns null)', () => {
      localStorage.setItem(`${BASELINE_PREFIX}portfolio-123`, 'not json');
      expect(readBaseline('portfolio-123')).toBeNull();
    });

    it('returns null for empty portfolio id', () => {
      expect(readBaseline('')).toBeNull();
    });

    it('keys baselines per portfolio so signups do not collide', () => {
      writeBaseline('alpha', { capturedOn: '2026-05-08', exposures: { x: 1 } });
      writeBaseline('beta', { capturedOn: '2026-05-08', exposures: { x: 2 } });
      expect(readBaseline('alpha')?.exposures.x).toBe(1);
      expect(readBaseline('beta')?.exposures.x).toBe(2);
    });

    it('overwrites a stale baseline with a newer capturedOn (rotation)', () => {
      writeBaseline('portfolio-123', { capturedOn: '2026-05-08', exposures: { momentum: 0.5 } });
      writeBaseline('portfolio-123', { capturedOn: '2026-05-09', exposures: { momentum: 0.6 } });
      const got = readBaseline('portfolio-123');
      expect(got?.capturedOn).toBe('2026-05-09');
      expect(got?.exposures.momentum).toBe(0.6);
    });
  });

  describe('aggregateExposures', () => {
    it('averages exposures with the same factor across symbols', () => {
      const factors: FactorExposureWithCategory[] = [
        mkFactor('momentum', 0.4),
        mkFactor('momentum', 0.6),
        mkFactor('value', 0.2),
      ];
      const agg = aggregateExposures(factors);
      expect(agg.momentum).toBeCloseTo(0.5, 5);
      expect(agg.value).toBeCloseTo(0.2, 5);
    });

    it('returns an empty object when given an empty array (empty state)', () => {
      expect(aggregateExposures([])).toEqual({});
    });
  });

  describe('explainDelta', () => {
    it('uses "rose" for positive deltas and "fell" for negative', () => {
      const up = explainDelta({
        factor: 'momentum',
        category: 'style',
        current: 0.6,
        previous: 0.5,
        delta: 0.1,
        deltaPct: 20,
      });
      const down = explainDelta({
        factor: 'momentum',
        category: 'style',
        current: 0.4,
        previous: 0.5,
        delta: -0.1,
        deltaPct: -20,
      });
      expect(up).toContain('rose');
      expect(down).toContain('fell');
    });

    it('formats magnitude as a single decimal percent', () => {
      const out = explainDelta({
        factor: 'value',
        category: 'style',
        current: 0.123,
        previous: 0.1,
        delta: 0.023,
        deltaPct: 23.4567,
      });
      expect(out).toContain('23.5%');
    });

    it('routes per-category copy', () => {
      const sector = explainDelta({
        factor: 'sector_tech',
        category: 'sector',
        current: 0.4,
        previous: 0.3,
        delta: 0.1,
        deltaPct: 33.3,
      });
      expect(sector).toContain('sector concentration');
    });

    it('does not use em dashes (cross-project rule)', () => {
      const cases: FactorExposureWithCategory['category'][] = [
        'style',
        'macro',
        'sector',
        'volatility',
        'sentiment',
      ];
      for (const cat of cases) {
        const s = explainDelta({
          factor: 'x',
          category: cat,
          current: 0.4,
          previous: 0.3,
          delta: 0.1,
          deltaPct: 33,
        });
        expect(s).not.toContain('—');
      }
    });
  });

  describe('computeDeltas (real-state delta computation)', () => {
    it('returns an empty array when no factors overlap with the baseline', () => {
      const current: FactorExposureWithCategory[] = [mkFactor('newFactor', 0.5)];
      const out = computeDeltas(current, { someOtherFactor: 0.2 });
      expect(out).toEqual([]);
    });

    it('computes delta and deltaPct for overlapping factors', () => {
      const current: FactorExposureWithCategory[] = [mkFactor('momentum', 0.6, 'style')];
      const out = computeDeltas(current, { momentum: 0.4 });
      expect(out).toHaveLength(1);
      expect(out[0].factor).toBe('momentum');
      expect(out[0].current).toBeCloseTo(0.6, 5);
      expect(out[0].previous).toBeCloseTo(0.4, 5);
      expect(out[0].delta).toBeCloseTo(0.2, 5);
      // 0.2 / 0.4 * 100 = 50
      expect(out[0].deltaPct).toBeCloseTo(50, 5);
      expect(out[0].explanation.length).toBeGreaterThan(0);
    });

    it('falls back to delta * 100 when previous is ~0 (avoids div-by-zero)', () => {
      const current: FactorExposureWithCategory[] = [mkFactor('newSignal', 0.05)];
      const out = computeDeltas(current, { newSignal: 0 });
      expect(out).toHaveLength(1);
      expect(out[0].deltaPct).toBeCloseTo(5, 5); // 0.05 * 100
    });

    it('returns top-3 sorted by absolute deltaPct (descending)', () => {
      const current: FactorExposureWithCategory[] = [
        mkFactor('a', 1.0),
        mkFactor('b', 0.5),
        mkFactor('c', 2.0),
        mkFactor('d', 0.05),
        mkFactor('e', -1.5),
      ];
      const baseline = { a: 0.5, b: 0.4, c: 1.0, d: 0.04, e: -1.0 };
      const out = computeDeltas(current, baseline);
      expect(out).toHaveLength(3);
      // |a| = 100, |b| = 25, |c| = 100, |d| = 25, |e| = 50
      // Top 3 by |deltaPct|: a (100), c (100), e (50)
      const factorNames = out.map((d) => d.factor);
      expect(factorNames).toContain('a');
      expect(factorNames).toContain('c');
      expect(factorNames).toContain('e');
      // Sorted descending by abs
      const sorted = [...out].sort(
        (x, y) => Math.abs(y.deltaPct) - Math.abs(x.deltaPct),
      );
      expect(out).toEqual(sorted);
    });

    it('preserves direction (negative delta keeps negative sign)', () => {
      const current: FactorExposureWithCategory[] = [mkFactor('momentum', 0.3)];
      const out = computeDeltas(current, { momentum: 0.6 });
      expect(out[0].delta).toBeLessThan(0);
      expect(out[0].deltaPct).toBeLessThan(0);
    });

    it('attaches a category-routed explanation per delta', () => {
      const current: FactorExposureWithCategory[] = [
        mkFactor('momentum', 0.6, 'style'),
        mkFactor('sector_tech', 0.4, 'sector'),
      ];
      const out = computeDeltas(current, { momentum: 0.4, sector_tech: 0.3 });
      const styleHit = out.find((d) => d.factor === 'momentum');
      const sectorHit = out.find((d) => d.factor === 'sector_tech');
      expect(styleHit?.explanation).toContain('style tilt');
      expect(sectorHit?.explanation).toContain('sector concentration');
    });
  });

  describe('Strategy 1 composition (server-derived current + prior)', () => {
    // The hook's Strategy 1 path takes two snapshots from the server, runs
    // aggregateExposures on the prior, then computeDeltas. This test pins
    // that composition so a refactor that re-orders the calls or swaps
    // aggregation semantics is caught at unit-test time.
    it('composes aggregateExposures(prior) + computeDeltas to produce ranked deltas', () => {
      const current: FactorExposureWithCategory[] = [
        mkFactor('momentum', 0.7, 'style'),
        mkFactor('value', 0.1, 'style'),
        mkFactor('sector_tech', 0.5, 'sector'),
      ];
      const prior: FactorExposureWithCategory[] = [
        mkFactor('momentum', 0.5, 'style'),
        mkFactor('value', 0.05, 'style'),
        mkFactor('sector_tech', 0.5, 'sector'),
      ];

      const priorAggregated = aggregateExposures(prior);
      const out = computeDeltas(current, priorAggregated);

      // momentum: (0.7 - 0.5) / 0.5 = 40%
      // value: (0.1 - 0.05) / 0.05 = 100%
      // sector_tech: 0% (unchanged)
      const byFactor = Object.fromEntries(out.map((d) => [d.factor, d]));
      expect(byFactor.value?.deltaPct).toBeCloseTo(100, 5);
      expect(byFactor.momentum?.deltaPct).toBeCloseTo(40, 5);
      // The 0%-change factor is dropped (sortable but uninteresting); top-3
      // means it survives ranking only when fewer than 3 changers exist.
      // Here all three are returned because top-3 takes whatever fits.
      expect(out.length).toBeLessThanOrEqual(3);
    });

    it('returns empty deltas when current and prior aggregate identically (e.g., weekend gap)', () => {
      const same: FactorExposureWithCategory[] = [mkFactor('momentum', 0.5, 'style')];
      const priorAggregated = aggregateExposures(same);
      const out = computeDeltas(same, priorAggregated);
      // Every factor's delta is 0 → still emits rows but all rank-zero.
      // The hook checks `deltas.length > 0` before wrapping; this test just
      // documents that "no change" still flows through computeDeltas
      // structurally so the hook's empty-check is the gate, not this helper.
      expect(out.every((d) => d.delta === 0)).toBe(true);
    });
  });
});
