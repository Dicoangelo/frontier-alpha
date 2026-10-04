import React from 'react';
import { Skeleton } from '../Skeleton';

// Match the compact desk's market row, KPI strip, chart pair, and holdings table.
export const SkeletonDashboard = React.memo(function SkeletonDashboard() {
  return (
    <div className="space-y-6 animate-fade-in desk-skeleton" role="status" aria-label="Loading portfolio dashboard">
      <div className="skeleton-shimmer h-8 w-full rounded" aria-hidden="true" />
      <div className="flex items-start justify-between gap-4">
        <div><Skeleton variant="text" width={220} height={28} /><Skeleton variant="text" width={270} height={14} className="mt-2" /></div>
        <Skeleton variant="rectangular" width={180} height={32} className="rounded" />
      </div>
      <div className="desk-kpis">
        {Array.from({ length: 4 }, (_, index) => <div className="desk-kpi" key={index} aria-hidden="true"><Skeleton variant="text" width="60%" height={12} /><Skeleton variant="text" width="80%" height={30} className="mt-2" /><Skeleton variant="text" width="65%" height={10} className="mt-2" /></div>)}
      </div>
      <div className="desk-chart-grid">
        <div className="desk-panel p-4" style={{ height: 390 }} aria-hidden="true"><Skeleton variant="text" width={160} height={18} /><Skeleton variant="text" width={100} height={30} className="mt-6" /><Skeleton variant="rectangular" width="100%" height={224} className="mt-4 rounded" /></div>
        <div className="desk-panel p-4" style={{ height: 390 }} aria-hidden="true"><Skeleton variant="text" width={130} height={18} /><Skeleton variant="circular" width={136} height={136} className="my-3 mx-auto" /><Skeleton variant="text" lines={5} /></div>
      </div>
      <div className="desk-panel p-4" aria-hidden="true"><Skeleton variant="text" width={130} height={18} className="mb-6" />{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} variant="rectangular" width="100%" height={34} className="mt-2 rounded" />)}</div>
    </div>
  );
});
