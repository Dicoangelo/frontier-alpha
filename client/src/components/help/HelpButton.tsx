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
          flex items-center gap-2 px-3 py-2
          text-[var(--color-text-secondary)] hover:text-blue-600
          bg-[var(--color-bg-tertiary)] hover:bg-blue-500/10
          border border-[var(--color-border)] hover:border-blue-500/20
          rounded-lg transition-all duration-150
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
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
        ${sizeClasses[size]}
        flex items-center justify-center
        text-[var(--color-text-muted)] hover:text-blue-600
        bg-[var(--color-bg)] hover:bg-blue-500/10
        border border-[var(--color-border)] hover:border-blue-300
        rounded-full shadow-sm hover:shadow
        transition-all duration-150
        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
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
        fixed ${positionClasses[position]} z-40
        w-12 h-12
        flex items-center justify-center
        bg-gradient-to-r from-blue-600 to-purple-600
        text-white
        rounded-full shadow-lg hover:shadow-xl
        transition-all duration-200
        hover:scale-110 active:scale-95
        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
      `}
      aria-label="Open help (press ? for keyboard shortcut)"
      title="Help (press ?)"
    >
      <HelpCircle className="w-6 h-6" />
    </button>
  );
}

/**
 * Keyboard shortcut hint shown in header
 */
export function HelpKeyboardHint() {
  return (
    <div className="hidden lg:flex items-center gap-1.5 px-2 py-1 bg-[var(--color-bg-secondary)] rounded text-xs text-[var(--color-text-muted)]">
      <span>Press</span>
      <kbd className="px-1.5 py-0.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-[var(--color-text-secondary)] font-mono">?</kbd>
      <span>for help</span>
    </div>
  );
}
