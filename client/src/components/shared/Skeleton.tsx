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

export function SkeletonStatCard() {
  return (
    <div className="bg-white p-4 rounded-lg border">
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

export function SkeletonPortfolioPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Skeleton variant="text" width={240} height={32} />
        <div className="flex items-center gap-3">
          <Skeleton variant="rectangular" width={100} height={40} />
          <Skeleton variant="rectangular" width={130} height={40} />
        </div>
      </div>

      {/* 3 Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                {['Symbol', 'Shares', 'Avg Cost', 'Current', 'P&L', 'Actions'].map((header) => (
                  <th key={header} className="text-left py-3 px-4">
                    <Skeleton variant="text" width={60} height={14} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonTableRow key={i} columns={6} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function SkeletonEarningsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Skeleton variant="text" width={200} height={32} className="mb-2" />
          <Skeleton variant="text" width={350} height={16} />
        </div>
        <Skeleton variant="rectangular" width={140} height={40} />
      </div>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>

      {/* Calendar and Forecast */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SkeletonEarningsCalendar />
        <div className="bg-white rounded-xl shadow-lg p-6">
          <Skeleton variant="text" width={160} height={24} className="mb-4" />
          <div className="space-y-4">
            <Skeleton variant="rectangular" height={120} />
            <Skeleton variant="text" lines={3} />
            <Skeleton variant="rectangular" height={80} />
          </div>
        </div>
      </div>
    </div>
  );
}
