/**
 * CVRF Episode Controls Component
 *
 * Start/close episode buttons with decision recording
 */

import { useState } from 'react';
import {
  Play,
  StopCircle,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  PlusCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  RotateCcw,
} from 'lucide-react';
import { useCVRFEpisodeManager, useRecordDecision } from '@/hooks/useCVRF';

// =============================================================================
// RECORD DECISION MODAL
// =============================================================================

interface RecordDecisionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const ACTION_OPTIONS = [
  { value: 'buy', label: 'Buy', icon: TrendingUp, color: 'text-green-600 bg-green-50 border-green-200' },
  { value: 'sell', label: 'Sell', icon: TrendingDown, color: 'text-red-600 bg-red-50 border-red-200' },
  { value: 'hold', label: 'Hold', icon: Minus, color: 'text-gray-600 bg-gray-50 border-gray-200' },
  { value: 'rebalance', label: 'Rebalance', icon: RotateCcw, color: 'text-blue-600 bg-blue-50 border-blue-200' },
] as const;

function RecordDecisionModal({ isOpen, onClose, onSuccess }: RecordDecisionModalProps) {
  const [symbol, setSymbol] = useState('');
  const [action, setAction] = useState<'buy' | 'sell' | 'hold' | 'rebalance'>('buy');
  const [weightBefore, setWeightBefore] = useState('');
  const [weightAfter, setWeightAfter] = useState('');
  const [reason, setReason] = useState('');
  const [confidence, setConfidence] = useState('75');
  const [error, setError] = useState('');

  const recordDecision = useRecordDecision();

  if (!isOpen) return null;

  const resetForm = () => {
    setSymbol('');
    setAction('buy');
    setWeightBefore('');
    setWeightAfter('');
    setReason('');
    setConfidence('75');
    setError('');
  };

  const handleSubmit = async () => {
    // Validation
    if (!symbol.trim()) {
      setError('Symbol is required');
      return;
    }
    if (!reason.trim()) {
      setError('Reason is required');
      return;
    }

    const wBefore = weightBefore ? parseFloat(weightBefore) / 100 : 0;
    const wAfter = weightAfter ? parseFloat(weightAfter) / 100 : 0;
    const conf = parseFloat(confidence) / 100;

    if (conf < 0 || conf > 1) {
      setError('Confidence must be between 0 and 100');
      return;
    }

    try {
      await recordDecision.mutateAsync({
        symbol: symbol.toUpperCase().trim(),
        action,
        weightBefore: wBefore,
        weightAfter: wAfter,
        reason: reason.trim(),
        confidence: conf,
      });
      resetForm();
      onSuccess();
      onClose();
    } catch (err) {
      setError('Failed to record decision. Please try again.');
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <PlusCircle className="w-5 h-5 text-indigo-500" />
          Record Trading Decision
        </h3>

        {/* Symbol */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Symbol <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            placeholder="e.g., AAPL, NVDA, TSLA"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
          />
        </div>

        {/* Action */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Action <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-4 gap-2">
            {ACTION_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const isSelected = action === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAction(opt.value)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all ${
                    isSelected
                      ? opt.color + ' border-current'
                      : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-xs font-medium">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Weights */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Weight Before (%)
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              placeholder="e.g., 5.0"
              value={weightBefore}
              onChange={(e) => setWeightBefore(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Weight After (%)
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              placeholder="e.g., 10.0"
              value={weightAfter}
              onChange={(e) => setWeightAfter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Confidence Slider */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Confidence: <span className="text-indigo-600 font-bold">{confidence}%</span>
          </label>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={confidence}
            onChange={(e) => setConfidence(e.target.value)}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>Low</span>
            <span>Medium</span>
            <span>High</span>
          </div>
        </div>

        {/* Reason */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Reason <span className="text-red-500">*</span>
          </label>
          <textarea
            placeholder="Why are you making this decision? (e.g., Strong momentum, undervalued, sector rotation...)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleClose}
            disabled={recordDecision.isPending}
            className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={recordDecision.isPending}
            className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {recordDecision.isPending ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Recording...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                Record Decision
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// CLOSE EPISODE MODAL
// =============================================================================

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
    const metrics: Record<string, number> = {};
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

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function CVRFEpisodeControls() {
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showDecisionModal, setShowDecisionModal] = useState(false);
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
    } catch {
      setResult({ type: 'error', message: 'Failed to start episode' });
    }
  };

  const handleCloseEpisode = async (runCycle: boolean, metrics?: Record<string, number>) => {
    try {
      const response = await closeEpisode({ runCvrfCycle: runCycle, metrics });
      setShowCloseModal(false);

      const message = response.cvrfResult
        ? `Episode closed. CVRF cycle complete with ${response.cvrfResult.insightsCount} insights.`
        : 'Episode closed.';

      setResult({ type: 'success', message });
      setTimeout(() => setResult(null), 5000);
    } catch {
      setResult({ type: 'error', message: 'Failed to close episode' });
    }
  };

  const handleDecisionRecorded = () => {
    setResult({ type: 'success', message: 'Decision recorded!' });
    setTimeout(() => setResult(null), 3000);
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
          <>
            <button
              onClick={() => setShowDecisionModal(true)}
              className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 flex items-center justify-center gap-2 transition-colors"
            >
              <PlusCircle className="w-4 h-4" />
              Record Decision
            </button>
            <button
              onClick={() => setShowCloseModal(true)}
              disabled={isClosing}
              className="px-4 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
            >
              <StopCircle className="w-4 h-4" />
              Close
            </button>
          </>
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

      {/* Modals */}
      <CloseEpisodeModal
        isOpen={showCloseModal}
        onClose={() => setShowCloseModal(false)}
        onConfirm={handleCloseEpisode}
        isClosing={isClosing}
      />
      <RecordDecisionModal
        isOpen={showDecisionModal}
        onClose={() => setShowDecisionModal(false)}
        onSuccess={handleDecisionRecorded}
      />
    </div>
  );
}
