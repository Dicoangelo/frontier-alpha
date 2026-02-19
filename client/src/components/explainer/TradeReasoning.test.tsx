/**
 * US-025: TradeReasoning Tests
 * 4-step chain-of-thought renders correctly
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TradeReasoning, WhyButton } from './TradeReasoning';

// Mock the API client
vi.mock('@/api/client', () => ({
  api: {
    get: vi.fn(),
  },
  getErrorMessage: vi.fn(() => 'An error occurred'),
}));

const MOCK_CHAIN = {
  symbol: 'NVDA',
  recommendation: 'buy' as const,
  overallConfidence: 0.77,
  steps: [
    {
      step: 1 as const,
      title: 'Factor Signal',
      explanation: 'Factor analysis identifies momentum and quality signals.',
      confidence: 0.78,
      dataPoints: ['Momentum: above median', 'Quality: 72nd percentile'],
    },
    {
      step: 2 as const,
      title: 'Belief State',
      explanation: 'CVRF belief state shows bullish conviction.',
      confidence: 0.72,
      dataPoints: ['CVRF regime: bull (82%)', 'Quality conviction: 0.75'],
    },
    {
      step: 3 as const,
      title: 'Optimization',
      explanation: 'Optimizer ran Monte Carlo simulations.',
      confidence: 0.81,
      dataPoints: ['Optimal weight: 3.5%', 'Sharpe contribution: +0.08'],
    },
    {
      step: 4 as const,
      title: 'Recommendation',
      explanation: 'BUY based on combined signal strength.',
      confidence: 0.77,
      dataPoints: ['Action: BUY', 'Stop-loss: -8%'],
    },
  ],
  generatedAt: '2026-02-18T12:00:00Z',
  cached: false,
};

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('TradeReasoning (US-025)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when isOpen=false', () => {
    const { container } = render(
      <TradeReasoning symbol="NVDA" isOpen={false} onClose={() => {}} />,
      { wrapper }
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders loading state initially', async () => {
    const { api } = await import('@/api/client');
    (api.get as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {})); // never resolves

    const { container } = render(
      <TradeReasoning symbol="NVDA" isOpen={true} onClose={() => {}} />,
      { wrapper }
    );

    // Header should be visible
    expect(container.textContent).toContain('Why NVDA?');
    expect(container.textContent).toContain('chain-of-thought');
  });

  it('renders 4 chain steps when data loads', async () => {
    const { api } = await import('@/api/client');
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: MOCK_CHAIN });

    const { findAllByTestId } = render(
      <TradeReasoning symbol="NVDA" isOpen={true} onClose={() => {}} />,
      { wrapper }
    );

    const steps = await findAllByTestId(/chain-step-/);
    expect(steps).toHaveLength(4);
  });

  it('renders step titles for all 4 steps', async () => {
    const { api } = await import('@/api/client');
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: MOCK_CHAIN });

    const { findByText } = render(
      <TradeReasoning symbol="NVDA" isOpen={true} onClose={() => {}} />,
      { wrapper }
    );

    expect(await findByText('Factor Signal')).toBeTruthy();
    expect(await findByText('Belief State')).toBeTruthy();
    expect(await findByText('Optimization')).toBeTruthy();
    expect(await findByText('Recommendation')).toBeTruthy();
  });

  it('steps are collapsed by default', async () => {
    const { api } = await import('@/api/client');
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: MOCK_CHAIN });

    const { findByText, queryByText } = render(
      <TradeReasoning symbol="NVDA" isOpen={true} onClose={() => {}} />,
      { wrapper }
    );

    // Wait for data to render
    await findByText('Factor Signal');

    // Full explanation text should not be visible (collapsed)
    expect(queryByText('Factor analysis identifies momentum and quality signals.')).toBeNull();
  });

  it('expands step on click', async () => {
    const { api } = await import('@/api/client');
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: MOCK_CHAIN });

    const { findByTestId, getByText } = render(
      <TradeReasoning symbol="NVDA" isOpen={true} onClose={() => {}} />,
      { wrapper }
    );

    // Click step 1
    const step1 = await findByTestId('chain-step-1');
    fireEvent.click(step1.querySelector('button')!);

    // Full explanation should now be visible
    expect(getByText('Factor analysis identifies momentum and quality signals.')).toBeTruthy();
  });

  it('renders recommendation badge', async () => {
    const { api } = await import('@/api/client');
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: MOCK_CHAIN });

    const { findByText } = render(
      <TradeReasoning symbol="NVDA" isOpen={true} onClose={() => {}} />,
      { wrapper }
    );

    expect(await findByText('buy')).toBeTruthy();
  });

  it('closes when backdrop clicked', () => {
    const onClose = vi.fn();
    const { container } = render(
      <TradeReasoning symbol="NVDA" isOpen={true} onClose={onClose} />,
      { wrapper }
    );

    const backdrop = container.querySelector('.fixed.inset-0.bg-black\\/50');
    if (backdrop) {
      fireEvent.click(backdrop);
      expect(onClose).toHaveBeenCalled();
    }
  });
});

describe('WhyButton (US-025)', () => {
  it('renders Why? button', () => {
    render(<WhyButton symbol="NVDA" onClick={() => {}} />, { wrapper });
    expect(screen.getByText('Why?')).toBeTruthy();
  });

  it('calls onClick with symbol', () => {
    const onClick = vi.fn();
    render(<WhyButton symbol="NVDA" onClick={onClick} />, { wrapper });
    fireEvent.click(screen.getByText('Why?'));
    expect(onClick).toHaveBeenCalledWith('NVDA');
  });
});
