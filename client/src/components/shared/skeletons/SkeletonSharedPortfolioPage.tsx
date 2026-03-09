import React from 'react';
import { Skeleton, SkeletonTableRow } from '../Skeleton';

export const SkeletonSharedPortfolioPage = React.memo(function SkeletonSharedPortfolioPage() {
  return (
    <div className="min-h-screen bg-[var(--color-bg)] animate-fade-in">
      {/* Banner skeleton */}
      <div className="h-16" style={{ background: 'linear-gradient(to right, var(--color-accent), var(--color-info))' }}>
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton variant="rectangular" width={40} height={40} className="rounded-lg" style={{ backgroundColor: 'color-mix(in srgb, var(--color-text) 20%, transparent)' }} />
            <div>
              <Skeleton variant="text" width={100} height={14} style={{ backgroundColor: 'color-mix(in srgb, var(--color-text) 20%, transparent)' }} />
              <Skeleton variant="text" width={160} height={20} style={{ backgroundColor: 'color-mix(in srgb, var(--color-text) 30%, transparent)' }} />
            </div>
          </div>
          <Skeleton variant="rectangular" width={100} height={32} className="rounded-full" style={{ backgroundColor: 'color-mix(in srgb, var(--color-text) 20%, transparent)' }} />
        </div>
      </div>

      {/* Owner badge */}
      <div className="max-w-6xl mx-auto px-4 -mt-3">
        <Skeleton variant="rectangular" width={200} height={36} className="rounded-full" />
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* Stats grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-[var(--color-bg)] rounded-xl shadow-sm border border-[var(--color-border-light)] p-4">
              <div className="flex items-center gap-3">
                <Skeleton variant="rectangular" width={48} height={48} className="rounded-lg" />
                <div>
                  <Skeleton variant="text" width={70} height={14} className="mb-1" />
                  <Skeleton variant="text" width={100} height={28} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Holdings table */}
        <div className="bg-[var(--color-bg)] rounded-xl shadow-sm border border-[var(--color-border-light)]">
          <div className="px-6 py-4 border-b border-[var(--color-border-light)]">
            <Skeleton variant="text" width={100} height={24} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <th key={i} className="py-3 px-6">
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

        {/* Factor exposures */}
        <div className="bg-[var(--color-bg)] rounded-xl shadow-sm border border-[var(--color-border-light)] p-6">
          <Skeleton variant="text" width={160} height={24} className="mb-4" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="p-3 bg-[var(--color-bg-tertiary)] rounded-lg">
                <Skeleton variant="text" width="60%" height={12} className="mb-1" />
                <Skeleton variant="text" width="80%" height={16} className="mb-1" />
                <Skeleton variant="text" width="50%" height={24} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
});
