import { beforeEach, describe, it, expect, vi } from 'vitest';
const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('../../src/lib/supabase.js', () => ({ supabaseAdmin: { from } }));
import { readResearchPortfolio } from '../../src/agent/portfolio.js';

function query(result: unknown) {
  const chain = { select: vi.fn(), eq: vi.fn(), limit: vi.fn(), order: vi.fn(), abortSignal: vi.fn().mockResolvedValue(result) };
  for (const method of ['select', 'eq', 'limit', 'order'] as const) chain[method].mockReturnValue(chain);
  return chain;
}
beforeEach(() => vi.clearAllMocks());

describe('research portfolio retrieval', () => {
  it('applies verified ownership before position retrieval, bounded reads, and a cancellation signal', async () => {
    const portfolio = query({ data: [{ id: 'portfolio-one', cash_balance: '100', updated_at: '2026-10-04' }], error: null });
    const positions = query({ data: [{ symbol: 'AAPL', shares: '5', avg_cost: '20' }], error: null });
    from.mockReturnValueOnce(portfolio).mockReturnValueOnce(positions);
    const signal = new AbortController().signal;
    const result = await readResearchPortfolio('verified-user', signal);
    expect(portfolio.eq).toHaveBeenCalledWith('user_id', 'verified-user');
    expect(portfolio.limit).toHaveBeenCalledWith(2); expect(positions.limit).toHaveBeenCalledWith(201);
    expect(positions.eq).toHaveBeenCalledWith('portfolio_id', 'portfolio-one');
    expect(positions.abortSignal).toHaveBeenCalledWith(signal);
    expect(result).toMatchObject({ cashBalance: 100, positions: [{ symbol: 'AAPL', shares: 5, avgCost: 20 }] });
  });
  it('returns no portfolio without creating or mutating rows', async () => {
    from.mockReturnValue(query({ data: [], error: null }));
    expect(await readResearchPortfolio('new-user', new AbortController().signal)).toBeNull(); expect(from).toHaveBeenCalledTimes(1);
  });
  it.each(['query error', 'ambiguous account', 'incomplete positions', 'scan limit'])('fails closed for %s', async scenario => {
    const portfolio = query({ data: scenario === 'ambiguous account' ? [{ id: 'a' }, { id: 'b' }] : [{ id: 'a', cash_balance: 5 }], error: scenario === 'query error' ? {} : null });
    const positions = query({ data: scenario === 'scan limit' ? Array(201).fill({ symbol: 'AAPL', shares: 1, avg_cost: 1 }) : null, error: {} });
    from.mockReturnValueOnce(portfolio).mockReturnValueOnce(positions);
    await expect(readResearchPortfolio('actor', new AbortController().signal)).rejects.toThrow();
  });
});
