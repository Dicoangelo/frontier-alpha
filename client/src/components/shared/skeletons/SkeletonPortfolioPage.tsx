import React from 'react';
import { Skeleton, SkeletonStatCard, SkeletonTableRow } from '../Skeleton';

export const SkeletonPortfolioPage = React.memo(function SkeletonPortfolioPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Skeleton variant="text" width={240} height={32} />
        <div className="flex items-center gap-3">
          <Skeleton variant="rectangular" width={100} height={40} />
          <Skeleton variant="rectangular" width={130} height={40} />
        </div>
      </div>

      {/* 3 Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>

      {/* Table */}
      <div className="bg-[var(--color-bg)] rounded-xl shadow-sm border">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                {['Symbol', 'Shares', 'Avg Cost', 'Current', 'P&L', 'Actions'].map((header) => (
                  <th key={header} className="text-left py-3 px-4">
                    <Skeleton variant="text" width={60} height={14} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonTableRow key={i} columns={6} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
});
