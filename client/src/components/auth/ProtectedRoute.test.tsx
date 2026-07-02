/**
 * Tests for ProtectedRoute — locks in the OPEN FRONT DOOR contract (2026-06-23).
 *
 * The three auth-lifecycle states the component branches on:
 *   1. !isReady              -> spinner only, NO children, NO demo banner.
 *   2. isReady && !session   -> children AND the demo banner (the open door —
 *                               unauthed visitors get the full app, not /landing).
 *   3. isReady && session    -> children, NO demo banner, clearDemoMode() called.
 *
 * The auth store uses selector reads (`useAuthStore((s) => s.isReady)`), so the
 * mock invokes the selector against a controllable state object.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';

// Controllable auth state the selector mock reads from.
const authState: { isReady: boolean; session: unknown } = {
  isReady: false,
  session: null,
};

vi.mock('@/stores/authStore', () => ({
  useAuthStore: <T,>(selector: (state: typeof authState) => T): T =>
    selector(authState),
}));

// Spy on clearDemoMode so the authed branch's latch-drop is observable.
const clearDemoMode = vi.fn();
vi.mock('@/lib/demoMode', () => ({
  clearDemoMode: () => clearDemoMode(),
}));

function renderRoute() {
  return render(
    <MemoryRouter>
      <ProtectedRoute>
        <div data-testid="protected-children">protected content</div>
      </ProtectedRoute>
    </MemoryRouter>
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    authState.isReady = false;
    authState.session = null;
    clearDemoMode.mockClear();
  });

  it('pre-hydration (!isReady): renders only the spinner, no children, no banner', () => {
    authState.isReady = false;
    authState.session = null;
    renderRoute();

    // Spinner renders a Loader2 SVG with the animate-spin class.
    expect(document.querySelector('svg.animate-spin')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-children')).not.toBeInTheDocument();
    expect(screen.queryByTestId('demo-mode-banner')).not.toBeInTheDocument();
  });

  it('ready + no session: OPEN DOOR — renders children AND the demo banner', () => {
    authState.isReady = true;
    authState.session = null;
    renderRoute();

    // The critical open-door assertion: app is reachable without an account.
    expect(screen.getByTestId('protected-children')).toBeInTheDocument();
    const banner = screen.getByTestId('demo-mode-banner');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(/Demo Mode: exploring without an account/i);
    // Banner offers the signup escape hatch.
    expect(screen.getByRole('link', { name: /sign up free/i })).toHaveAttribute(
      'href',
      '/login'
    );
    // No spinner once hydrated.
    expect(document.querySelector('svg.animate-spin')).not.toBeInTheDocument();
  });

  it('ready + session: renders children, no banner, drops the demo latch', () => {
    authState.isReady = true;
    authState.session = { access_token: 'token', user: { id: 'u1' } };
    renderRoute();

    expect(screen.getByTestId('protected-children')).toBeInTheDocument();
    expect(screen.queryByTestId('demo-mode-banner')).not.toBeInTheDocument();
    expect(document.querySelector('svg.animate-spin')).not.toBeInTheDocument();
    expect(clearDemoMode).toHaveBeenCalled();
  });
});
