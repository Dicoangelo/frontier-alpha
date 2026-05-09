import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import axios from 'axios';
import { signIn, signUp, signOut, getSession, onAuthStateChange, type Session, type User } from '@/lib/supabase';

interface Subscription {
  plan: 'free' | 'pro' | 'enterprise';
  status: 'active' | 'past_due' | 'canceled' | 'trialing';
}

interface AuthState {
  user: User | null;
  session: Session | null;
  subscription: Subscription | null;
  loading: boolean;
  error: string | null;
  initialized: boolean;
  /**
   * Auth-lifecycle gate (US-003).
   *
   * Flips to `true` exactly once per session — when the initial Supabase
   * `getSession()` call resolves (whether to a session or to null) AND on
   * every subsequent `onAuthStateChange()` event so that login / logout /
   * token refresh keep the flag truthy.
   *
   * Consumers (`<ProtectedRoute>` + every `useQuery({ enabled })` on a
   * Bearer-gated endpoint) MUST gate on this so requests don't race ahead
   * of the auth-store hydration. Without it, the first paint of
   * `/portfolio` etc. fires fetches before the access_token is in scope
   * and the server returns 401, which then falls through to mock-data
   * fallback even when the user is genuinely signed in.
   */
  isReady: boolean;

  // Actions
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<boolean>;
  signup: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
  fetchSubscription: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      session: null,
      subscription: null,
      loading: false,
      error: null,
      initialized: false,
      isReady: false,

      initialize: async () => {
        if (get().initialized) return;

        set({ loading: true });

        try {
          const { session } = await getSession();

          if (session) {
            set({
              session,
              user: session.user,
              initialized: true,
              isReady: true,
              loading: false,
            });
            // Fetch subscription in background
            get().fetchSubscription();
          } else {
            // Resolved-as-null is a terminal state too — flip isReady so
            // gated hooks can decide (skip fetch when no session) instead
            // of staying parked on the loading branch forever.
            set({ initialized: true, isReady: true, loading: false });
          }

          // Listen for auth changes (login, logout, token refresh, recovery).
          // Every transition keeps `isReady = true` so post-init flows never
          // regress to the pre-hydration branch.
          onAuthStateChange((session) => {
            set({
              session,
              user: session?.user || null,
              isReady: true,
            });
          });
        } catch (error) {
          console.error('Auth initialization error:', error);
          // Still flip isReady so the UI can render the unauthed branch
          // and not hang on the spinner. Gated hooks read both isReady AND
          // !!session, so an error path = unauthed = no requests fired.
          set({ initialized: true, isReady: true, loading: false });
        }
      },

      login: async (email: string, password: string) => {
        set({ loading: true, error: null });

        try {
          const { data, error } = await signIn(email, password);

          if (error) {
            set({ error: error.message, loading: false });
            return false;
          }

          if (data.session) {
            set({
              session: data.session,
              user: data.session.user,
              loading: false,
            });
            return true;
          }

          set({ loading: false });
          return false;
        } catch (error: unknown) {
          set({ error: error instanceof Error ? error.message : 'Login failed', loading: false });
          return false;
        }
      },

      signup: async (email: string, password: string) => {
        set({ loading: true, error: null });

        try {
          const { data, error } = await signUp(email, password);

          if (error) {
            set({ error: error.message, loading: false });
            return false;
          }

          // Supabase may require email confirmation
          if (data.session) {
            set({
              session: data.session,
              user: data.session.user,
              loading: false,
            });
            return true;
          }

          // If no session, email confirmation may be required
          set({
            loading: false,
            error: 'Please check your email to confirm your account',
          });
          return true;
        } catch (error: unknown) {
          set({ error: error instanceof Error ? error.message : 'Signup failed', loading: false });
          return false;
        }
      },

      logout: async () => {
        set({ loading: true });

        try {
          await signOut();
          set({
            user: null,
            session: null,
            subscription: null,
            loading: false,
          });
        } catch (error: unknown) {
          set({ error: error instanceof Error ? error.message : 'Logout failed', loading: false });
        }
      },

      clearError: () => set({ error: null }),

      fetchSubscription: async () => {
        const session = get().session;
        if (!session?.access_token) return;

        try {
          const apiUrl = import.meta.env.VITE_API_URL || '';
          const { data: response } = await axios.get(`${apiUrl}/api/v1/billing/subscription`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          if (response?.success && response.data) {
            set({ subscription: { plan: response.data.plan, status: response.data.status } });
          }
        } catch {
          // Default to free on error
          set({ subscription: { plan: 'free', status: 'active' } });
        }
      },
    }),
    {
      name: 'frontier-auth',
      partialize: (state) => ({
        // Only persist session - user will be rehydrated from session
        session: state.session,
      }),
    }
  )
);

// Helper to get access token for API calls
export function getAccessToken(): string | null {
  const session = useAuthStore.getState().session;
  return session?.access_token || null;
}
