/**
 * US-024: ConvictionTimeline Tests
 * Renders with mock episode data, shows Recharts LineChart
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConvictionTimeline } from './ConvictionTimeline';

// Mock Recharts to avoid rendering in jsdom
vi.mock('recharts', () => ({
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="recharts-line-chart">{children}</div>
  ),
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="recharts-responsive-container">{children}</div>
  ),
}));

vi.mock('@/hooks/useCVRF', () => ({
  useCVRFHistory: vi.fn(),
  useCVRFEpisodes: vi.fn(),
  useCVRFBeliefs: vi.fn(),
}));

import { useCVRFHistory, useCVRFEpisodes, useCVRFBeliefs } from '@/hooks/useCVRF';

const MOCK_HISTORY = [
  {
    timestamp: '2026-01-10T10:00:00Z',
    performanceDelta: 0.05,
    decisionOverlap: 0.7,
    insightsCount: 3,
    beliefUpdatesCount: 2,
    previousEpisodeReturn: 0.03,
    currentEpisodeReturn: 0.05,
    newRegime: 'bull',
  },
  {
    timestamp: '2026-01-20T10:00:00Z',
    performanceDelta: -0.02,
    decisionOverlap: 0.65,
    insightsCount: 2,
    beliefUpdatesCount: 1,
    previousEpisodeReturn: 0.05,
    currentEpisodeReturn: -0.02,
    newRegime: 'bear',
  },
];

const MOCK_BELIEFS = {
  factorWeights: { momentum: 0.3, quality: 0.2, value: -0.1 },
  factorConfidences: { momentum: 0.8, quality: 0.75, value: 0.6 },
  currentRegime: 'bull',
  regimeConfidence: 0.85,
};

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('ConvictionTimeline (US-024)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useCVRFEpisodes as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { completed: [{ episodeNumber: 1 }, { episodeNumber: 2 }] },
      isLoading: false,
    });
    (useCVRFBeliefs as ReturnType<typeof vi.fn>).mockReturnValue({
      data: MOCK_BELIEFS,
      isLoading: false,
    });
  });

  it('renders loading state', () => {
    (useCVRFHistory as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    const { container } = render(<ConvictionTimeline />, { wrapper });
    expect(container.textContent).toContain('Conviction Timeline');
  });

  it('renders empty state when no episodes', () => {
    (useCVRFHistory as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [],
      isLoading: false,
    });
    (useCVRFEpisodes as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { completed: [] },
      isLoading: false,
    });

    render(<ConvictionTimeline />, { wrapper });
    expect(screen.getByText(/No CVRF cycles yet/i)).toBeTruthy();
  });

  it('renders with mock episode data and shows Recharts chart', () => {
    (useCVRFHistory as ReturnType<typeof vi.fn>).mockReturnValue({
      data: MOCK_HISTORY,
      isLoading: false,
    });

    const { getByTestId } = render(<ConvictionTimeline />, { wrapper });

    // Recharts container should be rendered (chart view is default)
    expect(getByTestId('recharts-responsive-container')).toBeTruthy();
    expect(getByTestId('recharts-line-chart')).toBeTruthy();
  });

  it('shows cycle count in header', () => {
    (useCVRFHistory as ReturnType<typeof vi.fn>).mockReturnValue({
      data: MOCK_HISTORY,
      isLoading: false,
    });

    const { container } = render(<ConvictionTimeline />, { wrapper });
    expect(container.textContent).toContain('2 cycles');
  });

  it('renders episode selector dropdown', () => {
    (useCVRFHistory as ReturnType<typeof vi.fn>).mockReturnValue({
      data: MOCK_HISTORY,
      isLoading: false,
    });

    const { container } = render(<ConvictionTimeline />, { wrapper });
    const select = container.querySelector('select');
    expect(select).toBeTruthy();
    // Should have episode options + "All episodes"
    const options = container.querySelectorAll('option');
    expect(options.length).toBeGreaterThanOrEqual(3); // "All" + 2 episodes
  });

  it('renders chart/nodes toggle buttons', () => {
    (useCVRFHistory as ReturnType<typeof vi.fn>).mockReturnValue({
      data: MOCK_HISTORY,
      isLoading: false,
    });

    const { container } = render(<ConvictionTimeline />, { wrapper });
    const text = container.textContent || '';
    expect(text).toContain('Chart');
    expect(text).toContain('Nodes');
  });
});
