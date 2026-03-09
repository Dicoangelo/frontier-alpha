import React from 'react';
import { Skeleton, SkeletonCard } from '../Skeleton';
import { SkeletonPositionList } from './SkeletonPositionList';
import { SkeletonFactorExposures } from './SkeletonFactorExposures';
import { SkeletonRiskMetrics } from './SkeletonRiskMetrics';
import { SkeletonChart } from './SkeletonChart';

export const SkeletonDashboard = React.memo(function SkeletonDashboard() {
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
});
