import React from 'react';
import { Skeleton } from '../Skeleton';

export const SkeletonChart = React.memo(function SkeletonChart() {
  return (
    <div className="bg-[var(--color-bg)] rounded-xl shadow-lg p-6">
      <Skeleton variant="text" width={150} height={24} className="mb-4" />
      <Skeleton variant="rectangular" height={250} />
    </div>
  );
});
