/**
 * ProtectedRoute — auth-lifecycle gate for Bearer-protected pages.
 *
 * US-003 (v1.3.0). The contract:
 *
 *   - While `isReady === false` the route renders ONLY a full-screen
 *     spinner. Children must NOT mount because mounting them triggers the
 *     `useQuery` fan-out, which fires Bearer-less requests that 401 → fall
 *     to mock-data. The pre-hydration branch is the one we're fixing.
 *
 *   - Once `isReady === true && !!session` the route renders children.
 *     This is the single state where `useQuery({ enabled: isReady &&
 *     !!session })` will actually fire.
 *
 *   - Once `isReady === true && !session` the route redirects to
 *     `/landing`. The user is verified-unauthed, not in flux.
 *
 * The auth-state diagram lives in ARCHITECTURE.md "## Auth Lifecycle".
 * State predicates documented there — keep that section in sync with this
 * component's branch logic.
 */
import { Navigate, Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { Spinner } from '@/components/shared/Spinner';
import { detectDemoMode, clearDemoMode } from '@/lib/demoMode';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const isReady = useAuthStore((state) => state.isReady);
  const session = useAuthStore((state) => state.session);

  // Pre-hydration: hold the render. NEVER let children mount and start
  // their useQuery fan-out before we know whether we have a Bearer token.
  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  // Verified-unauthed: demo mode (IDEA-FF-6) mounts the tree anyway under a
  // persistent banner; otherwise redirect. A real session always wins.
  if (!session) {
    if (detectDemoMode()) {
      return (
        <>
          <DemoModeBanner />
          {children}
        </>
      );
    }
    return <Navigate to="/landing" replace />;
  }

  // Verified-authed: render protected tree (and drop any stale demo latch).
  clearDemoMode();
  return <>{children}</>;
}

/**
 * Type-rail banner (family pattern) pinned above the app shell in demo mode.
 * Not dismissible: the demo state must stay visible for the whole tour.
 */
function DemoModeBanner() {
  return (
    <div
      role="status"
      data-testid="demo-mode-banner"
      className="sticky top-0 z-50 glass-slab-floating px-4 py-2.5 flex items-center justify-between gap-3 border-b border-theme-light relative before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[image:var(--gradient-sovereign)]"
      style={{ boxShadow: '0 2px 16px color-mix(in srgb, var(--color-accent) 25%, transparent)' }}
    >
      <p className="mono text-[10px] sm:text-xs tracking-[0.2em] uppercase text-theme">
        Demo Mode — exploring without an account
      </p>
      <Link
        to="/login"
        onClick={clearDemoMode}
        className="mono text-[10px] sm:text-xs tracking-[0.2em] uppercase px-3 py-1 rounded-sm text-white bg-[image:var(--gradient-sovereign)] animate-press whitespace-nowrap"
      >
        Sign Up Free
      </Link>
    </div>
  );
}
