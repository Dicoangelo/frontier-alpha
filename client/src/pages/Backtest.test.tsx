import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect } from 'vitest';
import { Backtest } from './Backtest';
import { api } from '@/api/client';

vi.mock('@/api/client', () => ({ api: { post: vi.fn() }, getErrorMessage: (error: Error) => error.message }));
vi.mock('@/hooks/useToast', () => ({ useToast: () => ({ toastSuccess: vi.fn(), toastError: vi.fn() }) }));

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><Backtest /></QueryClientProvider>);
}

describe('Backtest input and recovery controls', () => {
  it('keeps invalid date ranges local and leaves configuration editable', () => {
    setup();
    fireEvent.change(screen.getByLabelText('End Date'), { target: { value: '2022-01-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run backtest' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose an end date after the start date.');
    expect(api.post).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Start Date')).toBeEnabled();
  });

  it('rejects zero capital instead of submitting an unusable run', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Initial Capital ($)'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run backtest' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Initial capital must be greater than zero.');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('normalizes tickers, reopens controls on failure, and resets inputs and errors', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new Error('Price history unavailable'));
    setup();
    fireEvent.change(screen.getByLabelText('Symbols (comma-separated)'), { target: { value: 'aapl msft, AAPL' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run backtest' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Price history unavailable'));
    expect(api.post).toHaveBeenCalledWith('/backtest/run', expect.objectContaining({ symbols: ['AAPL', 'MSFT'] }));
    expect(screen.getByLabelText('Symbols (comma-separated)')).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Reset inputs' }));
    expect(screen.getByLabelText('Symbols (comma-separated)')).toHaveValue('AAPL, MSFT, NVDA, GOOGL, AMZN, META, TSLA, JPM');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
