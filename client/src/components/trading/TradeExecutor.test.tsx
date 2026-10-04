import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { TradeExecutor, TradeExecutorCompact } from './TradeExecutor';

const mocks = vi.hoisted(() => ({ submit: vi.fn(), preview: vi.fn() }));
vi.mock('@/api/client', () => ({ getErrorMessage: (error: Error) => error.message }));
vi.mock('@/hooks/useTrading', () => ({
  useQuote: () => ({ data: { symbol: 'AAPL', last: 100, bid: 99, ask: 101 } }),
  useTrading: () => ({
    account: undefined, brokerConnected: true, brokerType: 'mock', paperTrading: true,
    accountLoading: false, orders: [], ordersLoading: false, isMarketOpen: false,
    refetchOrders: vi.fn(), cancelOrder: { mutate: vi.fn(), isPending: false },
    submitOrder: { mutateAsync: mocks.submit, isPending: false, isError: false },
    orderPreview: { mutateAsync: mocks.preview, isPending: false },
  }),
}));
const preview = {
  symbol: 'AAPL', side: 'buy', type: 'limit', qty: 2, currentPrice: 100, bid: 99, ask: 101,
  estimatedPrice: 100, estimatedCost: 200, estimatedFees: 0, estimatedTotal: 200,
  slippageEstimate: 0, marketImpact: 'low',
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.submit.mockResolvedValue({ order: { id: 'mock-only' } });
  mocks.preview.mockResolvedValue({ preview, validation: { valid: true, errors: [], warnings: [] } });
});

describe('Order ticket interactions (mock broker only)', () => {
  it('sends the selected sell side and fractional quantity from the compact control', async () => {
    render(<TradeExecutorCompact symbol="AAPL" />);
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '0.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sell' }));
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledWith(expect.objectContaining({ side: 'sell', qty: 0.5 })));
  });
  it('keeps a cleared quantity empty and prevents submitting an invalid amount', () => {
    render(<TradeExecutor defaultSymbol="AAPL" />);
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '' } });
    expect(screen.getByLabelText('Quantity')).toHaveValue(null);
    fireEvent.submit(document.querySelector('form')!);
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('quantity greater than zero');
  });
  it('requires limit prices before previewing, and surfaces preview failures', async () => {
    render(<TradeExecutor defaultSymbol="AAPL" />);
    fireEvent.change(screen.getByLabelText('Order Type'), { target: { value: 'limit' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('positive price');
    fireEvent.change(screen.getByLabelText('Limit Price'), { target: { value: '100' } });
    mocks.preview.mockRejectedValueOnce(new Error('Quote service unavailable. Try again.'));
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Quote service unavailable'));
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it('previews every selected term and confirms the same request, keeping errors in the dialog', async () => {
    render(<TradeExecutor defaultSymbol="AAPL" />);
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Order Type'), { target: { value: 'limit' } });
    fireEvent.change(screen.getByLabelText('Limit Price'), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('Time in Force'), { target: { value: 'gtc' } });
    fireEvent.click(screen.getByLabelText('Extended hours trading'));
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    const dialog = await screen.findByRole('dialog', { name: 'Review order' });
    const request = { symbol: 'AAPL', qty: 2, side: 'buy', type: 'limit', timeInForce: 'gtc', extendedHours: true, limitPrice: 100 };
    expect(mocks.preview).toHaveBeenCalledWith(request);
    mocks.submit.mockRejectedValueOnce(new Error('Order rejected by broker'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm Buy' }));
    await waitFor(() => expect(within(dialog).getByRole('alert')).toHaveTextContent('Order rejected by broker'));
    expect(mocks.submit).toHaveBeenCalledWith(request);
    expect(dialog).toBeInTheDocument();
  });
  it('passes edited symbols to the chart selection', () => {
    const onSymbolChange = vi.fn();
    render(<TradeExecutor onSymbolChange={onSymbolChange} />);
    fireEvent.change(screen.getByLabelText('Symbol'), { target: { value: ' msft ' } });
    expect(onSymbolChange).toHaveBeenCalledWith('MSFT');
  });
});
