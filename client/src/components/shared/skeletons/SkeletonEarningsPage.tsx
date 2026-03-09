import React from 'react';
import { Skeleton, SkeletonStatCard } from '../Skeleton';
import { SkeletonEarningsCalendar } from './SkeletonEarningsCalendar';

export const SkeletonEarningsPage = React.memo(function SkeletonEarningsPage() {
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
});
