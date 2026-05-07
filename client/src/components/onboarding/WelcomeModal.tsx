import { X, ArrowRight, TrendingUp, BarChart2, Bell, Zap } from 'lucide-react';

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
        className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="glass-modal relative max-w-lg w-full rounded-2xl overflow-hidden animate-enter shadow-[0_30px_80px_-20px_rgba(123,44,255,0.45)]"
        role="dialog"
        aria-modal="true"
        aria-label="Welcome to Frontier Alpha"
      >
        {/* Sovereign top rail */}
        <div className="sovereign-bar absolute top-0 left-0 right-0" />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-white/80 hover:text-white rounded-lg transition-colors animate-press z-10"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header — sovereign gradient field */}
        <div
          className="relative px-8 py-10 text-white overflow-hidden"
          style={{ background: 'var(--gradient-sovereign)' }}
        >
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-40 pointer-events-none"
            style={{
              background:
                'radial-gradient(circle at 20% 0%, rgba(255,255,255,0.4), transparent 60%)',
            }}
          />
          <div className="relative">
            <p className="text-[10px] mono tracking-[0.3em] uppercase text-white/80 mb-3">
              ONBOARDING · Welcome
            </p>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-white/15 backdrop-blur-sm rounded-xl flex items-center justify-center">
                <TrendingUp className="w-6 h-6" />
              </div>
              <span className="text-lg font-semibold">Frontier Alpha</span>
            </div>
            <h1 className="text-2xl font-bold mb-2">
              Institutional-grade intelligence
            </h1>
            <p className="text-white/90 leading-relaxed">
              See what the quants see. Understand what they will not explain.
            </p>
          </div>
        </div>

        {/* Features */}
        <div className="p-6">
          <p className="text-[10px] mono tracking-[0.3em] uppercase text-theme-muted mb-4">
            What you will get
          </p>
          <div className="grid grid-cols-2 gap-3 mb-6 animate-stagger">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="glass-slab rounded-2xl p-4 animate-enter"
              >
                <feature.icon className="w-6 h-6 text-[var(--color-accent)] mb-2" aria-hidden="true" />
                <h3 className="font-semibold text-theme text-sm">{feature.title}</h3>
                <p className="text-xs text-theme-secondary leading-relaxed mt-1">{feature.description}</p>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <button
              onClick={handleTryDemo}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-[image:var(--gradient-sovereign)] text-white font-medium animate-press animate-lift shadow-[0_4px_30px_rgba(123,44,255,0.35)] hover:brightness-110 hover:shadow-[0_6px_40px_rgba(123,44,255,0.5)]"
            >
              Try with Demo Portfolio
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={handleStartTour}
              className="glass-slab w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-theme animate-press animate-lift hover:border-[color:var(--color-border-hover)]"
            >
              Take a Quick Tour
            </button>
            <button
              onClick={onClose}
              className="w-full text-sm text-theme-muted hover:text-theme py-2 animate-press"
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
