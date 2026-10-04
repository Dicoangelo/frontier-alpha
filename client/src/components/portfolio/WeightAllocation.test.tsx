import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { WeightAllocation } from './WeightAllocation';
import type { Position } from '@/types';

vi.mock('@/stores/themeStore', () => ({
  useThemeStore: (select: (state: { resolved: string }) => unknown) => select({ resolved: 'light' }),
}));

const positions: Position[] = [
  { symbol: 'AAA', shares: 10, weight: 0.6, costBasis: 90, currentPrice: 100, unrealizedPnL: 100 },
  { symbol: 'BBB', shares: 5, weight: 0.4, costBasis: 80, currentPrice: 100, unrealizedPnL: 100 },
];

describe('WeightAllocation', () => {
  it('handles an empty portfolio becoming populated and keeps the center count current', () => {
    const { rerender } = render(<WeightAllocation positions={[]} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();

    rerender(<WeightAllocation positions={positions} />);
    expect(within(screen.getByRole('img')).getByText('2')).toBeInTheDocument();

    rerender(<WeightAllocation positions={positions.slice(0, 1)} />);
    const chart = screen.getByRole('img');
    expect(within(chart).getByText('1')).toBeInTheDocument();
    expect(within(chart).getByText('position')).toBeInTheDocument();
  });

  it('keeps the supplied weights and updates hovered values when quotes change', () => {
    const { rerender } = render(<WeightAllocation positions={positions} />);
    fireEvent.mouseEnter(screen.getByLabelText('AAA: 60.0%'));
    expect(within(screen.getByRole('img')).getByText('$1.0k')).toBeInTheDocument();

    rerender(<WeightAllocation positions={positions.map(p => p.symbol === 'AAA' ? { ...p, currentPrice: 120 } : p)} />);
    const chart = screen.getByRole('img');
    expect(within(chart).getByText('$1.2k')).toBeInTheDocument();
    expect(screen.getByLabelText('AAA: 60.0%')).toBeInTheDocument();

    fireEvent.mouseLeave(screen.getByLabelText('AAA: 60.0%'));
    expect(within(chart).getByText('2')).toBeInTheDocument();
  });
  it('labels normalized invested-holdings weights clearly and supports keyboard inspection', () => {
    render(<WeightAllocation positions={positions.map((p, i) => ({ ...p, weight: i === 0 ? 0.4 : 0.5 }))} />);
    expect(screen.getByText('Invested holdings · cash excluded')).toBeInTheDocument();
    expect(screen.getByLabelText('AAA: 44.4%')).toBeInTheDocument();
    fireEvent.focus(screen.getByRole('button', { name: 'Inspect AAA allocation: 44.4% of holdings, $1,000.00' }));
    expect(within(screen.getByRole('img')).getByText('$1.0k')).toBeInTheDocument();
  });

});
