/**
 * CVRF Stats Card Component
 *
 * Displays CVRF system statistics in a compact card format
 */

import { Activity, Brain, TrendingUp, Target } from 'lucide-react';
import { useCVRFStats, useRegimeDisplay } from '@/hooks/useCVRF';

export function CVRFStatsCard() {
  const { data: stats, isLoading, isError } = useCVRFStats();
  const regime = useRegimeDisplay(stats?.beliefs.regime, parseFloat(stats?.beliefs.regimeConfidence || '0') / 100);

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
        <div className="space-y-3">
          <div className="h-4 bg-gray-200 rounded w-full" />
          <div className="h-4 bg-gray-200 rounded w-2/3" />
          <div className="h-4 bg-gray-200 rounded w-3/4" />
        </div>
      </div>
    );
  }

  if (isError || !stats) {
    return (
      <div className="bg-white rounded-xl border border-red-200 p-6">
        <div className="text-red-500 text-sm">Failed to load CVRF stats</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Brain className="w-5 h-5 text-indigo-500" />
          CVRF Intelligence
        </h3>
        <span className="text-xs text-gray-500">v{stats.beliefs.version}</span>
      </div>

      {/* Regime Badge */}
      <div className="mb-4 p-3 bg-gray-50 rounded-lg">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Current Regime</span>
          <div className="flex items-center gap-2">
            <span className="text-lg">{regime.icon}</span>
            <span className={`font-semibold ${regime.color}`}>{regime.label}</span>
            <span className="text-xs text-gray-500">({regime.confidence})</span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4">
        {/* Episodes */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-gray-500">
            <Activity className="w-4 h-4" />
            <span className="text-xs">Episodes</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{stats.episodes.total}</div>
          <div className="text-xs text-gray-500">{stats.episodes.totalDecisions} decisions</div>
        </div>

        {/* CVRF Cycles */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-gray-500">
            <Brain className="w-4 h-4" />
            <span className="text-xs">CVRF Cycles</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{stats.cvrf.totalCycles}</div>
          <div className="text-xs text-gray-500">{stats.cvrf.totalInsights} insights</div>
        </div>

        {/* Avg Return */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-gray-500">
            <TrendingUp className="w-4 h-4" />
            <span className="text-xs">Avg Return</span>
          </div>
          <div className="text-2xl font-bold text-green-600">{stats.episodes.avgReturn}</div>
          <div className="text-xs text-gray-500">Sharpe: {stats.episodes.avgSharpe}</div>
        </div>

        {/* Learning Rate */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-gray-500">
            <Target className="w-4 h-4" />
            <span className="text-xs">Learning Rate</span>
          </div>
          <div className="text-2xl font-bold text-indigo-600">{stats.cvrf.avgLearningRate}</div>
          <div className="text-xs text-gray-500">τ: {stats.cvrf.avgDecisionOverlap}</div>
        </div>
      </div>

      {/* Factor Weights */}
      <div className="mt-4 pt-4 border-t border-gray-100">
        <div className="text-xs text-gray-500 mb-2">Factor Weights</div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(stats.factors.weights).map(([factor, weight]) => (
            <span
              key={factor}
              className="px-2 py-1 bg-indigo-50 text-indigo-700 text-xs rounded-full"
            >
              {factor}: {weight}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
