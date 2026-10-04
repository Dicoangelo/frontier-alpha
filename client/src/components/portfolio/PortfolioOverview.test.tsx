import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PortfolioOverview } from './PortfolioOverview';

describe('PortfolioOverview', () => {
  it('shows supplied cash and holdings values without inventing daily performance', () => {
    render(<PortfolioOverview portfolio={{ id: 'demo', name: 'Demo', currency: 'USD', cash: 200, totalValue: 1200, positions: [
      { symbol: 'AAA', shares: 10, weight: 0.83, costBasis: 110, currentPrice: 100, unrealizedPnL: -100 },
    ] }} />);
    expect(screen.getByText('$1,200')).toBeInTheDocument();
    expect(screen.getByText('$1,000')).toBeInTheDocument();
    expect(screen.getByText('$200')).toBeInTheDocument();
    expect(screen.getByText('−$100')).toBeInTheDocument();
    expect(screen.getByText('Demo portfolio · USD')).toBeInTheDocument();
    expect(screen.queryByText(/daily change/i)).not.toBeInTheDocument();
  });
});
