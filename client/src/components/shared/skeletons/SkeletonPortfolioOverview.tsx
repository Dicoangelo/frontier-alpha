import React from 'react';
import { Skeleton } from '../Skeleton';

// Mirrors PortfolioOverview.tsx: Card title + gradient hero (label, big $value
// + daily-change pill) + 2-col grid of icon stat cards. Box dimensions match
// the loaded card so the next-row chart never shifts up when data arrives.
export const SkeletonPortfolioOverview = React.memo(function SkeletonPortfolioOverview() {
  return (
    <div className="bg-[var(--color-bg)] rounded-xl shadow-lg p-6">
      <Skeleton variant="text" width={180} height={20} className="mb-4" />
      {/* Hero value block — gradient-brand-subtle p-6 mb-5 */}
      <div className="rounded-xl p-6 mb-5 border border-[var(--color-border-light)]" style={{ background: 'var(--color-bg-tertiary)' }}>
        <Skeleton variant="text" width={92} height={12} className="mb-2" />
        <div className="flex items-baseline gap-3 flex-wrap">
          {/* Hero number — text-4xl lg:text-5xl ~48-60px line-height */}
          <Skeleton variant="text" width={260} height={56} />
          {/* Daily change pill */}
          <Skeleton variant="rectangular" width={200} height={28} className="rounded-full" />
        </div>
      </div>
      {/* Stat cards — sm:grid-cols-2 with 40px icon + label + value */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-4 rounded-xl bg-[var(--color-bg-tertiary)]">
            <Skeleton variant="rectangular" width={44} height={44} className="rounded-lg flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <Skeleton variant="text" width={88} height={12} className="mb-1" />
              <Skeleton variant="text" width={120} height={20} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});
