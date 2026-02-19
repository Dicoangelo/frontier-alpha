/**
 * Tests for loading skeleton and empty/error states (US-017)
 *
 * Verifies that SkeletonDashboard renders on loading,
 * DataLoadError shows retry button on error,
 * and EmptyPortfolio shows CTA when there are no positions.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  SkeletonDashboard,
  SkeletonPortfolioPage,
  SkeletonCard,
  SkeletonPositionList,
  SkeletonRiskMetrics,
  SkeletonChart,
} from './Skeleton';
import { DataLoadError, EmptyPortfolio, NetworkError } from './EmptyState';

describe('SkeletonDashboard', () => {
  it('renders without crashing', () => {
    const { container } = render(<SkeletonDashboard />);
    expect(container.firstChild).not.toBeNull();
  });

  it('renders with fade-in animation class', () => {
    const { container } = render(<SkeletonDashboard />);
    const el = container.querySelector('.animate-fade-in');
    expect(el).not.toBeNull();
  });

  it('renders multiple skeleton sections', () => {
    const { container } = render(<SkeletonDashboard />);
    const spacer = container.querySelector('.space-y-6');
    expect(spacer).not.toBeNull();
    expect(spacer!.children.length).toBeGreaterThanOrEqual(3);
  });
});

describe('SkeletonPortfolioPage', () => {
  it('renders without crashing', () => {
    const { container } = render(<SkeletonPortfolioPage />);
    expect(container.firstChild).not.toBeNull();
  });

  it('renders a skeleton table structure', () => {
    const { container } = render(<SkeletonPortfolioPage />);
    const table = container.querySelector('table');
    expect(table).not.toBeNull();
  });

  it('renders skeleton stat cards', () => {
    const { container } = render(<SkeletonPortfolioPage />);
    const grid = container.querySelector('.grid');
    expect(grid).not.toBeNull();
  });
});

describe('SkeletonCard', () => {
  it('renders without crashing', () => {
    const { container } = render(<SkeletonCard />);
    expect(container.firstChild).not.toBeNull();
  });

  it('accepts optional className', () => {
    const { container } = render(<SkeletonCard className="custom-class" />);
    const el = container.querySelector('.custom-class');
    expect(el).not.toBeNull();
  });
});

describe('SkeletonPositionList', () => {
  it('renders 5 skeleton rows', () => {
    const { container } = render(<SkeletonPositionList />);
    const rows = container.querySelectorAll('.border-b');
    expect(rows.length).toBe(5);
  });
});

describe('SkeletonRiskMetrics', () => {
  it('renders 6 metric cells', () => {
    const { container } = render(<SkeletonRiskMetrics />);
    const cells = container.querySelectorAll('.p-3');
    expect(cells.length).toBe(6);
  });
});

describe('SkeletonChart', () => {
  it('renders without crashing', () => {
    const { container } = render(<SkeletonChart />);
    expect(container.firstChild).not.toBeNull();
  });
});

describe('DataLoadError', () => {
  it('renders the error title', () => {
    render(<DataLoadError onRetry={vi.fn()} />);
    expect(screen.getByText("Couldn't load data")).toBeTruthy();
  });

  it('renders a Retry button', () => {
    render(<DataLoadError onRetry={vi.fn()} />);
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy();
  });

  it('calls onRetry when retry button is clicked', () => {
    const onRetry = vi.fn();
    render(<DataLoadError onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows custom error message when provided', () => {
    render(<DataLoadError onRetry={vi.fn()} error="Custom error message" />);
    expect(screen.getByText('Custom error message')).toBeTruthy();
  });

  it('shows default message when no error prop', () => {
    render(<DataLoadError onRetry={vi.fn()} />);
    expect(screen.getByText(/something went wrong/i)).toBeTruthy();
  });
});

describe('NetworkError', () => {
  it('renders connection issue title', () => {
    render(<NetworkError onRetry={vi.fn()} />);
    expect(screen.getByText('Connection issue')).toBeTruthy();
  });

  it('renders retry button and calls onRetry on click', () => {
    const onRetry = vi.fn();
    render(<NetworkError onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('EmptyPortfolio', () => {
  it('renders no positions message', () => {
    render(<EmptyPortfolio onAddPosition={vi.fn()} />);
    expect(screen.getByText('No positions yet')).toBeTruthy();
  });

  it('renders Add Position CTA button', () => {
    render(<EmptyPortfolio onAddPosition={vi.fn()} />);
    expect(screen.getByRole('button', { name: /add position/i })).toBeTruthy();
  });

  it('calls onAddPosition when CTA is clicked', () => {
    const onAdd = vi.fn();
    render(<EmptyPortfolio onAddPosition={onAdd} />);
    fireEvent.click(screen.getByRole('button', { name: /add position/i }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('renders Try Demo Portfolio secondary action', () => {
    render(<EmptyPortfolio onAddPosition={vi.fn()} />);
    expect(screen.getByRole('button', { name: /try demo/i })).toBeTruthy();
  });
});
