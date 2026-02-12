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

  const returnColor = (episode.portfolioReturn || 0) >= 0 ? 'text-green-600' : 'text-red-600';
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
      className={`rounded-lg border ${
        isActive ? 'border-indigo-500/30 bg-indigo-500/10' : 'border-[var(--color-border)] bg-[var(--color-bg)]'
      } overflow-hidden`}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-[var(--color-bg-tertiary)] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center ${
              isActive ? 'bg-indigo-500 text-white' : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]'
            }`}
          >
            {isActive ? <Play className="w-4 h-4" /> : <Square className="w-4 h-4" />}
          </div>
          <div className="text-left">
            <div className="font-medium text-[var(--color-text)]">
              Episode {episode.episodeNumber}
              {isActive && (
                <span className="ml-2 text-xs bg-indigo-500 text-white px-2 py-0.5 rounded-full">
                  Active
                </span>
              )}
            </div>
            <div className="text-xs text-[var(--color-text-muted)] flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDate(episode.startDate)}
              {duration && ` • ${duration}s`}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {!isActive && episode.portfolioReturn !== undefined && (
            <div className={`flex items-center gap-1 ${returnColor}`}>
              <ReturnIcon className="w-4 h-4" />
              <span className="font-bold">
                {(episode.portfolioReturn * 100).toFixed(2)}%
              </span>
            </div>
          )}
          <div className="text-sm text-[var(--color-text-muted)]">
            {episode.decisionsCount} decisions
          </div>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-[var(--color-text-muted)]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[var(--color-text-muted)]" />
          )}
        </div>
      </button>

      {/* Expanded Details */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-[var(--color-border-light)]">
          <div className="pt-3 grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-xs text-[var(--color-text-muted)]">Return</div>
              <div className={`font-bold ${returnColor}`}>
                {episode.portfolioReturn !== undefined
                  ? `${(episode.portfolioReturn * 100).toFixed(2)}%`
                  : '—'}
              </div>
            </div>
            <div>
              <div className="text-xs text-[var(--color-text-muted)]">Sharpe</div>
              <div className="font-bold text-[var(--color-text)]">
                {episode.sharpeRatio?.toFixed(2) || '—'}
              </div>
            </div>
            <div>
              <div className="text-xs text-[var(--color-text-muted)]">Max DD</div>
              <div className="font-bold text-red-600">
                {episode.maxDrawdown !== undefined
                  ? `${(episode.maxDrawdown * 100).toFixed(2)}%`
                  : '—'}
              </div>
            </div>
          </div>

          {isActive && (
            <div className="mt-3 p-2 bg-indigo-100 rounded text-xs text-indigo-700 text-center">
              Recording decisions... Close episode to run CVRF cycle.
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
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)] p-4 animate-pulse">
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
      <div className="text-red-500 text-sm p-4 bg-red-500/10 rounded-lg">
        Failed to load episodes
      </div>
    );
  }

  // First page has the current episode and total count
  const firstPage = data.pages[0];
  const currentEpisode = firstPage?.current;
  const totalEpisodes = firstPage?.totalEpisodes ?? 0;

  // Flatten completed episodes from all pages
  const allCompleted = data.pages.flatMap((page) => page.completed);

  const hasEpisodes = currentEpisode || allCompleted.length > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-[var(--color-text)]">Episode Timeline</h3>
        <span className="text-xs text-[var(--color-text-muted)]">{totalEpisodes} total</span>
      </div>

      {!hasEpisodes ? (
        <div className="text-center p-8 bg-[var(--color-bg-tertiary)] rounded-lg">
          <div className="text-[var(--color-text-muted)] mb-2">No episodes yet</div>
          <div className="text-sm text-[var(--color-text-muted)]">
            Start a new episode to begin tracking decisions
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {currentEpisode && <EpisodeCard episode={currentEpisode} isActive />}
          {allCompleted.map((episode) => (
            <EpisodeCard key={episode.id} episode={episode} />
          ))}

          {hasNextPage && (
            <button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="w-full py-3 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text)] bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-bg-secondary)] rounded-lg border border-[var(--color-border)] transition-colors disabled:opacity-50"
            >
              {isFetchingNextPage ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
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
