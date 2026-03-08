interface BadgeProps {
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'default';
  children: React.ReactNode;
  className?: string;
}

const variants = {
  success: 'bg-[color-mix(in_srgb,var(--color-positive)_10%,transparent)] text-[var(--color-positive)]',
  warning: 'bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)] text-[var(--color-warning)]',
  danger: 'bg-[color-mix(in_srgb,var(--color-negative)_10%,transparent)] text-[var(--color-negative)]',
  info: 'bg-[color-mix(in_srgb,var(--color-info)_10%,transparent)] text-[var(--color-info)]',
  neutral: 'bg-[var(--color-bg-secondary)] text-[var(--color-text)]',
  default: 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]',
};

export function Badge({ variant = 'default', children, className = '' }: BadgeProps) {
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
}
