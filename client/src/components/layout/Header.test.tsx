/**
 * Tests for Header's live index-quote tile (2026-06-23).
 *
 * `useHeaderQuote()` calls `GET /api/v1/quotes/SPY` through the shared axios
 * client (which unwraps to the JSON body, so `api.get` resolves to the
 * endpoint's `{ data: HeaderQuote }`). The tile renders only while LOADING or
 * when a real quote is present; on a failed/empty fetch it renders NOTHING —
 * no dead "—" placeholder.
 *
 * The contract this file locks in:
 *   1. Valid SPY payload  -> "SPY" + price + change%, colored up/down.
 *   2. select() returns null (no `data`) -> tile gone, no dead dash.
 *   3. Query errors        -> tile gone, no dead dash.
 *   4. In-flight           -> tile shows the "Loading" placeholder (not a dash).
 *
 * Header also mounts AlertDropdown (reads the auth store + api) so both
 * `@/api/client` and `@/stores/authStore` are mocked, and the component is
 * wrapped in the providers it needs (QueryClientProvider + MemoryRouter for
 * its <Link>s).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { Header } from './Header';

// Mock the shared axios client. Header's quote query and AlertDropdown's
// alerts query both go through `api.get`.
vi.mock('@/api/client', () => ({
  api: {
    get: vi.fn(),
  },
  getErrorMessage: vi.fn(() => 'An error occurred'),
}));

// AlertDropdown reads `useAuthStore()` (object destructure).
vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ user: null, session: null }),
}));

// themeStore calls `window.matchMedia(...)` at module top-level, which runs at
// import time — before the test-setup `beforeAll` installs the matchMedia
// polyfill. Mock the store to a stable toggle so the real module never loads.
vi.mock('@/stores/themeStore', () => ({
  useThemeStore: () => ({ resolved: 'dark', toggle: vi.fn() }),
}));

const VALID_QUOTE = {
  symbol: 'SPY',
  last: 612.34,
  change: 4.21,
  changePercent: 0.69,
};

const VALID_QUOTE_DOWN = {
  symbol: 'SPY',
  last: 598.1,
  change: -7.5,
  changePercent: -1.24,
};

function renderHeader() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// The header quote tile is the role="status" region whose accessible name
// references the SPY symbol (the "Live connection active" status is separate).
function getQuoteTile(): HTMLElement | null {
  const statuses = screen.queryAllByRole('status');
  return (
    statuses.find((el) =>
      /SPY|Loading SPY/i.test(el.getAttribute('aria-label') ?? '')
    ) ?? null
  );
}

async function mockGet(impl: (url: string) => unknown) {
  const { api } = await import('@/api/client');
  (api.get as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
    if (url.startsWith('/quotes/')) return impl(url);
    // AlertDropdown's /alerts query — keep it benign.
    return Promise.resolve({ data: [] });
  });
}

describe('Header quote tile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders SPY, price, and a positive change% in the up color on a valid payload', async () => {
    await mockGet(() => Promise.resolve({ data: VALID_QUOTE }));
    renderHeader();

    // Price appears once the query resolves.
    expect(await screen.findByText('612.34')).toBeInTheDocument();

    const tile = getQuoteTile();
    expect(tile).not.toBeNull();
    expect(tile!).toHaveTextContent('SPY');
    expect(tile!).toHaveTextContent('612.34');

    // Positive change is prefixed "+" and colored with --color-positive.
    const change = screen.getByText('+0.69%');
    expect(change).toBeInTheDocument();
    expect(change).toHaveStyle({ color: 'var(--color-positive)' });
  });

  it('colors a negative change% with the down color and no "+" prefix', async () => {
    await mockGet(() => Promise.resolve({ data: VALID_QUOTE_DOWN }));
    renderHeader();

    const change = await screen.findByText('-1.24%');
    expect(change).toBeInTheDocument();
    expect(change).toHaveStyle({ color: 'var(--color-negative)' });
    // No erroneous "+" on a down move.
    expect(screen.queryByText('+-1.24%')).not.toBeInTheDocument();
  });

  it('renders nothing (no dead "—") when the quote payload is empty/null', async () => {
    // No `data` field -> select() returns null -> tile must not render.
    await mockGet(() => Promise.resolve({ data: undefined }));
    renderHeader();

    // Let the query settle; the tile should never appear.
    await waitFor(() => {
      expect(getQuoteTile()).toBeNull();
    });
    expect(screen.queryByText('—')).not.toBeInTheDocument();
    // The unrelated "Live" connection status still renders, proving the
    // header mounted and only the quote tile was suppressed.
    expect(screen.getByLabelText('Live connection active')).toBeInTheDocument();
  });

  it('renders nothing (no dead "—") when the quote query errors', async () => {
    await mockGet(() => Promise.reject(new Error('upstream 429')));
    renderHeader();

    // The test QueryClient sets retry:false and the query no longer overrides
    // it, so the failing query settles to error immediately and the tile is
    // suppressed without waiting on a retry backoff.
    await waitFor(() => {
      expect(getQuoteTile()).toBeNull();
    });
    expect(screen.queryByText('—')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Live connection active')).toBeInTheDocument();
  });

  it('shows the "Loading" placeholder (not a dash) while the quote is in flight', async () => {
    // A never-resolving promise keeps the query in its loading state.
    await mockGet(() => new Promise(() => {}));
    renderHeader();

    const tile = await waitFor(() => {
      const t = getQuoteTile();
      expect(t).not.toBeNull();
      return t!;
    });
    expect(tile).toHaveTextContent('SPY');
    expect(tile).toHaveTextContent('Loading');
    expect(tile).not.toHaveTextContent('—');
  });
});
