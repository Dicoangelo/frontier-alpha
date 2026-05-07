import React from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  children: React.ReactNode;
}

const variants = {
  primary: `
    bg-[image:var(--gradient-sovereign)] text-white
    shadow-[0_4px_14px_rgba(123,44,255,0.25)]
    hover:shadow-[0_6px_20px_rgba(123,44,255,0.35)] hover:brightness-110
    active:brightness-95
    focus-visible:ring-2 focus-visible:ring-[var(--brand-amethyst)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]
  `,
  secondary: `
    glass-slab text-[var(--color-text)]
    hover:border-[color:var(--color-border-hover)]
    focus-visible:ring-2 focus-visible:ring-[var(--brand-amethyst)]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]
  `,
  danger: `
    bg-[var(--color-negative)] text-white
    shadow-[0_4px_14px_rgba(239,68,68,0.25)]
    hover:brightness-110 hover:shadow-[0_6px_20px_rgba(239,68,68,0.35)]
    active:brightness-95
    focus-visible:ring-2 focus-visible:ring-[var(--color-negative)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]
  `,
  ghost: `
    bg-transparent text-[var(--color-text-secondary)]
    hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text)]
    focus-visible:ring-2 focus-visible:ring-[var(--brand-amethyst)]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]
  `,
  outline: `
    bg-[var(--color-bg-secondary)] text-[var(--color-text)] border border-[var(--color-border)]
    hover:bg-[var(--color-bg-tertiary)] hover:border-[var(--brand-amethyst)]/40
    focus-visible:ring-2 focus-visible:ring-[var(--brand-amethyst)]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]
  `,
};

const sizes = {
  sm: 'px-3 py-2 text-sm min-h-[44px] min-w-[44px]',
  md: 'px-4 py-2.5 text-base min-h-[44px] min-w-[44px]',
  lg: 'px-6 py-3 text-lg min-h-[48px] min-w-[48px]',
};

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  fullWidth = false,
  leftIcon,
  rightIcon,
  children,
  disabled,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      className={`
        ${variants[variant]} ${sizes[size]}
        rounded-lg font-medium
        animate-press animate-lift
        disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none
        flex items-center justify-center gap-2
        outline-none
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : leftIcon ? (
        <span className="flex-shrink-0">{leftIcon}</span>
      ) : null}
      {children}
      {!isLoading && rightIcon && (
        <span className="flex-shrink-0">{rightIcon}</span>
      )}
    </button>
  );
}

// Icon-only button variant
interface IconButtonProps extends Omit<ButtonProps, 'children' | 'leftIcon' | 'rightIcon'> {
  icon: React.ReactNode;
  'aria-label': string;
}

export function IconButton({
  icon,
  variant = 'ghost',
  size = 'md',
  className = '',
  ...props
}: IconButtonProps) {
  // Minimum 44x44px touch targets for mobile accessibility
  const iconSizes = {
    sm: 'w-11 h-11 min-w-[44px] min-h-[44px]',
    md: 'w-11 h-11 min-w-[44px] min-h-[44px]',
    lg: 'w-12 h-12 min-w-[48px] min-h-[48px]',
  };

  return (
    <button
      className={`
        ${variants[variant]}
        ${iconSizes[size]}
        rounded-lg
        animate-press
        transition-[background-color,color,border-color,box-shadow] duration-200 ease-out
        disabled:opacity-50 disabled:cursor-not-allowed
        flex items-center justify-center
        outline-none
        ${className}
      `}
      {...props}
    >
      {icon}
    </button>
  );
}
