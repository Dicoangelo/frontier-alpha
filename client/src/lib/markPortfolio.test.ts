import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMemo } from 'react';
import { markPortfolio } from './markPortfolio';
import { DEMO_CASH, DEMO_HOLDINGS, DEMO_TOTAL_VALUE } from './demoFixtures';
import type { Portfolio } from '@/types';

const demo: Portfolio = { id: 'demo', name: 'Demo', currency: 'USD', cash: DEMO_CASH, totalValue: DEMO_TOTAL_VALUE, positions: DEMO_HOLDINGS };

describe('portfolio valuation', () => {
  it('keeps the canonical demo total, weights, cash and P&L arithmetically consistent', () => {
    expect(DEMO_TOTAL_VALUE).toBe(85275);
    expect(DEMO_HOLDINGS.reduce((sum, p) => sum + p.shares * p.currentPrice, DEMO_CASH)).toBe(DEMO_TOTAL_VALUE);
    expect(DEMO_HOLDINGS.reduce((sum, p) => sum + p.weight, DEMO_CASH / DEMO_TOTAL_VALUE)).toBeCloseTo(1, 12);
    for (const p of DEMO_HOLDINGS) expect(p.unrealizedPnL).toBe((p.currentPrice - p.costBasis) * p.shares);
  });

  it('applies an unchanged cached quote map when a portfolio snapshot arrives after mount', () => {
    const cachedQuotes = new Map([['NVDA', { last: 600 }]]);
    const empty: Portfolio = { ...demo, positions: [], cash: 0, totalValue: 0 };
    const { result, rerender } = renderHook(({ snapshot }) => useMemo(() => markPortfolio(snapshot, cachedQuotes), [snapshot]), { initialProps: { snapshot: empty } });
    expect(result.current.totalValue).toBe(0);
    rerender({ snapshot: demo });
    expect(result.current.positions.find(p => p.symbol === 'NVDA')?.currentPrice).toBe(600);
    expect(result.current.totalValue).toBe(89275);
    expect(result.current.positions.find(p => p.symbol === 'NVDA')?.unrealizedPnL).toBe(7500);
    expect(result.current.positions.find(p => p.symbol === 'NVDA')?.weight).toBeCloseTo(30000 / 89275);
    expect(demo.positions[0].currentPrice).toBe(520);
  });

  it('retains valid snapshot prices for missing or invalid quotes while reconciling totals', () => {
    const result = markPortfolio(demo, new Map([['NVDA', { last: NaN }], ['AAPL', { last: -1 }]]));
    expect(result.totalValue).toBe(DEMO_TOTAL_VALUE);
    expect(result.positions.map(p => p.currentPrice)).toEqual(DEMO_HOLDINGS.map(p => p.currentPrice));
  });
});
