import React from 'react';
import { Skeleton } from '../Skeleton';

export const SkeletonFactorExposures = React.memo(function SkeletonFactorExposures() {
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
});
