import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BacktestRunningSkeleton } from './BacktestRunningSkeleton';

describe('<BacktestRunningSkeleton />', () => {
  it('announces the running state to assistive tech', () => {
    render(<BacktestRunningSkeleton />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-label', 'Running backtest');
    expect(screen.getByTestId('backtest-running')).toBeInTheDocument();
  });

  it('mirrors the real result metric labels', () => {
    render(<BacktestRunningSkeleton />);
    for (const label of ['Total Return', 'Annualized', 'Sharpe Ratio', 'Max Drawdown', 'Alpha', 'Duration']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});
