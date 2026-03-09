import React from 'react';
import { Skeleton, SkeletonStatCard } from '../Skeleton';

export const SkeletonFactorsPage = React.memo(function SkeletonFactorsPage() {
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
});
