import { useState, useEffect } from 'react';
import { Card } from '@/components/shared/Card';
import { TrendingUp, TrendingDown, Minus, Target, Zap } from 'lucide-react';

interface HistoricalReaction {
  reportDate: string;
  fiscalQuarter: string;
  estimatedEps: number;
  actualEps: number | null;
  surprise: number | null;
  priceMove: number | null;
  postEarningsDrift: number | null;
  outcome: 'beat' | 'miss' | 'inline' | 'unknown';
}

interface Summary {
  quarters: number;
  beatRate: number;
  avgMove: number;
  avgBeatMove: number;
  avgMissMove: number;
}

interface HistoricalReactionsProps {
  symbol: string;
}

export function HistoricalReactions({ symbol }: HistoricalReactionsProps) {
  const [reactions, setReactions] = useState<HistoricalReaction[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!symbol) return;

    const fetchHistory = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/v1/earnings/history/${symbol}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch history: ${response.status}`);
        }

        const data = await response.json();
        if (data.success) {
          setReactions(data.data.reactions || []);
          setSummary(data.data.summary || null);
        } else {
          throw new Error(data.error?.message || 'Unknown error');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load history');
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [symbol]);

  const getOutcomeIcon = (outcome: string) => {
    switch (outcome) {
      case 'beat':
        return <TrendingUp className="w-4 h-4 text-[var(--color-positive)]" />;
      case 'miss':
        return <TrendingDown className="w-4 h-4 text-[var(--color-negative)]" />;
      default:
        return <Minus className="w-4 h-4 text-[var(--color-text-muted)]" />;
    }
  };

  const getOutcomeColor = (outcome: string) => {
    switch (outcome) {
      case 'beat':
        return 'text-[var(--color-positive)] bg-[rgba(16, 185, 129,0.1)]';
      case 'miss':
        return 'text-[var(--color-negative)] bg-[rgba(239, 68, 68,0.1)]';
      default:
        return 'text-[var(--color-text-secondary)] bg-[var(--color-bg-tertiary)]';
    }
  };

  const formatPercent = (value: number | null): string => {
    if (value === null) return '-';
    const formatted = value.toFixed(1);
    return value >= 0 ? `+${formatted}%` : `${formatted}%`;
  };

  if (loading) {
    return (
      <Card title={`${symbol} Earnings History`}>
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-info)]" />
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card title={`${symbol} Earnings History`}>
        <div className="text-center py-8 text-[var(--color-negative)]">
          <p>{error}</p>
        </div>
      </Card>
    );
  }

  return (
    <Card title={`${symbol} Earnings History`}>
      {/* Summary Stats */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-[var(--color-bg-tertiary)] rounded-lg p-3">
            <div className="flex items-center gap-2 text-[var(--color-text-muted)] text-xs mb-1">
              <Target className="w-3 h-3" />
              Beat Rate
            </div>
            <p className={`text-lg font-bold ${summary.beatRate > 60 ? 'text-[var(--color-positive)]' : summary.beatRate < 40 ? 'text-[var(--color-negative)]' : 'text-[var(--color-text-secondary)]'}`}>
              {summary.beatRate.toFixed(0)}%
            </p>
          </div>

          <div className="bg-[var(--color-bg-tertiary)] rounded-lg p-3">
            <div className="flex items-center gap-2 text-[var(--color-text-muted)] text-xs mb-1">
              <Zap className="w-3 h-3" />
              Avg Move
            </div>
            <p className="text-lg font-bold text-[var(--color-text-secondary)]">
              {summary.avgMove.toFixed(1)}%
            </p>
          </div>

          <div className="bg-[rgba(16, 185, 129,0.1)] rounded-lg p-3">
            <div className="flex items-center gap-2 text-[var(--color-positive)] text-xs mb-1">
              <TrendingUp className="w-3 h-3" />
              On Beat
            </div>
            <p className="text-lg font-bold text-[var(--color-positive)]">
              {formatPercent(summary.avgBeatMove)}
            </p>
          </div>

          <div className="bg-[rgba(239, 68, 68,0.1)] rounded-lg p-3">
            <div className="flex items-center gap-2 text-[var(--color-negative)] text-xs mb-1">
              <TrendingDown className="w-3 h-3" />
              On Miss
            </div>
            <p className="text-lg font-bold text-[var(--color-negative)]">
              {formatPercent(summary.avgMissMove)}
            </p>
          </div>
        </div>
      )}

      {/* Reactions Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--color-text-muted)] border-b">
              <th className="pb-2 font-medium">Quarter</th>
              <th className="pb-2 font-medium text-right">EPS Est</th>
              <th className="pb-2 font-medium text-right">EPS Act</th>
              <th className="pb-2 font-medium text-center">Outcome</th>
              <th className="pb-2 font-medium text-right">Day Move</th>
              <th className="pb-2 font-medium text-right hidden sm:table-cell">5-Day Drift</th>
            </tr>
          </thead>
          <tbody>
            {reactions.map((reaction, index) => (
              <tr key={index} className="border-b border-[var(--color-border-light)] last:border-0">
                <td className="py-3">
                  <div className="font-medium text-[var(--color-text)]">{reaction.fiscalQuarter}</div>
                  <div className="text-xs text-[var(--color-text-muted)]">{reaction.reportDate}</div>
                </td>
                <td className="py-3 text-right text-[var(--color-text-secondary)]">
                  ${reaction.estimatedEps.toFixed(2)}
                </td>
                <td className="py-3 text-right text-[var(--color-text)] font-medium">
                  {reaction.actualEps !== null ? `$${reaction.actualEps.toFixed(2)}` : '-'}
                </td>
                <td className="py-3">
                  <div className="flex items-center justify-center gap-1">
                    {getOutcomeIcon(reaction.outcome)}
                    <span className={`text-xs px-2 py-0.5 rounded-full ${getOutcomeColor(reaction.outcome)}`}>
                      {reaction.outcome === 'beat' ? 'Beat' :
                        reaction.outcome === 'miss' ? 'Miss' :
                          reaction.outcome === 'inline' ? 'Inline' : '-'}
                    </span>
                  </div>
                </td>
                <td className={`py-3 text-right font-medium ${
                  (reaction.priceMove ?? 0) >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'
                }`}>
                  {formatPercent(reaction.priceMove)}
                </td>
                <td className={`py-3 text-right hidden sm:table-cell ${
                  (reaction.postEarningsDrift ?? 0) >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'
                }`}>
                  {formatPercent(reaction.postEarningsDrift)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {reactions.length === 0 && (
        <div className="text-center py-8 text-[var(--color-text-muted)]">
          No historical earnings data available
        </div>
      )}

      {/* Visual pattern */}
      {reactions.length > 0 && (
        <div className="mt-4 pt-4 border-t">
          <div className="text-xs text-[var(--color-text-muted)] mb-2">Reaction Pattern (last 8 quarters)</div>
          <div className="flex items-end gap-1 h-16">
            {reactions.slice(0, 8).reverse().map((r, i) => {
              const move = r.priceMove || 0;
              const height = Math.min(100, Math.abs(move) * 10);
              const isPositive = move >= 0;

              return (
                <div
                  key={i}
                  className="flex-1 flex flex-col justify-end items-center"
                  title={`${r.fiscalQuarter}: ${formatPercent(move)}`}
                >
                  <div
                    className={`w-full rounded-t ${isPositive ? 'bg-[var(--color-positive)]' : 'bg-[var(--color-negative)]'}`}
                    style={{ height: `${Math.max(4, height)}%` }}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-xs text-[var(--color-text-muted)] mt-1">
            <span>Oldest</span>
            <span>Recent</span>
          </div>
        </div>
      )}
    </Card>
  );
}
