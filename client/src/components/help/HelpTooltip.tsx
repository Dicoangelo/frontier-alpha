import { useState, useRef, useEffect } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { metricExplanations, quickTips } from '@/data/helpContent';

interface HelpTooltipProps {
  /** The metric key to look up explanation */
  metricKey?: string;
  /** Or provide custom content directly */
  title?: string;
  content?: string;
  formula?: string;
  /** Size of the help icon */
  size?: 'sm' | 'md' | 'lg';
  /** Position preference */
  position?: 'top' | 'bottom' | 'left' | 'right';
  /** Additional CSS classes */
  className?: string;
}

const sizeClasses = {
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
};

export function HelpTooltip({
  metricKey,
  title: customTitle,
  content: customContent,
  formula: customFormula,
  size = 'sm',
  position = 'top',
  className = '',
}: HelpTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [actualPosition, setActualPosition] = useState(position);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Get content from metric key or use custom content
  const metric = metricKey ? metricExplanations[metricKey] : null;
  const title = customTitle || metric?.title || metricKey || 'Help';
  const content = customContent || metric?.explanation || quickTips[metricKey || ''] || 'No help available.';
  const formula = customFormula || metric?.formula;

  // Adjust position if tooltip would go off screen
  useEffect(() => {
    if (isOpen && tooltipRef.current && triggerRef.current) {
      const tooltip = tooltipRef.current.getBoundingClientRect();
      const trigger = triggerRef.current.getBoundingClientRect();
      const viewport = {
        width: window.innerWidth,
        height: window.innerHeight,
      };

      let newPosition = position;

      // Check if tooltip would go off screen and adjust
      if (position === 'top' && trigger.top < tooltip.height + 10) {
        newPosition = 'bottom';
      } else if (position === 'bottom' && trigger.bottom + tooltip.height + 10 > viewport.height) {
        newPosition = 'top';
      } else if (position === 'left' && trigger.left < tooltip.width + 10) {
        newPosition = 'right';
      } else if (position === 'right' && trigger.right + tooltip.width + 10 > viewport.width) {
        newPosition = 'left';
      }

      if (newPosition !== actualPosition) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- position adjustment based on DOM measurement
        setActualPosition(newPosition);
      }
    }
  }, [isOpen, position, actualPosition]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent border-t-white',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent border-b-white',
    left: 'left-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent border-l-white',
    right: 'right-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent border-r-white',
  };

  return (
    <div className={`relative inline-flex ${className}`}>
      <button
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        className="text-[var(--color-text-muted)] hover:text-[var(--color-info)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-info)] focus:ring-offset-1 rounded-full p-0.5"
        aria-label={`Help: ${title}`}
        aria-expanded={isOpen}
        type="button"
      >
        <HelpCircle className={sizeClasses[size]} />
      </button>

      {isOpen && (
        <div
          ref={tooltipRef}
          className={`
            absolute z-50 ${positionClasses[actualPosition]}
            w-72 max-w-[calc(100vw-2rem)]
            bg-[var(--color-bg)] rounded-lg shadow-xl border border-[var(--color-border)]
            animate-fade-in
          `}
          role="tooltip"
        >
          {/* Arrow */}
          <div
            className={`absolute ${arrowClasses[actualPosition]} border-8`}
            aria-hidden="true"
          />

          <div className="p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <h4 className="font-semibold text-[var(--color-text)] text-sm">{title}</h4>
              <button
                onClick={() => setIsOpen(false)}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] -mt-1 -mr-1 p-1"
                aria-label="Close tooltip"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">{content}</p>

            {formula && (
              <div className="mt-3 p-2 bg-[var(--color-bg-tertiary)] rounded text-xs font-mono text-[var(--color-text-secondary)]">
                {formula}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Inline help text that appears on hover
 * Simpler than HelpTooltip, just shows a dotted underline with tooltip
 */
interface InlineHelpProps {
  children: React.ReactNode;
  tip: string;
  className?: string;
}

export function InlineHelp({ children, tip, className = '' }: InlineHelpProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <span
      className={`relative cursor-help border-b border-dotted border-[var(--color-border)] ${className}`}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && (
        <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 text-white text-xs rounded-lg shadow-lg whitespace-nowrap max-w-xs animate-fade-in" style={{ backgroundColor: 'rgba(15, 18, 25, 0.95)' }}>
          {tip}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent" style={{ borderTopColor: 'rgba(15, 18, 25, 0.95)' }} />
        </span>
      )}
    </span>
  );
}

/**
 * Help badge that shows a "?" with explanation on click
 * Good for form fields and settings
 */
interface HelpBadgeProps {
  text: string;
  className?: string;
}

export function HelpBadge({ text, className = '' }: HelpBadgeProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <span className={`relative inline-block ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold text-[var(--color-text-muted)] bg-[var(--color-bg-secondary)] rounded-full hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
        aria-label="Show help"
      >
        ?
      </button>
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute z-50 bottom-full left-0 mb-2 p-3 bg-[var(--color-bg)] rounded-lg shadow-xl border text-sm text-[var(--color-text-secondary)] w-64 animate-fade-in">
            {text}
          </div>
        </>
      )}
    </span>
  );
}
