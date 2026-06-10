/**
 * Unit tests for multi-anchor temporal factor analysis (IDEA-CIN-3).
 *
 * Covers:
 *   - assembleTemporalContext: slices the SAME price map (no new fetches),
 *     recomputes exposures per 5d/30d window, drops anchors with too little
 *     history, returns null on INSUFFICIENT_DATA (no current snapshot).
 *   - buildAnchorSummaryLines: compact one-line-per-moving-factor deltas,
 *     flat factors dropped, bounded count.
 *   - ExplanationService.enrichWithTemporalAnchors: attaches temporalSummary on
 *     success, degrades to the unchanged context on INSUFFICIENT_DATA / error.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.hoisted(() => {
  process.env.SUPABASE_URL ??= 'http://localhost:54321';
  process.env.SUPABASE_SERVICE_KEY ??= 'test-service-key';
});

vi.mock('../../src/lib/logger.js', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import {
  assembleTemporalContext,
  buildAnchorSummaryLines,
  type FactorEngineLike,
  type TemporalFactorContext,
} from '../../src/services/factorAnchors.js';
import { ExplanationService } from '../../src/services/ExplanationService.js';
import type { FactorExposure, Price } from '../../src/types/index.js';

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

function makeSeries(symbol: string, n: number): Price[] {
  const out: Price[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      symbol,
      timestamp: new Date(2026, 0, 1 + i),
      open: 100 + i,
      high: 101 + i,
      low: 99 + i,
      close: 100 + i,
      volume: 1_000,
    });
  }
  return out;
}

/**
 * Fake factor engine: momentum exposure is a deterministic function of the
 * series length (length / 50), so slicing N days off yields a predictable,
 * material delta (5d -> 0.10, 30d -> 0.60). Value stays flat across windows.
 */
const lengthDrivenEngine: FactorEngineLike = {
  async calculateExposures(symbols, prices) {
    const out = new Map<string, unknown[]>();
    for (const s of symbols) {
      const series = prices.get(s) ?? [];
      if (series.length === 0) {
        out.set(s, []);
        continue;
      }
      const exposures: FactorExposure[] = [
        { factor: 'momentum', exposure: series.length / 50, tStat: 2.0, confidence: 0.8 },
        { factor: 'value', exposure: 0.20, tStat: 1.0, confidence: 0.6 }, // flat across windows
      ];
      out.set(s, exposures);
    }
    return out;
  },
};

// ---------------------------------------------------------------------------
// assembleTemporalContext
// ---------------------------------------------------------------------------

describe('assembleTemporalContext (IDEA-CIN-3)', () => {
  it('builds current + 5d + 30d anchors from one price map, no extra fetches', async () => {
    const prices = new Map<string, Price[]>([
      ['AAPL', makeSeries('AAPL', 300)],
      ['SPY', makeSeries('SPY', 300)],
    ]);
    const spy = vi.spyOn(lengthDrivenEngine, 'calculateExposures');

    const ctx = await assembleTemporalContext('AAPL', prices, lengthDrivenEngine);

    expect(ctx).not.toBeNull();
    expect(ctx!.current.length).toBeGreaterThan(0);
    expect(ctx!.anchors.map((a) => a.window)).toEqual(['5d', '30d']);
    // 1 current + 2 anchor recomputes = 3 engine calls; no market-data fetch.
    expect(spy).toHaveBeenCalledTimes(3);
    spy.mockRestore();
  });

  it('returns null on INSUFFICIENT_DATA (current snapshot empty)', async () => {
    const emptyEngine: FactorEngineLike = {
      async calculateExposures(symbols) {
        const out = new Map<string, unknown[]>();
        for (const s of symbols) out.set(s, []);
        return out;
      },
    };
    const prices = new Map<string, Price[]>([['AAPL', makeSeries('AAPL', 300)]]);

    const ctx = await assembleTemporalContext('AAPL', prices, emptyEngine);
    expect(ctx).toBeNull();
  });

  it('returns null when the symbol is absent from the price map', async () => {
    const prices = new Map<string, Price[]>([['SPY', makeSeries('SPY', 300)]]);
    const ctx = await assembleTemporalContext('AAPL', prices, lengthDrivenEngine);
    expect(ctx).toBeNull();
  });

  it('drops anchors with too little history but keeps the current snapshot', async () => {
    // 20-day series: 5d slice survives (15 bars), 30d slice cannot (series <= 30).
    const prices = new Map<string, Price[]>([
      ['AAPL', makeSeries('AAPL', 20)],
      ['SPY', makeSeries('SPY', 20)],
    ]);

    const ctx = await assembleTemporalContext('AAPL', prices, lengthDrivenEngine);

    expect(ctx).not.toBeNull();
    expect(ctx!.anchors.map((a) => a.window)).toEqual(['5d']); // 30d dropped
  });
});

