/**
 * Tests for two-phase episode retrieval (CVRF v2-A, MemRL pattern).
 *
 * Invariants: Phase 1 ranks by genuine similarity (symbols, actions,
 * factor profile); Phase 2 filters by outcome utility (unclosed and
 * zero-outcome episodes never surface); instructive LOSERS rank — the
 * lesson just flips direction.
 */

import { describe, it, expect } from 'vitest';
import {
  episodeSimilarity,
  episodeUtility,
  retrieveRelevantEpisodes,
  precedentInsights,
} from '../../src/cvrf/EpisodeRetrieval.js';
import type { Episode, TradingDecision } from '../../src/cvrf/types.js';

let idCounter = 0;

function decision(symbol: string, action: TradingDecision['action'] = 'buy'): TradingDecision {
  return {
    id: `d${idCounter++}`,
    timestamp: new Date('2026-01-01T00:00:00Z'),
    symbol,
    action,
    weightBefore: 0,
    weightAfter: 0.1,
    reason: 'test',
    factors: [],
    confidence: 0.8,
  };
}

function episode(
  id: string,
  symbols: string[],
  outcome?: { portfolioReturn?: number; sharpeRatio?: number },
  factorExposures: Array<{ factor: string; exposure: number }> = [],
): Episode {
  return {
    id,
    startDate: new Date('2026-01-01T00:00:00Z'),
    endDate: outcome ? new Date('2026-01-22T00:00:00Z') : undefined,
    decisions: symbols.map((s) => decision(s)),
    portfolioReturn: outcome?.portfolioReturn,
    sharpeRatio: outcome?.sharpeRatio,
    factorExposures: factorExposures.map((f) => ({
      ...f,
      tStat: 2,
      confidence: 0.9,
      contribution: 0,
    })),
  };
}

describe('episodeSimilarity', () => {
  it('is high for identical symbol sets and action mixes', () => {
    const a = episode('a', ['NVDA', 'AAPL']);
    const b = episode('b', ['NVDA', 'AAPL']);
    expect(episodeSimilarity(a, b)).toBeGreaterThan(0.9);
  });

  it('is low for disjoint symbol sets', () => {
    const a = episode('a', ['NVDA', 'AAPL']);
    const b = episode('b', ['XOM', 'CVX']);
    // Action mix still matches (all buys), so similarity isn't zero — but
    // the symbol component (50% weight) contributes nothing.
    expect(episodeSimilarity(a, b)).toBeLessThan(0.5);
  });

  it('factor profiles move the score', () => {
    const a = episode('a', ['NVDA'], undefined, [{ factor: 'momentum', exposure: 1 }]);
    const aligned = episode('b', ['NVDA'], undefined, [{ factor: 'momentum', exposure: 0.9 }]);
    const opposed = episode('c', ['NVDA'], undefined, [{ factor: 'momentum', exposure: -1 }]);
    expect(episodeSimilarity(a, aligned)).toBeGreaterThan(episodeSimilarity(a, opposed));
  });

  it('returns 0 when nothing is comparable', () => {
    const a = episode('a', []);
    const b = episode('b', []);
    expect(episodeSimilarity(a, b)).toBe(0);
  });
});

describe('episodeUtility', () => {
  it('is 0 for unclosed episodes (no environmental feedback)', () => {
    expect(episodeUtility(episode('a', ['NVDA']))).toBe(0);
  });

  it('is positive for winners and negative for losers', () => {
    expect(episodeUtility(episode('w', [], { portfolioReturn: 0.08, sharpeRatio: 1.5 }))).toBeGreaterThan(0.3);
    expect(episodeUtility(episode('l', [], { portfolioReturn: -0.08, sharpeRatio: -1.5 }))).toBeLessThan(-0.3);
  });

  it('saturates rather than exploding on outlier returns', () => {
    const u = episodeUtility(episode('x', [], { portfolioReturn: 5.0 }));
    expect(u).toBeLessThanOrEqual(1);
  });
});

describe('retrieveRelevantEpisodes', () => {
  const current = episode('current', ['NVDA', 'AAPL', 'MSFT']);

  it('ranks similar high-utility episodes first and filters noise', () => {
    const candidates = [
      episode('similar-winner', ['NVDA', 'AAPL'], { portfolioReturn: 0.09, sharpeRatio: 1.8 }),
      episode('similar-flat', ['NVDA', 'AAPL'], { portfolioReturn: 0.001, sharpeRatio: 0.01 }),
      episode('dissimilar-winner', ['XOM', 'CVX'], { portfolioReturn: 0.12, sharpeRatio: 2.0 }),
      episode('similar-unclosed', ['NVDA', 'MSFT']),
    ];

    const results = retrieveRelevantEpisodes(current, candidates);
    const ids = results.map((r) => r.episode.id);

    expect(ids[0]).toBe('similar-winner');
    expect(ids).not.toContain('similar-flat'); // utility below floor
    expect(ids).not.toContain('similar-unclosed'); // no feedback yet
  });

  it('keeps instructive losers', () => {
    const candidates = [
      episode('similar-loser', ['NVDA', 'AAPL', 'MSFT'], { portfolioReturn: -0.11, sharpeRatio: -1.2 }),
    ];
    const results = retrieveRelevantEpisodes(current, candidates);
    expect(results).toHaveLength(1);
    expect(results[0].utility).toBeLessThan(0);
  });

  it('never retrieves the current episode itself and respects topK', () => {
    const candidates = [
      current,
      ...Array.from({ length: 6 }, (_, i) =>
        episode(`e${i}`, ['NVDA', 'AAPL'], { portfolioReturn: 0.05 + i * 0.01 }),
      ),
    ];
    const results = retrieveRelevantEpisodes(current, candidates, {
      topK: 3,
      minSimilarity: 0.15,
      minAbsUtility: 0.05,
    });
    expect(results).toHaveLength(3);
    expect(results.map((r) => r.episode.id)).not.toContain('current');
  });
});

describe('precedentInsights', () => {
  it('frames winners as repeat and losers as adjust', () => {
    const current = episode('current', ['NVDA', 'AAPL']);
    const retrieved = retrieveRelevantEpisodes(current, [
      episode('winner', ['NVDA', 'AAPL'], { portfolioReturn: 0.09 }),
      episode('loser', ['NVDA', 'AAPL'], { portfolioReturn: -0.09 }),
    ]);

    const insights = precedentInsights(retrieved);
    expect(insights).toHaveLength(2);

    const winner = insights.find((i) => i.sourceEpisode === 'winner')!;
    const loser = insights.find((i) => i.sourceEpisode === 'loser')!;
    expect(winner.impactDirection).toBe('positive');
    expect(winner.concept).toMatch(/worked before/);
    expect(loser.impactDirection).toBe('negative');
    expect(loser.concept).toMatch(/failed before/);
    expect(winner.type).toBe('regime');
  });
});
