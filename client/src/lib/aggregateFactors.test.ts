import { describe, it, expect } from 'vitest';
import { aggregatePortfolioFactors, unwrapFactorPayload } from './aggregateFactors';

const row = (factor: string, exposure: number, tStat = 2, contribution = 0.01) => ({
  factor,
  exposure,
  tStat,
  confidence: 0.5,
  contribution,
});

describe('unwrapFactorPayload', () => {
  it('unwraps the { success, data } envelope the server actually sends', () => {
    const json = { success: true, data: { NVDA: [row('market', 1.2)] }, meta: {} };
    expect(Object.keys(unwrapFactorPayload(json))).toEqual(['NVDA']);
  });

  it('accepts a bare symbol map (legacy shape)', () => {
    const json = { NVDA: [row('market', 1.2)] };
    expect(Object.keys(unwrapFactorPayload(json))).toEqual(['NVDA']);
  });

  it('returns an empty map for garbage', () => {
    expect(unwrapFactorPayload(null)).toEqual({});
    expect(unwrapFactorPayload('nope')).toEqual({});
    expect(unwrapFactorPayload({ success: false, error: {} })).toEqual({});
  });
});

describe('aggregatePortfolioFactors', () => {
  it('produces exposures from the enveloped response (the production regression)', () => {
    const json = {
      success: true,
      data: {
        NVDA: [row('market', 1.8, 14), row('momentum_12m', 1.2, 4)],
        AAPL: [row('market', 1.0, 10), row('momentum_12m', 0.4, 1)],
      },
    };
    const out = aggregatePortfolioFactors(json, ['NVDA', 'AAPL']);
    expect(out.map((f) => f.factor)).toEqual(['market', 'momentum_12m']);
    expect(out[0].exposure).toBeCloseTo(1.4);
    expect(out[0].tStat).toBeCloseTo(12);
    expect(out[0].confidence).toBe(1);
    expect(out[1].exposure).toBeCloseTo(0.8);
  });

  it('is empty when the payload holds none of the requested symbols', () => {
    expect(aggregatePortfolioFactors({ success: true, data: { MSFT: [row('market', 1)] } }, ['NVDA'])).toEqual([]);
  });

  it('ranks by |exposure| and honours the limit', () => {
    const json = { data: { X: [row('a', 0.1), row('b', -3), row('c', 2)] } };
    const out = aggregatePortfolioFactors(json, ['X'], 2);
    expect(out.map((f) => f.factor)).toEqual(['b', 'c']);
  });

  it('skips malformed rows instead of throwing', () => {
    const json = { data: { X: [row('a', 1), { factor: 'bad', exposure: NaN }, null] } };
    expect(aggregatePortfolioFactors(json, ['X']).map((f) => f.factor)).toEqual(['a']);
  });
});
