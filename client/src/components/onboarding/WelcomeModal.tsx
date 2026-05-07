import { useEffect, useState } from 'react';
import { X, ArrowRight, TrendingUp, BarChart2, Bell, Zap, Sparkles } from 'lucide-react';

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartTour: () => void;
  onTryDemo: () => void;
  onImportDemoSymbols?: (symbols: string[]) => void;
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

const ANALYZE_SYMBOLS_KEY = 'analyze_symbols';

function readDemoSymbols(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(ANALYZE_SYMBOLS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is string => typeof s === 'string' && s.length > 0);
  } catch {
    return [];
  }
}

export function WelcomeModal({
  isOpen,
  onClose,
  onStartTour,
  onTryDemo,
  onImportDemoSymbols,
}: WelcomeModalProps) {
  const [demoSymbols, setDemoSymbols] = useState<string[]>([]);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDemoSymbols(readDemoSymbols());
      setBannerDismissed(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleStartTour = () => {
    onClose();
    onStartTour();
  };

  const handleTryDemo = () => {
    onClose();
    onTryDemo();
  };

  const handleImport = () => {
    if (onImportDemoSymbols && demoSymbols.length > 0) {
      onImportDemoSymbols(demoSymbols);
    }
    setDemoSymbols([]);
    setBannerDismissed(true);
  };

  const handleSkipBanner = () => {
    setBannerDismissed(true);
  };

  const showDemoBanner = demoSymbols.length > 0 && !bannerDismissed;
  const previewSymbols = demoSymbols.slice(0, 4);
  const remainingCount = Math.max(0, demoSymbols.length - previewSymbols.length);

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

        {/* Body */}
        <div className="p-6">
          {/* Demo handoff banner — only when analyze_symbols exists */}
          {showDemoBanner && (
            <div
              className="glass-slab-floating relative overflow-hidden rounded-xl pl-5 pr-4 py-4 mb-5 before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[image:var(--gradient-sovereign)] shadow-[0_18px_60px_-20px_rgba(123,44,255,0.45)] animate-fade-in-up"
              role="region"
              aria-label="Import demo symbols"
            >
              <div className="flex items-start gap-3">
                <Sparkles
                  className="w-5 h-5 flex-shrink-0 mt-0.5 text-[var(--color-accent)]"
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0">
                  <p className="mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-accent)] font-semibold">
                    FROM YOUR PREVIEW
                  </p>
                  <p className="text-sm font-semibold text-theme mt-1">
                    We saved {demoSymbols.length}{' '}
                    {demoSymbols.length === 1 ? 'symbol' : 'symbols'} from your demo.
                  </p>
                  <p className="text-sm text-theme-secondary leading-relaxed mt-1">
                    Import {demoSymbols.length === 1 ? 'it' : 'them'} as your starting
                    portfolio?
                  </p>

                  {/* Symbol chips */}
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {previewSymbols.map((sym) => (
                      <span
                        key={sym}
                        className="mono tabular-nums text-[10px] tracking-[0.2em] uppercase font-bold px-2 py-1 rounded-md bg-[var(--color-bg-tertiary)] border border-theme text-theme"
                      >
                        {sym}
                      </span>
                    ))}
                    {remainingCount > 0 && (
                      <span className="mono text-[10px] tracking-[0.2em] uppercase px-2 py-1 text-theme-muted">
                        +{remainingCount} more
                      </span>
                    )}
                  </div>

                  {/* Buttons */}
                  <div className="flex flex-col sm:flex-row gap-2 mt-4">
                    <button
                      type="button"
                      onClick={handleImport}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[image:var(--gradient-sovereign)] text-white text-sm font-semibold animate-press animate-lift shadow-[0_4px_24px_rgba(123,44,255,0.35)] hover:brightness-110"
                    >
                      Import {demoSymbols.length}{' '}
                      {demoSymbols.length === 1 ? 'symbol' : 'symbols'}
                    </button>
                    <button
                      type="button"
                      onClick={handleSkipBanner}
                      className="glass-slab px-4 py-2.5 rounded-lg text-theme text-sm font-medium animate-press animate-lift hover:border-[color:var(--color-border-hover)]"
                    >
                      Skip
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

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
