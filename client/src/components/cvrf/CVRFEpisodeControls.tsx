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
  { value: 'buy', label: 'Buy', icon: TrendingUp, color: 'text-[var(--color-positive)] bg-[color-mix(in_srgb,var(--color-positive)_10%,transparent)] border-[color-mix(in_srgb,var(--color-positive)_20%,transparent)]' },
  { value: 'sell', label: 'Sell', icon: TrendingDown, color: 'text-[var(--color-negative)] bg-[color-mix(in_srgb,var(--color-negative)_10%,transparent)] border-[color-mix(in_srgb,var(--color-negative)_20%,transparent)]' },
  { value: 'hold', label: 'Hold', icon: Minus, color: 'text-theme-secondary bg-[var(--color-bg-tertiary)] border-[var(--color-border)]' },
  { value: 'rebalance', label: 'Rebalance', icon: RotateCcw, color: 'text-[var(--color-info)] bg-[color-mix(in_srgb,var(--color-info)_10%,transparent)] border-[color-mix(in_srgb,var(--color-info)_20%,transparent)]' },
] as const;

const inputClass =
  'w-full px-3 py-2 border border-[var(--color-border)] rounded-lg bg-[var(--color-bg)] text-theme text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] transition-[box-shadow,border-color] duration-150';

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
    } catch {
      setError('Failed to record decision. Please try again.');
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass-slab-floating rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto animate-enter">
        <p className="mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-theme-muted mb-2">
          New Decision
        </p>
        <h3 className="text-lg font-semibold text-theme mb-4 flex items-center gap-2">
          <PlusCircle className="w-5 h-5 text-[var(--color-accent)]" aria-hidden="true" />
          Record Trading Decision
        </h3>

        {/* Symbol */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-theme-secondary mb-1">
            Symbol <span className="text-[var(--color-negative)]">*</span>
          </label>
          <input
            type="text"
            placeholder="e.g., AAPL, NVDA, TSLA"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            className={`${inputClass} mono tracking-[0.05em]`}
          />
        </div>

        {/* Action */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-theme-secondary mb-2">
            Action <span className="text-[var(--color-negative)]">*</span>
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
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 animate-press transition-[background-color,border-color,color] duration-150 ${
                    isSelected
                      ? opt.color + ' border-current'
                      : 'bg-[var(--color-bg)] border-[var(--color-border)] text-theme-muted hover:border-[var(--color-border)]'
                  }`}
                  aria-pressed={isSelected}
                >
                  <Icon className="w-5 h-5" aria-hidden="true" />
                  <span className="mono text-[10px] tracking-[0.2em] uppercase">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Weights */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-sm font-medium text-theme-secondary mb-1">
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
              className={`${inputClass} tabular-nums`}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-theme-secondary mb-1">
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
              className={`${inputClass} tabular-nums`}
            />
          </div>
        </div>

        {/* Confidence Slider */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-theme-secondary mb-1">
            Confidence: <span className="text-[var(--color-accent)] font-bold tabular-nums">{confidence}%</span>
          </label>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={confidence}
            onChange={(e) => setConfidence(e.target.value)}
            className="w-full h-2 bg-[var(--color-border)] rounded-lg appearance-none cursor-pointer accent-[var(--color-accent)]"
          />
          <div className="flex justify-between mono text-[10px] tracking-[0.2em] uppercase text-theme-muted mt-1">
            <span>Low</span>
            <span>Medium</span>
            <span>High</span>
          </div>
        </div>

        {/* Reason */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-theme-secondary mb-1">
            Reason <span className="text-[var(--color-negative)]">*</span>
          </label>
          <textarea
            placeholder="Why are you making this decision? (e.g., Strong momentum, undervalued, sector rotation...)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className={`${inputClass} resize-none`}
          />
        </div>

        {/* Error */}
        {error && (
          <div
            className="mb-4 glass-slab-floating relative overflow-hidden rounded-xl pl-4 pr-3 py-3 shadow-[0_18px_60px_-20px_rgba(239,68,68,0.45)] before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[var(--color-negative)]"
            role="alert"
          >
            <div className="flex items-center gap-2 text-[var(--color-negative)] text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              {error}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleClose}
            disabled={recordDecision.isPending}
            className="flex-1 px-4 py-2.5 glass-slab-floating rounded-lg text-sm font-medium text-theme-secondary hover:text-theme animate-press transition-[color,background-color] duration-150 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={recordDecision.isPending}
            className="flex-1 px-4 py-2.5 bg-[image:var(--gradient-sovereign)] text-white rounded-lg text-sm font-medium animate-press animate-lift transition-[transform,box-shadow] duration-200 disabled:opacity-50 flex items-center justify-center gap-2 shadow-[0_18px_60px_-20px_rgba(123,44,255,0.45)]"
          >
            {recordDecision.isPending ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
                Recording...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" aria-hidden="true" />
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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass-slab-floating rounded-2xl p-6 w-full max-w-md shadow-2xl animate-enter">
        <p className="mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-theme-muted mb-2">
          Wrap Episode
        </p>
        <h3 className="text-lg font-semibold text-theme mb-4">Close Episode</h3>

        {/* Performance Metrics */}
        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-sm text-theme-secondary mb-1">Portfolio Return (%)</label>
            <input
              type="number"
              step="0.01"
              placeholder="e.g., 2.5"
              value={portfolioReturn}
              onChange={(e) => setPortfolioReturn(e.target.value)}
              className={`${inputClass} tabular-nums`}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-theme-secondary mb-1">Sharpe Ratio</label>
              <input
                type="number"
                step="0.01"
                placeholder="e.g., 1.5"
                value={sharpeRatio}
                onChange={(e) => setSharpeRatio(e.target.value)}
                className={`${inputClass} tabular-nums`}
              />
            </div>
            <div>
              <label className="block text-sm text-theme-secondary mb-1">Max Drawdown (%)</label>
              <input
                type="number"
                step="0.01"
                placeholder="e.g., -5.0"
                value={maxDrawdown}
                onChange={(e) => setMaxDrawdown(e.target.value)}
                className={`${inputClass} tabular-nums`}
              />
            </div>
          </div>
        </div>

        {/* Run CVRF Cycle Toggle */}
        <label
          htmlFor="runCycle"
          className="flex items-center gap-3 p-3 glass-slab-floating rounded-xl mb-4 cursor-pointer animate-press transition-[background-color] duration-150"
        >
          <input
            type="checkbox"
            id="runCycle"
            checked={runCycle}
            onChange={(e) => setRunCycle(e.target.checked)}
            className="w-4 h-4 accent-[var(--color-accent)] rounded"
          />
          <span className="text-sm text-theme-secondary">Run CVRF cycle to update beliefs</span>
        </label>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isClosing}
            className="flex-1 px-4 py-2 glass-slab-floating rounded-lg text-sm font-medium text-theme-secondary hover:text-theme animate-press transition-[color,background-color] duration-150 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isClosing}
            className="flex-1 px-4 py-2 bg-[image:var(--gradient-sovereign)] text-white rounded-lg text-sm font-medium animate-press animate-lift transition-[transform,box-shadow] duration-200 disabled:opacity-50 flex items-center justify-center gap-2 shadow-[0_18px_60px_-20px_rgba(123,44,255,0.45)]"
          >
            {isClosing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
                Closing...
              </>
            ) : (
              <>
                <StopCircle className="w-4 h-4" aria-hidden="true" />
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
      <div className="glass-slab rounded-2xl p-4 sm:p-6 animate-shimmer">
        <div className="h-10 bg-[var(--color-border)] rounded-lg" />
      </div>
    );
  }

  // Result rail accents (Toast pattern)
  const resultRail = result?.type === 'success'
    ? { rail: 'before:bg-[var(--color-positive)]', icon: 'text-[var(--color-positive)]', glow: 'shadow-[0_18px_60px_-20px_rgba(16,185,129,0.45)]' }
    : { rail: 'before:bg-[var(--color-negative)]', icon: 'text-[var(--color-negative)]', glow: 'shadow-[0_18px_60px_-20px_rgba(239,68,68,0.45)]' };

  return (
    <div className="glass-slab rounded-2xl p-4 sm:p-6 animate-enter">
      {/* Status Bar */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              hasActiveEpisode ? 'bg-[var(--color-positive)] animate-pulse-green' : 'bg-[var(--color-border)]'
            }`}
            aria-hidden="true"
          />
          <span className="text-sm font-semibold text-theme tabular-nums">
            {hasActiveEpisode
              ? `Episode ${activeEpisode?.episodeNumber} · learning`
              : 'No active episode'}
          </span>
        </div>
        <span className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted tabular-nums">
          {totalEpisodes} total
        </span>
      </div>

      {/* Status hint — explains what the badge actually means */}
      <p className="text-xs text-theme-muted mb-4">
        {hasActiveEpisode
          ? 'Recording decisions and updating beliefs as new data arrives.'
          : 'Start an episode to record decisions and let CVRF update its beliefs from the outcomes.'}
      </p>

      {/* Action Buttons */}
      <div className="flex gap-3">
        {!hasActiveEpisode ? (
          <button
            onClick={handleStartEpisode}
            disabled={isStarting}
            className="flex-1 px-4 py-2.5 bg-[image:var(--gradient-sovereign)] text-white rounded-lg font-medium animate-press animate-lift transition-[transform,box-shadow] duration-200 disabled:opacity-50 flex items-center justify-center gap-2 shadow-[0_18px_60px_-20px_rgba(123,44,255,0.45)]"
          >
            {isStarting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
                Starting...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" aria-hidden="true" />
                Start Episode
              </>
            )}
          </button>
        ) : (
          <>
            <button
              onClick={() => setShowDecisionModal(true)}
              className="flex-1 px-4 py-2.5 bg-[var(--color-positive)] text-white rounded-lg font-medium animate-press animate-lift transition-[transform,box-shadow] duration-200 flex items-center justify-center gap-2 shadow-[0_18px_60px_-20px_rgba(16,185,129,0.45)]"
            >
              <PlusCircle className="w-4 h-4" aria-hidden="true" />
              Record Decision
            </button>
            <button
              onClick={() => setShowCloseModal(true)}
              disabled={isClosing}
              className="px-4 py-2.5 glass-slab-floating text-[var(--color-negative)] rounded-lg font-medium animate-press transition-[background-color,border-color] duration-150 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <StopCircle className="w-4 h-4" aria-hidden="true" />
              Close
            </button>
          </>
        )}
      </div>

      {/* Active Episode Info */}
      {hasActiveEpisode && activeEpisode && (
        <div className="mt-3 glass-slab-floating rounded-xl p-3 text-sm">
          <div className="flex items-center justify-between text-[var(--color-accent)]">
            <span className="mono text-[10px] tracking-[0.3em] uppercase">Decisions recorded</span>
            <span className="font-bold tabular-nums">{activeEpisode.decisionsCount}</span>
          </div>
          <p className="mono text-[10px] tracking-[0.2em] uppercase text-theme-muted tabular-nums mt-1">
            Recording since{' '}
            {new Date(activeEpisode.startDate).toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
      )}

      {/* Result Toast — type-rail pattern */}
      {result && (
        <div
          className={`mt-3 glass-slab-floating relative overflow-hidden rounded-xl pl-4 pr-3 py-3 ${resultRail.glow} before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] ${resultRail.rail}`}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-2 text-sm">
            {result.type === 'success' ? (
              <CheckCircle className={`w-4 h-4 flex-shrink-0 ${resultRail.icon}`} aria-hidden="true" />
            ) : (
              <AlertCircle className={`w-4 h-4 flex-shrink-0 ${resultRail.icon}`} aria-hidden="true" />
            )}
            <span className="text-theme">{result.message}</span>
          </div>
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
