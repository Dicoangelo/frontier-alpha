/**
 * US-025: TradeReasoning Tests
 * 4-step chain-of-thought renders correctly
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { PullToRefresh } from '@/components/shared/PullToRefresh';
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

function Wrapper({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }));
  return <QueryClientProvider client={qc}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>;
}

describe('TradeReasoning (US-025)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when isOpen=false', () => {
    const { container } = render(
      <TradeReasoning symbol="NVDA" isOpen={false} onClose={() => {}} />,
      { wrapper: Wrapper }
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders loading state initially', async () => {
    const { api } = await import('@/api/client');
    (api.get as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {})); // never resolves

    const { container } = render(
      <TradeReasoning symbol="NVDA" isOpen={true} onClose={() => {}} />,
      { wrapper: Wrapper }
    );

    // Header should be visible
    expect(screen.getByRole('dialog', { name: 'Why NVDA?' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Loading illustrative reference');
    expect(container).toBeEmptyDOMElement();
  });

  it('renders 4 chain steps when data loads', async () => {
    const { api } = await import('@/api/client');
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: MOCK_CHAIN });

    const { findAllByTestId } = render(
      <TradeReasoning symbol="NVDA" isOpen={true} onClose={() => {}} />,
      { wrapper: Wrapper }
    );

    const steps = await findAllByTestId(/chain-step-/);
    expect(steps).toHaveLength(4);
  });

  it('renders step titles for all 4 steps', async () => {
    const { api } = await import('@/api/client');
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: MOCK_CHAIN });

    const { findByText } = render(
      <TradeReasoning symbol="NVDA" isOpen={true} onClose={() => {}} />,
      { wrapper: Wrapper }
    );

    expect(await findByText('Factor Signal')).toBeTruthy();
    expect(await findByText('Belief State')).toBeTruthy();
    expect(await findByText('Optimization')).toBeTruthy();
    expect(await screen.findByRole('button', { name: /Step 4 Recommendation/ })).toBeInTheDocument();
  });

  it('steps are collapsed by default', async () => {
    const { api } = await import('@/api/client');
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: MOCK_CHAIN });

    const { findByText, queryByText } = render(
      <TradeReasoning symbol="NVDA" isOpen={true} onClose={() => {}} />,
      { wrapper: Wrapper }
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
      { wrapper: Wrapper }
    );

    // Click step 1
    const step1 = await findByTestId('chain-step-1');
    fireEvent.click(step1.querySelector('button')!);

    // Full explanation should now be visible
    expect(getByText('Factor analysis identifies momentum and quality signals.')).toBeTruthy();
  });

  it('identifies fixed examples and removes recommendation/confidence presentations', async () => {
    const { api } = await import('@/api/client');
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: MOCK_CHAIN });

    const { findByText } = render(
      <TradeReasoning symbol="NVDA" isOpen={true} onClose={() => {}} />,
      { wrapper: Wrapper }
    );

    expect(await findByText('Illustrative reference')).toBeInTheDocument();
    expect(screen.getByText(/fixed examples, not current analysis of NVDA/)).toBeInTheDocument();
    expect(screen.getByText(/No current market evidence or saved holdings/)).toBeInTheDocument();
    expect(screen.queryByText('buy')).not.toBeInTheDocument();
    expect(screen.queryByText('Overall confidence')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Step 1 Factor Signal/ }));
    expect(screen.getByText('Illustrative example — fixed text and figures')).toBeInTheDocument();
    expect(screen.queryByText('Step confidence')).not.toBeInTheDocument();
    expect(screen.queryByText('78%')).not.toBeInTheDocument();
  });

  it('closes from the viewport overlay', () => {
    const onClose = vi.fn();
    render(<TradeReasoning symbol="NVDA" isOpen onClose={onClose} />, { wrapper: Wrapper });
    fireEvent.click(screen.getByRole('dialog').parentElement!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('escapes the transformed PullToRefresh ancestor that clipped the panel', async () => {
    const { api } = await import('@/api/client');
    vi.mocked(api.get).mockResolvedValue({ data: MOCK_CHAIN });
    const { container } = render(
      <div style={{ transform: 'translateX(240px)', overflow: 'hidden', width: 320, height: 200 }}>
        <PullToRefresh onRefresh={async () => {}}><TradeReasoning symbol="NVDA" isOpen onClose={() => {}} /></PullToRefresh>
      </div>, { wrapper: Wrapper },
    );
    const dialog = screen.getByRole('dialog', { name: 'Why NVDA?' });
    expect(container).not.toContainElement(dialog);
    expect(dialog.parentElement?.parentElement).toBe(document.body);
    expect(dialog).toHaveClass('viewport-dialog-panel-full');
    expect(screen.getByTestId('trade-reasoning-scroll-region')).toHaveClass('trade-reasoning-body');
    const lastStep = await screen.findByTestId('chain-step-4');
    fireEvent.click(lastStep.querySelector('button')!);
    expect(screen.getByText('BUY based on combined signal strength.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Done' })).toBeVisible();
  });

  it('keeps keyboard focus inside, closes with Escape, and restores the Why trigger', async () => {
    const { api } = await import('@/api/client');
    vi.mocked(api.get).mockResolvedValue({ data: MOCK_CHAIN });
    function Harness() {
      const [open, setOpen] = useState(false);
      return <><WhyButton symbol="NVDA" onClick={() => setOpen(true)} /><TradeReasoning symbol="NVDA" isOpen={open} onClose={() => setOpen(false)} /></>;
    }
    render(<Harness />, { wrapper: Wrapper });
    const trigger = screen.getByRole('button', { name: 'Explain NVDA reasoning' });
    trigger.focus();
    fireEvent.click(trigger);
    const close = screen.getByRole('button', { name: 'Close trade reasoning' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(screen.getByRole('button', { name: 'Done' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('loads the selected symbol instead of retaining the previous symbol’s reference', async () => {
    const { api } = await import('@/api/client');
    vi.mocked(api.get).mockResolvedValueOnce({ data: { ...MOCK_CHAIN, steps: [{ ...MOCK_CHAIN.steps[0], title: 'NVDA example' }] } })
      .mockResolvedValueOnce({ data: { ...MOCK_CHAIN, symbol: 'AAPL', steps: [{ ...MOCK_CHAIN.steps[0], title: 'AAPL example' }] } });
    const { rerender } = render(<TradeReasoning symbol="NVDA" isOpen onClose={() => {}} />, { wrapper: Wrapper });
    expect(await screen.findByText('NVDA example')).toBeInTheDocument();
    rerender(<TradeReasoning symbol="AAPL" isOpen onClose={() => {}} />);
    expect(await screen.findByText('AAPL example')).toBeInTheDocument();
    expect(screen.queryByText('NVDA example')).not.toBeInTheDocument();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/explain/trade/AAPL'));
  });

  it('closes the reference and opens the separate research form without starting a research run', async () => {
    const { api } = await import('@/api/client');
    vi.mocked(api.get).mockResolvedValue({ data: MOCK_CHAIN });
    const onClose = vi.fn();
    function LocationProbe() { const location = useLocation(); return <output data-testid="location">{location.pathname}{location.search}</output>; }
    render(<><TradeReasoning symbol="NVDA" isOpen onClose={onClose} /><LocationProbe /></>, { wrapper: Wrapper });
    await screen.findByText('Illustrative reference');
    const link = screen.getByRole('link', { name: 'Research with current evidence' });
    const destination = new URL(link.getAttribute('href')!, 'https://example.test');
    expect(destination.pathname).toBe('/research');
    expect(destination.searchParams.get('symbols')).toBe('NVDA');
    expect(destination.searchParams.get('question')).toContain('Review NVDA using available market evidence');
    fireEvent.click(link);
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.getByTestId('location')).toHaveTextContent('/research?');
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith('/explain/trade/NVDA');
  });

});

describe('WhyButton (US-025)', () => {
  it('renders Why? button', () => {
    render(<WhyButton symbol="NVDA" onClick={() => {}} />, { wrapper: Wrapper });
    expect(screen.getByText('Why?')).toBeTruthy();
  });

  it('calls onClick with symbol', () => {
    const onClick = vi.fn();
    render(<WhyButton symbol="NVDA" onClick={onClick} />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText('Why?'));
    expect(onClick).toHaveBeenCalledWith('NVDA');
  });
});
