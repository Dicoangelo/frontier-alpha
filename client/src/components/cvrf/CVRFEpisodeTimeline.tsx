/**
 * CVRF Episode Timeline Component
 *
 * Displays trading episodes with their decisions and performance
 */

import { useState } from 'react';
import { Clock, TrendingUp, TrendingDown, Play, Square, ChevronDown, ChevronUp } from 'lucide-react';
import { useCVRFEpisodes } from '@/hooks/useCVRF';
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
        isActive ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200 bg-white'
      } overflow-hidden`}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center ${
              isActive ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {isActive ? <Play className="w-4 h-4" /> : <Square className="w-4 h-4" />}
          </div>
          <div className="text-left">
            <div className="font-medium text-gray-900">
              Episode {episode.episodeNumber}
              {isActive && (
                <span className="ml-2 text-xs bg-indigo-500 text-white px-2 py-0.5 rounded-full">
                  Active
                </span>
              )}
            </div>
            <div className="text-xs text-gray-500 flex items-center gap-1">
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
          <div className="text-sm text-gray-500">
            {episode.decisionsCount} decisions
          </div>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </button>

      {/* Expanded Details */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100">
          <div className="pt-3 grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-xs text-gray-500">Return</div>
              <div className={`font-bold ${returnColor}`}>
                {episode.portfolioReturn !== undefined
                  ? `${(episode.portfolioReturn * 100).toFixed(2)}%`
                  : '—'}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Sharpe</div>
              <div className="font-bold text-gray-900">
                {episode.sharpeRatio?.toFixed(2) || '—'}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Max DD</div>
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
  const { data, isLoading, isError } = useCVRFEpisodes();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-lg border border-gray-200 p-4 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gray-200 rounded-full" />
              <div className="space-y-2">
                <div className="h-4 bg-gray-200 rounded w-24" />
                <div className="h-3 bg-gray-200 rounded w-32" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="text-red-500 text-sm p-4 bg-red-50 rounded-lg">
        Failed to load episodes
      </div>
    );
  }

  const hasEpisodes = data.current || data.completed.length > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Episode Timeline</h3>
        <span className="text-xs text-gray-500">{data.totalEpisodes} total</span>
      </div>

      {!hasEpisodes ? (
        <div className="text-center p-8 bg-gray-50 rounded-lg">
          <div className="text-gray-400 mb-2">No episodes yet</div>
          <div className="text-sm text-gray-500">
            Start a new episode to begin tracking decisions
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {data.current && <EpisodeCard episode={data.current} isActive />}
          {data.completed.map((episode) => (
            <EpisodeCard key={episode.id} episode={episode} />
          ))}
        </div>
      )}
    </div>
  );
}
