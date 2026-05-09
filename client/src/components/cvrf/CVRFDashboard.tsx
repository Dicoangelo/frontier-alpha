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
import { SectionErrorBoundary } from '@/components/shared/ErrorBoundary';
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
    <div>
      {/* Inline header — minimal because page-level Hero already owns the kicker */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 animate-enter">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[image:var(--gradient-sovereign)] rounded-xl flex items-center justify-center shrink-0 shadow-[0_10px_30px_-12px_rgba(123,44,255,0.6)]">
            <Brain className="w-5 h-5 text-white" aria-hidden="true" />
          </div>
          <div>
            <p className="mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-theme-muted">
              Belief Substrate
            </p>
            <h2 className="text-xl font-semibold text-theme">CVRF Dashboard</h2>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isLoading}
          className="px-4 py-2 min-h-[44px] glass-slab-floating rounded-lg text-sm text-theme-secondary hover:text-theme flex items-center gap-2 animate-press transition-[color,background-color] duration-150 disabled:opacity-50"
          aria-label="Refresh CVRF data"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
          <span className="mono text-[10px] tracking-[0.3em] uppercase">Refresh</span>
        </button>
      </div>

      {/* Error State — show full error when all data failed */}
      {isError && hasNoData && (
        <div className="py-12">
          <DataLoadError onRetry={() => refetch()} error="Failed to load CVRF data. Check your connection and try again." />
        </div>
      )}

      {/* Error Banner — partial errors when some data loaded (Toast-pattern rail) */}
      {isError && !hasNoData && (
        <div
          className="mb-6 glass-slab-floating relative overflow-hidden rounded-xl pl-5 pr-4 py-4 shadow-[0_18px_60px_-20px_rgba(239,68,68,0.45)] before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[var(--color-negative)]"
          role="alert"
          aria-live="polite"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-[var(--color-negative)]" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-theme">Partial data</p>
              <p className="text-sm mt-1 text-theme-secondary leading-relaxed">
                Some data failed to load. Check your connection and try refreshing.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Content — each row is wrapped in a SectionErrorBoundary so a
          single child failure (e.g. malformed API payload) shows a localized
          error rail instead of taking down the whole CVRF page. */}
      {!hasNoData && <div className="space-y-6 animate-stagger">
        {/* Row 1: Performance Chart (Full Width) */}
        <SectionErrorBoundary sectionName="Episode Performance">
          <EpisodePerformanceChart />
        </SectionErrorBoundary>

        {/* Row 2: Belief Constellation (Full Width) */}
        <SectionErrorBoundary sectionName="Belief Constellation">
          <BeliefConstellation />
        </SectionErrorBoundary>

        {/* Row 3: Factor Heatmap + Regime Timeline */}
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-8 animate-enter">
            <SectionErrorBoundary sectionName="Factor Heatmap">
              <FactorWeightHeatmap />
            </SectionErrorBoundary>
          </div>
          <div className="col-span-12 lg:col-span-4 animate-enter">
            <SectionErrorBoundary sectionName="Regime Timeline">
              <RegimeTimeline />
            </SectionErrorBoundary>
          </div>
        </div>

        {/* Row 4: Controls, Stats/Beliefs, Cycle History */}
        <div className="grid grid-cols-12 gap-6">
          {/* Left Column - Controls & Timeline */}
          <div className="col-span-12 lg:col-span-4 space-y-6 animate-enter">
            <SectionErrorBoundary sectionName="Episode Controls">
              <CVRFEpisodeControls />
            </SectionErrorBoundary>
            <SectionErrorBoundary sectionName="Episode Timeline">
              <CVRFEpisodeTimeline />
            </SectionErrorBoundary>
          </div>

          {/* Middle Column - Stats & Beliefs */}
          <div className="col-span-12 lg:col-span-4 space-y-6 animate-enter">
            <SectionErrorBoundary sectionName="CVRF Stats">
              <CVRFStatsCard />
            </SectionErrorBoundary>
            <SectionErrorBoundary sectionName="Belief Display">
              <CVRFBeliefDisplay />
            </SectionErrorBoundary>
          </div>

          {/* Right Column - Cycle History */}
          <div className="col-span-12 lg:col-span-4 animate-enter">
            <SectionErrorBoundary sectionName="Cycle History">
              <CVRFCycleHistory />
            </SectionErrorBoundary>
          </div>
        </div>

        {/* Row 5: Conviction Timeline (Full Width) */}
        <SectionErrorBoundary sectionName="Conviction Timeline">
          <ConvictionTimeline />
        </SectionErrorBoundary>

        {/* Row 6: Meta-Prompt (Full Width) */}
        <SectionErrorBoundary sectionName="Meta-Prompt">
          <MetaPromptCard />
        </SectionErrorBoundary>

        {/* Row 7: Episode Comparison (Full Width) */}
        <SectionErrorBoundary sectionName="Episode Comparison">
          <EpisodeComparisonView />
        </SectionErrorBoundary>
      </div>}

      {/* Footer — research credits */}
      {!hasNoData && (
        <div className="mt-8 pt-4 border-t border-[var(--color-border-light)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">
            Based on{' '}
            <a href="#" className="text-[var(--color-accent)] hover:underline">FinCon</a>
            {' · '}
            <a href="#" className="text-[var(--color-accent)] hover:underline">TextGrad</a>
            {' · '}
            <a href="#" className="text-[var(--color-accent)] hover:underline">FLAG-Trader</a>
            {' research'}
          </p>
          <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">
            Frontier Alpha CVRF
          </p>
        </div>
      )}
    </div>
  );
}
