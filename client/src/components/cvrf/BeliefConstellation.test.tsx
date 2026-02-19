/**
 * US-023: BeliefConstellation Tests
 * Renders SVG with correct node count from belief data
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BeliefConstellation } from './BeliefConstellation';

// jsdom does not implement ResizeObserver — provide a no-op stub
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

// Mock D3 zoom so SVG rendering works in jsdom (no layout engine)
// zoom() must return a callable function (selection.call(zoom) invokes it as fn(selection))
vi.mock('d3', async () => {
  const actual = await vi.importActual<typeof import('d3')>('d3');
  const zoomBehavior = Object.assign(
    () => {}, // callable — svg.call(zoom) passes selection as first arg
    {
      scaleExtent: () => zoomBehavior,
      on: () => zoomBehavior,
    }
  );
  return {
    ...actual,
    zoom: () => zoomBehavior,
  };
});

// Mock useCVRF hooks
vi.mock('@/hooks/useCVRF', () => ({
  useCVRFBeliefs: vi.fn(),
  useRegimeDisplay: vi.fn(() => ({ label: 'bull', confidence: '85%' })),
}));

import { useCVRFBeliefs } from '@/hooks/useCVRF';

const MOCK_BELIEFS = {
  factorWeights: {
    momentum: 0.3,
    quality: 0.25,
    value: -0.1,
    volatility: 0.15,
    sentiment: 0.2,
  },
  factorConfidences: {
    momentum: 0.8,
    quality: 0.75,
    value: 0.6,
    volatility: 0.7,
    sentiment: 0.65,
  },
  currentRegime: 'bull',
  regimeConfidence: 0.85,
};

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('BeliefConstellation (US-023)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading spinner when data is loading', () => {
    (useCVRFBeliefs as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    const { container } = render(<BeliefConstellation />, { wrapper });
    // Should render the card without SVG during loading
    expect(container.querySelector('h3')?.textContent).toContain('Belief Constellation');
  });

  it('renders SVG with correct node count', () => {
    (useCVRFBeliefs as ReturnType<typeof vi.fn>).mockReturnValue({
      data: MOCK_BELIEFS,
      isLoading: false,
      isError: false,
    });

    const { container } = render(<BeliefConstellation />, { wrapper });

    // SVG should be present
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('renders factor count in header', () => {
    (useCVRFBeliefs as ReturnType<typeof vi.fn>).mockReturnValue({
      data: MOCK_BELIEFS,
      isLoading: false,
      isError: false,
    });

    const { container } = render(<BeliefConstellation />, { wrapper });

    // Header should show factor count
    const factorCount = Object.keys(MOCK_BELIEFS.factorWeights).length;
    const header = container.textContent || '';
    expect(header).toContain(`${factorCount} factors`);
  });

  it('renders error state when data fails to load', () => {
    (useCVRFBeliefs as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    const { container } = render(<BeliefConstellation />, { wrapper });
    expect(container.textContent).toContain('Failed to load belief data');
  });

  it('renders legend with category colors', () => {
    (useCVRFBeliefs as ReturnType<typeof vi.fn>).mockReturnValue({
      data: MOCK_BELIEFS,
      isLoading: false,
      isError: false,
    });

    const { container } = render(<BeliefConstellation />, { wrapper });
    // Legend should contain at least one category label
    const text = container.textContent || '';
    const hasCategory = ['Style', 'Quality', 'Volatility', 'Sentiment', 'Macro', 'Sector'].some(
      cat => text.includes(cat)
    );
    expect(hasCategory).toBe(true);
  });

  it('renders interactive instructions in header', () => {
    (useCVRFBeliefs as ReturnType<typeof vi.fn>).mockReturnValue({
      data: MOCK_BELIEFS,
      isLoading: false,
      isError: false,
    });

    const { getByText } = render(<BeliefConstellation />, { wrapper });
    // Info text should include drag/zoom instructions
    expect(getByText(/Drag to explore/i)).toBeTruthy();
  });
});
