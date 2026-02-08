interface BadgeProps {
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'default';
  children: React.ReactNode;
  className?: string;
}

const variants = {
  success: 'bg-green-500/10 text-green-800',
  warning: 'bg-yellow-500/10 text-yellow-800',
  danger: 'bg-red-500/10 text-red-800',
  info: 'bg-blue-500/10 text-blue-800',
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
