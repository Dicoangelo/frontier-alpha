/**
 * Episode Comparison Component
 *
 * Side-by-side comparison of two episodes showing performance deltas,
 * decision differences, and factor exposure changes.
 */

import { useState } from 'react';
import { GitCompare, TrendingUp, TrendingDown, ArrowRight, X } from 'lucide-react';
import { useCVRFEpisodes } from '@/hooks/useCVRF';
import type { CVRFEpisode } from '@/types/cvrf';


interface MetricComparisonProps {
  label: string;
  valueA: number | undefined;
  valueB: number | undefined;
  format: 'percent' | 'ratio';
  invertColor?: boolean;
}

function MetricComparison({ label, valueA, valueB, format, invertColor }: MetricComparisonProps) {
  const fmt = (v: number | undefined) => {
    if (v === undefined) return '—';
    return format === 'percent' ? `${(v * 100).toFixed(2)}%` : v.toFixed(2);
  };

  const delta = valueA !== undefined && valueB !== undefined ? valueB - valueA : undefined;
  const improved = delta !== undefined ? (invertColor ? delta < 0 : delta > 0) : false;

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center py-2 border-b border-[var(--color-border-light)] last:border-0">
      <div className="text-right font-mono text-sm text-[var(--color-text)]">{fmt(valueA)}</div>
      <div className="text-center">
        <div className="text-xs text-[var(--color-text-muted)] mb-0.5">{label}</div>
        {delta !== undefined && (
          <div className={`text-xs font-bold ${improved ? 'text-green-600' : 'text-red-600'}`}>
            {delta > 0 ? '+' : ''}
            {format === 'percent' ? `${(delta * 100).toFixed(2)}%` : delta.toFixed(2)}
          </div>
        )}
      </div>
      <div className="text-left font-mono text-sm text-[var(--color-text)]">{fmt(valueB)}</div>
    </div>
  );
}

interface EpisodeSelectorProps {
  label: string;
  selected: CVRFEpisode | null;
  episodes: CVRFEpisode[];
  onSelect: (episode: CVRFEpisode) => void;
  onClear: () => void;
}

