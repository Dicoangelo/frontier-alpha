/**
 * CVRF Cycle History Component
 *
 * Displays history of CVRF cycles with performance deltas and insights
 */

import { History, TrendingUp, TrendingDown, Lightbulb, ArrowRight } from 'lucide-react';
import { useCVRFHistory } from '@/hooks/useCVRF';
import type { CVRFCycleResult } from '@/types/cvrf';

interface CycleCardProps {
  cycle: CVRFCycleResult;
  index: number;
}

function CycleCard({ cycle, index }: CycleCardProps) {
  const deltaColor = cycle.performanceDelta >= 0 ? 'text-green-600' : 'text-red-600';
  const DeltaIcon = cycle.performanceDelta >= 0 ? TrendingUp : TrendingDown;

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-sm font-medium text-gray-900">Cycle #{index + 1}</div>
          <div className="text-xs text-gray-500">{formatDate(cycle.timestamp)}</div>
        </div>
        <div className={`flex items-center gap-1 ${deltaColor}`}>
          <DeltaIcon className="w-4 h-4" />
          <span className="font-bold text-sm">
            {cycle.performanceDelta >= 0 ? '+' : ''}
            {(cycle.performanceDelta * 100).toFixed(2)}%
          </span>
        </div>
      </div>

      {/* Episode Comparison */}
      <div className="flex items-center gap-2 text-xs text-gray-600 mb-3">
        <span className="px-2 py-1 bg-white rounded">
          {(cycle.previousEpisodeReturn * 100).toFixed(2)}%
        </span>
        <ArrowRight className="w-3 h-3" />
        <span className="px-2 py-1 bg-white rounded">
          {(cycle.currentEpisodeReturn * 100).toFixed(2)}%
        </span>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="p-2 bg-white rounded">
          <div className="text-xs text-gray-500">τ (Overlap)</div>
          <div className="font-bold text-gray-900">{cycle.decisionOverlap.toFixed(2)}</div>
        </div>
        <div className="p-2 bg-white rounded">
          <div className="text-xs text-gray-500">Insights</div>
          <div className="font-bold text-indigo-600">{cycle.insightsCount}</div>
        </div>
        <div className="p-2 bg-white rounded">
          <div className="text-xs text-gray-500">Updates</div>
          <div className="font-bold text-purple-600">{cycle.beliefUpdatesCount}</div>
        </div>
      </div>

      {/* Regime Change */}
      {cycle.newRegime && (
        <div className="mt-3 flex items-center gap-2 text-xs">
          <span className="text-gray-500">New Regime:</span>
          <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full capitalize">
            {cycle.newRegime}
          </span>
        </div>
      )}
    </div>
  );
}

export function CVRFCycleHistory() {
  const { data: history, isLoading, isError } = useCVRFHistory();

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-gray-100 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-white rounded-xl border border-red-200 p-6">
        <div className="text-red-500 text-sm">Failed to load cycle history</div>
      </div>
    );
  }

  const cycles = history || [];
  const totalInsights = cycles.reduce((sum, c) => sum + c.insightsCount, 0);
  const avgDelta =
    cycles.length > 0
      ? cycles.reduce((sum, c) => sum + c.performanceDelta, 0) / cycles.length
      : 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <History className="w-5 h-5 text-indigo-500" />
          CVRF Cycles
        </h3>
        <span className="text-xs text-gray-500">{cycles.length} cycles</span>
      </div>

      {/* Summary Stats */}
      {cycles.length > 0 && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="p-3 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg">
            <div className="flex items-center gap-1.5 text-indigo-600 mb-1">
              <Lightbulb className="w-4 h-4" />
              <span className="text-xs">Total Insights</span>
            </div>
            <div className="text-2xl font-bold text-indigo-700">{totalInsights}</div>
          </div>
          <div className="p-3 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg">
            <div className="flex items-center gap-1.5 text-green-600 mb-1">
              <TrendingUp className="w-4 h-4" />
              <span className="text-xs">Avg Improvement</span>
            </div>
            <div className={`text-2xl font-bold ${avgDelta >= 0 ? 'text-green-700' : 'text-red-600'}`}>
              {avgDelta >= 0 ? '+' : ''}
              {(avgDelta * 100).toFixed(2)}%
            </div>
          </div>
        </div>
      )}

      {/* Cycle List */}
      {cycles.length === 0 ? (
        <div className="text-center py-8">
          <History className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <div className="text-gray-500 text-sm">No CVRF cycles yet</div>
          <div className="text-gray-400 text-xs mt-1">
            Close an episode with CVRF enabled to see cycles
          </div>
        </div>
      ) : (
        <div className="space-y-3 max-h-[500px] overflow-y-auto">
          {cycles.map((cycle, idx) => (
            <CycleCard key={idx} cycle={cycle} index={cycles.length - 1 - idx} />
          ))}
        </div>
      )}
    </div>
  );
}
