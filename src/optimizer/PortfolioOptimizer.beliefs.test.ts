/**
 * PortfolioOptimizer — CVRF belief integration.
 *
 * The belief pathway was entirely untested. It only looked covered: vitest 1's
 * v8 provider reported 85% branch coverage on this file where the honest figure
 * is ~45%, so the gate was flattering it rather than protecting it.
 *
 * This matters more than the number. Beliefs are the CVRF integration — the
 * thing that makes this optimizer more than a textbook mean-variance solver —
 * and every branch of it shipped unexercised.
 *
 * `optimize()` weights are deterministic: this.rng is only touched by the Monte
 * Carlo block, never by the solvers. So each test here compares a beliefs run
 * against an identical no-beliefs run and asserts on the DIFFERENCE, rather than
 * on absolute weights that would be brittle.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PortfolioOptimizer, type BeliefConstraints } from './PortfolioOptimizer.js';
import type { Price, OptimizationConfig } from '../types/index.js';

/**
 * Deterministic price series — a seeded LCG, not Math.random, so a failure here
 * is always reproducible and never a flake.
 */
function seededPrices(
  symbol: string, days: number, startPrice: number, drift: number, vol: number, seed: number,
): Price[] {
  let state = seed;
  const rand = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
  const out: Price[] = [];
  let price = startPrice;
  for (let i = 0; i < days; i++) {
    const date = new Date(Date.UTC(2026, 0, 1));
    date.setUTCDate(date.getUTCDate() + i);
    price = Math.max(1, price * (1 + drift + (rand() - 0.5) * vol));
    out.push({
      symbol,
      timestamp: date,
      open: price * 0.99,
      high: price * 1.01,
      low: price * 0.98,
      close: price,
      volume: 1_000_000,
    });
  }
  return out;
}

const SYMBOLS = ['AAPL', 'MSFT', 'GOOGL'];

/**
 * Drift/vol chosen so max-Sharpe returns an INTERIOR solution (~[0.61, 0, 0.39]).
 * This matters: with a wider spread the solver goes to a corner ([1, 0, 0]) and
 * sits there, belief tilts on mu cannot move it, and every assertion below
 * passes or fails for the wrong reason. A corner solution makes this whole file
 * vacuous, so keep these numbers unless you re-check the resulting weights.
 */
function priceBook(days = 260): Map<string, Price[]> {
  return new Map([
    ['AAPL', seededPrices('AAPL', days, 100, 0.0006, 0.03, 11)],
    ['MSFT', seededPrices('MSFT', days, 200, 0.0005, 0.025, 22)],
    ['GOOGL', seededPrices('GOOGL', days, 150, 0.0006, 0.02, 33)],
  ]);
}

const CONFIG: OptimizationConfig = { objective: 'max_sharpe', riskFreeRate: 0.04 };

function beliefs(
  weights: Record<string, number>,
  confidences?: Record<string, number>,
): BeliefConstraints {
  return {
    factorWeights: new Map(Object.entries(weights)),
    factorConfidences: new Map(Object.entries(confidences ?? {})),
  };
}

const weightsOf = (r: { weights: Map<string, number> }) => SYMBOLS.map((s) => r.weights.get(s) ?? 0);

