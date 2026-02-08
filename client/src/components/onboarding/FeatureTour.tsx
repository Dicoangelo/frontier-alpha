import { useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { Button } from '@/components/shared/Button';

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
    content: 'See your total portfolio value, daily P&L, and key performance metrics at a glance.',
    position: 'bottom',
  },
  {
    id: 'equity-curve',
    target: '[data-tour="equity-curve"]',
    title: 'Equity Curve',
    content: 'Track your portfolio performance over time compared to the S&P 500 benchmark.',
    position: 'bottom',
  },
  {
    id: 'positions',
    target: '[data-tour="positions"]',
    title: 'Position List',
    content: 'View all your holdings with real-time prices, weights, and unrealized P&L.',
    position: 'right',
  },
  {
    id: 'factors',
    target: '[data-tour="factors"]',
    title: 'Factor Exposures',
    content: 'See your exposure to 80+ institutional factors including momentum, quality, and value.',
    position: 'left',
  },
  {
    id: 'risk-metrics',
    target: '[data-tour="risk-metrics"]',
    title: 'Risk Metrics',
    content: 'Monitor your portfolio risk with Sharpe ratio, volatility, max drawdown, and VaR.',
    position: 'top',
  },
  {
    id: 'cognitive-insight',
    target: '[data-tour="cognitive-insight"]',
    title: 'AI Insights',
    content: 'Get plain-English explanations of your portfolio characteristics and recommendations.',
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
    const tooltipHeight = 180;
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
        <div className="absolute inset-0 bg-black/60" />

        {/* Spotlight cutout */}
        {highlightRect && (
          <div
            className="absolute bg-transparent"
            style={{
              top: highlightRect.top - 8,
              left: highlightRect.left - 8,
              width: highlightRect.width + 16,
              height: highlightRect.height + 16,
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)',
              borderRadius: '12px',
            }}
          />
        )}
      </div>

      {/* Highlight ring */}
      {highlightRect && (
        <div
          className="fixed z-50 pointer-events-none border-2 border-blue-400 rounded-xl animate-pulse-subtle"
          style={{
            top: highlightRect.top - 8,
            left: highlightRect.left - 8,
            width: highlightRect.width + 16,
            height: highlightRect.height + 16,
          }}
        />
      )}

      {/* Tooltip */}
      <div
        className="fixed z-50 w-80 bg-[var(--color-bg)] rounded-xl shadow-2xl animate-scale-in"
        style={{
          top: tooltipPosition.top,
          left: tooltipPosition.left,
        }}
      >
        {/* Skip button */}
        <button
          onClick={onSkip}
          className="absolute top-3 right-3 p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
          aria-label="Skip tour"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-5">
          {/* Progress */}
          <div className="flex items-center gap-1.5 mb-3">
            {tourSteps.map((_, index) => (
              <div
                key={index}
                className={`h-1.5 rounded-full transition-all ${
                  index <= currentStep
                    ? 'w-6 bg-blue-600'
                    : 'w-1.5 bg-[var(--color-border)]'
                }`}
              />
            ))}
          </div>

          {/* Content */}
          <h3 className="text-lg font-semibold text-[var(--color-text)] mb-2">
            {step.title}
          </h3>
          <p className="text-[var(--color-text-secondary)] text-sm mb-4">
            {step.content}
          </p>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <button
              onClick={handlePrev}
              disabled={currentStep === 0}
              className="flex items-center gap-1 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>

            <span className="text-xs text-[var(--color-text-muted)]">
              {currentStep + 1} of {tourSteps.length}
            </span>

            <Button
              onClick={handleNext}
              size="sm"
              rightIcon={
                currentStep === tourSteps.length - 1 ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )
              }
            >
              {currentStep === tourSteps.length - 1 ? 'Done' : 'Next'}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
