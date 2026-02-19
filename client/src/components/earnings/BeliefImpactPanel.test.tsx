/**
 * US-026: BeliefImpactPanel Tests
 * Conviction gauge + historical accuracy + mobile collapse
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BeliefImpactPanel } from './BeliefImpactPanel';

vi.mock('@/hooks/useCVRF', () => ({
  useCVRFBeliefs: vi.fn(),
}));

import { useCVRFBeliefs } from '@/hooks/useCVRF';

const MOCK_BELIEFS = {
  currentRegime: 'bull',
  regimeConfidence: 0.82,
  factorWeights: {
    roe: 0.6,
    roa: 0.55,
    gross_margin: 0.7,
    net_margin: 0.65,
    revenue_growth: 0.5,
    earnings_momentum: 0.48,
    quality: 0.72,
    momentum_12m: 0.44,
    value: 0.35,
  },
  factorConfidences: {
    roe: 0.78,
    roa: 0.72,
    gross_margin: 0.81,
    net_margin: 0.68,
    revenue_growth: 0.55,
    earnings_momentum: 0.62,
    quality: 0.75,
    momentum_12m: 0.49,
    value: 0.41,
  },
};

const MOCK_EARNINGS = [
  {
    id: 'earn-1',
    symbol: 'NVDA',
    companyName: 'NVIDIA Corporation',
    reportDate: new Date('2026-02-20'),
    reportTime: 'post_market' as const,
    expectedMove: 0.07,
    fiscalQuarter: 'Q4',
    status: 'upcoming' as const,
    daysUntil: 2,
    recommendation: 'hold' as const,
    explanation: 'Strong momentum expected.',
  },
  {
    id: 'earn-2',
    symbol: 'AAPL',
    companyName: 'Apple Inc.',
    reportDate: new Date('2026-02-22'),
    reportTime: 'post_market' as const,
    expectedMove: 0.04,
    fiscalQuarter: 'Q1',
    status: 'upcoming' as const,
    daysUntil: 4,
    recommendation: 'hold' as const,
    explanation: 'Moderate impact expected.',
  },
];

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('BeliefImpactPanel (US-026)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useCVRFBeliefs as ReturnType<typeof vi.fn>).mockReturnValue({
      data: MOCK_BELIEFS,
      isLoading: false,
    });
  });

  it('shows no-history fallback when no symbol selected', () => {
    render(
      <BeliefImpactPanel earnings={MOCK_EARNINGS} selectedSymbol={null} />,
      { wrapper }
    );
    expect(screen.getByText(/No belief history/)).toBeTruthy();
    expect(screen.getByText(/record decisions to build conviction/)).toBeTruthy();
  });

  it('shows no-history fallback when beliefs are unavailable', () => {
    (useCVRFBeliefs as ReturnType<typeof vi.fn>).mockReturnValue({
      data: null,
      isLoading: false,
    });
    render(
      <BeliefImpactPanel earnings={MOCK_EARNINGS} selectedSymbol="NVDA" />,
      { wrapper }
    );
    expect(screen.getByText(/No belief history/)).toBeTruthy();
  });

  it('renders loading spinner while beliefs load', () => {
    (useCVRFBeliefs as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined,
      isLoading: true,
    });
    const { container } = render(
      <BeliefImpactPanel earnings={MOCK_EARNINGS} selectedSymbol="NVDA" />,
      { wrapper }
    );
    // Spinner should be rendered (no factor list)
    expect(container.querySelector('svg')).toBeTruthy();
    expect(screen.queryByText('Roe')).toBeNull();
  });

  it('renders conviction gauge SVG for selected symbol with beliefs', () => {
    const { container } = render(
      <BeliefImpactPanel earnings={MOCK_EARNINGS} selectedSymbol="NVDA" />,
      { wrapper }
    );
    // ConvictionGauge renders an SVG with aria-label
    const gauge = container.querySelector('svg[aria-label^="Conviction gauge"]');
    expect(gauge).toBeTruthy();
  });

  it('shows regime confidence as historical accuracy metric', () => {
    render(
      <BeliefImpactPanel earnings={MOCK_EARNINGS} selectedSymbol="NVDA" />,
      { wrapper }
    );
    // Regime accuracy 82%
    expect(screen.getByText('82%')).toBeTruthy();
  });

  it('shows earnings impact header with expected move', () => {
    render(
      <BeliefImpactPanel earnings={MOCK_EARNINGS} selectedSymbol="NVDA" />,
      { wrapper }
    );
    expect(screen.getByText('NVDA Earnings Impact')).toBeTruthy();
    expect(screen.getByText(/Expected move: ±7\.0%/)).toBeTruthy();
  });

  it('shows regime badge in header', () => {
    render(
      <BeliefImpactPanel earnings={MOCK_EARNINGS} selectedSymbol="NVDA" />,
      { wrapper }
    );
    expect(screen.getByText(/bull \(82%\)/i)).toBeTruthy();
  });

  it('renders factor impact rows', () => {
    render(
      <BeliefImpactPanel earnings={MOCK_EARNINGS} selectedSymbol="NVDA" />,
      { wrapper }
    );
    // At least one factor should show
    expect(screen.getByText('Roe')).toBeTruthy();
  });

  it('shows high volatility warning for large expected moves', () => {
    const highVolEarnings = [
      { ...MOCK_EARNINGS[0], expectedMove: 0.12 },
      ...MOCK_EARNINGS.slice(1),
    ];
    render(
      <BeliefImpactPanel earnings={highVolEarnings} selectedSymbol="NVDA" />,
      { wrapper }
    );
    expect(screen.getByText(/High volatility expected/)).toBeTruthy();
  });

  it('shows factor conviction text in gauge section', () => {
    render(
      <BeliefImpactPanel earnings={MOCK_EARNINGS} selectedSymbol="NVDA" />,
      { wrapper }
    );
    expect(screen.getByText('Factor Conviction')).toBeTruthy();
  });
});
