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
  const baseStyles = 'animate-pulse bg-gradient-to-r from-[var(--color-border)] via-[var(--color-bg-secondary)] to-[var(--color-border)] bg-[length:200%_100%] animate-shimmer';

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
    <div className={`bg-[var(--color-bg)] rounded-xl shadow-lg p-6 ${className}`}>
      <Skeleton variant="text" width="40%" height={24} className="mb-4" />
      <Skeleton variant="rectangular" height={100} className="mb-4" />
      <Skeleton variant="text" lines={3} />
    </div>
  );
}

export function SkeletonPortfolioOverview() {
  return (
    <div className="bg-[var(--color-bg)] rounded-xl shadow-lg p-6">
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
    <div className="bg-[var(--color-bg)] rounded-xl shadow-lg p-6">
      <Skeleton variant="text" width={120} height={24} className="mb-4" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between py-3 border-b border-[var(--color-border-light)]">
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
    <div className="bg-[var(--color-bg)] rounded-xl shadow-lg p-6">
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
    <div className="bg-[var(--color-bg)] rounded-xl shadow-lg p-6">
      <Skeleton variant="text" width={120} height={24} className="mb-4" />
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="p-3 bg-[var(--color-bg-tertiary)] rounded-lg">
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
    <div className="bg-[var(--color-bg)] rounded-xl shadow-lg p-6">
      <Skeleton variant="text" width={150} height={24} className="mb-4" />
      <Skeleton variant="rectangular" height={250} />
    </div>
  );
}

