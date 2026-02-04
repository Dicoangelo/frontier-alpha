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
    bg-gradient-to-r from-blue-600 to-purple-600 text-white
    hover:from-blue-700 hover:to-purple-700
    active:from-blue-800 active:to-purple-800
    shadow-md hover:shadow-lg active:shadow-sm
    focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
  `,
  secondary: `
    bg-gray-100 text-gray-800
    hover:bg-gray-200 active:bg-gray-300
    focus:ring-2 focus:ring-gray-400 focus:ring-offset-2
  `,
  danger: `
    bg-red-600 text-white
    hover:bg-red-700 active:bg-red-800
    shadow-md hover:shadow-lg active:shadow-sm
    focus:ring-2 focus:ring-red-500 focus:ring-offset-2
  `,
  ghost: `
    bg-transparent text-gray-600
    hover:bg-gray-100 active:bg-gray-200
    focus:ring-2 focus:ring-gray-400 focus:ring-offset-2
  `,
  outline: `
    bg-white text-gray-700 border border-gray-300
    hover:bg-gray-50 hover:border-gray-400 active:bg-gray-100
    focus:ring-2 focus:ring-gray-400 focus:ring-offset-2
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
        transition-all duration-150 ease-out
        transform hover:scale-[1.02] active:scale-[0.98]
        disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none
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
        transition-all duration-150 ease-out
        transform hover:scale-110 active:scale-95
        disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none
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
