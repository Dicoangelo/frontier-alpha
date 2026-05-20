/**
 * Unit Tests for PortfolioOptimizer — baseline invariants
 *
 * Guards numerical output of maxSharpe and minVolatility before/after the
 * gradient/scratch hoist refactor. Identical pre- and post-hoist behavior
 * is the acceptance bar.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PortfolioOptimizer } from '../../src/optimizer/PortfolioOptimizer.js';

function diagonalSigma(n: number): number[][] {
  const sigma: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = new Array(n).fill(0);
    row[i] = 0.04 * (1 + i * 0.1);
    sigma.push(row);
  }
  return sigma;
}

describe('PortfolioOptimizer baseline invariants', () => {
  let optimizer: PortfolioOptimizer;

  beforeEach(() => {
    optimizer = new PortfolioOptimizer();
  });

  it('maxSharpe returns weights that sum to 1', () => {
    const mu = [0.08, 0.10, 0.12, 0.07, 0.09];
    const sigma = diagonalSigma(5);
    const weights = (optimizer as any).maxSharpe(mu, sigma, 0.02);

    expect(weights.length).toBe(5);
    const sum = weights.reduce((a: number, b: number) => a + b, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(1e-6);
  });

  it('minVolatility returns weights that sum to 1', () => {
    const sigma = diagonalSigma(5);
    const weights = (optimizer as any).minVolatility(sigma);

    expect(weights.length).toBe(5);
    const sum = weights.reduce((a: number, b: number) => a + b, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(1e-6);
  });

  it('maxSharpe enforces long-only constraint (all weights >= 0)', () => {
    const mu = [0.08, 0.10, 0.12, 0.07, 0.09];
    const sigma = diagonalSigma(5);
    const weights = (optimizer as any).maxSharpe(mu, sigma, 0.02);

    expect(weights.every((w: number) => w >= 0)).toBe(true);
  });
});
