import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PriceChart } from './PriceChart';

describe('Trade quote snapshot', () => {
  it('shows the supplied quote without inventing a trend or price change', () => {
    const { container } = render(<PriceChart symbol="AAPL" currentPrice={125.25} />);
    expect(screen.getByText('$125.25')).toBeInTheDocument();
    expect(container.querySelector('polyline')).toBeNull();
    expect(screen.queryByText(/%$/)).not.toBeInTheDocument();
  });
  it('shows only the percentage change supplied by the quote', () => {
    render(<PriceChart symbol="AAPL" currentPrice={125.25} changePercent={-1.25} />);
    expect(screen.getByText('-1.25%')).toBeInTheDocument();
  });
  it('shows an unavailable state when no quote exists', () => {
    render(<PriceChart symbol="AAPL" />);
    expect(screen.getByText(/No quote is available for AAPL/)).toBeInTheDocument();
    expect(screen.queryByText('$100.00')).not.toBeInTheDocument();
  });
});
