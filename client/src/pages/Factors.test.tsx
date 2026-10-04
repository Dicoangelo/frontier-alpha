import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect } from 'vitest';
import { Factors } from './Factors';

const mocks = vi.hoisted(() => ({ authReady: true, positions: [] as { symbol: string }[], factors: {} as Record<string, unknown[]>, useFactorsByCategory: vi.fn(), refresh: vi.fn() }));
vi.mock('@/hooks/usePortfolio', () => ({ usePortfolio: () => ({ data: { positions: mocks.positions }, isLoading: false, isError: false, refetch: vi.fn() }) }));
vi.mock('@/hooks/useSubscription', () => ({ useAuthReady: () => mocks.authReady }));
vi.mock('@/hooks/useFactors', () => ({
  useFactorsByCategory: (symbols: string[]) => { mocks.useFactorsByCategory(symbols); return { data: mocks.factors, isLoading: false, isError: false, refetch: vi.fn() }; },
  useRefreshFactors: () => ({ mutate: mocks.refresh, isPending: false, isError: false }),
  FACTOR_CATEGORY_LABELS: { style: 'Style Factors', macro: 'Macro Factors', sector: 'Sector Factors', volatility: 'Volatility Factors', sentiment: 'Sentiment Factors' },
  FACTOR_CATEGORY_DESCRIPTIONS: {},
}));
vi.mock('@/components/factors/SignalTiming', () => ({ SignalTiming: () => null }));
vi.mock('@/components/factors/MethodConsensus', () => ({ MethodConsensus: () => null }));
vi.mock('@/components/factors/ContributionWaterfall', () => ({ ContributionWaterfall: () => null }));

function setup() {
  render(<MemoryRouter><QueryClientProvider client={new QueryClient()}><Factors /></QueryClientProvider></MemoryRouter>);
}

describe('Factors universe and filters', () => {
  it('does not replace an empty authenticated portfolio with example holdings', () => {
    mocks.authReady = true; mocks.positions = []; mocks.factors = {};
    setup();
    expect(mocks.useFactorsByCategory).toHaveBeenCalledWith([]);
    expect(screen.getByText('No positions in your portfolio')).toBeInTheDocument();
    expect(screen.queryByText('Example watchlist')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh factors' })).toBeDisabled();
  });

  it('identifies the example universe and lets a user clear an empty category', () => {
    mocks.authReady = false; mocks.positions = [];
    mocks.factors = { style: [{ symbol: 'AAPL', factor: 'momentum_12m', exposure: 0.4, tStat: 2.1, confidence: 0.8, contribution: 0.1 }] };
    setup();
    expect(screen.getByText('Example watchlist')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Macro Factors/ }));
    expect(screen.getByText('No readings in this category for the selected holdings.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show all categories' }));
    expect(screen.queryByText('No readings in this category for the selected holdings.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All categories' })).toHaveAttribute('aria-pressed', 'true');
  });
});
