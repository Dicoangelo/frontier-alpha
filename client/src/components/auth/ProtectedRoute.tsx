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
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { Spinner } from '@/components/shared/Spinner';

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

  // Verified-unauthed: redirect.
  if (!session) {
    return <Navigate to="/landing" replace />;
  }

  // Verified-authed: render protected tree.
  return <>{children}</>;
}
