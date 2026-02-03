import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { signIn, signUp, signOut, getSession, onAuthStateChange, type Session, type User } from '@/lib/supabase';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
  initialized: boolean;

  // Actions
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<boolean>;
  signup: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      session: null,
      loading: false,
      error: null,
      initialized: false,

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
              loading: false,
            });
          } else {
            set({ initialized: true, loading: false });
          }

          // Listen for auth changes
          onAuthStateChange((session) => {
            set({
              session,
              user: session?.user || null,
            });
          });
        } catch (error) {
          console.error('Auth initialization error:', error);
          set({ initialized: true, loading: false });
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
        } catch (error: any) {
          set({ error: error.message || 'Login failed', loading: false });
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
        } catch (error: any) {
          set({ error: error.message || 'Signup failed', loading: false });
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
            loading: false,
          });
        } catch (error: any) {
          set({ error: error.message, loading: false });
        }
      },

      clearError: () => set({ error: null }),
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
