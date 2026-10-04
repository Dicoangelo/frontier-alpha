import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect } from 'vitest';
import { SignalTiming } from './SignalTiming';
import { factorsApi } from '@/api/factors';

vi.mock('@/api/factors', () => ({ factorsApi: { getSaliency: vi.fn() } }));

function setup(symbols: string[]) {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><SignalTiming symbols={symbols} /></QueryClientProvider>);
}

describe('Signal timing controls', () => {
  it('allows selecting holdings beyond the first six', async () => {
    vi.mocked(factorsApi.getSaliency).mockResolvedValue({ symbol: 'AAPL', lookbackDays: 30, factors: [] });
    setup(['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'META', 'AMZN', 'JPM']);
    fireEvent.change(screen.getByLabelText('Signal timing holding'), { target: { value: 'JPM' } });
    await waitFor(() => expect(factorsApi.getSaliency).toHaveBeenCalledWith('JPM'));
    expect(screen.getByLabelText('Signal timing holding')).toHaveValue('JPM');
  });

  it('distinguishes a failed request from missing history and wires retry', async () => {
    vi.mocked(factorsApi.getSaliency).mockRejectedValueOnce(new Error('Temporary network error'));
    setup(['AAPL']);
    await waitFor(() => expect(screen.getByText('Signal timing could not be loaded for AAPL.')).toBeInTheDocument());
    vi.mocked(factorsApi.getSaliency).mockResolvedValueOnce({ symbol: 'AAPL', lookbackDays: 30, factors: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Retry signal timing' }));
    await waitFor(() => expect(factorsApi.getSaliency).toHaveBeenCalledTimes(2));
  });
});
