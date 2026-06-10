import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import '@/stores/themeStore'; // Initialize theme (dark mode) on load
import { Layout } from '@/components/layout/Layout';
import { Login } from '@/pages/Login';
import { Spinner } from '@/components/shared/Spinner';
import { ToastContainer } from '@/components/shared/Toast';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { OnboardingProvider } from '@/components/onboarding';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

// Lazy load heavy pages for better initial load performance.
// Landing is the marketing entry point (HeroEnhanced + TypingTickerDemo +
// HowItWorks + TrustComparison + DemoPreview, plus dozens of SVG icons).
// Repeat users hitting /login don't need any of that JS in their entry
// chunk; lazy gives them ~150kB lighter first paint.
// Terms / Privacy / ResetPassword are rarely-visited single-purpose pages
// where a one-RTT lazy load is invisible to the user.
const Landing = lazy(() => import('@/pages/Landing').then(m => ({ default: m.Landing })));
const ResetPassword = lazy(() => import('@/pages/ResetPassword').then(m => ({ default: m.ResetPassword })));
const Terms = lazy(() => import('@/pages/Terms').then(m => ({ default: m.Terms })));
const Privacy = lazy(() => import('@/pages/Privacy').then(m => ({ default: m.Privacy })));
const Dashboard = lazy(() => import('@/pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Portfolio = lazy(() => import('@/pages/Portfolio').then(m => ({ default: m.Portfolio })));
const Factors = lazy(() => import('@/pages/Factors').then(m => ({ default: m.Factors })));
const Earnings = lazy(() => import('@/pages/Earnings').then(m => ({ default: m.Earnings })));
const Optimize = lazy(() => import('@/pages/Optimize').then(m => ({ default: m.Optimize })));
const Alerts = lazy(() => import('@/pages/Alerts').then(m => ({ default: m.Alerts })));
const Trading = lazy(() => import('@/pages/Trading'));
const Settings = lazy(() => import('@/pages/Settings').then(m => ({ default: m.Settings })));
const Help = lazy(() => import('@/pages/Help').then(m => ({ default: m.Help })));
const CVRF = lazy(() => import('@/pages/CVRF').then(m => ({ default: m.CVRF })));
const Backtest = lazy(() => import('@/pages/Backtest').then(m => ({ default: m.Backtest })));
const ML = lazy(() => import('@/pages/ML').then(m => ({ default: m.ML })));
const Options = lazy(() => import('@/pages/Options').then(m => ({ default: m.Options })));
const Social = lazy(() => import('@/pages/Social').then(m => ({ default: m.Social })));
const Tax = lazy(() => import('@/pages/Tax').then(m => ({ default: m.Tax })));
const InsightHistory = lazy(() => import('@/pages/InsightHistory').then(m => ({ default: m.InsightHistory })));
const SharedPortfolio = lazy(() => import('@/pages/SharedPortfolio'));
const Pricing = lazy(() => import('@/pages/Pricing'));
const BillingSuccess = lazy(() => import('@/pages/BillingSuccess'));
const BillingCanceled = lazy(() => import('@/pages/BillingCanceled'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      retry: 1,
    },
  },
});

// `<ProtectedRoute>` lives in `components/auth/ProtectedRoute.tsx` (US-003).
// It gates on `authStore.isReady` so children NEVER mount before the
// initial Supabase session-load resolves.

function PublicRoute({ children }: { children: React.ReactNode }) {
  const isReady = useAuthStore((state) => state.isReady);
  const session = useAuthStore((state) => state.session);

  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  if (session) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <Routes>
      <Route
        path="/landing"
        element={
          <PublicRoute>
            <Landing />
          </PublicRoute>
        }
      />
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      <Route
        path="/reset-password"
        element={<ResetPassword />}
      />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Layout>
              <ErrorBoundary>
                <Dashboard />
              </ErrorBoundary>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout>
              <ErrorBoundary>
                <Dashboard />
              </ErrorBoundary>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/portfolio"
        element={
          <ProtectedRoute>
            <Layout>
              <ErrorBoundary>
                <Portfolio />
              </ErrorBoundary>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/factors"
        element={
          <ProtectedRoute>
            <Layout>
              <ErrorBoundary>
                <Factors />
              </ErrorBoundary>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/earnings"
        element={
          <ProtectedRoute>
            <Layout>
              <ErrorBoundary>
                <Earnings />
              </ErrorBoundary>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/optimize"
        element={
          <ProtectedRoute>
            <Layout>
              <ErrorBoundary>
                <Optimize />
              </ErrorBoundary>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/alerts"
        element={
          <ProtectedRoute>
            <Layout>
              <ErrorBoundary>
                <Alerts />
              </ErrorBoundary>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/trade"
        element={
          <ProtectedRoute>
            <Layout>
              <ErrorBoundary>
                <Trading />
              </ErrorBoundary>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <Layout>
              <ErrorBoundary>
                <Settings />
              </ErrorBoundary>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/help"
        element={
          <ProtectedRoute>
            <Layout>
              <ErrorBoundary>
                <Help />
              </ErrorBoundary>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/cvrf"
        element={
          <ProtectedRoute>
            <Layout>
              <ErrorBoundary>
                <CVRF />
              </ErrorBoundary>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/ml"
        element={
          <ProtectedRoute>
            <Layout>
              <ErrorBoundary>
                <ML />
              </ErrorBoundary>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/insights"
        element={
          <ProtectedRoute>
            <Layout>
              <ErrorBoundary>
                <InsightHistory />
              </ErrorBoundary>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/options"
        element={
          <ProtectedRoute>
            <Layout>
              <ErrorBoundary>
                <Options />
              </ErrorBoundary>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/social"
        element={
          <ProtectedRoute>
            <Layout>
              <ErrorBoundary>
                <Social />
              </ErrorBoundary>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/tax"
        element={
          <ProtectedRoute>
            <Layout>
              <ErrorBoundary>
                <Tax />
              </ErrorBoundary>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/backtest"
        element={
          <ProtectedRoute>
            <Layout>
              <ErrorBoundary>
                <Backtest />
              </ErrorBoundary>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/pricing"
        element={
          <Pricing />
        }
      />
      {/* Stripe checkout return flow — user is authenticated post-checkout */}
      <Route
        path="/billing/success"
        element={
          <ProtectedRoute>
            <ErrorBoundary>
              <BillingSuccess />
            </ErrorBoundary>
          </ProtectedRoute>
        }
      />
      <Route
        path="/billing/canceled"
        element={
          <ProtectedRoute>
            <ErrorBoundary>
              <BillingCanceled />
            </ErrorBoundary>
          </ProtectedRoute>
        }
      />
      {/* Public route for shared portfolios - no auth required */}
      <Route
        path="/shared/:token"
        element={
          <ErrorBoundary>
            <SharedPortfolio />
          </ErrorBoundary>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// Page loading fallback
function PageLoader() {
  return (
    <div className="min-h-[400px] flex items-center justify-center">
      <div className="text-center">
        <Spinner size="lg" />
        <p className="mt-4 text-[var(--color-text-muted)] animate-pulse-subtle">Loading...</p>
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ErrorBoundary>
          <OnboardingProvider>
            <Suspense fallback={<PageLoader />}>
              <AppRoutes />
            </Suspense>
          </OnboardingProvider>
        </ErrorBoundary>
        <ToastContainer />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
