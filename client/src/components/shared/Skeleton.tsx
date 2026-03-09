import React from 'react';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'rectangular' | 'circular';
  width?: string | number;
  height?: string | number;
  lines?: number;
  style?: React.CSSProperties;
}

export function Skeleton({
  className = '',
  variant = 'rectangular',
  width,
  height,
  lines = 1,
  style: styleProp,
}: SkeletonProps) {
  const baseStyles = 'bg-gradient-to-r from-[var(--color-border)] via-[var(--color-bg-secondary)] to-[var(--color-border)] bg-[length:200%_100%] animate-shimmer';

  const variantStyles = {
    text: 'h-4 rounded',
    rectangular: 'rounded-lg',
    circular: 'rounded-full',
  };

  const style: React.CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
    ...styleProp,
  };

  if (variant === 'text' && lines > 1) {
    return (
      <div className={`space-y-2 ${className}`}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={`${baseStyles} ${variantStyles.text}`}
            style={{
              ...style,
              width: i === lines - 1 ? '75%' : style.width || '100%',
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`${baseStyles} ${variantStyles[variant]} ${className}`}
      style={style}
    />
  );
}

// Pre-built small skeleton primitives
export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-[var(--color-bg)] rounded-xl shadow-lg p-6 ${className}`}>
      <Skeleton variant="text" width="40%" height={24} className="mb-4" />
      <Skeleton variant="rectangular" height={100} className="mb-4" />
      <Skeleton variant="text" lines={3} />
    </div>
  );
}

export function SkeletonStatCard() {
  return (
    <div className="bg-[var(--color-bg)] p-4 rounded-lg border">
      <Skeleton variant="text" width="60%" height={14} className="mb-2" />
      <Skeleton variant="text" width="80%" height={28} />
    </div>
  );
}

export function SkeletonTableRow({ columns = 6 }: { columns?: number }) {
  return (
    <tr className="border-b">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="py-3 px-4">
          <Skeleton variant="text" width={i === 0 ? 60 : 80} height={16} />
        </td>
      ))}
    </tr>
  );
}

// Re-export all page-specific skeletons for backwards compatibility
export {
  SkeletonDashboard,
  SkeletonPortfolioPage,
  SkeletonPortfolioOverview,
  SkeletonPositionList,
  SkeletonFactorExposures,
  SkeletonRiskMetrics,
  SkeletonChart,
  SkeletonEarningsCalendar,
  SkeletonEarningsPage,
  SkeletonFactorsPage,
  SkeletonOptionsPage,
  SkeletonSettingsPage,
  SkeletonCVRFPage,
  SkeletonSharedPortfolioPage,
} from './skeletons';