function EpisodeSelector({ label, selected, episodes, onSelect, onClear }: EpisodeSelectorProps) {
  return (
    <div>
      <div className="text-xs text-[var(--color-text-muted)] mb-1.5">{label}</div>
      {selected ? (
        <div className="flex items-center gap-2 p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
          <span className="text-sm font-medium text-indigo-700">Episode {selected.episodeNumber}</span>
          <span className="text-xs text-[var(--color-text-muted)]">
            {selected.portfolioReturn !== undefined
              ? `${(selected.portfolioReturn * 100).toFixed(2)}%`
              : '—'}
          </span>
          <button
            onClick={onClear}
            className="ml-auto p-0.5 hover:bg-indigo-500/20 rounded"
          >
            <X className="w-3 h-3 text-indigo-500" />
          </button>
        </div>
      ) : (
        <select
          onChange={(e) => {
            const ep = episodes.find((ep) => ep.id === e.target.value);
            if (ep) onSelect(ep);
          }}
          value=""
          className="w-full p-2 text-sm bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)]"
        >
          <option value="" disabled>
            Select episode...
          </option>
          {episodes.map((ep) => (
            <option key={ep.id} value={ep.id}>
              Episode {ep.episodeNumber} (
              {ep.portfolioReturn !== undefined ? `${(ep.portfolioReturn * 100).toFixed(2)}%` : 'N/A'})
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

export function EpisodeComparisonView() {
  const { data: episodesData } = useCVRFEpisodes();
  const [episodeA, setEpisodeA] = useState<CVRFEpisode | null>(null);
  const [episodeB, setEpisodeB] = useState<CVRFEpisode | null>(null);

  const completedEpisodes = (episodesData?.completed || []).filter(
    (e) => e.status === 'completed'
  );

  if (completedEpisodes.length < 2) {
    return null;
  }

  const hasComparison = episodeA && episodeB;

  return (
    <div className="bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)] p-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <GitCompare className="w-5 h-5 text-indigo-500" />
        <h3 className="text-lg font-semibold text-[var(--color-text)]">Episode Comparison</h3>
      </div>

      {/* Episode Selectors */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-end mb-6">
        <EpisodeSelector
          label="Episode A (Earlier)"
          selected={episodeA}
          episodes={completedEpisodes.filter((e) => e.id !== episodeB?.id)}
          onSelect={setEpisodeA}
          onClear={() => setEpisodeA(null)}
        />
        <div className="pb-2">
          <ArrowRight className="w-5 h-5 text-[var(--color-text-muted)]" />
        </div>
        <EpisodeSelector
          label="Episode B (Later)"
          selected={episodeB}
          episodes={completedEpisodes.filter((e) => e.id !== episodeA?.id)}
          onSelect={setEpisodeB}
          onClear={() => setEpisodeB(null)}
        />
      </div>

      {/* Comparison Results */}
      {hasComparison ? (
        <div>
          {/* Performance Summary */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="text-center p-3 bg-[var(--color-bg-tertiary)] rounded-lg">
              <div className="text-xs text-[var(--color-text-muted)]">Return Delta</div>
              {(() => {
                const delta = (episodeB.portfolioReturn || 0) - (episodeA.portfolioReturn || 0);
                return (
                  <div className={`text-lg font-bold ${delta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {delta >= 0 ? '+' : ''}
                    {(delta * 100).toFixed(2)}%
                  </div>
                );
              })()}
            </div>
            <div className="text-center p-3 bg-[var(--color-bg-tertiary)] rounded-lg">
              <div className="text-xs text-[var(--color-text-muted)]">Sharpe Delta</div>
              {(() => {
                const delta = (episodeB.sharpeRatio || 0) - (episodeA.sharpeRatio || 0);
                return (
                  <div className={`text-lg font-bold ${delta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {delta >= 0 ? '+' : ''}
                    {delta.toFixed(2)}
                  </div>
                );
              })()}
            </div>
            <div className="text-center p-3 bg-[var(--color-bg-tertiary)] rounded-lg">
              <div className="text-xs text-[var(--color-text-muted)]">Decision Delta</div>
              <div className="text-lg font-bold text-[var(--color-text)]">
                {episodeB.decisionsCount - episodeA.decisionsCount >= 0 ? '+' : ''}
                {episodeB.decisionsCount - episodeA.decisionsCount}
              </div>
            </div>
          </div>

          {/* Detailed Metrics */}
          <div className="bg-[var(--color-bg-tertiary)] rounded-lg p-4">
            <div className="grid grid-cols-3 gap-3 mb-3 text-center">
              <div className="text-sm font-medium text-indigo-600">
                Episode {episodeA.episodeNumber}
              </div>
              <div className="text-xs text-[var(--color-text-muted)]">Metric</div>
              <div className="text-sm font-medium text-indigo-600">
                Episode {episodeB.episodeNumber}
              </div>
            </div>

            <MetricComparison
              label="Return"
              valueA={episodeA.portfolioReturn}
              valueB={episodeB.portfolioReturn}
              format="percent"
            />
            <MetricComparison
              label="Sharpe"
              valueA={episodeA.sharpeRatio}
              valueB={episodeB.sharpeRatio}
              format="ratio"
            />
            <MetricComparison
              label="Max Drawdown"
              valueA={episodeA.maxDrawdown}
              valueB={episodeB.maxDrawdown}
              format="percent"
              invertColor
            />
            <MetricComparison
              label="Decisions"
              valueA={episodeA.decisionsCount}
              valueB={episodeB.decisionsCount}
              format="ratio"
            />
          </div>

          {/* Improvement Indicator */}
          <div className="mt-4 p-3 rounded-lg border border-[var(--color-border-light)]">
            {(() => {
              const retDelta = (episodeB.portfolioReturn || 0) - (episodeA.portfolioReturn || 0);
              const sharpeDelta = (episodeB.sharpeRatio || 0) - (episodeA.sharpeRatio || 0);
              const improved = retDelta > 0 && sharpeDelta > 0;
              const mixed = retDelta > 0 !== sharpeDelta > 0;

              return (
                <div className="flex items-center gap-2">
                  {improved ? (
                    <TrendingUp className="w-5 h-5 text-green-600" />
                  ) : (
                    <TrendingDown className="w-5 h-5 text-red-600" />
                  )}
                  <span className="text-sm text-[var(--color-text)]">
                    {improved
                      ? 'CVRF beliefs improved both return and risk-adjusted performance.'
                      : mixed
                      ? 'Mixed results — CVRF is still learning optimal factor exposure.'
                      : 'Performance decreased. CVRF will adjust beliefs in the next cycle.'}
                  </span>
                </div>
              );
            })()}
          </div>
        </div>
      ) : (
        <div className="text-center py-6 text-sm text-[var(--color-text-muted)]">
          Select two episodes above to compare their performance
        </div>
      )}
    </div>
  );
}
