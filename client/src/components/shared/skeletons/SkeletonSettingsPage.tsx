import React from 'react';
import { Skeleton } from '../Skeleton';

export const SkeletonSettingsPage = React.memo(function SkeletonSettingsPage() {
  return (
    <div className="space-y-6 max-w-3xl animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Skeleton variant="text" width={140} height={32} className="mb-2" />
          <Skeleton variant="text" width={320} height={16} />
        </div>
      </div>

      {/* Appearance card */}
      <div className="bg-[var(--color-bg)] rounded-xl shadow-sm border border-[var(--color-border-light)] p-6">
        <div className="flex items-center gap-3 mb-6">
          <Skeleton variant="rectangular" width={40} height={40} className="rounded-lg" />
          <Skeleton variant="text" width={120} height={20} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} variant="rectangular" height={100} className="rounded-xl" />
          ))}
        </div>
      </div>

      {/* Profile card */}
      <div className="bg-[var(--color-bg)] rounded-xl shadow-sm border border-[var(--color-border-light)] p-6">
        <div className="flex items-center gap-3 mb-6">
          <Skeleton variant="rectangular" width={40} height={40} className="rounded-lg" />
          <Skeleton variant="text" width={80} height={20} />
        </div>
        <div className="space-y-4">
          <div>
            <Skeleton variant="text" width={50} height={14} className="mb-2" />
            <Skeleton variant="rectangular" height={44} className="rounded-lg" />
          </div>
          <div>
            <Skeleton variant="text" width={100} height={14} className="mb-2" />
            <Skeleton variant="rectangular" height={44} className="rounded-lg" />
          </div>
        </div>
      </div>

      {/* Risk preferences card */}
      <div className="bg-[var(--color-bg)] rounded-xl shadow-sm border border-[var(--color-border-light)] p-6">
        <div className="flex items-center gap-3 mb-6">
          <Skeleton variant="rectangular" width={40} height={40} className="rounded-lg" />
          <Skeleton variant="text" width={140} height={20} />
        </div>
        <div className="space-y-4">
          <Skeleton variant="text" width={100} height={14} className="mb-2" />
          <div className="flex gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} variant="rectangular" height={48} className="flex-1 rounded-lg" />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-4 mt-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i}>
                <Skeleton variant="text" width="80%" height={14} className="mb-2" />
                <Skeleton variant="rectangular" height={44} className="rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Notifications card */}
      <div className="bg-[var(--color-bg)] rounded-xl shadow-sm border border-[var(--color-border-light)] p-6">
        <div className="flex items-center gap-3 mb-6">
          <Skeleton variant="rectangular" width={40} height={40} className="rounded-lg" />
          <Skeleton variant="text" width={120} height={20} />
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Skeleton variant="text" width={140} height={16} className="mb-1" />
              <Skeleton variant="text" width={200} height={14} />
            </div>
            <Skeleton variant="rectangular" width={44} height={24} className="rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
});
