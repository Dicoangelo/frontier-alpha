import { X, ArrowRight, TrendingUp, BarChart2, Bell, Zap } from 'lucide-react';
import { Button } from '@/components/shared/Button';

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartTour: () => void;
  onTryDemo: () => void;
}

const features = [
  {
    icon: TrendingUp,
    title: 'Factor Analysis',
    description: '80+ institutional-grade factors analyzed in real-time',
  },
  {
    icon: BarChart2,
    title: 'Smart Optimization',
    description: 'AI-powered portfolio optimization with plain-English explanations',
  },
  {
    icon: Bell,
    title: 'Risk Alerts',
    description: 'Real-time alerts for drawdowns, volatility spikes, and earnings',
  },
  {
    icon: Zap,
    title: 'Earnings Oracle',
    description: 'Factor-adjusted earnings forecasts and historical patterns',
  },
];

export function WelcomeModal({ isOpen, onClose, onStartTour, onTryDemo }: WelcomeModalProps) {
  if (!isOpen) return null;

  const handleStartTour = () => {
    onClose();
    onStartTour();
  };

  const handleTryDemo = () => {
    onClose();
    onTryDemo();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-[var(--color-bg)] rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-scale-in">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors z-10"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header with gradient */}
        <div className="bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-700 px-8 py-10 text-white">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-[var(--color-bg)]/20 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-6 h-6" />
            </div>
            <span className="text-lg font-semibold">Frontier Alpha</span>
          </div>
          <h1 className="text-2xl font-bold mb-2">
            Welcome to Institutional-Grade Intelligence
          </h1>
          <p className="text-blue-100">
            See what the quants see. Understand what they won't explain.
          </p>
        </div>

        {/* Features */}
        <div className="p-6">
          <h2 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wide mb-4">
            What you'll get
          </h2>
          <div className="grid grid-cols-2 gap-4 mb-6">
            {features.map((feature, index) => (
              <div
                key={feature.title}
                className="p-4 bg-[var(--color-bg-tertiary)] rounded-xl hover:bg-[var(--color-bg-secondary)] transition-colors animate-fade-in-up"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <feature.icon className="w-6 h-6 text-blue-600 mb-2" />
                <h3 className="font-semibold text-[var(--color-text)] text-sm">{feature.title}</h3>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">{feature.description}</p>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <Button
              onClick={handleTryDemo}
              fullWidth
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Try with Demo Portfolio
            </Button>
            <Button
              onClick={handleStartTour}
              variant="outline"
              fullWidth
            >
              Take a Quick Tour
            </Button>
            <button
              onClick={onClose}
              className="w-full text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] py-2"
            >
              Skip for now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Hook to manage onboarding state
// eslint-disable-next-line react-refresh/only-export-components
export function useOnboarding() {
  const STORAGE_KEY = 'frontier_onboarding_complete';

  const isOnboardingComplete = () => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem(STORAGE_KEY) === 'true';
  };

  const completeOnboarding = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
  };

  const resetOnboarding = () => {
    localStorage.removeItem(STORAGE_KEY);
  };

  return {
    isOnboardingComplete: isOnboardingComplete(),
    completeOnboarding,
    resetOnboarding,
  };
}
