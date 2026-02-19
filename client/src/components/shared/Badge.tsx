interface BadgeProps {
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'default';
  children: React.ReactNode;
  className?: string;
}

const variants = {
  success: 'bg-[rgba(16, 185, 129,0.1)] text-[var(--color-positive)]',
  warning: 'bg-[rgba(234, 179, 8,0.1)] text-[var(--color-warning)]',
  danger: 'bg-[rgba(239, 68, 68,0.1)] text-[var(--color-negative)]',
  info: 'bg-[rgba(59, 130, 246,0.1)] text-[var(--color-info)]',
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
