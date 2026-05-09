/**
 * CVRF Episode Timeline Component
 *
 * Displays trading episodes with their decisions and performance.
 * Uses paginated fetching with a "Load More" button.
 */

import { useState } from 'react';
import { Clock, TrendingUp, TrendingDown, Play, Square, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { useCVRFEpisodesPaginated } from '@/hooks/useCVRF';
import type { CVRFEpisode } from '@/types/cvrf';

interface EpisodeCardProps {
  episode: CVRFEpisode;
  isActive?: boolean;
}

function EpisodeCard({ episode, isActive }: EpisodeCardProps) {
  const [expanded, setExpanded] = useState(isActive);

  const returnColor = (episode.portfolioReturn || 0) >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]';
  const returnIcon = (episode.portfolioReturn || 0) >= 0 ? TrendingUp : TrendingDown;
  const ReturnIcon = returnIcon;

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const duration = episode.endDate
    ? Math.round((new Date(episode.endDate).getTime() - new Date(episode.startDate).getTime()) / 1000)
    : null;

  return (
    <div
      className={`glass-slab rounded-xl overflow-hidden animate-enter transition-[border-color,box-shadow] duration-200 ${
        isActive ? 'shadow-[0_18px_60px_-20px_rgba(123,44,255,0.4)]' : ''
      }`}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between text-left animate-press transition-[background-color] duration-150 hover:bg-[var(--color-bg-tertiary)]"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center ${
              isActive ? 'bg-[image:var(--gradient-sovereign)] text-white' : 'bg-[var(--color-bg-secondary)] text-theme-secondary'
            }`}
            aria-hidden="true"
          >
            {isActive ? <Play className="w-4 h-4" /> : <Square className="w-4 h-4" />}
          </div>
          <div>
            <div className="font-medium text-theme tabular-nums">
              Episode {episode.episodeNumber}
              {isActive && (
                <span className="ml-2 mono text-[10px] tracking-[0.3em] uppercase bg-[image:var(--gradient-sovereign)] text-white px-2 py-0.5 rounded-full">
                  Active
                </span>
              )}
            </div>
            <div className="mono text-[10px] tracking-[0.2em] uppercase text-theme-muted tabular-nums flex items-center gap-1 mt-0.5">
              <Clock className="w-3 h-3" aria-hidden="true" />
              {formatDate(episode.startDate)}
              {duration && ` · ${duration}s`}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {!isActive && episode.portfolioReturn !== undefined && (
            <div className={`flex items-center gap-1 ${returnColor}`}>
              <ReturnIcon className="w-4 h-4" aria-hidden="true" />
              <span className="font-bold tabular-nums">
                {(episode.portfolioReturn * 100).toFixed(2)}%
              </span>
            </div>
          )}
          <div className="text-sm text-theme-muted tabular-nums">
            {episode.decisionsCount} decisions
          </div>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-theme-muted" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-4 h-4 text-theme-muted" aria-hidden="true" />
          )}
        </div>
      </button>

      {/* Expanded Details */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-[var(--color-border-light)]">
          <div className="pt-3 grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Return</p>
              <p className={`font-bold tabular-nums ${returnColor}`}>
                {episode.portfolioReturn !== undefined
                  ? `${(episode.portfolioReturn * 100).toFixed(2)}%`
                  : '—'}
              </p>
            </div>
            <div>
              <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Sharpe</p>
              <p className="font-bold text-theme tabular-nums">
                {episode.sharpeRatio?.toFixed(2) || '—'}
              </p>
            </div>
            <div>
              <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Max DD</p>
              <p className="font-bold text-[var(--color-negative)] tabular-nums">
                {episode.maxDrawdown !== undefined
                  ? `${(episode.maxDrawdown * 100).toFixed(2)}%`
                  : '—'}
              </p>
            </div>
          </div>

          {isActive && (
            <div className="mt-3 p-2 bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] rounded mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-accent)] text-center">
              Recording decisions · close episode to run CVRF cycle
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function CVRFEpisodeTimeline() {
  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useCVRFEpisodesPaginated();

  if (isLoading) {
    return (
      <div className="space-y-3 animate-stagger">
        {[1, 2, 3].map((i) => (
          <div key={i} className="glass-slab rounded-xl p-4 animate-shimmer">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-[var(--color-border)] rounded-full" />
              <div className="space-y-2">
                <div className="h-4 bg-[var(--color-border)] rounded w-24" />
                <div className="h-3 bg-[var(--color-border)] rounded w-32" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div
        className="glass-slab-floating relative overflow-hidden rounded-xl pl-4 pr-3 py-3 shadow-[0_18px_60px_-20px_rgba(239,68,68,0.45)] before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[var(--color-negative)]"
        role="alert"
      >
        <p className="text-[var(--color-negative)] text-sm">Failed to load episodes</p>
      </div>
    );
  }

  // First page has the current episode and total count
  const firstPage = data.pages[0];
  const currentEpisode = firstPage?.current;
  const totalEpisodes = firstPage?.totalEpisodes ?? 0;

  // Flatten completed episodes from all pages — guard against pages where
  // `completed` is undefined (server can omit the field entirely on cold
  // start). flatMap of `undefined` would inject `undefined` slots and
  // crash EpisodeCard downstream.
  const allCompleted = data.pages.flatMap((page) => page?.completed ?? []);

  const hasEpisodes = currentEpisode || allCompleted.length > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <p className="mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-theme-muted mb-1">
            Episode Stream
          </p>
          <h3 className="font-semibold text-theme">Episode Timeline</h3>
        </div>
        <span className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted tabular-nums">
          {totalEpisodes} total
        </span>
      </div>

      {!hasEpisodes ? (
        <div className="glass-slab-floating text-center p-8 rounded-xl">
          <p className="text-theme-muted mb-2">No episodes yet</p>
          <p className="text-sm text-theme-muted">
            Start a new episode to begin tracking decisions
          </p>
        </div>
      ) : (
        <div className="space-y-2 animate-stagger">
          {currentEpisode && <EpisodeCard episode={currentEpisode} isActive />}
          {allCompleted.map((episode) => (
            <EpisodeCard key={episode.id} episode={episode} />
          ))}

          {hasNextPage && (
            <button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="w-full py-3 mono text-[10px] tracking-[0.3em] uppercase font-medium text-theme-secondary hover:text-theme glass-slab-floating rounded-xl animate-press transition-[color,background-color] duration-150 disabled:opacity-50"
            >
              {isFetchingNextPage ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  Loading...
                </span>
              ) : (
                'Load More Episodes'
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
