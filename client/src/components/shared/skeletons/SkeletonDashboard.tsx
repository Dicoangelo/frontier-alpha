import React from 'react';
import { Skeleton } from '../Skeleton';
import { SkeletonPositionList } from './SkeletonPositionList';
import { SkeletonFactorExposures } from './SkeletonFactorExposures';
import { SkeletonRiskMetrics } from './SkeletonRiskMetrics';
import { SkeletonChart } from './SkeletonChart';
import { SkeletonPortfolioOverview } from './SkeletonPortfolioOverview';

// CLS-stable: this skeleton mirrors the real Dashboard.tsx grid exactly
// (MarketStatusStrip + pt-6 hero + lg:grid-cols-3 [2+1] + tertiary zone).
// Container heights match the loaded layout so swap is zero-shift.
export const SkeletonDashboard = React.memo(function SkeletonDashboard() {
  return (
    <div className="space-y-6 animate-fade-in pt-6">
      {/* Market status strip placeholder — matches MarketStatusStrip h ~32px */}
      <div className="skeleton-shimmer h-8 w-full rounded-md" aria-hidden="true" />

      {/* Hero header — greeting + quick actions + live status pill */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <Skeleton variant="text" width={280} height={32} className="mb-2" />
          <Skeleton variant="text" width={160} height={16} className="mb-3" />
          <div className="flex gap-2 mt-3 flex-wrap">
            <Skeleton variant="rectangular" width={120} height={28} className="rounded-full" />
            <Skeleton variant="rectangular" width={92} height={28} className="rounded-full" />
            <Skeleton variant="rectangular" width={76} height={28} className="rounded-full" />
          </div>
        </div>
        {/* Live status pill — fixed width matches glass-slab pill in real header */}
        <div className="glass-slab rounded-full px-4 py-2 flex items-center gap-2 self-start flex-shrink-0 min-w-[168px] h-9">
          <span className="inline-block w-2 h-2 rounded-full bg-[var(--color-text-muted)] opacity-40" />
          <Skeleton variant="text" width={32} height={12} />
          <span className="border-l border-[var(--color-border-light)] pl-2 ml-0.5">
            <Skeleton variant="text" width={56} height={12} />
          </span>
        </div>
      </div>

      {/* Primary + secondary zone — mirrors lg:grid-cols-3 with 2+1 split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-5">
        {/* Primary: PortfolioOverview + EquityCurve */}
        <div className="lg:col-span-2 space-y-5">
          <SkeletonPortfolioOverview />
          <SkeletonChart />
        </div>
        {/* Secondary: WeightAllocation + PositionList */}
        <div className="lg:col-span-1 space-y-5">
          {/* WeightAllocation donut — fixed-size SVG in real component */}
          <div className="bg-[var(--color-bg)] rounded-xl shadow-lg p-6">
            <Skeleton variant="text" width={140} height={20} className="mb-4" />
            <div className="flex justify-center items-center min-h-[220px]">
              <Skeleton variant="circular" width={180} height={180} />
            </div>
          </div>
          <SkeletonPositionList />
        </div>
      </div>

      {/* Tertiary zone — collapsible analytics, 3-col on lg */}
      <div className="bg-[var(--color-bg)] rounded-xl shadow-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <Skeleton variant="text" width={180} height={20} className="mb-1" />
            <Skeleton variant="text" width={260} height={14} />
          </div>
          <Skeleton variant="circular" width={20} height={20} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <SkeletonFactorExposures />
          <SkeletonRiskMetrics />
          <div className="bg-[var(--color-bg-tertiary)] rounded-xl shadow-lg p-6 min-h-[280px]">
            <Skeleton variant="text" width={160} height={20} className="mb-4" />
            <Skeleton variant="text" lines={4} />
            <Skeleton variant="rectangular" height={80} className="mt-4" />
          </div>
        </div>
      </div>
    </div>
  );
});
