import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { PositionList } from './PositionList';
import type { Position } from '@/types';

vi.mock('@tanstack/react-query', () => ({
  useQueries: ({ queries }: { queries: unknown[] }) => queries.map(() => ({ data: null, isLoading: false })),
}));
vi.mock('@/components/shared/ScrollableTable', () => ({ ScrollableTable: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

const positions: Position[] = [
  { symbol: 'AAA', shares: 10, weight: 0.4, costBasis: 110, currentPrice: 100, unrealizedPnL: -100 },
  { symbol: 'BBB', shares: 20, weight: 0.5, costBasis: 90, currentPrice: 100, unrealizedPnL: 200 },
];
const bodyRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);

describe('PositionList', () => {
  it('shows the minus sign on losses and preserves supplied portfolio weights', () => {
    render(<PositionList positions={positions} />);
    expect(screen.getByText('−$100.00')).toBeInTheDocument();
    expect(screen.getByText('+$200.00')).toBeInTheDocument();
    expect(screen.getByText('40.0%')).toBeInTheDocument();
  });

  it('filters symbols case-insensitively and clears the search with Escape', () => {
    render(<PositionList positions={positions} />);
    const search = screen.getByRole('searchbox', { name: 'Search holdings' });
    fireEvent.change(search, { target: { value: 'aa' } });
    expect(bodyRows()).toHaveLength(1);
    expect(bodyRows()[0]).toHaveTextContent('AAA');
    fireEvent.change(search, { target: { value: 'unknown' } });
    expect(screen.getByRole('status')).toHaveTextContent('No holdings match');
    fireEvent.keyDown(search, { key: 'Escape' });
    expect(bodyRows()).toHaveLength(2);
  });

  it('uses real focusable sort buttons, preserves focus, and updates aria-sort and row order', () => {
    render(<PositionList positions={positions} />);
    expect(bodyRows()[0]).toHaveTextContent('BBB');
    const control = screen.getByRole('button', { name: 'Sort by Market value' });
    control.focus();
    fireEvent.click(control);
    expect(control).toHaveFocus();
    expect(control.closest('th')).toHaveAttribute('aria-sort', 'ascending');
    expect(bodyRows()[0]).toHaveTextContent('AAA');
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort holdings' }), { target: { value: 'symbol-desc' } });
    expect(bodyRows()[0]).toHaveTextContent('BBB');
  });
});
