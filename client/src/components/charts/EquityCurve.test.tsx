/**
 * Proof-of-test for the equity curve: with no series the chart must render an
 * honest empty state, never numbers. Before this the component silently drew
 * a seeded random walk and reported "+11.22% / +10.34%" for every account.
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
    expect(screen.getByText('+5.00 pp')).toBeInTheDocument(); // difference in percentage points
    expect(screen.getByText(/Not your transaction history/)).toBeInTheDocument();
    expect(screen.queryByTestId('equity-curve-unavailable')).not.toBeInTheDocument();
  });
});


describe('EquityCurve controls', () => {
  const history = [
    point('2024-12-31', 50000, 50000),
    point('2025-12-31', 100000, 90000),
    point('2026-01-02', 110000, 100000),
    point('2026-09-01', 120000, 110000),
    point('2026-09-23', 140000, 115000),
    point('2026-09-30', 150000, 120000),
  ];

  it('shows all supplied history, selects the actual YTD anchor, and changes the requested window', () => {
    render(<EquityCurve portfolioValue={150000} series={history} seriesStatus="ready" timeframe="ALL" />);
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', expect.stringContaining('+200.00%'));
    fireEvent.click(screen.getByRole('button', { name: 'YTD' }));
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', expect.stringContaining('+50.00%'));
    expect(screen.getByRole('button', { name: 'YTD' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: '1W' }));
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', expect.stringContaining('+7.14%'));
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', expect.stringContaining('Sep 23, 2026 to Sep 30, 2026'));
  });

  it('toggles the benchmark line without changing the measured return or comparison', () => {
    const { container } = render(<EquityCurve portfolioValue={150000} series={history} seriesStatus="ready" timeframe="ALL" />);
    const toggle = screen.getByRole('button', { name: 'Show S&P 500 benchmark' });
    expect(container.querySelector('.equity-benchmark')).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(container.querySelector('.equity-benchmark')).not.toBeInTheDocument();
    expect(screen.getByText('+200.00%')).toBeInTheDocument();
    expect(screen.getByText('+60.00 pp')).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(container.querySelector('.equity-benchmark')).toBeInTheDocument();
  });

  it('offers an in-flow chart expansion and an Escape shortcut to restore the layout', () => {
    const onToggleExpand = vi.fn();
    const { rerender } = render(<EquityCurve portfolioValue={150000} series={history} onToggleExpand={onToggleExpand} />);
    const expand = screen.getByRole('button', { name: 'Expand chart' });
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(expand);
    expect(onToggleExpand).toHaveBeenCalledOnce();
    rerender(<EquityCurve portfolioValue={150000} series={history} expanded onToggleExpand={onToggleExpand} />);
    const restore = screen.getByRole('button', { name: 'Restore layout' });
    expect(restore).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(restore.getAttribute('aria-controls')!)).toHaveStyle({ height: '360px' });
    fireEvent.keyDown(restore, { key: 'Escape' });
    expect(onToggleExpand).toHaveBeenCalledTimes(2);
  });

  it('lets a keyboard-accessible date slider inspect real values and resets inspection when the period changes', () => {
    render(<EquityCurve portfolioValue={150000} series={history} seriesStatus="ready" timeframe="ALL" />);
    const slider = screen.getByRole('slider', { name: 'Inspect chart date' });
    fireEvent.change(slider, { target: { value: '0' } });
    expect(slider).toHaveAttribute('aria-valuetext', 'Dec 31, 2024: $50,000');
    fireEvent.click(screen.getByRole('button', { name: '1W' }));
    expect(slider).toHaveAttribute('aria-valuetext', 'Sep 30, 2026: $150,000');
  });
});
