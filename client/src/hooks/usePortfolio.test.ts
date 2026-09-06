import { describe, it, expect } from 'vitest';
import { unwrapPortfolio } from './usePortfolio';

const bare = {
  id: 'pf-1',
  name: 'Main Portfolio',
  cash: 100000,
  positions: [{ symbol: 'NVDA', shares: 1, weight: 1, costBasis: 1, currentPrice: 2, unrealizedPnL: 1 }],
  totalValue: 100002,
  currency: 'USD',
};

describe('unwrapPortfolio', () => {
  it('unwraps the { success, data } envelope from api.get', () => {
    const out = unwrapPortfolio({ success: true, data: bare, meta: {} });
    expect(out?.cash).toBe(100000);
    expect(out?.positions).toHaveLength(1);
  });

  it('passes the bare snapshot through (portfolioApi.getPortfolio shape)', () => {
    const out = unwrapPortfolio(bare);
    expect(out?.cash).toBe(100000);
    expect(out?.id).toBe('pf-1');
  });

  it('both shapes normalise to the same object — the cross-page cache regression', () => {
    expect(unwrapPortfolio({ success: true, data: bare })).toEqual(unwrapPortfolio(bare));
  });

  it('returns null for an error envelope or garbage', () => {
    expect(unwrapPortfolio({ success: false, error: { code: 'NOT_FOUND' } })).toBeNull();
    expect(unwrapPortfolio(null)).toBeNull();
    expect(unwrapPortfolio('x')).toBeNull();
  });

  it('coerces numeric strings (Postgres DECIMAL arrives as text through some paths)', () => {
    const out = unwrapPortfolio({ ...bare, cash: '25000.00', totalValue: '25002' });
    expect(out?.cash).toBe(25000);
    expect(out?.totalValue).toBe(25002);
  });
});
