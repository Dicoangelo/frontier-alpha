import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect } from 'vitest';
import { Optimize } from './Optimize';
import { api } from '@/api/client';

vi.mock('@/api/client', () => ({ api: { post: vi.fn() }, getErrorMessage: (error: Error) => error?.message }));
vi.mock('@/hooks/useToast', () => ({ useToast: () => ({ toastSuccess: vi.fn(), toastError: vi.fn() }) }));
vi.mock('@/hooks/usePortfolio', () => ({ usePortfolio: () => ({ data: { positions: [{ symbol: 'AAPL', weight: 0.5 }, { symbol: 'MSFT', weight: 0.5 }] }, isLoading: false, isError: false, refetch: vi.fn() }) }));
vi.mock('@/components/shared/UpgradeGate', () => ({ UpgradeGate: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/charts/MonteCarloChart', () => ({ MonteCarloChart: () => <div data-testid="simulation-chart" /> }));

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(<MemoryRouter><QueryClientProvider client={queryClient}><Optimize /></QueryClientProvider></MemoryRouter>);
}

describe('Optimizer controls and result provenance', () => {
  it('rejects blank weight constraints before making a request', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Maximum position weight'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run optimization' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a maximum position weight between 0.05 and 1.');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('wires target volatility to both API constraints and clears stale results on editing', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { weights: { AAPL: 0.5, MSFT: 0.5 }, expectedReturn: 0.1, expectedVolatility: 0.15, sharpeRatio: 0.36, factorExposures: [] } });
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Target volatility/ }));
    fireEvent.change(screen.getByLabelText('Target volatility'), { target: { value: '0.20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run optimization' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Model results' })).toBeInTheDocument());
    expect(api.post).toHaveBeenCalledWith('/portfolio/optimize', expect.objectContaining({ config: expect.objectContaining({ targetVolatility: 0.2, constraints: { maxWeight: 0.25, targetVolatility: 0.2 } }) }));
    expect(screen.getByText('Simulation statistics were not included in this result.')).toBeInTheDocument();
    expect(screen.queryByTestId('simulation-chart')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Maximum position weight'), { target: { value: '0.30' } });
    expect(screen.queryByRole('heading', { name: 'Model results' })).not.toBeInTheDocument();
  });
});
