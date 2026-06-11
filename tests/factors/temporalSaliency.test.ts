/**
 * Tests for temporal saliency decomposition (IDEAS Topic D).
 *
 * The invariant that makes this feature honest: window contributions are a
 * TRUE additive decomposition — momentum shares sum the per-day log returns,
 * volatility shares sum the squared returns — so the percentages are
 * attribution, not vibes.
 */

import { describe, it, expect } from 'vitest';
import {
  computeTemporalSaliency,
  saliencyPromptDigest,
  MIN_SALIENCY_DAYS,
} from '../../src/factors/temporalSaliency.js';
import type { Price } from '../../src/types/index.js';

/** Build an oldest-first price series from a list of daily close prices. */
function series(closes: number[]): Price[] {
  return closes.map((close, i) => ({
    symbol: 'TEST',
    timestamp: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000),
    open: close,
    high: close,
    low: close,
    close,
    volume: 1_000,
  }));
}

/** Flat series of `n` days at `price`, optionally with a final-day jump. */
function flatSeries(n: number, price = 100): number[] {
  return Array.from({ length: n }, () => price);
}

describe('computeTemporalSaliency', () => {
  it('returns null for series shorter than the minimum', () => {
    expect(computeTemporalSaliency('TEST', series(flatSeries(MIN_SALIENCY_DAYS - 1)))).toBeNull();
  });

  it('attributes a recent-only move 100% to the recent window', () => {
    // 250 flat days, then a +10% jump in the last 5 days.
    const closes = [...flatSeries(248), 102, 104, 106, 108, 110];
    const result = computeTemporalSaliency('TEST', series(closes));

    expect(result).not.toBeNull();
    const momentum = result!.factors.find((f) => f.factor === 'momentum')!;
    expect(momentum.dominantWindow.key).toBe('recent');
    expect(momentum.dominantWindow.sharePct).toBe(100);
    expect(momentum.copy).toMatch(/100% by the last 14 days/);
  });

  it('attributes an old move to the far window', () => {
    // +20% move in the first 10 days, flat for the remaining ~240.
    const closes = [
      100, 102, 104, 108, 112, 116, 118, 119, 120, 120,
      ...flatSeries(243, 120),
    ];
    const result = computeTemporalSaliency('TEST', series(closes));

    const momentum = result!.factors.find((f) => f.factor === 'momentum')!;
    expect(momentum.dominantWindow.key).toBe('far');
    expect(momentum.dominantWindow.sharePct).toBe(100);
  });

  it('window shares sum to ~100 when every window contributes', () => {
    // Steady drift across the whole year.
    const closes = Array.from({ length: 253 }, (_, i) => 100 * Math.pow(1.001, i));
    const result = computeTemporalSaliency('TEST', series(closes));

    const momentum = result!.factors.find((f) => f.factor === 'momentum')!;
    const totalShare = momentum.windows.reduce((s, w) => s + w.sharePct, 0);
    expect(totalShare).toBeGreaterThanOrEqual(98); // rounding tolerance
    expect(totalShare).toBeLessThanOrEqual(102);
    // Far window covers ~189 of 252 return days of equal drift.
    expect(momentum.dominantWindow.key).toBe('far');
  });

  it('volatility attribution finds a recent vol spike', () => {
    // Flat year, then violent chop in the last 10 days.
    const chop = [100, 110, 98, 112, 96, 114, 95, 113, 97, 111];
    const closes = [...flatSeries(243), ...chop];
    const result = computeTemporalSaliency('TEST', series(closes));

    const vol = result!.factors.find((f) => f.factor === 'volatility')!;
    expect(vol.dominantWindow.key).toBe('recent');
    expect(vol.dominantWindow.sharePct).toBe(100);
    expect(vol.copy).toMatch(/realized volatility/);
  });

  it('momentum contributions reconstruct the total log return', () => {
    const closes = Array.from({ length: 253 }, (_, i) => 100 + i * 0.3 + (i % 7) * 0.5);
    const result = computeTemporalSaliency('TEST', series(closes));

    const momentum = result!.factors.find((f) => f.factor === 'momentum')!;
    const reconstructed = momentum.windows.reduce((s, w) => s + w.contribution, 0);
    const expected = Math.log(closes[closes.length - 1] / closes[0]);
    expect(reconstructed).toBeCloseTo(expected, 10);
  });

  it('works on a short-but-valid series (young listing)', () => {
    const closes = Array.from({ length: 40 }, (_, i) => 100 * Math.pow(1.002, i));
    const result = computeTemporalSaliency('TEST', series(closes));

    expect(result).not.toBeNull();
    expect(result!.lookbackDays).toBe(39);
    // No far window on a 39-return series (39 < 63).
    const momentum = result!.factors.find((f) => f.factor === 'momentum')!;
    const far = momentum.windows.find((w) => w.key === 'far')!;
    expect(far.days).toBe(0);
    expect(far.sharePct).toBe(0);
  });
});

describe('saliencyPromptDigest', () => {
  it('is empty for null input', () => {
    expect(saliencyPromptDigest(null)).toBe('');
  });

  it('joins both factor sentences', () => {
    const closes = [...flatSeries(248), 102, 104, 106, 108, 110];
    const digest = saliencyPromptDigest(computeTemporalSaliency('NVDA', series(closes)));
    expect(digest).toMatch(/NVDA/);
    expect(digest).toMatch(/driven/);
    expect(digest).toMatch(/realized volatility/);
  });
});
