import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { Layout } from '@/components/layout/Layout';
import { Landing } from '@/pages/Landing';
import { Login } from '@/pages/Login';
import { Spinner } from '@/components/shared/Spinner';
import { ToastContainer } from '@/components/shared/Toast';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';

// Lazy load heavy pages for better initial load performance
const Dashboard = lazy(() => import('@/pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Portfolio = lazy(() => import('@/pages/Portfolio').then(m => ({ default: m.Portfolio })));
const Factors = lazy(() => import('@/pages/Factors').then(m => ({ default: m.Factors })));
const Earnings = lazy(() => import('@/pages/Earnings').then(m => ({ default: m.Earnings })));
const Optimize = lazy(() => import('@/pages/Optimize').then(m => ({ default: m.Optimize })));
const Alerts = lazy(() => import('@/pages/Alerts').then(m => ({ default: m.Alerts })));
const Settings = lazy(() => import('@/pages/Settings').then(m => ({ default: m.Settings })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      retry: 1,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, initialized, loading } = useAuthStore();

  if (!initialized || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/landing" replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, initialized, loading } = useAuthStore();

  if (!initialized || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  if (user) {
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
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Layout>
              <Dashboard />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout>
              <Dashboard />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/portfolio"
        element={
          <ProtectedRoute>
            <Layout>
              <Portfolio />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/factors"
        element={
          <ProtectedRoute>
            <Layout>
              <Factors />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/earnings"
        element={
          <ProtectedRoute>
            <Layout>
              <Earnings />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/optimize"
        element={
          <ProtectedRoute>
            <Layout>
              <Optimize />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/alerts"
        element={
          <ProtectedRoute>
            <Layout>
              <Alerts />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <Layout>
              <Settings />
            </Layout>
          </ProtectedRoute>
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
        <p className="mt-4 text-gray-500 animate-pulse">Loading...</p>
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ErrorBoundary>
          <Suspense fallback={<PageLoader />}>
            <AppRoutes />
          </Suspense>
        </ErrorBoundary>
        <ToastContainer />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
