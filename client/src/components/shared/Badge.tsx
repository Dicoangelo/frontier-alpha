interface BadgeProps {
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'default';
  children: React.ReactNode;
  className?: string;
}

const variants = {
  // Opaque surface-based tints keep contrast stable on cards and canvas alike.
  success: 'bg-[color-mix(in_srgb,var(--color-positive)_8%,var(--color-bg-secondary))] text-[var(--color-positive)]',
  warning: 'bg-[color-mix(in_srgb,var(--color-warning)_8%,var(--color-bg-secondary))] text-[var(--color-warning)]',
  danger: 'bg-[color-mix(in_srgb,var(--color-negative)_8%,var(--color-bg-secondary))] text-[var(--color-negative)]',
  info: 'bg-[color-mix(in_srgb,var(--color-info)_8%,var(--color-bg-secondary))] text-[var(--color-info)]',
  neutral: 'bg-[var(--color-bg-secondary)] text-[var(--color-text)]',
  default: 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]',
};

export function Badge({ variant = 'default', children, className = '' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs leading-[18px] font-medium ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
}
