/**
 * Tests for multi-method factor consensus (IDEA-FF-2 v1).
 *
 * Invariants: each method ranks independently off the same context; agreement
 * is quantified honestly (identical inputs → strong agreement, orthogonal
 * inputs → disagreement); a missing 5d anchor degrades to two methods.
 */

import { describe, it, expect } from 'vitest';
import { computeMethodConsensus, toExposure } from '../../src/factors/methodConsensus.js';
import type { TemporalFactorContext } from '../../src/services/factorAnchors.js';

function ctx(
  current: Array<[string, number, number]>,
  prior5d?: Array<[string, number, number]>,
): TemporalFactorContext {
  return {
    current: current.map(([f, e, t]) => toExposure(f, e, t)),
    anchors: prior5d
      ? [{ window: '5d', factors: prior5d.map(([f, e, t]) => toExposure(f, e, t)) }]
      : [],
  };
}

describe('computeMethodConsensus', () => {
  it('produces three methods when a 5d anchor exists', () => {
    const result = computeMethodConsensus(
      'NVDA',
      ctx(
        [
          ['momentum', 0.8, 3.1],
          ['value', -0.2, 0.4],
        ],
        [
          ['momentum', 0.5, 2.8],
          ['value', -0.19, 0.5],
        ],
      ),
    );
    expect(result.methods.map((m) => m.method)).toEqual([
      'exposure_magnitude',
      'temporal_delta',
      'statistical_significance',
    ]);
  });

  it('degrades to two methods without an anchor', () => {
    const result = computeMethodConsensus('NVDA', ctx([['momentum', 0.8, 3.1]]));
    expect(result.methods.map((m) => m.method)).toEqual([
      'exposure_magnitude',
      'statistical_significance',
    ]);
    expect(result.agreement.pairwise).toHaveLength(1);
  });

  it('reports strong agreement when all methods point at the same factors', () => {
    // momentum is biggest, moved most, and most significant.
    const result = computeMethodConsensus(
      'NVDA',
      ctx(
        [
          ['momentum', 0.9, 4.0],
          ['quality', 0.5, 2.0],
          ['value', 0.1, 0.3],
        ],
        [
          ['momentum', 0.3, 3.5],
          ['quality', 0.3, 1.8],
          ['value', 0.09, 0.3],
        ],
      ),
      2,
    );

    expect(result.agreement.verdict).toBe('strong_agreement');
    expect(result.consensusFactors[0].factor).toBe('momentum');
    expect(result.consensusFactors[0].methodsInTopK).toBe(3);
  });

  it('reports disagreement when methods rank orthogonally', () => {
    // Big exposure on value (but insignificant and static); big move on
    // momentum (small exposure, insignificant); significance on quality only.
    const result = computeMethodConsensus(
      'XYZ',
      ctx(
        [
          ['value', 2.0, 0.1],
          ['momentum', 0.1, 0.2],
          ['quality', 0.2, 5.0],
        ],
        [
          ['value', 2.0, 0.1],
          ['momentum', -0.9, 0.2],
          ['quality', 0.2, 5.0],
        ],
      ),
      1,
    );

    expect(result.agreement.verdict).toBe('disagreement');
    expect(result.agreement.overallScore).toBeLessThan(0.3);
  });

  it('rank correlation is 1 for identical rankings', () => {
    const result = computeMethodConsensus(
      'AAA',
      ctx([
        ['a', 0.9, 9.0],
        ['b', 0.5, 5.0],
        ['c', 0.1, 1.0],
      ]),
    );
    const pair = result.agreement.pairwise[0];
    expect(pair.rankCorrelation).toBe(1);
    expect(pair.topKOverlap).toBe(1);
  });

  it('rank correlation is negative for reversed rankings', () => {
    const result = computeMethodConsensus(
      'BBB',
      ctx([
        ['a', 0.9, 1.0],
        ['b', 0.5, 5.0],
        ['c', 0.1, 9.0],
      ]),
      3,
    );
    const pair = result.agreement.pairwise[0];
    expect(pair.rankCorrelation).toBe(-1);
  });

  it('consensus factors sort by cross-method presence then avg rank', () => {
    const result = computeMethodConsensus(
      'CCC',
      ctx(
        [
          ['momentum', 0.9, 4.0],
          ['quality', 0.8, 0.2],
          ['value', 0.1, 3.9],
        ],
        [
          ['momentum', 0.1, 4.0],
          ['quality', 0.79, 0.2],
          ['value', 0.1, 3.9],
        ],
      ),
      2,
    );

    // momentum: top-2 in all three methods (big, moved, significant).
    expect(result.consensusFactors[0].factor).toBe('momentum');
    expect(result.consensusFactors[0].methodsInTopK).toBe(3);
  });
});
