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
      <div className="text-right mono text-sm text-theme tabular-nums">{fmt(valueA)}</div>
      <div className="text-center">
        <p className="mono text-[10px] tracking-[0.2em] uppercase text-theme-muted mb-0.5">{label}</p>
        {delta !== undefined && (
          <div className={`text-xs font-bold mono tabular-nums ${improved ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
            {delta > 0 ? '+' : ''}
            {format === 'percent' ? `${(delta * 100).toFixed(2)}%` : delta.toFixed(2)}
          </div>
        )}
      </div>
      <div className="text-left mono text-sm text-theme tabular-nums">{fmt(valueB)}</div>
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
      <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted mb-1.5">{label}</p>
      {selected ? (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--color-accent)_20%,transparent)]">
          <span className="text-sm font-medium text-[var(--color-accent)] tabular-nums">Episode {selected.episodeNumber}</span>
          <span className="mono text-[10px] tracking-[0.1em] text-theme-muted tabular-nums">
            {selected.portfolioReturn !== undefined
              ? `${(selected.portfolioReturn * 100).toFixed(2)}%`
              : '—'}
          </span>
          <button
            onClick={onClear}
            className="ml-auto p-0.5 hover:bg-[color-mix(in_srgb,var(--color-accent)_20%,transparent)] rounded animate-press transition-[background-color] duration-150"
            aria-label="Clear selection"
          >
            <X className="w-3 h-3 text-[var(--color-accent)]" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <select
          onChange={(e) => {
            const ep = episodes.find((ep) => ep.id === e.target.value);
            if (ep) onSelect(ep);
          }}
          value=""
          className="w-full p-2 text-sm bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg text-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] transition-[box-shadow,border-color] duration-150"
          aria-label={label}
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

  const completedEpisodes = (episodesData?.completed ?? []).filter(
    (e) => e?.status === 'completed'
  );

  if (completedEpisodes.length < 2) {
    return null;
  }

  const hasComparison = episodeA && episodeB;

  return (
    <div className="glass-slab rounded-2xl p-6 sm:p-8 animate-enter">
      {/* Header */}
      <div className="mb-4">
        <p className="mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-theme-muted mb-2">
          Side-by-Side
        </p>
        <h3 className="text-lg font-semibold text-theme flex items-center gap-2">
          <GitCompare className="w-5 h-5 text-[var(--color-accent)]" aria-hidden="true" />
          Episode Comparison
        </h3>
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
          <ArrowRight className="w-5 h-5 text-theme-muted" aria-hidden="true" />
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
          <div className="grid grid-cols-3 gap-3 mb-4 animate-stagger">
            <div className="glass-slab-floating rounded-xl p-3 text-center animate-enter">
              <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Return Δ</p>
              {(() => {
                const delta = (episodeB.portfolioReturn || 0) - (episodeA.portfolioReturn || 0);
                return (
                  <p className={`text-lg font-bold tabular-nums mt-0.5 ${delta >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
                    {delta >= 0 ? '+' : ''}
                    {(delta * 100).toFixed(2)}%
                  </p>
                );
              })()}
            </div>
            <div className="glass-slab-floating rounded-xl p-3 text-center animate-enter">
              <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Sharpe Δ</p>
              {(() => {
                const delta = (episodeB.sharpeRatio || 0) - (episodeA.sharpeRatio || 0);
                return (
                  <p className={`text-lg font-bold tabular-nums mt-0.5 ${delta >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
                    {delta >= 0 ? '+' : ''}
                    {delta.toFixed(2)}
                  </p>
                );
              })()}
            </div>
            <div className="glass-slab-floating rounded-xl p-3 text-center animate-enter">
              <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Decisions Δ</p>
              <p className="text-lg font-bold text-theme tabular-nums mt-0.5">
                {episodeB.decisionsCount - episodeA.decisionsCount >= 0 ? '+' : ''}
                {episodeB.decisionsCount - episodeA.decisionsCount}
              </p>
            </div>
          </div>

          {/* Detailed Metrics */}
          <div className="glass-slab-floating rounded-xl p-4">
            <div className="grid grid-cols-3 gap-3 mb-3 text-center">
              <div className="mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-accent)] tabular-nums">
                Episode {episodeA.episodeNumber}
              </div>
              <div className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Metric</div>
              <div className="mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-accent)] tabular-nums">
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
          <div className="mt-4 glass-slab-floating rounded-xl p-3">
            {(() => {
              const retDelta = (episodeB.portfolioReturn || 0) - (episodeA.portfolioReturn || 0);
              const sharpeDelta = (episodeB.sharpeRatio || 0) - (episodeA.sharpeRatio || 0);
              const improved = retDelta > 0 && sharpeDelta > 0;
              const mixed = retDelta > 0 !== sharpeDelta > 0;

              return (
                <div className="flex items-center gap-2">
                  {improved ? (
                    <TrendingUp className="w-5 h-5 text-[var(--color-positive)]" aria-hidden="true" />
                  ) : (
                    <TrendingDown className="w-5 h-5 text-[var(--color-negative)]" aria-hidden="true" />
                  )}
                  <span className="text-sm text-theme">
                    {improved
                      ? 'CVRF beliefs improved both return and risk-adjusted performance.'
                      : mixed
                      ? 'Mixed results. CVRF is still learning optimal factor exposure.'
                      : 'Performance decreased. CVRF will adjust beliefs in the next cycle.'}
                  </span>
                </div>
              );
            })()}
          </div>
        </div>
      ) : (
        <div className="text-center py-6 text-sm text-theme-muted">
          Select two episodes above to compare their performance
        </div>
      )}
    </div>
  );
}