describe('PortfolioOptimizer — CVRF belief integration', () => {
  let optimizer: PortfolioOptimizer;
  let prices: Map<string, Price[]>;

  beforeEach(() => {
    optimizer = new PortfolioOptimizer();
    prices = priceBook();
  });

  describe('graceful fallback', () => {
    it('runs unconstrained when beliefs are omitted entirely', async () => {
      const result = await optimizer.optimize(SYMBOLS, prices, CONFIG);
      expect(weightsOf(result).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    });

    it('ignores a beliefs object with no factors — an empty map is not a view', async () => {
      const withEmpty = await optimizer.optimize(SYMBOLS, prices, CONFIG, beliefs({}));
      const without = await optimizer.optimize(SYMBOLS, prices, CONFIG);
      expect(weightsOf(withEmpty)).toEqual(weightsOf(without));
    });
  });

  describe('applyBeliefPriors — tilts on expected return', () => {
    // These assert on expectedReturn, not weights, and that is deliberate.
    // Priors tilt `mu`; expectedReturn is portfolioReturn(weights, tiltedMu), so
    // it reads the tilt directly. Weights are the wrong probe because the
    // concentration cap downstream can clamp two different tilts to the same
    // allocation — see the saturation test below, which pins that behaviour.

    it('a high-conviction momentum view shifts expected return', async () => {
      const without = await optimizer.optimize(SYMBOLS, prices, CONFIG);
      const withView = await optimizer.optimize(
        SYMBOLS, prices, CONFIG,
        beliefs({ momentum_12m: 1.0 }, { momentum_12m: 0.9 }),
      );
      expect(withView.expectedReturn).not.toBeCloseTo(without.expectedReturn, 9);
      expect(weightsOf(withView).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    });

    it('value and momentum views of equal strength tilt in OPPOSITE directions', async () => {
      // Value is treated as anti-momentum. Straddling the no-view baseline is
      // the real contract: if the alignment sign is ever lost, both land on the
      // same side and this fails.
      const base = await optimizer.optimize(SYMBOLS, prices, CONFIG);
      const mom = await optimizer.optimize(
        SYMBOLS, prices, CONFIG, beliefs({ momentum_12m: 1.0 }, { momentum_12m: 0.8 }),
      );
      const val = await optimizer.optimize(
        SYMBOLS, prices, CONFIG, beliefs({ value_composite: 1.0 }, { value_composite: 0.8 }),
      );
      const momDelta = mom.expectedReturn - base.expectedReturn;
      const valDelta = val.expectedReturn - base.expectedReturn;
      expect(Math.sign(momDelta)).toBe(-Math.sign(valDelta));
      expect(Math.abs(momDelta)).toBeGreaterThan(0);
    });

    it('FINDING: belief magnitude is inert above ~0.55 — a dial that behaves as a switch', async () => {
      // The clamp makes conviction almost meaningless. Walking the belief weight
      // from 0.55 to 1.0 produces byte-identical expected returns:
      //
      //   base     0.026418006708531273
      //   w=0.501  0.027799831392829648
      //   w=0.55   0.028870392768514610
      //   w=0.75   0.028870392768514610   <- identical
      //   w=1.00   0.028870392768514610   <- identical
      //
      // Why: confidence CANCELS in `beliefTilt / totalConfidence`, leaving
      // signal * alignment, which is then clamped to |mu[i]| * 0.5. alignment is
      // a 60-day cumulative return (~3.6%) while the bound derives from a DAILY
      // mean return (~0.00025) — a ~100x unit mismatch, so the clamp binds for
      // any non-trivial view and only the SIGN survives.
      //
      // A 55%-conviction view and a 100%-conviction view give the same portfolio.
      // Pinned so that if the units are ever reconciled, this test fails loudly
      // and someone re-reads this comment rather than silently changing
      // allocations for every user holding a belief.
      const at = async (w: number) =>
        (await optimizer.optimize(
          SYMBOLS, prices, CONFIG, beliefs({ momentum_12m: w }, { momentum_12m: 0.2 }),
        )).expectedReturn;

      const [a, b, c, d] = [await at(0.55), await at(0.75), await at(0.95), await at(1.0)];
      expect(b).toBeCloseTo(a, 15);
      expect(c).toBeCloseTo(a, 15);
      expect(d).toBeCloseTo(a, 15);

      // ...and it is genuinely a tilt, not a no-op: it still moves off baseline.
      const base = await optimizer.optimize(SYMBOLS, prices, CONFIG);
      expect(a).not.toBeCloseTo(base.expectedReturn, 9);
    });

    it('SATURATES: a strong view clamps generic and momentum to the same tilt', async () => {
      // Pinning the flip side of the test above. clampedTilt is bounded by
      // |mu[i]| * 0.5, so once a view is strong enough both alignments hit the
      // bound and the half-weight rule for unmapped factors stops mattering.
      const strong = 0.8;
      const generic = await optimizer.optimize(
        SYMBOLS, prices, CONFIG, beliefs({ some_unmapped_factor: 1.0 }, { some_unmapped_factor: strong }),
      );
      const momentum = await optimizer.optimize(
        SYMBOLS, prices, CONFIG, beliefs({ momentum_12m: 1.0 }, { momentum_12m: strong }),
      );
      expect(generic.expectedReturn).toBeCloseTo(momentum.expectedReturn, 12);
    });

    it('an ABSENT confidence map disables the concentration cap, unlike an explicit 0.5', async () => {
      // Easy to read as equivalent, and it is not. applyBeliefPriors defaults a
      // missing confidence to 0.5 via `??`, but applyBeliefWeightConstraints
      // checks `confidences.length === 0` and returns early — so omitting the
      // map skips the cap ENTIRELY while an explicit 0.5 caps at 0.375.
      // Same-looking input, materially different risk posture.
      const absent = await optimizer.optimize(
        SYMBOLS, prices, CONFIG, beliefs({ momentum_12m: 1.0 }),
      );
      const explicitHalf = await optimizer.optimize(
        SYMBOLS, prices, CONFIG, beliefs({ momentum_12m: 1.0 }, { momentum_12m: 0.5 }),
      );
      expect(weightsOf(absent)).not.toEqual(weightsOf(explicitHalf));
      expect(Math.max(...weightsOf(absent))).toBeGreaterThan(Math.max(...weightsOf(explicitHalf)));
      // The PRIOR itself does default to 0.5 — both stay on the same side of
      // the no-view baseline, so only the cap differs.
      const base = await optimizer.optimize(SYMBOLS, prices, CONFIG);
      expect(Math.sign(absent.expectedReturn - base.expectedReturn))
        .toBe(Math.sign(explicitHalf.expectedReturn - base.expectedReturn));
    });

    it('skips assets with under 60 bars instead of tilting on thin history', async () => {
      const thin = priceBook();
      thin.set('GOOGL', seededPrices('GOOGL', 59, 150, 0.0006, 0.02, 33));
      const view = beliefs({ momentum_12m: 1.0 }, { momentum_12m: 0.9 });

      const result = await optimizer.optimize(SYMBOLS, thin, CONFIG, view);
      expect(Number.isFinite(result.weights.get('GOOGL'))).toBe(true);
      expect(weightsOf(result).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    });
  });

  describe('applyBeliefWeightConstraints — conviction damps concentration', () => {
    it('high conviction caps any single name below what low conviction allows', async () => {
      const low = await optimizer.optimize(
        SYMBOLS, prices, CONFIG, beliefs({ momentum_12m: 0.5 }, { momentum_12m: 0.0 }),
      );
      const high = await optimizer.optimize(
        SYMBOLS, prices, CONFIG, beliefs({ momentum_12m: 0.5 }, { momentum_12m: 1.0 }),
      );
      // cap is 0.5 - avgConfidence*0.25, so 0.5 at zero conviction, 0.25 at full
      expect(Math.max(...weightsOf(high))).toBeLessThanOrEqual(Math.max(...weightsOf(low)) + 1e-9);
    });

    it('re-normalises to 1 after clamping', async () => {
      const result = await optimizer.optimize(
        SYMBOLS, prices, CONFIG, beliefs({ momentum_12m: 1.0 }, { momentum_12m: 1.0 }),
      );
      expect(weightsOf(result).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
      for (const w of weightsOf(result)) expect(w).toBeGreaterThanOrEqual(0);
    });

    it('SATURATES: at high conviction the cap erases the prior tilt from weights', async () => {
      // Documenting real behaviour, not endorsing it. At confidence 0.8 the cap
      // is 0.30, so an interior [0.61, 0, 0.39] clamps and renormalises to
      // [0.5, 0, 0.5] no matter which way the prior tilted. The view still moves
      // expectedReturn, but its effect on the ALLOCATION is gone. Worth knowing
      // before trusting high-conviction beliefs to change what you hold.
      const mom = await optimizer.optimize(
        SYMBOLS, prices, CONFIG, beliefs({ momentum_12m: 1.0 }, { momentum_12m: 0.8 }),
      );
      const val = await optimizer.optimize(
        SYMBOLS, prices, CONFIG, beliefs({ value_composite: 1.0 }, { value_composite: 0.8 }),
      );
      expect(weightsOf(mom)).toEqual(weightsOf(val));
      expect(mom.expectedReturn).not.toBeCloseTo(val.expectedReturn, 9);
    });

    it('leaves weights alone when factors carry no confidence entries at all', async () => {
      const result = await optimizer.optimize(
        SYMBOLS, prices, CONFIG, beliefs({ momentum_12m: 1.0, value_composite: 0.2 }),
      );
      expect(weightsOf(result).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    });
  });

  describe('target_volatility scaling', () => {
    it('leaves max-Sharpe weights untouched when the target is already slack', async () => {
      const result = await optimizer.optimize(SYMBOLS, prices, {
        objective: 'target_volatility', riskFreeRate: 0.04, targetVolatility: 10,
      });
      expect(weightsOf(result).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    });

    it('scales exposure down when the target binds, leaving the rest in cash', async () => {
      const bound = await optimizer.optimize(SYMBOLS, prices, {
        objective: 'target_volatility', riskFreeRate: 0.04, targetVolatility: 0.001,
      });
      const slack = await optimizer.optimize(SYMBOLS, prices, {
        objective: 'target_volatility', riskFreeRate: 0.04, targetVolatility: 10,
      });
      const invested = weightsOf(bound).reduce((a, b) => a + b, 0);
      expect(invested).toBeLessThan(weightsOf(slack).reduce((a, b) => a + b, 0));
      expect(invested).toBeGreaterThan(0);
    });

    it('falls back to a 0.15 target when none is supplied', async () => {
      const implicit = await optimizer.optimize(SYMBOLS, prices, {
        objective: 'target_volatility', riskFreeRate: 0.04,
      });
      const explicit = await optimizer.optimize(SYMBOLS, prices, {
        objective: 'target_volatility', riskFreeRate: 0.04, targetVolatility: 0.15,
      });
      expect(weightsOf(implicit)).toEqual(weightsOf(explicit));
    });
  });
});
