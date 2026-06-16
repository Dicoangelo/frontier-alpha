import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BacktestEmptyState } from './BacktestEmptyState';

describe('<BacktestEmptyState />', () => {
  it('renders the run prompt and the payoff framing', () => {
    render(<BacktestEmptyState />);
    expect(screen.getByText('Run your first walk-forward backtest')).toBeInTheDocument();
    expect(screen.getByTestId('backtest-empty')).toBeInTheDocument();
  });

  it('previews the real result metric labels', () => {
    render(<BacktestEmptyState />);
    for (const label of ['Total Return', 'Annualized', 'Sharpe Ratio', 'Max Drawdown', 'Alpha', 'Duration']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('previews the equity curve surface', () => {
    render(<BacktestEmptyState />);
    expect(screen.getByText('Equity Curve')).toBeInTheDocument();
  });

  it('points the user back to the run controls', () => {
    render(<BacktestEmptyState />);
    expect(screen.getByText('Run Backtest')).toBeInTheDocument();
  });
});
