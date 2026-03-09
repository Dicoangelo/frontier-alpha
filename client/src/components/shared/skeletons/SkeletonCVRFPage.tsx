import React from 'react';
import { Skeleton, SkeletonCard } from '../Skeleton';
import { SkeletonChart } from './SkeletonChart';

export const SkeletonCVRFPage = React.memo(function SkeletonCVRFPage() {
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
});
