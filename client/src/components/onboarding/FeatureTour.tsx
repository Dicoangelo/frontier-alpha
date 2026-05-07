import { useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Check } from 'lucide-react';

interface TourStep {
  id: string;
  target: string; // CSS selector for the element to highlight
  title: string;
  content: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

const tourSteps: TourStep[] = [
  {
    id: 'portfolio-overview',
    target: '[data-tour="portfolio-overview"]',
    title: 'Portfolio Overview',
    content: 'Total value, daily P&L, and key performance metrics — the read at a glance.',
    position: 'bottom',
  },
  {
    id: 'equity-curve',
    target: '[data-tour="equity-curve"]',
    title: 'Equity Curve',
    content: 'Your portfolio performance over time, benchmarked against the S&P 500.',
    position: 'bottom',
  },
  {
    id: 'positions',
    target: '[data-tour="positions"]',
    title: 'Position List',
    content: 'Every holding with real-time prices, portfolio weights, and unrealized P&L.',
    position: 'right',
  },
  {
    id: 'factors',
    target: '[data-tour="factors"]',
    title: 'Factor Exposures',
    content: 'Your exposure to 80+ institutional factors — momentum, quality, value, and more. This is what the quants see.',
    position: 'left',
  },
  {
    id: 'risk-metrics',
    target: '[data-tour="risk-metrics"]',
    title: 'Risk Metrics',
    content: 'Sharpe ratio, volatility, max drawdown, and VaR — surfaced before they become problems.',
    position: 'top',
  },
  {
    id: 'cognitive-insight',
    target: '[data-tour="cognitive-insight"]',
    title: 'AI Insights',
    content: 'Plain-English explanations of your portfolio characteristics. The system shows its work.',
    position: 'top',
  },
];

interface FeatureTourProps {
  isActive: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

export function FeatureTour({ isActive, onComplete, onSkip }: FeatureTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);

  const step = tourSteps[currentStep];

  const updatePositions = useCallback(() => {
    if (!step) return;

    const element = document.querySelector(step.target);
    if (!element) {
      // If element not found, skip to next step
      if (currentStep < tourSteps.length - 1) {
        setCurrentStep(prev => prev + 1);
      } else {
        onComplete();
      }
      return;
    }

    const rect = element.getBoundingClientRect();
    setHighlightRect(rect);

    // Calculate tooltip position
    const tooltipWidth = 320;
    const tooltipHeight = 200;
    const padding = 16;

    let top = 0;
    let left = 0;

    switch (step.position) {
      case 'top':
        top = rect.top - tooltipHeight - padding;
        left = rect.left + rect.width / 2 - tooltipWidth / 2;
        break;
      case 'bottom':
        top = rect.bottom + padding;
        left = rect.left + rect.width / 2 - tooltipWidth / 2;
        break;
      case 'left':
        top = rect.top + rect.height / 2 - tooltipHeight / 2;
        left = rect.left - tooltipWidth - padding;
        break;
      case 'right':
        top = rect.top + rect.height / 2 - tooltipHeight / 2;
        left = rect.right + padding;
        break;
      default:
        top = rect.bottom + padding;
        left = rect.left + rect.width / 2 - tooltipWidth / 2;
    }

    // Keep tooltip in viewport
    top = Math.max(padding, Math.min(top, window.innerHeight - tooltipHeight - padding));
    left = Math.max(padding, Math.min(left, window.innerWidth - tooltipWidth - padding));

    setTooltipPosition({ top, left });
  }, [step, currentStep, onComplete]);

  useEffect(() => {
    if (!isActive) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- position updates from DOM measurements
    updatePositions();

    const handleResize = () => updatePositions();
    const handleScroll = () => updatePositions();

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isActive, updatePositions]);

  const handleNext = () => {
    if (currentStep < tourSteps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      onComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  if (!isActive || !step) return null;

  return (
    <>
      {/* Backdrop with spotlight */}
      <div className="fixed inset-0 z-40 pointer-events-none">
        {/* Dark overlay */}
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" />

        {/* Spotlight cutout */}
        {highlightRect && (
          <div
            className="absolute bg-transparent"
            style={{
              top: highlightRect.top - 8,
              left: highlightRect.left - 8,
              width: highlightRect.width + 16,
              height: highlightRect.height + 16,
              boxShadow: '0 0 0 9999px color-mix(in srgb, var(--color-text) 60%, transparent)',
              borderRadius: '12px',
            }}
          />
        )}
      </div>

      {/* Highlight ring */}
      {highlightRect && (
        <div
          className="fixed z-50 pointer-events-none border-2 border-[var(--color-accent)] rounded-xl animate-pulse-subtle"
          style={{
            top: highlightRect.top - 8,
            left: highlightRect.left - 8,
            width: highlightRect.width + 16,
            height: highlightRect.height + 16,
            boxShadow: '0 0 40px rgba(123,44,255,0.4)',
          }}
        />
      )}

      {/* Tooltip */}
      <div
        className="glass-modal fixed z-50 w-80 rounded-2xl overflow-hidden animate-enter shadow-[0_30px_80px_-20px_rgba(123,44,255,0.45)]"
        style={{
          top: tooltipPosition.top,
          left: tooltipPosition.left,
        }}
        role="dialog"
        aria-modal="true"
        aria-label={step.title}
      >
        {/* Sovereign top rail */}
        <div className="sovereign-bar absolute top-0 left-0 right-0" />

        {/* Skip button */}
        <button
          onClick={onSkip}
          className="absolute top-3 right-3 p-1.5 text-theme-muted hover:text-theme rounded-lg transition-colors animate-press"
          aria-label="Skip tour"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-5">
          {/* Kicker */}
          <p className="text-[10px] mono tracking-[0.3em] uppercase text-theme-muted mb-3">
            ONBOARDING · Step {currentStep + 1} / {tourSteps.length}
          </p>

          {/* Progress dots */}
          <div className="flex items-center gap-1.5 mb-4" aria-hidden="true">
            {tourSteps.map((_, index) => (
              <div
                key={index}
                className="h-1.5 rounded-full transition-[width,background] duration-200"
                style={
                  index <= currentStep
                    ? {
                        width: '24px',
                        background: 'var(--gradient-sovereign)',
                      }
                    : {
                        width: '6px',
                        background: 'var(--color-bg-tertiary)',
                      }
                }
              />
            ))}
          </div>

          {/* Content */}
          <h3 className="text-lg font-bold text-theme mb-2">
            {step.title}
          </h3>
          <p className="text-theme-secondary text-sm leading-relaxed mb-5">
            {step.content}
          </p>

          {/* Navigation */}
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={handlePrev}
              disabled={currentStep === 0}
              className="flex items-center gap-1 text-sm text-theme-muted hover:text-theme disabled:opacity-40 disabled:cursor-not-allowed animate-press px-2 py-1.5 rounded-md"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>

            <button
              onClick={handleNext}
              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-[image:var(--gradient-sovereign)] text-white text-sm font-medium animate-press animate-lift shadow-[0_4px_24px_rgba(123,44,255,0.35)] hover:brightness-110"
            >
              {currentStep === tourSteps.length - 1 ? 'Done' : 'Next'}
              {currentStep === tourSteps.length - 1 ? (
                <Check className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
