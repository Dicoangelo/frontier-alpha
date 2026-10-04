import type { ReactNode } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Dashboard } from './Dashboard';
import type { PortfolioSnapshot } from '@/hooks/usePortfolio';

const mocks = vi.hoisted(() => ({
  actor: 'account-a' as string | null,
  ready: true,
  getPortfolio: vi.fn(),
  getFactors: vi.fn(),
  quotes: new Map(),
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: object) => unknown) => selector({
    isReady: mocks.ready,
    session: mocks.actor ? { access_token: 'test-only-token', user: { id: mocks.actor } } : null,
    user: mocks.actor ? { id: mocks.actor, email: `${mocks.actor}@example.test` } : null,
  }),
}));
vi.mock('@/api/portfolio', () => ({ portfolioApi: { getPortfolio: mocks.getPortfolio, getFactors: mocks.getFactors } }));
vi.mock('@/hooks/useQuotes', () => ({ useQuotes: () => ({ quotes: mocks.quotes, isConnected: false, lastUpdate: null }) }));
vi.mock('@/hooks/useFeedStatus', () => ({ useFeedStatus: () => ({ label: 'Idle', tone: 'idle', aria: 'No quote feed' }) }));
vi.mock('@/hooks/useEquityHistory', () => ({ useEquityHistory: () => ({ series: null, status: 'idle' }) }));
vi.mock('@/components/shared/PullToRefresh', () => ({ PullToRefresh: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('@/components/shared/Skeleton', () => ({ SkeletonDashboard: () => <p role="status">Loading portfolio</p> }));
vi.mock('@/components/portfolio/PositionList', () => ({ PositionList: ({ positions }: { positions: { symbol: string }[] }) => <ul aria-label="Saved holdings">{positions.map(p => <li key={p.symbol}>{p.symbol}</li>)}</ul> }));
vi.mock('@/components/factors/FactorExposures', () => ({ FactorExposures: () => null }));
vi.mock('@/components/risk/RiskMetrics', () => ({ RiskMetrics: () => null }));
vi.mock('@/components/explainer/CognitiveInsight', () => ({ CognitiveInsight: () => null }));
vi.mock('@/components/explainer/FactorDeltas', () => ({ FactorDeltas: () => null }));
vi.mock('@/components/charts/EquityCurve', () => ({ EquityCurve: () => null }));
vi.mock('@/components/portfolio/WeightAllocation', () => ({ WeightAllocation: () => null }));
vi.mock('@/components/dashboard/MarketStatusStrip', () => ({ MarketStatusStrip: () => null }));
vi.mock('@/components/dashboard/DashZone', () => ({ DashZone: ({ children }: { children: ReactNode }) => <>{children}</> }));

const EMPTY_ACCOUNT: PortfolioSnapshot = { id: 'saved-a', name: 'Saved account A', cash: 100000, totalValue: 100000, currency: 'USD', positions: [] };
const FUNDED_ACCOUNT = { ...EMPTY_ACCOUNT, positions: [{ id: 'aapl-a', symbol: 'AAPL', shares: 2, costBasis: 80, currentPrice: 100, weight: .002, unrealizedPnL: 40 }], totalValue: 100200 };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = () => <QueryClientProvider client={client}><MemoryRouter><Dashboard /></MemoryRouter></QueryClientProvider>;
  const rendered = render(view());
  return { client, refreshActor: () => rendered.rerender(view()) };
}
function overview() { return within(screen.getByRole('region', { name: 'Portfolio Overview' })); }

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.actor = 'account-a';
  mocks.ready = true;
  mocks.getPortfolio.mockResolvedValue(EMPTY_ACCOUNT);
  mocks.getFactors.mockResolvedValue({});
});

