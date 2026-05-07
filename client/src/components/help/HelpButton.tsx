import { HelpCircle } from 'lucide-react';

interface HelpButtonProps {
  onClick: () => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

const sizeClasses = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-12 h-12',
};

const iconSizes = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
};

export function HelpButton({
  onClick,
  className = '',
  size = 'md',
  showLabel = false,
}: HelpButtonProps) {
  if (showLabel) {
    return (
      <button
        onClick={onClick}
        className={`
          glass-slab flex items-center gap-2 px-3 py-2 rounded-lg
          text-theme-secondary hover:text-[var(--color-accent)]
          hover:border-[color:var(--color-border-hover)]
          animate-press animate-lift
          focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40
          ${className}
        `}
        aria-label="Open help"
      >
        <HelpCircle className={iconSizes[size]} />
        <span className="text-sm font-medium">Help</span>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`
        glass-slab ${sizeClasses[size]} flex items-center justify-center rounded-full
        text-theme-muted hover:text-[var(--color-accent)]
        hover:border-[color:var(--color-border-hover)]
        animate-press animate-lift
        focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40
        ${className}
      `}
      aria-label="Open help"
    >
      <HelpCircle className={iconSizes[size]} />
    </button>
  );
}

/**
 * Floating help button that stays fixed in the corner
 */
interface FloatingHelpButtonProps {
  onClick: () => void;
  position?: 'bottom-right' | 'bottom-left';
}

export function FloatingHelpButton({
  onClick,
  position = 'bottom-right',
}: FloatingHelpButtonProps) {
  const positionClasses = {
    'bottom-right': 'bottom-20 lg:bottom-6 right-4',
    'bottom-left': 'bottom-20 lg:bottom-6 left-4',
  };

  return (
    <button
      onClick={onClick}
      className={`
        glass-slab-floating fixed ${positionClasses[position]} z-40
        w-12 h-12 rounded-full
        flex items-center justify-center
        text-[var(--color-accent)]
        animate-press animate-lift
        shadow-[0_10px_40px_-10px_rgba(123,44,255,0.55)]
        hover:shadow-[0_18px_60px_-12px_rgba(123,44,255,0.75)]
        focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/50
      `}
      aria-label="Open help (press ? for keyboard shortcut)"
      title="Help (press ?)"
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 rounded-full opacity-30 pointer-events-none"
        style={{ background: 'var(--gradient-sovereign)', filter: 'blur(14px)' }}
      />
      <HelpCircle className="relative w-6 h-6" />
    </button>
  );
}

/**
 * Keyboard shortcut hint shown in header
 */
export function HelpKeyboardHint() {
  return (
    <div className="hidden lg:flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] mono tracking-[0.2em] uppercase text-theme-muted">
      <span>Press</span>
      <kbd className="glass-slab rounded px-1.5 py-0.5 mono text-[10px] text-theme-secondary border border-theme">
        ?
      </kbd>
      <span>for help</span>
    </div>
  );
}
