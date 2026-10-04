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

  it('combines gain/loss filters with symbol search and updates only the shown totals', () => {
    render(<PositionList positions={positions} />);
    fireEvent.click(screen.getByRole('button', { name: 'With losses' }));
    expect(bodyRows()).toHaveLength(1);
    expect(bodyRows()[0]).toHaveTextContent('AAA');
    expect(screen.getByText('Shown value')).toHaveTextContent('$1,000.00');
    expect(screen.getByText('Shown P&L')).toHaveTextContent('−$100.00');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search holdings' }), { target: { value: 'BBB' } });
    expect(bodyRows()).toHaveLength(0);
    expect(screen.getByRole('status')).toHaveTextContent('with this P&L filter');
    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(bodyRows()).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'All holdings' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('searchbox', { name: 'Search holdings' })).toHaveValue('');
  });

  it('changes table density without altering values or the selected sort', () => {
    render(<PositionList positions={positions} />);
    const compact = screen.getByRole('button', { name: 'Compact' });
    fireEvent.click(compact);
    expect(compact).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('region', { name: /Holdings/ })).toHaveClass('holdings-density-compact');
    expect(bodyRows()[0]).toHaveTextContent('BBB');
    expect(bodyRows()).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Comfortable' }));
    expect(compact).toHaveAttribute('aria-pressed', 'false');
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
