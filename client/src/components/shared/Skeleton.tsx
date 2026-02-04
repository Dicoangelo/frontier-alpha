import React from 'react';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'rectangular' | 'circular';
  width?: string | number;
  height?: string | number;
  lines?: number;
}

export function Skeleton({
  className = '',
  variant = 'rectangular',
  width,
  height,
  lines = 1,
}: SkeletonProps) {
  const baseStyles = 'animate-pulse bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%] animate-shimmer';

  const variantStyles = {
    text: 'h-4 rounded',
    rectangular: 'rounded-lg',
    circular: 'rounded-full',
  };

  const style: React.CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
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

// Pre-built skeleton layouts
export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-white rounded-xl shadow-lg p-6 ${className}`}>
      <Skeleton variant="text" width="40%" height={24} className="mb-4" />
      <Skeleton variant="rectangular" height={100} className="mb-4" />
      <Skeleton variant="text" lines={3} />
    </div>
  );
}

export function SkeletonPortfolioOverview() {
  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <Skeleton variant="text" width={180} height={28} />
        <Skeleton variant="rectangular" width={100} height={36} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="text-center">
            <Skeleton variant="text" width="60%" height={16} className="mx-auto mb-2" />
            <Skeleton variant="text" width="80%" height={28} className="mx-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonPositionList() {
  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <Skeleton variant="text" width={120} height={24} className="mb-4" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between py-3 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <Skeleton variant="circular" width={40} height={40} />
              <div>
                <Skeleton variant="text" width={60} height={16} className="mb-1" />
                <Skeleton variant="text" width={100} height={14} />
              </div>
            </div>
            <div className="text-right">
              <Skeleton variant="text" width={80} height={16} className="mb-1" />
              <Skeleton variant="text" width={60} height={14} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonFactorExposures() {
  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <Skeleton variant="text" width={140} height={24} className="mb-4" />
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i}>
            <div className="flex justify-between mb-1">
              <Skeleton variant="text" width={80} height={14} />
              <Skeleton variant="text" width={40} height={14} />
            </div>
            <Skeleton variant="rectangular" height={8} className="rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonRiskMetrics() {
  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <Skeleton variant="text" width={120} height={24} className="mb-4" />
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="p-3 bg-gray-50 rounded-lg">
            <Skeleton variant="text" width="70%" height={14} className="mb-2" />
            <div className="flex items-center gap-2">
              <Skeleton variant="circular" width={12} height={12} />
              <Skeleton variant="text" width="50%" height={20} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonChart() {
  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <Skeleton variant="text" width={150} height={24} className="mb-4" />
      <Skeleton variant="rectangular" height={250} />
    </div>
  );
}

export function SkeletonEarningsCalendar() {
  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <Skeleton variant="text" width={180} height={24} className="mb-4" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-3">
              <Skeleton variant="rectangular" width={50} height={50} />
              <div>
                <Skeleton variant="text" width={60} height={16} className="mb-1" />
                <Skeleton variant="text" width={100} height={14} />
              </div>
            </div>
            <div className="text-right">
              <Skeleton variant="text" width={80} height={16} className="mb-1" />
              <Skeleton variant="rectangular" width={60} height={24} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonDashboard() {
  return (
    <div className="space-y-6 animate-fade-in">
      <SkeletonPortfolioOverview />
      <SkeletonChart />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SkeletonPositionList />
        <SkeletonFactorExposures />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SkeletonRiskMetrics />
        <SkeletonCard />
      </div>
    </div>
  );
}