export function SkeletonEarningsCalendar() {
  return (
    <div className="bg-[var(--color-bg)] rounded-xl shadow-lg p-6">
      <Skeleton variant="text" width={180} height={24} className="mb-4" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between p-4 bg-[var(--color-bg-tertiary)] rounded-lg">
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
      {/* Hero header skeleton — greeting + status pill */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <Skeleton variant="text" width={280} height={32} className="mb-2" />
          <Skeleton variant="text" width={160} height={16} className="mb-3" />
          <div className="flex gap-2">
            <Skeleton variant="rectangular" width={100} height={28} className="rounded-full" />
            <Skeleton variant="rectangular" width={80} height={28} className="rounded-full" />
            <Skeleton variant="rectangular" width={70} height={28} className="rounded-full" />
          </div>
        </div>
        <Skeleton variant="rectangular" width={140} height={36} className="rounded-full" />
      </div>

      {/* Hero portfolio value skeleton */}
      <div className="bg-[var(--color-bg)] rounded-xl shadow-lg p-6">
        <div className="rounded-xl p-5 mb-5" style={{ background: 'var(--color-bg-tertiary)' }}>
          <Skeleton variant="text" width={100} height={12} className="mb-2" />
          <Skeleton variant="text" width={220} height={44} className="mb-2" />
          <Skeleton variant="rectangular" width={180} height={24} className="rounded-full" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-3">
            <Skeleton variant="rectangular" width={40} height={40} className="rounded-lg" />
            <div>
              <Skeleton variant="text" width={80} height={12} className="mb-1" />
              <Skeleton variant="text" width={100} height={20} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Skeleton variant="rectangular" width={40} height={40} className="rounded-lg" />
            <div>
              <Skeleton variant="text" width={60} height={12} className="mb-1" />
              <Skeleton variant="text" width={80} height={20} />
            </div>
          </div>
        </div>
      </div>

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
      <div className="bg-[var(--color-bg)] rounded-xl shadow-sm border">
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

export function SkeletonFactorsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Skeleton variant="text" width={200} height={32} className="mb-2" />
          <Skeleton variant="text" width={320} height={16} />
        </div>
        <Skeleton variant="rectangular" width={100} height={40} />
      </div>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>

      {/* Category Filters */}
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} variant="rectangular" width={i === 0 ? 110 : 130} height={36} className="rounded-lg" />
        ))}
      </div>

      {/* Factor Category Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-[var(--color-bg)] rounded-xl shadow-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <Skeleton variant="rectangular" width={40} height={40} className="rounded-lg" />
              <div>
                <Skeleton variant="text" width={120} height={18} className="mb-1" />
                <Skeleton variant="text" width={200} height={14} />
              </div>
            </div>
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j}>
                  <div className="flex justify-between mb-1">
                    <Skeleton variant="text" width={80} height={14} />
                    <Skeleton variant="text" width={40} height={14} />
                  </div>
                  <Skeleton variant="rectangular" height={8} className="rounded-full" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonCVRFPage() {
  return (
    <div className="min-h-screen bg-[var(--color-bg-tertiary)]">
      {/* Header */}
      <div className="bg-[var(--color-bg)] border-b border-[var(--color-border)] px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton variant="rectangular" width={40} height={40} className="rounded-xl" />
            <div>
              <Skeleton variant="text" width={160} height={24} className="mb-1" />
              <Skeleton variant="text" width={280} height={14} />
            </div>
          </div>
          <Skeleton variant="rectangular" width={100} height={36} className="rounded-lg" />
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Performance Chart */}
        <SkeletonChart />

        {/* Belief Constellation */}
        <div className="bg-[var(--color-bg)] rounded-xl shadow-lg p-6">
          <Skeleton variant="text" width={180} height={24} className="mb-4" />
          <Skeleton variant="rectangular" height={300} />
        </div>

        {/* Factor Heatmap + Regime Timeline */}
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-8">
            <SkeletonChart />
          </div>
          <div className="col-span-12 lg:col-span-4">
            <div className="bg-[var(--color-bg)] rounded-xl shadow-lg p-6">
              <Skeleton variant="text" width={140} height={24} className="mb-4" />
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton variant="circular" width={12} height={12} />
                    <Skeleton variant="text" width="80%" height={16} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 3-column controls */}
        <div className="grid grid-cols-12 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="col-span-12 lg:col-span-4">
              <SkeletonCard />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SkeletonSettingsPage() {
  return (
    <div className="space-y-6 max-w-3xl animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Skeleton variant="text" width={140} height={32} className="mb-2" />
          <Skeleton variant="text" width={320} height={16} />
        </div>
      </div>

      {/* Appearance card */}
      <div className="bg-[var(--color-bg)] rounded-xl shadow-sm border border-[var(--color-border-light)] p-6">
        <div className="flex items-center gap-3 mb-6">
          <Skeleton variant="rectangular" width={40} height={40} className="rounded-lg" />
          <Skeleton variant="text" width={120} height={20} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} variant="rectangular" height={100} className="rounded-xl" />
          ))}
        </div>
      </div>

      {/* Profile card */}
      <div className="bg-[var(--color-bg)] rounded-xl shadow-sm border border-[var(--color-border-light)] p-6">
        <div className="flex items-center gap-3 mb-6">
          <Skeleton variant="rectangular" width={40} height={40} className="rounded-lg" />
          <Skeleton variant="text" width={80} height={20} />
        </div>
        <div className="space-y-4">
          <div>
            <Skeleton variant="text" width={50} height={14} className="mb-2" />
            <Skeleton variant="rectangular" height={44} className="rounded-lg" />
          </div>
          <div>
            <Skeleton variant="text" width={100} height={14} className="mb-2" />
            <Skeleton variant="rectangular" height={44} className="rounded-lg" />
          </div>
        </div>
      </div>

      {/* Risk preferences card */}
      <div className="bg-[var(--color-bg)] rounded-xl shadow-sm border border-[var(--color-border-light)] p-6">
        <div className="flex items-center gap-3 mb-6">
          <Skeleton variant="rectangular" width={40} height={40} className="rounded-lg" />
          <Skeleton variant="text" width={140} height={20} />
        </div>
        <div className="space-y-4">
          <Skeleton variant="text" width={100} height={14} className="mb-2" />
          <div className="flex gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} variant="rectangular" height={48} className="flex-1 rounded-lg" />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-4 mt-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i}>
                <Skeleton variant="text" width="80%" height={14} className="mb-2" />
                <Skeleton variant="rectangular" height={44} className="rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Notifications card */}
      <div className="bg-[var(--color-bg)] rounded-xl shadow-sm border border-[var(--color-border-light)] p-6">
        <div className="flex items-center gap-3 mb-6">
          <Skeleton variant="rectangular" width={40} height={40} className="rounded-lg" />
          <Skeleton variant="text" width={120} height={20} />
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Skeleton variant="text" width={140} height={16} className="mb-1" />
              <Skeleton variant="text" width={200} height={14} />
            </div>
            <Skeleton variant="rectangular" width={44} height={24} className="rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function SkeletonSharedPortfolioPage() {
  return (
    <div className="min-h-screen bg-[var(--color-bg)] animate-fade-in">
      {/* Banner skeleton */}
      <div className="h-16" style={{ background: 'linear-gradient(to right, var(--color-accent), var(--color-info))' }}>
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton variant="rectangular" width={40} height={40} className="rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }} />
            <div>
              <Skeleton variant="text" width={100} height={14} style={{ backgroundColor: 'rgba(255,255,255,0.2)' }} />
              <Skeleton variant="text" width={160} height={20} style={{ backgroundColor: 'rgba(255,255,255,0.3)' }} />
            </div>
          </div>
          <Skeleton variant="rectangular" width={100} height={32} className="rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }} />
        </div>
      </div>

      {/* Owner badge */}
      <div className="max-w-6xl mx-auto px-4 -mt-3">
        <Skeleton variant="rectangular" width={200} height={36} className="rounded-full" />
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* Stats grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-[var(--color-bg)] rounded-xl shadow-sm border border-[var(--color-border-light)] p-4">
              <div className="flex items-center gap-3">
                <Skeleton variant="rectangular" width={48} height={48} className="rounded-lg" />
                <div>
                  <Skeleton variant="text" width={70} height={14} className="mb-1" />
                  <Skeleton variant="text" width={100} height={28} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Holdings table */}
        <div className="bg-[var(--color-bg)] rounded-xl shadow-sm border border-[var(--color-border-light)]">
          <div className="px-6 py-4 border-b border-[var(--color-border-light)]">
            <Skeleton variant="text" width={100} height={24} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <th key={i} className="py-3 px-6">
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

        {/* Factor exposures */}
        <div className="bg-[var(--color-bg)] rounded-xl shadow-sm border border-[var(--color-border-light)] p-6">
          <Skeleton variant="text" width={160} height={24} className="mb-4" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="p-3 bg-[var(--color-bg-tertiary)] rounded-lg">
                <Skeleton variant="text" width="60%" height={12} className="mb-1" />
                <Skeleton variant="text" width="80%" height={16} className="mb-1" />
                <Skeleton variant="text" width="50%" height={24} />
              </div>
            ))}
          </div>
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
        <div className="bg-[var(--color-bg)] rounded-xl shadow-lg p-6">
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
