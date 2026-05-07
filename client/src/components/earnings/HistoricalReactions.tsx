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
        return <TrendingUp className="w-4 h-4 text-[var(--color-positive)]" aria-hidden="true" />;
      case 'miss':
        return <TrendingDown className="w-4 h-4 text-[var(--color-negative)]" aria-hidden="true" />;
      default:
        return <Minus className="w-4 h-4 text-theme-muted" aria-hidden="true" />;
    }
  };

  const getOutcomePill = (outcome: string) => {
    switch (outcome) {
      case 'beat':
        return 'text-[var(--color-positive)] bg-[color-mix(in_srgb,var(--color-positive)_12%,transparent)]';
      case 'miss':
        return 'text-[var(--color-negative)] bg-[color-mix(in_srgb,var(--color-negative)_12%,transparent)]';
      default:
        return 'text-theme-secondary bg-theme-tertiary';
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
        <div className="flex items-center justify-center min-h-[192px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-info)]" aria-label="Loading" />
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card title={`${symbol} Earnings History`}>
        <div className="glass-slab-floating relative overflow-hidden rounded-xl pl-5 py-6 px-4 text-center before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[var(--color-negative)]">
          <p className="mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-negative)]">Error</p>
          <p className="text-sm text-theme-secondary mt-1">{error}</p>
        </div>
      </Card>
    );
  }

  return (
    <Card title={`${symbol} Earnings History`}>
      {/* Summary Stats */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6 animate-stagger">
          <div className="glass-slab rounded-xl p-3 animate-enter">
            <div className="flex items-center gap-2 mono text-[10px] tracking-[0.3em] uppercase text-theme-muted mb-1">
              <Target className="w-3 h-3" aria-hidden="true" />
              Beat Rate
            </div>
            <p className={`mono tabular-nums text-lg font-bold ${summary.beatRate > 60 ? 'text-[var(--color-positive)]' : summary.beatRate < 40 ? 'text-[var(--color-negative)]' : 'text-theme-secondary'}`}>
              {summary.beatRate.toFixed(0)}%
            </p>
          </div>

          <div className="glass-slab rounded-xl p-3 animate-enter">
            <div className="flex items-center gap-2 mono text-[10px] tracking-[0.3em] uppercase text-theme-muted mb-1">
              <Zap className="w-3 h-3" aria-hidden="true" />
              Avg Move
            </div>
            <p className="mono tabular-nums text-lg font-bold text-theme-secondary">
              {summary.avgMove.toFixed(1)}%
            </p>
          </div>

          <div
            className="glass-slab-floating relative overflow-hidden rounded-xl p-3 pl-5 animate-enter before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[var(--color-positive)]"
          >
            <div className="flex items-center gap-2 mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-positive)] mb-1">
              <TrendingUp className="w-3 h-3" aria-hidden="true" />
              On Beat
            </div>
            <p className="mono tabular-nums text-lg font-bold text-[var(--color-positive)]">
              {formatPercent(summary.avgBeatMove)}
            </p>
          </div>

          <div
            className="glass-slab-floating relative overflow-hidden rounded-xl p-3 pl-5 animate-enter before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[var(--color-negative)]"
          >
            <div className="flex items-center gap-2 mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-negative)] mb-1">
              <TrendingDown className="w-3 h-3" aria-hidden="true" />
              On Miss
            </div>
            <p className="mono tabular-nums text-lg font-bold text-[var(--color-negative)]">
              {formatPercent(summary.avgMissMove)}
            </p>
          </div>
        </div>
      )}

      {/* Reactions Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left mono text-[10px] tracking-[0.3em] uppercase text-theme-muted border-b border-theme-light">
              <th className="pb-2 font-semibold">Quarter</th>
              <th className="pb-2 font-semibold text-right">EPS Est</th>
              <th className="pb-2 font-semibold text-right">EPS Act</th>
              <th className="pb-2 font-semibold text-center">Outcome</th>
              <th className="pb-2 font-semibold text-right">Day Move</th>
              <th className="pb-2 font-semibold text-right hidden sm:table-cell">5-Day Drift</th>
            </tr>
          </thead>
          <tbody>
            {reactions.map((reaction, index) => (
              <tr key={index} className="border-b border-theme-light last:border-0 transition-colors duration-200 hover:bg-theme-tertiary">
                <td className="py-3">
                  <div className="mono uppercase tracking-wider text-xs font-semibold text-theme">{reaction.fiscalQuarter}</div>
                  <div className="mono tabular-nums text-[10px] text-theme-muted mt-0.5">{reaction.reportDate}</div>
                </td>
                <td className="py-3 text-right mono tabular-nums text-theme-secondary">
                  ${reaction.estimatedEps.toFixed(2)}
                </td>
                <td className="py-3 text-right mono tabular-nums text-theme font-medium">
                  {reaction.actualEps !== null ? `$${reaction.actualEps.toFixed(2)}` : '-'}
                </td>
                <td className="py-3">
                  <div className="flex items-center justify-center gap-1">
                    {getOutcomeIcon(reaction.outcome)}
                    <span className={`mono text-[10px] tracking-wider uppercase font-semibold px-2 py-0.5 rounded-full ${getOutcomePill(reaction.outcome)}`}>
                      {reaction.outcome === 'beat' ? 'Beat' :
                        reaction.outcome === 'miss' ? 'Miss' :
                          reaction.outcome === 'inline' ? 'Inline' : '-'}
                    </span>
                  </div>
                </td>
                <td className={`py-3 text-right mono tabular-nums font-semibold ${
                  (reaction.priceMove ?? 0) >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'
                }`}>
                  {formatPercent(reaction.priceMove)}
                </td>
                <td className={`py-3 text-right mono tabular-nums hidden sm:table-cell ${
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
        <div className="text-center py-8 mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">
          No historical earnings data available
        </div>
      )}

      {/* Visual pattern */}
      {reactions.length > 0 && (
        <div className="mt-4 pt-4 border-t border-theme-light">
          <div className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted mb-2">Reaction Pattern · last 8 quarters</div>
          <div className="flex items-end gap-1 min-h-[64px]">
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
                    className={`w-full rounded-t transition-[height] duration-500 ${isPositive ? 'bg-[var(--color-positive)]' : 'bg-[var(--color-negative)]'}`}
                    style={{ height: `${Math.max(4, height)}%` }}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mono text-[10px] tracking-[0.3em] uppercase text-theme-muted mt-1">
            <span>Oldest</span>
            <span>Recent</span>
          </div>
        </div>
      )}
    </Card>
  );
}
