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
    <div className={`surface-card rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-5 sm:p-6 ${className}`} style={style}>
      {(title || action) && (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          {title && <h3 className="text-base font-semibold text-theme">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
