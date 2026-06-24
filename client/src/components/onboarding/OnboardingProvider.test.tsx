/**
 * Tests for OnboardingProvider's authenticated auto-launch gate (2026-06-23).
 *
 * The app is now public — unauthenticated visitors land directly in the app
 * under the demo banner (see ProtectedRoute). Onboarding (welcome modal +
 * feature tour) must only AUTO-RUN for real signed-in users. A truthy
 * `session` from useAuthStore is the single authenticated-visitor predicate.
 *
 * The contract this file locks in:
 *   1. No session  -> the welcome modal does NOT auto-launch (even after the
 *                     500ms delay timer, on the dashboard route, fresh user).
 *   2. Session      -> the welcome modal DOES auto-launch (existing behavior)
 *                     for a fresh, empty-portfolio user.
 *   3. Manual trigger (startTour) stays ungated — works regardless of session.
 *
 * The auto-launch is timer-driven (500ms setTimeout) and depends on a settled
 * portfolio query returning an empty portfolio, so we mock `portfolioApi`,
 * mock the auth store, and drive the delay with fake timers for determinism.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { OnboardingProvider, useOnboardingContext } from './OnboardingProvider';

// Controllable auth state the provider reads via useAuthStore() (object form).
const authState: { user: unknown; session: unknown; initialized: boolean } = {
  user: null,
  session: null,
  initialized: true,
};

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => authState,
}));

// Empty portfolio -> the "fresh user" branch that auto-opens the welcome modal.
vi.mock('@/api/portfolio', () => ({
  portfolioApi: {
    getPortfolio: vi.fn(() => Promise.resolve({ positions: [] })),
  },
}));

// FeatureTour reaches into the DOM for tour anchors; stub it to a marker so the
// provider's children render cleanly in jsdom.
vi.mock('./FeatureTour', () => ({
  FeatureTour: ({ isActive }: { isActive: boolean }) =>
    isActive ? <div data-testid="feature-tour" /> : null,
}));

const AUTHENTICATED_SESSION = {
  access_token: 'token',
  user: { id: 'u1', email: 'real@user.com' },
};

// Consumer that surfaces the manual trigger for the ungated-path test.
function TourTrigger() {
  const { startTour } = useOnboardingContext();
  return (
    <button onClick={startTour} data-testid="start-tour">
      start
    </button>
  );
}

function renderProvider() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      {/* MemoryRouter defaults to "/", one of the two auto-launch routes. */}
      <MemoryRouter>
        <OnboardingProvider>
          <TourTrigger />
        </OnboardingProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// The welcome modal renders role="dialog" aria-label="Welcome to Frontier Alpha"
// when showWelcome is true — but it hard short-circuits if the persistent
// `frontier:onboarded` localStorage flag is set, so each test starts clean.
function getWelcomeModal() {
  return screen.queryByRole('dialog', { name: /Welcome to Frontier Alpha/i });
}

describe('OnboardingProvider auto-launch gate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    authState.user = null;
    authState.session = null;
    authState.initialized = true;
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('does NOT auto-launch the welcome modal when there is no session', async () => {
    authState.user = null;
    authState.session = null;
    renderProvider();

    // Flush the portfolio query + advance well past the 500ms launch delay.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(getWelcomeModal()).not.toBeInTheDocument();
  });

  it('DOES auto-launch the welcome modal when a session is present', async () => {
    authState.session = AUTHENTICATED_SESSION;
    authState.user = AUTHENTICATED_SESSION.user;
    renderProvider();

    // Pump async cycles so the portfolio query settles, then advance past the
    // 500ms delay timer. (waitFor spins on real timers and would hang here.)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(getWelcomeModal()).toBeInTheDocument();
  });

  it('keeps the manual startTour trigger ungated even with no session', async () => {
    authState.user = null;
    authState.session = null;
    renderProvider();

    // No auto-launch fired (gate holds)...
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.queryByTestId('feature-tour')).not.toBeInTheDocument();

    // ...but the manual trigger still starts the tour (handleStartTour uses a
    // 300ms setTimeout before flipping showTour).
    await act(async () => {
      screen.getByTestId('start-tour').click();
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(screen.getByTestId('feature-tour')).toBeInTheDocument();
  });
});
