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
    bg-[var(--color-action-primary)] text-white border border-transparent
    hover:bg-[var(--color-action-primary-hover)]
    active:brightness-95
    focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]
  `,
  secondary: `
    bg-[var(--color-bg-secondary)] text-[var(--color-text)] border border-[var(--color-control-border)]
    hover:bg-[var(--color-bg-tertiary)] hover:border-[color:var(--color-text-secondary)]
    focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]
  `,
  danger: `
    bg-[var(--color-action-danger)] text-white
    border border-transparent hover:bg-[var(--color-action-danger-hover)]
    active:brightness-95
    focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]
  `,
  ghost: `
    bg-transparent text-[var(--color-text-secondary)] border border-transparent
    hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text)]
    focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]
  `,
  outline: `
    bg-[var(--color-bg-secondary)] text-[var(--color-text)] border border-[var(--color-control-border)]
    hover:bg-[var(--color-bg-tertiary)] hover:border-[var(--color-text-secondary)]
    focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]
  `,
};

const sizes = {
  sm: 'px-3 py-2 text-sm leading-5 min-h-[var(--control-height)] min-w-[var(--control-height)]',
  md: 'px-4 py-2 text-sm leading-5 min-h-[var(--control-height)] min-w-[var(--control-height)]',
  lg: 'px-5 py-3 text-base leading-6 min-h-[48px] min-w-[48px]',
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
        frontier-button frontier-button-${size} ${variants[variant]} ${sizes[size]}
        rounded-lg font-medium
        transition-[background-color,color,border-color,box-shadow] duration-150
        disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none
        inline-flex items-center justify-center gap-2 whitespace-nowrap
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      type="button"
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
  // The shared token keeps mobile targets at 44px and desktop controls at 40px.
  const iconSizes = {
    sm: 'w-[var(--control-height)] h-[var(--control-height)] min-w-[var(--control-height)] min-h-[var(--control-height)]',
    md: 'w-[var(--control-height)] h-[var(--control-height)] min-w-[var(--control-height)] min-h-[var(--control-height)]',
    lg: 'w-12 h-12 min-w-[48px] min-h-[48px]',
  };

  return (
    <button
      className={`
        ${variants[variant]}
        ${iconSizes[size]}
        rounded-lg
        transition-[background-color,color,border-color,box-shadow] duration-200 ease-out
        disabled:opacity-50 disabled:cursor-not-allowed
        flex items-center justify-center
        ${className}
      `}
      {...props}
    >
      {icon}
    </button>
  );
}
