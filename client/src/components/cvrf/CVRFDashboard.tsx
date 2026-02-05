/**
 * CVRF Dashboard Component
 *
 * Main dashboard view combining all CVRF components
 */

import { RefreshCw, Brain, AlertTriangle } from 'lucide-react';
import { useCVRFDashboard } from '@/hooks/useCVRF';
import { CVRFStatsCard } from './CVRFStatsCard';
import { CVRFBeliefDisplay } from './CVRFBeliefDisplay';
import { CVRFEpisodeControls } from './CVRFEpisodeControls';
import { CVRFEpisodeTimeline } from './CVRFEpisodeTimeline';
import { CVRFCycleHistory } from './CVRFCycleHistory';

export function CVRFDashboard() {
  const { isLoading, isError, refetch } = useCVRFDashboard();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">CVRF Dashboard</h1>
              <p className="text-sm text-gray-500">
                Conceptual Verbal Reinforcement Framework
              </p>
            </div>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {isError && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-3">
          <div className="max-w-7xl mx-auto flex items-center gap-2 text-red-700">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm">
              Some data failed to load. Check your connection and try refreshing.
            </span>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
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
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 bg-white px-6 py-4 mt-auto">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-xs text-gray-500">
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
