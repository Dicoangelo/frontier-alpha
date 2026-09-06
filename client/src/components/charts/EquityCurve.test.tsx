/**
 * Proof-of-test for the equity curve: with no series the chart must render an
 * honest empty state, never numbers. Before this the component silently drew
 * a seeded random walk and reported "+11.22% / +10.34%" for every account.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EquityCurve } from './EquityCurve';

// jsdom has no ResizeObserver; the chart observes its container for sizing.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub;

vi.mock('@/stores/themeStore', () => ({
  useThemeStore: (sel?: (s: { resolved: string }) => unknown) => (sel ? sel({ resolved: 'dark' }) : { resolved: 'dark' }),
}));

const point = (date: string, portfolio: number, benchmark: number) => ({ date, portfolio, benchmark });

describe('EquityCurve', () => {
  it('renders the unavailable state and dashes (no fabricated return) when no series is given', () => {
    render(<EquityCurve portfolioValue={125000} seriesStatus="unavailable" />);
    expect(screen.getByTestId('equity-curve-unavailable')).toBeInTheDocument();
    expect(screen.queryByText(/\d+\.\d{2}%/)).not.toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('prompts to add a position when idle (empty portfolio)', () => {
    render(<EquityCurve portfolioValue={100000} seriesStatus="idle" />);
    expect(screen.getByText(/Add a position/)).toBeInTheDocument();
  });

  it('shows a loading placeholder, not numbers, while history is in flight', () => {
    render(<EquityCurve portfolioValue={100000} seriesStatus="loading" />);
    expect(screen.getByTestId('equity-curve-loading')).toBeInTheDocument();
  });

  it('computes total return and alpha from the real series', () => {
    const series = [
      point('2026-09-01', 100000, 100000),
      point('2026-09-02', 101000, 100500),
      point('2026-09-03', 110000, 105000),
    ];
    render(<EquityCurve portfolioValue={110000} series={series} seriesStatus="ready" />);
    expect(screen.getByText('+10.00%')).toBeInTheDocument(); // total return
    expect(screen.getByText('+5.00%')).toBeInTheDocument(); // alpha vs benchmark
    expect(screen.getByText(/Not your transaction history/)).toBeInTheDocument();
    expect(screen.queryByTestId('equity-curve-unavailable')).not.toBeInTheDocument();
  });
});
