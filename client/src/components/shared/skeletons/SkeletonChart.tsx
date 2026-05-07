import React from 'react';
import { Skeleton } from '../Skeleton';

// Mirrors EquityCurve.tsx: title row + total-return / alpha stats + timeframe
// pill group + h-64 (256px) canvas + legend row. Container reserves the same
// box so the chart can mount without shifting siblings.
export const SkeletonChart = React.memo(function SkeletonChart() {
  return (
    <div className="bg-[var(--color-bg)] rounded-xl shadow-lg p-6">
      <Skeleton variant="text" width={180} height={20} className="mb-4" />
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-6">
          <div>
            <Skeleton variant="text" width={80} height={12} className="mb-1" />
            <Skeleton variant="text" width={90} height={20} />
          </div>
          <div>
            <Skeleton variant="text" width={70} height={12} className="mb-1" />
            <Skeleton variant="text" width={80} height={20} />
          </div>
        </div>
        {/* Timeframe pill group — 5 buttons matching real control */}
        <div className="flex gap-1 bg-[var(--color-bg-tertiary)] rounded-lg p-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} variant="rectangular" width={36} height={28} className="rounded-md" />
          ))}
        </div>
      </div>
      {/* Canvas reservation — h-64 matches EquityCurve.tsx line 463 */}
      <div className="h-64 w-full">
        <Skeleton variant="rectangular" className="h-full w-full" />
      </div>
      {/* Legend row */}
      <div className="flex items-center justify-center gap-6 mt-4">
        <Skeleton variant="text" width={80} height={14} />
        <Skeleton variant="text" width={80} height={14} />
      </div>
    </div>
  );
});
