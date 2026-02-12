/**
 * CVRF Dashboard Component
 *
 * Main dashboard view combining all CVRF components:
 * - Performance chart (full width)
 * - Factor heatmap + Regime timeline
 * - Controls, Stats, Beliefs, Cycle History (3 columns)
 * - Episode comparison (full width)
 */

import { RefreshCw, Brain, AlertTriangle } from 'lucide-react';
import { useCVRFDashboard } from '@/hooks/useCVRF';
import { SkeletonCVRFPage } from '@/components/shared/LoadingSkeleton';
import { DataLoadError } from '@/components/shared/EmptyState';
import { CVRFStatsCard } from './CVRFStatsCard';
import { CVRFBeliefDisplay } from './CVRFBeliefDisplay';
import { CVRFEpisodeControls } from './CVRFEpisodeControls';
import { CVRFEpisodeTimeline } from './CVRFEpisodeTimeline';
import { CVRFCycleHistory } from './CVRFCycleHistory';
import { EpisodePerformanceChart } from './EpisodePerformanceChart';
import { EpisodeComparisonView } from './EpisodeComparison';
import { FactorWeightHeatmap } from './FactorWeightHeatmap';
import { RegimeTimeline } from './RegimeTimeline';
import { MetaPromptCard } from './MetaPromptCard';
import { BeliefConstellation } from './BeliefConstellation';
import { ConvictionTimeline } from './ConvictionTimeline';

export function CVRFDashboard() {
  const { isLoading, isError, beliefs, episodes, refetch } = useCVRFDashboard();

  // Show full-page skeleton on initial load (no data yet)
  const hasNoData = !beliefs && !episodes;
  if (isLoading && hasNoData) {
    return <SkeletonCVRFPage />;
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-tertiary)]">
      {/* Header */}
      <div className="bg-[var(--color-bg)] border-b border-[var(--color-border)] px-4 sm:px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shrink-0">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-[var(--color-text)]">CVRF Dashboard</h1>
              <p className="text-sm text-[var(--color-text-muted)]">
                Conceptual Verbal Reinforcement Framework
              </p>
            </div>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="px-4 py-2 min-h-[44px] text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-secondary)] rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Error State — show full error when all data failed */}
      {isError && hasNoData && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
          <DataLoadError onRetry={() => refetch()} error="Failed to load CVRF data. Check your connection and try again." />
        </div>
      )}

      {/* Error Banner — partial errors when some data loaded */}
      {isError && !hasNoData && (
        <div className="bg-red-500/10 border-b border-red-500/20 px-4 sm:px-6 py-3">
          <div className="max-w-7xl mx-auto flex items-center gap-2 text-red-700">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm">
              Some data failed to load. Check your connection and try refreshing.
            </span>
          </div>
        </div>
      )}

      {/* Main Content */}
      {!hasNoData && <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Row 1: Performance Chart (Full Width) */}
        <EpisodePerformanceChart />

        {/* Row 2: Belief Constellation (Full Width) */}
        <BeliefConstellation />

        {/* Row 3: Factor Heatmap + Regime Timeline */}
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-8">
            <FactorWeightHeatmap />
          </div>
          <div className="col-span-12 lg:col-span-4">
            <RegimeTimeline />
          </div>
        </div>

        {/* Row 3: Controls, Stats/Beliefs, Cycle History */}
        <div className="grid grid-cols-12 gap-6">
          {/* Left Column - Controls & Timeline */}
          <div className="col-span-12 lg:col-span-4 space-y-6">
            <CVRFEpisodeControls />
            <CVRFEpisodeTimeline />
          </div>

          {/* Middle Column - Stats & Beliefs */}
          <div className="col-span-12 lg:col-span-4 space-y-6">
            <CVRFStatsCard />
            <CVRFBeliefDisplay />
          </div>

          {/* Right Column - Cycle History */}
          <div className="col-span-12 lg:col-span-4">
            <CVRFCycleHistory />
          </div>
        </div>

        {/* Row 4: Conviction Timeline (Full Width) */}
        <ConvictionTimeline />

        {/* Row 5: Meta-Prompt (Full Width) */}
        <MetaPromptCard />

        {/* Row 6: Episode Comparison (Full Width) */}
        <EpisodeComparisonView />
      </div>}

      {/* Footer */}
      <div className="border-t border-[var(--color-border)] bg-[var(--color-bg)] px-4 sm:px-6 py-4 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-[var(--color-text-muted)]">
          <div>
            Based on{' '}
            <a href="#" className="text-indigo-600 hover:underline">
              FinCon
            </a>
            ,{' '}
            <a href="#" className="text-indigo-600 hover:underline">
              TextGrad
            </a>
            , and{' '}
            <a href="#" className="text-indigo-600 hover:underline">
              FLAG-Trader
            </a>{' '}
            research
          </div>
          <div>Frontier Alpha CVRF</div>
        </div>
      </div>
    </div>
  );
}
