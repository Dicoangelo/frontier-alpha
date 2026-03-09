import React from 'react';
import { Skeleton } from '../Skeleton';

export const SkeletonRiskMetrics = React.memo(function SkeletonRiskMetrics() {
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
});
