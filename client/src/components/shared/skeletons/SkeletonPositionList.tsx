import React from 'react';
import { Skeleton } from '../Skeleton';

export const SkeletonPositionList = React.memo(function SkeletonPositionList() {
  return (
    <div className="bg-[var(--color-bg)] rounded-xl shadow-lg p-6">
      <Skeleton variant="text" width={120} height={24} className="mb-4" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between py-3 border-b border-[var(--color-border-light)]">
            <div className="flex items-center gap-3">
              <Skeleton variant="circular" width={40} height={40} />
              <div>
                <Skeleton variant="text" width={60} height={16} className="mb-1" />
                <Skeleton variant="text" width={100} height={14} />
              </div>
            </div>
            <div className="text-right">
              <Skeleton variant="text" width={80} height={16} className="mb-1" />
              <Skeleton variant="text" width={60} height={14} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});
