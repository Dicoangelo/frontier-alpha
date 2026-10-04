import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PositionCard } from './PositionCard';

const position = { symbol: 'AAPL', shares: 10, costBasis: 90, currentPrice: 100, unrealizedPnL: 100, weight: .5 };
describe('Position price history', () => {
  it('does not invent a chart when no history is supplied', () => {
    render(<PositionCard position={position} />);
    expect(screen.queryByRole('img', { name: /price sparkline/ })).not.toBeInTheDocument();
    expect(screen.getByText('+$100.00')).toBeInTheDocument();
  });
  it('renders a supplied historical series', () => {
    render(<PositionCard position={{ ...position, history: [90, 95, 100] }} />);
    expect(screen.getByRole('img', { name: 'AAPL recent price sparkline' })).toBeInTheDocument();
  });
});
