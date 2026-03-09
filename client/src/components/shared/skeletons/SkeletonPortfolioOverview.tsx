import React from 'react';
import { Skeleton } from '../Skeleton';

export const SkeletonPortfolioOverview = React.memo(function SkeletonPortfolioOverview() {
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
});
