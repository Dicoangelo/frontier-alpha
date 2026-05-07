import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { WelcomeModal, useOnboarding } from './WelcomeModal';
import { FeatureTour } from './FeatureTour';
import { useAuthStore } from '@/stores/authStore';
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

  // Show welcome modal for first-time authenticated users on dashboard
  useEffect(() => {
    if (
      initialized &&
      user &&
      !isOnboardingComplete &&
      !hasShownWelcome &&
      (location.pathname === '/dashboard' || location.pathname === '/')
    ) {
      // Small delay to let the dashboard load first
      const timer = setTimeout(() => {
        setShowWelcome(true);
        setHasShownWelcome(true);
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [initialized, user, isOnboardingComplete, hasShownWelcome, location.pathname]);

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
        `Imported ${count} ${count === 1 ? 'symbol' : 'symbols'} to your portfolio`,
        'Visit the Portfolio page to wire live data and run a real read.',
      );
    } catch {
      // Storage unavailable — fail quietly, banner still dismisses
    }
  }, []);

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
