import React from 'react';

interface CardProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}

export function Card({ title, children, className = '', action }: CardProps) {
  return (
    <div className={`glass-slab rounded-sm p-6 transition-shadow duration-200 hover:shadow-lg ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-4">
          {title && <h3 className="text-lg font-semibold text-theme">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
