import React from 'react';

interface CardProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  action?: React.ReactNode;
}

export function Card({ title, children, className = '', style, action }: CardProps) {
  return (
    <div className={`surface-card rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 sm:p-5 ${className}`} style={style}>
      {(title || action) && (
        <div className="surface-card-heading flex flex-wrap items-center justify-between gap-3 mb-4">
          {title && <h3 className="text-sm font-semibold text-theme">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