describe('Dashboard portfolio source isolation (mock API only)', () => {
  it('uses the saved empty portfolio and cash, ignoring unrelated imported preview symbols', async () => {
    localStorage.setItem('imported_symbols', JSON.stringify(['NVDA', 'MSFT', 'AAPL', 'GOOGL', 'AMZN', 'META', 'TSLA']));
    localStorage.setItem('analyze_symbols', JSON.stringify(['SPY']));
    setup();
    expect(await screen.findByText('No positions yet')).toBeInTheDocument();
    expect(overview().getByText('0 open positions')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try Demo Portfolio' })).not.toBeInTheDocument();
    expect(overview().getAllByText('$100,000')).toHaveLength(2);
    expect(screen.queryByText(/Demo portfolio ·/)).not.toBeInTheDocument();
    expect(mocks.getPortfolio).toHaveBeenCalledTimes(1);
    expect(mocks.getFactors).not.toHaveBeenCalled();
  });

  it('shows an authenticated 401 as an error without replacing the account with demo holdings', async () => {
    mocks.getPortfolio.mockRejectedValue(new Error('Portfolio request failed: 401'));
    setup();
    expect(await screen.findByText('Authentication required')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Portfolio Overview' })).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Saved holdings' })).not.toBeInTheDocument();
    expect(mocks.getPortfolio).toHaveBeenCalledTimes(1);
  });

  it('keeps the anonymous preview separate and removes it as soon as the user signs in', async () => {
    mocks.actor = null;
    const saved = deferred<typeof EMPTY_ACCOUNT>();
    mocks.getPortfolio.mockReturnValue(saved.promise);
    const { refreshActor } = setup();
    expect(await screen.findByText('Demo portfolio · USD')).toBeInTheDocument();
    expect(overview().getByText('5 open positions')).toBeInTheDocument();
    expect(mocks.getPortfolio).not.toHaveBeenCalled();
    mocks.actor = 'account-a';
    refreshActor();
    expect(screen.queryByText('Demo portfolio · USD')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Loading portfolio');
    await act(async () => saved.resolve(EMPTY_ACCOUNT));
    expect(await screen.findByText('No positions yet')).toBeInTheDocument();
    expect(overview().getAllByText('$100,000')).toHaveLength(2);
  });

  it('hides a previous account on account switch and restores only the preview after sign-out', async () => {
    mocks.getPortfolio.mockResolvedValueOnce(FUNDED_ACCOUNT);
    const second = deferred<typeof EMPTY_ACCOUNT>();
    mocks.getPortfolio.mockReturnValueOnce(second.promise);
    const { refreshActor } = setup();
    expect(await screen.findByText('AAPL')).toBeInTheDocument();
    mocks.actor = 'account-b';
    refreshActor();
    expect(screen.queryByText('Saved account A · USD')).not.toBeInTheDocument();
    expect(screen.queryByText('AAPL')).not.toBeInTheDocument();
    await act(async () => second.resolve({ ...EMPTY_ACCOUNT, id: 'saved-b', name: 'Saved account B', cash: 42000, totalValue: 42000 }));
    expect(await screen.findByText('Saved account B · USD')).toBeInTheDocument();
    expect(overview().getAllByText('$42,000')).toHaveLength(2);
    mocks.actor = null;
    refreshActor();
    expect(screen.queryByText('Saved account B · USD')).not.toBeInTheDocument();
    expect(await screen.findByText('Demo portfolio · USD')).toBeInTheDocument();
    expect(mocks.getPortfolio).toHaveBeenCalledTimes(2);
  });

  it('cannot overwrite the current account with a late response from the previous account', async () => {
    const first = deferred<typeof EMPTY_ACCOUNT>();
    const second = deferred<typeof EMPTY_ACCOUNT>();
    mocks.getPortfolio.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { refreshActor } = setup();
    await waitFor(() => expect(mocks.getPortfolio).toHaveBeenCalledTimes(1));
    mocks.actor = 'account-b';
    refreshActor();
    await waitFor(() => expect(mocks.getPortfolio).toHaveBeenCalledTimes(2));
    await act(async () => second.resolve({ ...EMPTY_ACCOUNT, name: 'Saved account B' }));
    expect(await screen.findByText('Saved account B · USD')).toBeInTheDocument();
    await act(async () => first.resolve(FUNDED_ACCOUNT));
    expect(screen.getByText('Saved account B · USD')).toBeInTheDocument();
    expect(screen.queryByText('AAPL')).not.toBeInTheDocument();
  });

  it('still refreshes account-scoped snapshots through the existing portfolio invalidation prefix', async () => {
    const { client } = setup();
    expect(await screen.findByText('No positions yet')).toBeInTheDocument();
    mocks.getPortfolio.mockResolvedValueOnce(FUNDED_ACCOUNT);
    await act(async () => { await client.invalidateQueries({ queryKey: ['portfolio'] }); });
    expect(await screen.findByText('AAPL')).toBeInTheDocument();
    expect(mocks.getPortfolio).toHaveBeenCalledTimes(2);
  });
});
