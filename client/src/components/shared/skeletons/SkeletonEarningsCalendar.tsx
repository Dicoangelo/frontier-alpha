import React from 'react';
import { Skeleton } from '../Skeleton';

export const SkeletonEarningsCalendar = React.memo(function SkeletonEarningsCalendar() {
  return (
    <div className="bg-[var(--color-bg)] rounded-xl shadow-lg p-6">
      <Skeleton variant="text" width={180} height={24} className="mb-4" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between p-4 bg-[var(--color-bg-tertiary)] rounded-lg">
            <div className="flex items-center gap-3">
              <Skeleton variant="rectangular" width={50} height={50} />
              <div>
                <Skeleton variant="text" width={60} height={16} className="mb-1" />
                <Skeleton variant="text" width={100} height={14} />
              </div>
            </div>
            <div className="text-right">
              <Skeleton variant="text" width={80} height={16} className="mb-1" />
              <Skeleton variant="rectangular" width={60} height={24} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});
