import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { Portfolio } from './Portfolio';

const mocks = vi.hoisted(() => ({ session: null as object | null, post: vi.fn(), put: vi.fn(), remove: vi.fn() }));
vi.mock('@/api/client', () => ({ api: { post: mocks.post, put: mocks.put, delete: mocks.remove }, isNetworkError: () => false, getErrorMessage: (e: Error) => e.message }));
vi.mock('@/stores/authStore', () => ({ useAuthStore: (selector: (state: object) => unknown) => selector({ isReady: true, session: mocks.session }) }));
vi.mock('@/hooks/usePortfolio', () => ({ usePortfolio: () => ({
  data: { id: 'p1', name: 'Portfolio', cash: 200, totalValue: 1200, positions: [{ id: 'one', symbol: 'AAPL', shares: 10, costBasis: 90, currentPrice: 100, unrealizedPnL: 100, weight: .83 }] },
  isLoading: false, error: null, refetch: vi.fn(),
}) }));
vi.mock('@/hooks/useToast', () => ({ useToast: () => ({ toastSuccess: vi.fn(), toastError: vi.fn() }) }));
vi.mock('@/hooks/useIsMobile', () => ({ useIsMobile: () => false }));
vi.mock('@/components/portfolio/PortfolioExport', () => ({ PortfolioExport: () => null }));
vi.mock('@/components/portfolio/ShareModal', () => ({ ShareModal: () => null }));
vi.mock('@/components/shared/PullToRefresh', () => ({ PullToRefresh: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/portfolio/mobile/PositionSheet', () => ({ PositionSheet: () => null }));
vi.mock('@/components/explainer/TradeReasoning', () => ({ TradeReasoning: () => null, WhyButton: () => null }));
vi.mock('@/components/shared/BottomSheet', () => ({ BottomSheet: () => null, useBottomSheet: () => ({ isOpen: false, open: vi.fn(), close: vi.fn() }) }));

function renderPortfolio() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
    <MemoryRouter><Portfolio /></MemoryRouter>
  </QueryClientProvider>);
}
beforeEach(() => { vi.clearAllMocks(); mocks.session = { access_token: 'mock-only' }; mocks.post.mockResolvedValue({}); mocks.put.mockResolvedValue({}); });

describe('Portfolio position forms (mock API only)', () => {
  it('identifies sample positions and disables their edit/delete actions', () => {
    mocks.session = null;
    renderPortfolio();
    expect(screen.getByText('Demo portfolio')).toBeInTheDocument();
    expect(screen.getByText('$85,275.00')).toBeInTheDocument();
    expect(screen.queryByText('$125,000.00')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in to add positions' })).toBeEnabled();
    screen.getAllByRole('button', { name: /^Edit / }).forEach((button) => expect(button).toBeDisabled());
    screen.getAllByRole('button', { name: /^Delete / }).forEach((button) => expect(button).toBeDisabled());
    expect(mocks.post).not.toHaveBeenCalled();
  });
  it('rejects invalid inline edits without sending API writes', () => {
    renderPortfolio();
    fireEvent.click(screen.getByRole('button', { name: 'Edit AAPL' }));
    fireEvent.change(screen.getByLabelText('Edit shares for AAPL'), { target: { value: '-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Shares must be greater than zero');
    expect(mocks.put).not.toHaveBeenCalled();
  });
  it('normalizes symbols while preserving a valid entered position', async () => {
    renderPortfolio();
    fireEvent.click(screen.getByRole('button', { name: 'Add position' }));
    fireEvent.change(screen.getByLabelText('Symbol'), { target: { value: ' msft ' } });
    fireEvent.change(screen.getByLabelText('Shares'), { target: { value: '0.5' } });
    fireEvent.change(screen.getByLabelText('Avg Cost'), { target: { value: '123.45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/portfolio/positions', { symbol: 'MSFT', shares: 0.5, avgCost: 123.45 }));
  });
});
