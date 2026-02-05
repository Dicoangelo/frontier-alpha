/**
 * CVRF Episode Controls Component
 *
 * Start/close episode buttons with status indicators
 */

import { useState } from 'react';
import { Play, StopCircle, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import { useCVRFEpisodeManager } from '@/hooks/useCVRF';

interface CloseEpisodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (runCycle: boolean, metrics?: {
    portfolioReturn?: number;
    sharpeRatio?: number;
    maxDrawdown?: number;
    volatility?: number;
  }) => void;
  isClosing: boolean;
}

function CloseEpisodeModal({ isOpen, onClose, onConfirm, isClosing }: CloseEpisodeModalProps) {
  const [runCycle, setRunCycle] = useState(true);
  const [portfolioReturn, setPortfolioReturn] = useState('');
  const [sharpeRatio, setSharpeRatio] = useState('');
  const [maxDrawdown, setMaxDrawdown] = useState('');

  if (!isOpen) return null;

  const handleSubmit = () => {
    const metrics: any = {};
    if (portfolioReturn) metrics.portfolioReturn = parseFloat(portfolioReturn) / 100;
    if (sharpeRatio) metrics.sharpeRatio = parseFloat(sharpeRatio);
    if (maxDrawdown) metrics.maxDrawdown = parseFloat(maxDrawdown) / 100;

    onConfirm(runCycle, Object.keys(metrics).length > 0 ? metrics : undefined);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Close Episode</h3>

        {/* Performance Metrics */}
        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Portfolio Return (%)</label>
            <input
              type="number"
              step="0.01"
              placeholder="e.g., 2.5"
              value={portfolioReturn}
              onChange={(e) => setPortfolioReturn(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Sharpe Ratio</label>
              <input
                type="number"
                step="0.01"
                placeholder="e.g., 1.5"
                value={sharpeRatio}
                onChange={(e) => setSharpeRatio(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Max Drawdown (%)</label>
              <input
                type="number"
                step="0.01"
                placeholder="e.g., -5.0"
                value={maxDrawdown}
                onChange={(e) => setMaxDrawdown(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Run CVRF Cycle Toggle */}
        <div className="flex items-center gap-3 p-3 bg-indigo-50 rounded-lg mb-4">
          <input
            type="checkbox"
            id="runCycle"
            checked={runCycle}
            onChange={(e) => setRunCycle(e.target.checked)}
            className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
          />
          <label htmlFor="runCycle" className="text-sm text-gray-700">
            Run CVRF cycle to update beliefs
          </label>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isClosing}
            className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isClosing}
            className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isClosing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Closing...
              </>
            ) : (
              <>
                <StopCircle className="w-4 h-4" />
                Close Episode
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export function CVRFEpisodeControls() {
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const {
    hasActiveEpisode,
    activeEpisode,
    totalEpisodes,
    isLoading,
    startEpisode,
    closeEpisode,
    isStarting,
    isClosing,
  } = useCVRFEpisodeManager();

  const handleStartEpisode = async () => {
    try {
      await startEpisode();
      setResult({ type: 'success', message: 'Episode started!' });
      setTimeout(() => setResult(null), 3000);
    } catch (error) {
      setResult({ type: 'error', message: 'Failed to start episode' });
    }
  };

  const handleCloseEpisode = async (runCycle: boolean, metrics?: any) => {
    try {
      const response = await closeEpisode({ runCvrfCycle: runCycle, metrics });
      setShowCloseModal(false);

      const message = response.cvrfResult
        ? `Episode closed. CVRF cycle complete with ${response.cvrfResult.insightsCount} insights.`
        : 'Episode closed.';

      setResult({ type: 'success', message });
      setTimeout(() => setResult(null), 5000);
    } catch (error) {
      setResult({ type: 'error', message: 'Failed to close episode' });
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
        <div className="h-10 bg-gray-200 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      {/* Status Bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              hasActiveEpisode ? 'bg-green-500 animate-pulse' : 'bg-gray-300'
            }`}
          />
          <span className="text-sm text-gray-600">
            {hasActiveEpisode
              ? `Episode ${activeEpisode?.episodeNumber} active`
              : 'No active episode'}
          </span>
        </div>
        <span className="text-xs text-gray-400">{totalEpisodes} total episodes</span>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        {!hasActiveEpisode ? (
          <button
            onClick={handleStartEpisode}
            disabled={isStarting}
            className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
          >
            {isStarting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Start Episode
              </>
            )}
          </button>
        ) : (
          <button
            onClick={() => setShowCloseModal(true)}
            disabled={isClosing}
            className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
          >
            <StopCircle className="w-4 h-4" />
            Close Episode
          </button>
        )}
      </div>

      {/* Active Episode Info */}
      {hasActiveEpisode && activeEpisode && (
        <div className="mt-3 p-3 bg-indigo-50 rounded-lg text-sm">
          <div className="flex items-center justify-between text-indigo-700">
            <span>Decisions recorded:</span>
            <span className="font-bold">{activeEpisode.decisionsCount}</span>
          </div>
          <div className="text-xs text-indigo-600 mt-1">
            Recording since{' '}
            {new Date(activeEpisode.startDate).toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
        </div>
      )}

      {/* Result Toast */}
      {result && (
        <div
          className={`mt-3 p-3 rounded-lg flex items-center gap-2 text-sm ${
            result.type === 'success'
              ? 'bg-green-50 text-green-700'
              : 'bg-red-50 text-red-700'
          }`}
        >
          {result.type === 'success' ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <AlertCircle className="w-4 h-4" />
          )}
          {result.message}
        </div>
      )}

      {/* Close Episode Modal */}
      <CloseEpisodeModal
        isOpen={showCloseModal}
        onClose={() => setShowCloseModal(false)}
        onConfirm={handleCloseEpisode}
        isClosing={isClosing}
      />
    </div>
  );
}
