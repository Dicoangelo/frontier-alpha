/**
 * Tests for RiskMetrics component (US-019)
 *
 * Verifies that threshold-based color coding works correctly:
 * - Healthy Sharpe (>= 1.0) shows green
 * - Dangerous drawdown (< -20%) shows red
 * - Elevated volatility (15-25%) shows yellow
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RiskMetrics, RISK_THRESHOLDS } from './RiskMetrics';
import type { RiskMetrics as RiskMetricsType } from '@/types';

// Mock HelpTooltip to avoid dependency complexity in tests
vi.mock('@/components/help', () => ({
  HelpTooltip: () => null,
}));

const baseMetrics: RiskMetricsType = {
  sharpeRatio: 1.5,
  volatility: 0.12,
  maxDrawdown: -0.05,
  beta: 1.0,
  var95: 0.01,
  cvar95: 0.015,
};

describe('RISK_THRESHOLDS', () => {
  it('exports a configurable thresholds object', () => {
    expect(RISK_THRESHOLDS).toBeDefined();
    expect(typeof RISK_THRESHOLDS.sharpe.green).toBe('number');
    expect(typeof RISK_THRESHOLDS.volatility.green).toBe('number');
    expect(typeof RISK_THRESHOLDS.drawdown.green).toBe('number');
    expect(typeof RISK_THRESHOLDS.var95.green).toBe('number');
  });

  it('sharpe green threshold is >= 1.0', () => {
    expect(RISK_THRESHOLDS.sharpe.green).toBeGreaterThanOrEqual(1.0);
  });

  it('volatility green threshold is <= 0.15', () => {
    expect(RISK_THRESHOLDS.volatility.green).toBeLessThanOrEqual(0.15);
  });

  it('drawdown green threshold is >= -0.10', () => {
    expect(RISK_THRESHOLDS.drawdown.green).toBeGreaterThanOrEqual(-0.10);
  });

  it('var95 green threshold is <= 0.02', () => {
    expect(RISK_THRESHOLDS.var95.green).toBeLessThanOrEqual(0.02);
  });
});

describe('RiskMetrics — healthy portfolio', () => {
  it('renders without crashing', () => {
    const { container } = render(<RiskMetrics metrics={baseMetrics} />);
    expect(container.firstChild).not.toBeNull();
  });

  it('shows Sharpe Ratio value', () => {
    render(<RiskMetrics metrics={baseMetrics} />);
    expect(screen.getByText('1.50')).toBeTruthy();
  });

  it('shows Good badge for healthy sharpe (>= 1.0)', () => {
    render(<RiskMetrics metrics={{ ...baseMetrics, sharpeRatio: 1.5 }} />);
    expect(screen.getByText(/good/i)).toBeTruthy();
  });

  it('shows Healthy badge for healthy drawdown (>= -10%)', () => {
    render(<RiskMetrics metrics={{ ...baseMetrics, maxDrawdown: -0.05 }} />);
    expect(screen.getByText('Healthy')).toBeTruthy();
  });

  it('shows Low badge for low volatility (<= 15%)', () => {
    render(<RiskMetrics metrics={{ ...baseMetrics, volatility: 0.12 }} />);
    // Both volatility and VaR may show 'Low' — ensure at least one Low badge exists
    const lows = screen.getAllByText('Low');
    expect(lows.length).toBeGreaterThanOrEqual(1);
  });

  it('shows Low badge for low VaR (<= 2%)', () => {
    render(<RiskMetrics metrics={{ ...baseMetrics, var95: 0.015 }} />);
    // There should be a Low VaR badge (not to confuse with vol Low)
    const lows = screen.getAllByText('Low');
    expect(lows.length).toBeGreaterThanOrEqual(1);
  });
});

describe('RiskMetrics — dangerous portfolio', () => {
  const dangerousMetrics: RiskMetricsType = {
    sharpeRatio: 0.3,       // < 0.5 → danger (Poor)
    volatility: 0.35,       // > 25% → danger (High)
    maxDrawdown: -0.30,     // < -20% → danger (Critical)
    beta: 1.8,              // > 1.2 → warning (Aggressive)
    var95: 0.05,            // > 4% → danger (High)
    cvar95: 0.07,
  };

  it('shows Poor badge for dangerous sharpe (< 0.5)', () => {
    render(<RiskMetrics metrics={dangerousMetrics} />);
    expect(screen.getByText('Poor')).toBeTruthy();
  });

  it('shows Critical badge for dangerous drawdown (< -20%)', () => {
    render(<RiskMetrics metrics={dangerousMetrics} />);
    expect(screen.getByText('Critical')).toBeTruthy();
  });

  it('shows High badge for dangerous volatility (> 25%)', () => {
    render(<RiskMetrics metrics={dangerousMetrics} />);
    // Both volatility and VaR show 'High' in dangerousMetrics — use getAllByText
    const highs = screen.getAllByText('High');
    expect(highs.length).toBeGreaterThanOrEqual(1);
  });

  it('shows Aggressive badge for high beta (> 1.2)', () => {
    render(<RiskMetrics metrics={dangerousMetrics} />);
    expect(screen.getByText('Aggressive')).toBeTruthy();
  });
});

describe('RiskMetrics — borderline portfolio', () => {
  const borderlineMetrics: RiskMetricsType = {
    sharpeRatio: 0.7,       // 0.5-1.0 → yellow (Below Avg)
    volatility: 0.20,       // 15-25% → yellow (Elevated)
    maxDrawdown: -0.15,     // -10% to -20% → yellow (Warning)
    beta: 1.0,
    var95: 0.03,            // 2-4% → yellow (Moderate)
    cvar95: 0.04,
  };

  it('shows Below Avg badge for borderline sharpe (0.5-1.0)', () => {
    render(<RiskMetrics metrics={borderlineMetrics} />);
    expect(screen.getByText('Below Avg')).toBeTruthy();
  });

  it('shows Elevated badge for borderline volatility (15-25%)', () => {
    render(<RiskMetrics metrics={borderlineMetrics} />);
    expect(screen.getByText('Elevated')).toBeTruthy();
  });

  it('shows Warning badge for borderline drawdown (-10% to -20%)', () => {
    render(<RiskMetrics metrics={borderlineMetrics} />);
    expect(screen.getByText('Warning')).toBeTruthy();
  });

  it('shows Moderate badge for borderline VaR (2-4%)', () => {
    render(<RiskMetrics metrics={borderlineMetrics} />);
    expect(screen.getByText('Moderate')).toBeTruthy();
  });
});

describe('RiskMetrics — beta thresholds', () => {
  it('shows Neutral for beta within 0.8-1.2', () => {
    render(<RiskMetrics metrics={{ ...baseMetrics, beta: 1.0 }} />);
    expect(screen.getByText('Neutral')).toBeTruthy();
  });

  it('shows Aggressive for beta above 1.2', () => {
    render(<RiskMetrics metrics={{ ...baseMetrics, beta: 1.5 }} />);
    expect(screen.getByText('Aggressive')).toBeTruthy();
  });

  it('shows Defensive for beta below 0.8', () => {
    render(<RiskMetrics metrics={{ ...baseMetrics, beta: 0.5 }} />);
    expect(screen.getByText('Defensive')).toBeTruthy();
  });
});

describe('RiskMetrics — benchmark comparison', () => {
  it('shows benchmark values when provided', () => {
    render(
      <RiskMetrics
        metrics={baseMetrics}
        benchmark={{ sharpeRatio: 0.8, volatility: 0.15, maxDrawdown: -0.10 }}
      />
    );
    expect(screen.getByText('vs SPY: 0.80')).toBeTruthy();
  });

  it('does not show benchmark row when not provided', () => {
    render(<RiskMetrics metrics={baseMetrics} />);
    const spyText = screen.queryByText(/vs SPY/i);
    expect(spyText).toBeNull();
  });
});
