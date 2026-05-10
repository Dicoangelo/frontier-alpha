import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { WelcomeModal, useOnboarding } from './WelcomeModal';
import { FeatureTour } from './FeatureTour';
import { useAuthStore } from '@/stores/authStore';
import { portfolioApi } from '@/api/portfolio';
import { toast } from '@/components/shared/Toast';

interface OnboardingContextValue {
  showWelcome: boolean;
  showTour: boolean;
  startTour: () => void;
  skipOnboarding: () => void;
  resetOnboarding: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useOnboardingContext() {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboardingContext must be used within OnboardingProvider');
  }
  return context;
}

interface OnboardingProviderProps {
  children: ReactNode;
}

export function OnboardingProvider({ children }: OnboardingProviderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, initialized } = useAuthStore();
  const { isOnboardingComplete, completeOnboarding, resetOnboarding } = useOnboarding();

  const [showWelcome, setShowWelcome] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [hasShownWelcome, setHasShownWelcome] = useState(false);

  // Suppress the welcome modal for authenticated users who already have a
  // funded portfolio. The modal's import-symbols flow assumes a fresh
  // portfolio and would prompt the user to overwrite their existing
  // positions with the demo set, which is data-destructive UX. The query
  // is conditional on the same auth gate as the modal trigger so we don't
  // fire it for signed-out visitors.
  const portfolioQuery = useQuery({
    queryKey: ['portfolio'],
    queryFn: portfolioApi.getPortfolio,
    enabled: Boolean(initialized && user && !isOnboardingComplete && !hasShownWelcome),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  const hasPositions = (portfolioQuery.data?.positions?.length ?? 0) > 0;
  const portfolioReady = portfolioQuery.isFetched || portfolioQuery.isError;

  // Show welcome modal for first-time authenticated users on dashboard
  useEffect(() => {
    if (
      initialized &&
      user &&
      !isOnboardingComplete &&
      !hasShownWelcome &&
      portfolioReady &&
      !hasPositions &&
      (location.pathname === '/dashboard' || location.pathname === '/')
    ) {
      // Small delay to let the dashboard load first
      const timer = setTimeout(() => {
        setShowWelcome(true);
        setHasShownWelcome(true);
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [
    initialized,
    user,
    isOnboardingComplete,
    hasShownWelcome,
    portfolioReady,
    hasPositions,
    location.pathname,
  ]);

  // Returning user who already has positions — quietly mark them onboarded
  // so the modal doesn't reappear if their localStorage is wiped.
  useEffect(() => {
    if (
      initialized &&
      user &&
      !isOnboardingComplete &&
      portfolioReady &&
      hasPositions
    ) {
      completeOnboarding();
    }
  }, [initialized, user, isOnboardingComplete, portfolioReady, hasPositions, completeOnboarding]);

  const handleCloseWelcome = useCallback(() => {
    setShowWelcome(false);
  }, []);

  const handleStartTour = useCallback(() => {
    setShowWelcome(false);
    // Ensure we're on the dashboard for the tour
    if (location.pathname !== '/dashboard' && location.pathname !== '/') {
      navigate('/dashboard');
    }
    // Small delay to ensure dashboard is rendered
    setTimeout(() => {
      setShowTour(true);
    }, 300);
  }, [navigate, location.pathname]);

  const handleTryDemo = useCallback(() => {
    setShowWelcome(false);
    completeOnboarding();
    navigate('/dashboard?demo=true');
  }, [navigate, completeOnboarding]);

  const handleImportDemoSymbols = useCallback((symbols: string[]) => {
    if (typeof window === 'undefined' || symbols.length === 0) return;
    try {
      // Persist as the durable "user wanted these in their portfolio" key
      window.localStorage.setItem('imported_symbols', JSON.stringify(symbols));
      // Clear the preview key so the prompt doesn't show again
      window.localStorage.removeItem('analyze_symbols');
      const count = symbols.length;
      toast.success(
        `Saved ${count} ${count === 1 ? 'symbol' : 'symbols'} for import`,
        'Add them to your portfolio with shares and cost basis on the next screen.',
      );
      // Bridge the demo→real handoff — was previously stalled at localStorage.
      // The Portfolio page reads `imported_symbols` and pre-populates the
      // Add-Position form so the user has a concrete next action instead of
      // landing on an empty portfolio with no obvious connection to their
      // imported demo.
      setTimeout(() => navigate('/portfolio?import=1'), 100);
    } catch {
      // Storage unavailable — fail quietly, banner still dismisses
    }
  }, [navigate]);

  const handleTourComplete = useCallback(() => {
    setShowTour(false);
    completeOnboarding();
  }, [completeOnboarding]);

  const handleTourSkip = useCallback(() => {
    setShowTour(false);
    completeOnboarding();
  }, [completeOnboarding]);

  const handleSkipOnboarding = useCallback(() => {
    setShowWelcome(false);
    completeOnboarding();
  }, [completeOnboarding]);

  const handleResetOnboarding = useCallback(() => {
    resetOnboarding();
    setHasShownWelcome(false);
    setShowWelcome(true);
  }, [resetOnboarding]);

  const contextValue: OnboardingContextValue = {
    showWelcome,
    showTour,
    startTour: handleStartTour,
    skipOnboarding: handleSkipOnboarding,
    resetOnboarding: handleResetOnboarding,
  };

  return (
    <OnboardingContext.Provider value={contextValue}>
      {children}

      {/* Welcome Modal */}
      <WelcomeModal
        isOpen={showWelcome}
        onClose={handleCloseWelcome}
        onStartTour={handleStartTour}
        onTryDemo={handleTryDemo}
        onImportDemoSymbols={handleImportDemoSymbols}
      />

      {/* Feature Tour */}
      <FeatureTour
        isActive={showTour}
        onComplete={handleTourComplete}
        onSkip={handleTourSkip}
      />
    </OnboardingContext.Provider>
  );
}
