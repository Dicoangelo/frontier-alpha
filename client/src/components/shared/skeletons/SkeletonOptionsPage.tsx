import React from 'react';
import { Skeleton } from '../Skeleton';

export const SkeletonOptionsPage = React.memo(function SkeletonOptionsPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Skeleton variant="text" width={160} height={32} className="mb-2" />
          <Skeleton variant="text" width={320} height={16} />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton variant="rectangular" width={180} height={40} className="rounded-lg" />
          <Skeleton variant="rectangular" width={100} height={40} className="rounded-lg" />
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-4 rounded-xl bg-[var(--color-bg-tertiary)] border border-[var(--color-border-light)]">
            <Skeleton variant="rectangular" width={40} height={40} className="rounded-lg" />
            <div>
              <Skeleton variant="text" width={60} height={12} className="mb-1" />
              <Skeleton variant="text" width={80} height={24} />
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-[var(--color-border)]">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} variant="rectangular" width={i === 0 ? 80 : 100} height={40} className="rounded-t-lg" />
        ))}
      </div>

      {/* Chain Table Skeleton */}
      <div className="bg-[var(--color-bg)] rounded-xl shadow-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <Skeleton variant="text" width={140} height={24} />
          <Skeleton variant="rectangular" width={200} height={36} className="rounded-lg" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              {Array.from({ length: 11 }).map((_, j) => (
                <Skeleton key={j} variant="text" width={j === 5 ? 50 : 45} height={16} className="flex-1" />
              ))}
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-1">
              <Skeleton variant="rectangular" width={12} height={12} className="rounded" />
              <Skeleton variant="text" width={60} height={12} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