// ---------------------------------------------------------------------------
// buildAnchorSummaryLines
// ---------------------------------------------------------------------------

describe('buildAnchorSummaryLines (IDEA-CIN-3)', () => {
  it('emits one compact line per moving factor, dropping flat factors', () => {
    const ctx: TemporalFactorContext = {
      current: [
        { factor: 'momentum', exposure: 0.70, tStat: 2, confidence: 0.8 },
        { factor: 'value', exposure: 0.20, tStat: 1, confidence: 0.6 },
      ],
      anchors: [
        {
          window: '5d',
          factors: [
            { factor: 'momentum', exposure: 0.30, tStat: 2, confidence: 0.8 }, // +0.40 move
            { factor: 'value', exposure: 0.19, tStat: 1, confidence: 0.6 },     // +0.01 flat
          ],
        },
      ],
    };

    const lines = buildAnchorSummaryLines(ctx);

    expect(lines).toEqual(['momentum: +0.70 now vs +0.30 5d ago (+0.40)']);
  });

  it('returns empty when there are no anchors (single-snapshot path)', () => {
    const ctx: TemporalFactorContext = {
      current: [{ factor: 'momentum', exposure: 0.7, tStat: 2, confidence: 0.8 }],
      anchors: [],
    };
    expect(buildAnchorSummaryLines(ctx)).toEqual([]);
  });

  it('returns empty when every factor is flat (no material trend to report)', () => {
    const ctx: TemporalFactorContext = {
      current: [{ factor: 'momentum', exposure: 0.70, tStat: 2, confidence: 0.8 }],
      anchors: [
        { window: '5d', factors: [{ factor: 'momentum', exposure: 0.69, tStat: 2, confidence: 0.8 }] },
      ],
    };
    expect(buildAnchorSummaryLines(ctx)).toEqual([]);
  });

  it('formats a negative delta with a leading minus', () => {
    const ctx: TemporalFactorContext = {
      current: [{ factor: 'momentum', exposure: 0.20, tStat: 2, confidence: 0.8 }],
      anchors: [
        { window: '30d', factors: [{ factor: 'momentum', exposure: 0.80, tStat: 2, confidence: 0.8 }] },
      ],
    };
    expect(buildAnchorSummaryLines(ctx)).toEqual(['momentum: +0.20 now vs +0.80 30d ago (-0.60)']);
  });
});

// ---------------------------------------------------------------------------
// ExplanationService.enrichWithTemporalAnchors
// ---------------------------------------------------------------------------

describe('ExplanationService.enrichWithTemporalAnchors (IDEA-CIN-3)', () => {
  let service: ExplanationService;

  beforeEach(() => {
    service = new ExplanationService();
  });

  it('attaches temporalSummary when anchors yield material moves', async () => {
    const prices = new Map<string, Price[]>([
      ['AAPL', makeSeries('AAPL', 300)],
      ['SPY', makeSeries('SPY', 300)],
    ]);

    const enriched = await service.enrichWithTemporalAnchors({}, 'AAPL', prices, lengthDrivenEngine);

    expect(enriched.temporalSummary).toBeDefined();
    expect(enriched.temporalSummary!.length).toBeGreaterThan(0);
    expect(enriched.temporalSummary!.some((l) => l.startsWith('momentum:'))).toBe(true);
  });

  it('degrades to the unchanged context on INSUFFICIENT_DATA', async () => {
    const emptyEngine: FactorEngineLike = {
      async calculateExposures(symbols) {
        const out = new Map<string, unknown[]>();
        for (const s of symbols) out.set(s, []);
        return out;
      },
    };
    const prices = new Map<string, Price[]>([['AAPL', makeSeries('AAPL', 300)]]);

    const original = { factors: [] as FactorExposure[] };
    const enriched = await service.enrichWithTemporalAnchors(original, 'AAPL', prices, emptyEngine);

    expect(enriched.temporalSummary).toBeUndefined();
    expect(enriched).toEqual(original);
  });

  it('never throws — engine failure falls back to the unchanged context', async () => {
    const throwingEngine: FactorEngineLike = {
      async calculateExposures() {
        throw new Error('factor engine boom');
      },
    };
    const prices = new Map<string, Price[]>([['AAPL', makeSeries('AAPL', 300)]]);

    const original = { marketReturn: 0.05 };
    const enriched = await service.enrichWithTemporalAnchors(original, 'AAPL', prices, throwingEngine);

    expect(enriched).toEqual(original);
    expect(enriched.temporalSummary).toBeUndefined();
  });
});
