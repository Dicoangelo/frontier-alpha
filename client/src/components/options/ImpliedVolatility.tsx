import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  AlertCircle,
  RefreshCw,
  Info,
  BarChart3,
  ArrowRight,
} from 'lucide-react';
import { Card } from '@/components/shared/Card';
import { Button } from '@/components/shared/Button';
import { api } from '@/api/client';

interface IVData {
  symbol: string;
  currentPrice: number;
  ivRank: number;
  ivPercentile: number;
  atmIV: number;
  iv30: number;
  iv60: number;
  iv90: number;
  hv30: number;
  hv60: number;
  hv90: number;
  putCallRatio: number;
  expectedMove: {
    weekly: number;
    monthly: number;
    quarterly: number;
    earnings?: number;
  };
  expectedMoveInDollars?: {
    weekly: number;
    monthly: number;
    quarterly: number;
    earnings?: number;
  };
  skew: number;
  termStructure: 'contango' | 'backwardation' | 'flat';
  dataSource: 'options' | 'historical' | 'hybrid';
  straddlePrice?: number;
  signal: 'high_iv' | 'low_iv' | 'neutral';
  recommendation: string;
  ivVsHV: number;
}

interface PortfolioIV {
  averageIV: number;
  averageHV: number;
  averageIVRank: number;
  averageIVvsHV: number;
  highIVPositions: string[];
  lowIVPositions: string[];
  highSkewPositions: string[];
  backwardationPositions: string[];
  insights: {
    overallSignal: 'high_iv' | 'low_iv' | 'neutral';
    recommendation: string;
  };
}

interface ImpliedVolatilityProps {
  symbols: string[];
  className?: string;
  showDollars?: boolean;
}

const signalColors: Record<string, string> = {
  high_iv: 'text-[var(--color-warning)] bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)]',
  low_iv: 'text-[var(--color-positive)] bg-[color-mix(in_srgb,var(--color-positive)_10%,transparent)]',
  neutral: 'text-[var(--color-text-secondary)] bg-[var(--color-bg-tertiary)]',
};

const signalIcons: Record<string, typeof TrendingUp> = {
  high_iv: TrendingUp,
  low_iv: TrendingDown,
  neutral: Minus,
};

const termStructureColors: Record<string, string> = {
  contango: 'text-[var(--color-info)] bg-[color-mix(in_srgb,var(--color-info)_10%,transparent)]',
  backwardation: 'text-[var(--color-warning)] bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)]',
  flat: 'text-[var(--color-text-secondary)] bg-[var(--color-bg-tertiary)]',
};

function IVRankBar({ rank }: { rank: number }) {
  const getColor = (r: number) => {
    if (r >= 70) return 'bg-[var(--color-warning)]';
    if (r <= 30) return 'bg-[var(--color-positive)]';
    return 'bg-[var(--color-info)]';
  };

  return (
    <div className="w-full h-2 bg-[var(--color-border)] rounded-full overflow-hidden">
      <div
        className={`h-full ${getColor(rank)} transition-[width] duration-500 ease-out`}
        style={{ width: `${rank}%` }}
      />
    </div>
  );
}

/**
 * Semi-circular gauge for IV visualization
 */
function IVGauge({ value, label, max = 100 }: { value: number; label: string; max?: number }) {
  const percentage = Math.min((value / max) * 100, 100);
  const rotation = (percentage / 100) * 180 - 90; // -90 to 90 degrees

  const getColor = (v: number) => {
    if (v >= 70) return 'var(--color-warning)';
    if (v <= 30) return 'var(--color-positive)';
    return 'var(--color-info)';
  };

  return (
    <div className="relative w-24 h-12 mx-auto">
      {/* Background arc */}
      <svg className="w-full h-full" viewBox="0 0 100 50">
        <path
          d="M 5 50 A 45 45 0 0 1 95 50"
          fill="none"
          stroke="var(--color-border)"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <path
          d="M 5 50 A 45 45 0 0 1 95 50"
          fill="none"
          stroke={getColor(value)}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${(percentage / 100) * 141.4} 141.4`}
        />
      </svg>
      {/* Needle */}
      <div
        className="absolute bottom-0 left-1/2 w-0.5 h-8 bg-[var(--color-text)] origin-bottom rounded-full"
        style={{ transform: `translateX(-50%) rotate(${rotation}deg)` }}
      />
      {/* Value display */}
      <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-center">
        <p className="mono text-lg font-bold tabular-nums text-theme">{Math.round(value)}</p>
        <p className="mono text-[10px] tracking-[0.2em] uppercase text-theme-muted">{label}</p>
      </div>
    </div>
  );
}

/**
 * IV vs HV comparison bar
 */
function IVvsHVBar({ iv, hv }: { iv: number; hv: number }) {
  const ratio = hv > 0 ? iv / hv : 1;
  const premium = ratio > 1 ? '+' : '';
  const premiumPercent = Math.round((ratio - 1) * 100);

  return (
    <div className="space-y-1">
      <div className="flex justify-between mono text-[10px] tracking-[0.2em] uppercase text-theme-muted">
        <span className="tabular-nums">HV30: {hv}%</span>
        <span className="tabular-nums">IV: {iv}%</span>
      </div>
      <div className="relative h-2 bg-[var(--color-border)] rounded-full overflow-hidden">
        <div
          className="absolute h-full bg-[var(--color-bg-tertiary)]"
          style={{ width: `${Math.min(hv / 100 * 100, 100)}%` }}
        />
        <div
          className={`absolute h-full transition-[width] duration-500 ease-out ${ratio >= 1.2 ? 'bg-[var(--color-warning)]' : ratio <= 0.9 ? 'bg-[var(--color-positive)]' : 'bg-[var(--color-info)]'}`}
          style={{ width: `${Math.min(iv / 100 * 100, 100)}%` }}
        />
      </div>
      <p className="mono text-[10px] tracking-[0.2em] uppercase text-center tabular-nums text-theme-secondary">
        IV/HV: {ratio.toFixed(2)}x ({premium}{premiumPercent}%)
      </p>
    </div>
  );
}

export const ImpliedVolatility = React.memo(function ImpliedVolatility({
  symbols,
  className = '',
  showDollars = true,
}: ImpliedVolatilityProps) {
  const {
    data: response,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['implied-volatility', symbols.join(',')],
    queryFn: () => api.get(`/options/iv?symbols=${symbols.join(',')}`),
    enabled: symbols.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 10 * 60 * 1000, // Auto-refresh every 10 minutes
  });

  const ivData: Record<string, IVData> = response?.data?.symbols || {};
  const portfolioIV: PortfolioIV | null = response?.data?.portfolio || null;
  const ivList = Object.values(ivData);

  // Sort by IV rank (highest first for attention)
  const sortedIVList = [...ivList].sort((a, b) => b.ivRank - a.ivRank);

  return (
    <Card className={`p-6 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-theme-muted">
            Implied Volatility
          </p>
          <h3 className="mt-1 text-lg font-semibold text-theme flex items-center gap-2">
            <Activity className="w-5 h-5 text-[var(--color-accent)]" aria-hidden="true" />
            Volatility surface
          </h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          aria-label="Refresh implied volatility data"
        >
          <RefreshCw
            className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
        </Button>
      </div>

      {/* Portfolio Summary */}
      {portfolioIV && (
        <div className="space-y-4 mb-6">
          {/* IV Gauge and Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 glass-slab-floating rounded-xl p-4">
            <div className="flex flex-col items-center justify-center py-2">
              <IVGauge value={portfolioIV.averageIVRank} label="IV Rank" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="text-center glass-slab-floating rounded-lg p-2">
                <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Avg IV</p>
                <p className="mt-0.5 mono text-lg font-bold tabular-nums text-theme">{portfolioIV.averageIV}%</p>
              </div>
              <div className="text-center glass-slab-floating rounded-lg p-2">
                <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Avg HV</p>
                <p className="mt-0.5 mono text-lg font-bold tabular-nums text-theme">{portfolioIV.averageHV}%</p>
              </div>
              <div className="text-center glass-slab-floating rounded-lg p-2 col-span-2">
                <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">IV/HV Ratio</p>
                <p className={`mt-0.5 mono text-lg font-bold tabular-nums ${
                  portfolioIV.averageIVvsHV >= 1.2 ? 'text-[var(--color-warning)]' :
                  portfolioIV.averageIVvsHV <= 0.9 ? 'text-[var(--color-positive)]' : 'text-[var(--color-info)]'
                }`}>
                  {portfolioIV.averageIVvsHV}x
                </p>
              </div>
            </div>
            <div className="flex flex-col justify-center">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-[var(--color-warning)]" />
                  <span className="text-sm text-[var(--color-text-secondary)]">High IV:</span>
                  <span className="text-sm font-medium">
                    {portfolioIV.highIVPositions.length > 0
                      ? portfolioIV.highIVPositions.slice(0, 3).join(', ')
                      : 'None'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-[var(--color-positive)]" />
                  <span className="text-sm text-[var(--color-text-secondary)]">Low IV:</span>
                  <span className="text-sm font-medium">
                    {portfolioIV.lowIVPositions.length > 0
                      ? portfolioIV.lowIVPositions.slice(0, 3).join(', ')
                      : 'None'}
                  </span>
                </div>
                {portfolioIV.backwardationPositions.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-[var(--color-warning)]" />
                    <span className="text-sm text-[var(--color-text-secondary)]">Backwardation:</span>
                    <span className="text-sm font-medium">
                      {portfolioIV.backwardationPositions.slice(0, 3).join(', ')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Portfolio Insight */}
          {portfolioIV.insights && (() => {
            const railColor =
              portfolioIV.insights.overallSignal === 'high_iv'
                ? 'var(--color-warning)'
                : portfolioIV.insights.overallSignal === 'low_iv'
                ? 'var(--color-positive)'
                : 'var(--color-info)';
            return (
              <div
                className="glass-slab-floating relative overflow-hidden rounded-xl pl-5 pr-4 py-3 before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px]"
                style={{
                  backgroundColor: `color-mix(in srgb, ${railColor} 8%, transparent)`,
                  ['--rail-color' as string]: railColor,
                }}
              >
                <span aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ backgroundColor: railColor }} />
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: railColor }} />
                  <p className="text-sm leading-relaxed text-theme-secondary">
                    {portfolioIV.insights.recommendation}
                  </p>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="py-8 text-center text-theme-muted">
          <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin" aria-hidden="true" />
          <p className="mono text-[11px] tracking-[0.2em] uppercase">Loading IV data...</p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="py-6 text-center">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 text-[var(--color-warning)]" aria-hidden="true" />
          <p className="text-theme-secondary">Failed to load IV data</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-2"
            onClick={() => refetch()}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && ivList.length === 0 && (
        <div className="py-8 text-center text-theme-muted">
          <Activity className="w-8 h-8 mx-auto mb-2" aria-hidden="true" />
          <p className="mono text-[11px] tracking-[0.2em] uppercase">No IV data available</p>
          <p className="text-sm mt-1">Add symbols to see implied volatility</p>
        </div>
      )}

      {/* IV List */}
      {sortedIVList.length > 0 && (
        <div className="space-y-4">
          {sortedIVList.map((iv) => {
            const SignalIcon = signalIcons[iv.signal];
            return (
              <div
                key={iv.symbol}
                className="glass-slab-floating rounded-xl p-4 transition-[border-color,box-shadow] duration-200 hover:shadow-lg"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-[var(--color-text)]">{iv.symbol}</span>
                    {iv.currentPrice > 0 && (
                      <span className="text-sm text-[var(--color-text-muted)]">${iv.currentPrice}</span>
                    )}
                    <span
                      className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        signalColors[iv.signal]
                      }`}
                    >
                      <SignalIcon className="w-3 h-3" />
                      {iv.signal === 'high_iv' && 'High IV'}
                      {iv.signal === 'low_iv' && 'Low IV'}
                      {iv.signal === 'neutral' && 'Neutral'}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        termStructureColors[iv.termStructure]
                      }`}
                    >
                      {iv.termStructure}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="mono text-2xl font-bold tabular-nums text-[var(--color-accent)]">{iv.atmIV}%</span>
                    <p className="mono text-[10px] tracking-[0.2em] uppercase text-theme-muted">ATM IV</p>
                  </div>
                </div>

                {/* IV Rank Bar */}
                <div className="mb-3">
                  <div className="flex justify-between mono text-[10px] tracking-[0.2em] uppercase text-theme-muted mb-1">
                    <span>IV Rank</span>
                    <span className="tabular-nums">{iv.ivRank}/100</span>
                  </div>
                  <IVRankBar rank={iv.ivRank} />
                </div>

                {/* IV vs HV */}
                <div className="mb-3">
                  <IVvsHVBar iv={iv.atmIV} hv={iv.hv30} />
                </div>

                {/* Expected Moves */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="text-center glass-slab-floating rounded-lg p-2">
                    <p className="mono text-[10px] tracking-[0.2em] uppercase text-theme-muted">Weekly</p>
                    <p className="mt-0.5 mono text-sm font-semibold tabular-nums text-theme">±{iv.expectedMove.weekly}%</p>
                    {showDollars && iv.expectedMoveInDollars && (
                      <p className="mono text-[10px] tabular-nums text-theme-muted">
                        ±${iv.expectedMoveInDollars.weekly}
                      </p>
                    )}
                  </div>
                  <div className="text-center glass-slab-floating rounded-lg p-2">
                    <p className="mono text-[10px] tracking-[0.2em] uppercase text-theme-muted">Monthly</p>
                    <p className="mt-0.5 mono text-sm font-semibold tabular-nums text-theme">±{iv.expectedMove.monthly}%</p>
                    {showDollars && iv.expectedMoveInDollars && (
                      <p className="mono text-[10px] tabular-nums text-theme-muted">
                        ±${iv.expectedMoveInDollars.monthly}
                      </p>
                    )}
                  </div>
                  <div className="text-center glass-slab-floating rounded-lg p-2">
                    <p className="mono text-[10px] tracking-[0.2em] uppercase text-theme-muted">Quarterly</p>
                    <p className="mt-0.5 mono text-sm font-semibold tabular-nums text-theme">±{iv.expectedMove.quarterly}%</p>
                    {showDollars && iv.expectedMoveInDollars && (
                      <p className="mono text-[10px] tabular-nums text-theme-muted">
                        ±${iv.expectedMoveInDollars.quarterly}
                      </p>
                    )}
                  </div>
                </div>

                {/* Earnings Expected Move (if available) */}
                {iv.expectedMove.earnings !== undefined && (
                  <div
                    className="glass-slab-floating relative overflow-hidden rounded-xl mb-3 pl-5 pr-3 py-2 before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px]"
                    style={{
                      backgroundColor: 'color-mix(in srgb, var(--color-accent) 8%, transparent)',
                    }}
                  >
                    <span aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-[3px] bg-[image:var(--gradient-sovereign)]" />
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-[var(--color-accent)]" aria-hidden="true" />
                        <span className="mono text-[10px] tracking-[0.2em] uppercase font-medium text-[var(--color-accent)]">
                          Options-Implied Earnings Move
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="mono text-lg font-bold tabular-nums text-[var(--color-accent)]">
                          ±{iv.expectedMove.earnings}%
                        </span>
                        {iv.straddlePrice && (
                          <p className="mono text-[10px] tabular-nums text-[var(--color-accent)]">
                            Straddle: ${iv.straddlePrice}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Term Structure */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="text-center glass-slab-floating rounded-lg p-1.5">
                    <p className="mono text-[10px] tracking-[0.2em] uppercase text-theme-muted">IV30</p>
                    <p className="mono text-xs font-medium tabular-nums text-theme">{iv.iv30}%</p>
                  </div>
                  <div className="text-center glass-slab-floating rounded-lg p-1.5">
                    <p className="mono text-[10px] tracking-[0.2em] uppercase text-theme-muted">IV60</p>
                    <p className="mono text-xs font-medium tabular-nums text-theme">{iv.iv60}%</p>
                  </div>
                  <div className="text-center glass-slab-floating rounded-lg p-1.5">
                    <p className="mono text-[10px] tracking-[0.2em] uppercase text-theme-muted">IV90</p>
                    <p className="mono text-xs font-medium tabular-nums text-theme">{iv.iv90}%</p>
                  </div>
                </div>

                {/* Additional metrics */}
                <div className="flex flex-wrap items-center justify-between gap-2 mono text-[10px] tracking-[0.2em] uppercase text-theme-secondary">
                  <span className="tabular-nums">P/C Ratio: {iv.putCallRatio}</span>
                  <span className="tabular-nums">Skew: {iv.skew > 0 ? '+' : ''}{iv.skew}%</span>
                  <span className={`mono text-[10px] tracking-[0.2em] uppercase px-2 py-0.5 rounded-full ${
                    iv.dataSource === 'options' ? 'bg-[color-mix(in_srgb,var(--color-positive)_12%,transparent)] text-[var(--color-positive)]' : 'glass-slab-floating text-theme-secondary'
                  }`}>
                    {iv.dataSource === 'options' ? 'Live Options' : 'Historical'}
                  </span>
                </div>

                {/* Recommendation */}
                {iv.recommendation && (
                  <p className="text-xs leading-relaxed text-theme-muted mt-2 italic">{iv.recommendation}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      {symbols.length > 0 && (
        <div className="mt-4 pt-3 border-t border-theme-light">
          <p className="text-xs leading-relaxed text-theme-muted">
            IV Rank shows where current IV stands vs 52-week range. High IV (&gt;70) suggests
            expensive options, low IV (&lt;30) suggests cheap options.
          </p>
        </div>
      )}
    </Card>
  );
});

// Compact version for dashboard
export function ImpliedVolatilityCompact({
  symbols,
  className = '',
}: ImpliedVolatilityProps) {
  const { data: response, isLoading } = useQuery({
    queryKey: ['implied-volatility', symbols.join(',')],
    queryFn: () => api.get(`/options/iv?symbols=${symbols.join(',')}`),
    enabled: symbols.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const portfolioIV: PortfolioIV | null = response?.data?.portfolio || null;

  if (isLoading) {
    return (
      <div className={`glass-slab-floating rounded-xl p-4 ${className}`}>
        <div className="animate-shimmer flex items-center gap-3">
          <div className="w-8 h-8 bg-[var(--color-border)] rounded" />
          <div className="flex-1">
            <div className="h-4 bg-[var(--color-border)] rounded w-24 mb-1" />
            <div className="h-3 bg-[var(--color-border)] rounded w-16" />
          </div>
        </div>
      </div>
    );
  }

  if (!portfolioIV) return null;

  const signal = portfolioIV.insights?.overallSignal;
  const railColor =
    signal === 'high_iv' ? 'var(--color-warning)' :
    signal === 'low_iv' ? 'var(--color-positive)' :
    'var(--color-accent)';

  return (
    <div
      className={`glass-slab-floating relative overflow-hidden rounded-xl pl-5 pr-4 py-4 before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] ${className}`}
      style={{ backgroundColor: `color-mix(in srgb, ${railColor} 8%, transparent)` }}
    >
      <span aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ backgroundColor: railColor }} />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="w-5 h-5 text-[var(--color-accent)]" aria-hidden="true" />
          <div>
            <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Portfolio IV</p>
            <p className="mt-0.5 mono text-xs tabular-nums text-theme-secondary">
              Rank: {portfolioIV.averageIVRank} · IV/HV: {portfolioIV.averageIVvsHV}x
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="mono text-2xl font-bold tabular-nums text-[var(--color-accent)]">{portfolioIV.averageIV}%</p>
          <p className="mono text-[10px] tabular-nums text-theme-muted">HV: {portfolioIV.averageHV}%</p>
        </div>
      </div>
    </div>
  );
}

// Earnings-specific IV component
interface EarningsIVProps {
  symbol: string;
  daysToEarnings: number;
  historicalAvgMove?: number;
  className?: string;
}

export function EarningsIV({
  symbol,
  daysToEarnings,
  historicalAvgMove = 5,
  className = '',
}: EarningsIVProps) {
  const { data: response, isLoading } = useQuery({
    queryKey: ['implied-volatility', symbol],
    queryFn: () => api.get(`/options/iv?symbols=${symbol}`),
    enabled: !!symbol,
    staleTime: 5 * 60 * 1000,
  });

  const ivData: IVData | null = response?.data?.symbols?.[symbol] || null;

  if (isLoading) {
    return (
      <div className={`glass-slab-floating rounded-xl p-4 animate-shimmer ${className}`}>
        <div className="h-6 bg-[var(--color-border)] rounded w-3/4 mb-2" />
        <div className="h-4 bg-[var(--color-border)] rounded w-1/2" />
      </div>
    );
  }

  if (!ivData) {
    return (
      <div className={`glass-slab-floating rounded-xl p-4 ${className}`}>
        <p className="text-sm text-theme-muted">IV data not available for {symbol}</p>
      </div>
    );
  }

  // Calculate options-implied move for earnings timeframe
  const optionsMove = ivData.expectedMove.earnings ||
    ivData.atmIV * Math.sqrt(daysToEarnings / 365);

  const historicalMovePercent = historicalAvgMove;
  const ivPremium = optionsMove - historicalMovePercent;
  const isPremiumExpensive = ivPremium > historicalMovePercent * 0.3;
  const isPremiumCheap = ivPremium < -historicalMovePercent * 0.2;
  const railColor = isPremiumExpensive
    ? 'var(--color-warning)'
    : isPremiumCheap
    ? 'var(--color-positive)'
    : 'var(--color-info)';

  return (
    <div
      className={`glass-slab-floating relative overflow-hidden rounded-xl pl-5 pr-4 py-4 before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] ${className}`}
      style={{ backgroundColor: `color-mix(in srgb, ${railColor} 8%, transparent)` }}
    >
      <span aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ backgroundColor: railColor }} />
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="w-5 h-5 text-[var(--color-accent)]" aria-hidden="true" />
        <h4 className="mono text-[10px] tracking-[0.3em] uppercase font-medium text-theme">Options-Implied Move</h4>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-3">
        <div>
          <p className="mono text-[10px] tracking-[0.2em] uppercase text-theme-muted">Options Pricing</p>
          <p className="mt-0.5 mono text-xl font-bold tabular-nums text-[var(--color-accent)]">±{optionsMove.toFixed(1)}%</p>
          {ivData.straddlePrice && ivData.currentPrice > 0 && (
            <p className="mono text-[10px] tabular-nums text-theme-muted">
              ${ivData.straddlePrice} straddle
            </p>
          )}
        </div>
        <div>
          <p className="mono text-[10px] tracking-[0.2em] uppercase text-theme-muted">Historical Avg</p>
          <p className="mt-0.5 mono text-xl font-bold tabular-nums text-theme-secondary">±{historicalMovePercent.toFixed(1)}%</p>
          <p className="mono text-[10px] tabular-nums text-theme-muted">past 8 quarters</p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <ArrowRight className="w-4 h-4 text-theme-muted" aria-hidden="true" />
        <span className="text-sm font-medium leading-relaxed" style={{ color: railColor }}>
          {isPremiumExpensive
            ? `Options are pricing ${Math.abs(ivPremium).toFixed(1)}% MORE volatility than historical`
            : isPremiumCheap
            ? `Options are pricing ${Math.abs(ivPremium).toFixed(1)}% LESS volatility than historical`
            : 'Options pricing is in line with historical volatility'}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 mono text-[10px] tracking-[0.2em] uppercase text-theme-secondary">
        <span className="tabular-nums">IV Rank: {ivData.ivRank}</span>
        <span aria-hidden="true">·</span>
        <span className="tabular-nums">P/C: {ivData.putCallRatio}</span>
        <span aria-hidden="true">·</span>
        <span className="tabular-nums">{daysToEarnings} days to earnings</span>
      </div>

      {/* Recommendation */}
      <div
        className="mt-3 glass-slab-floating rounded-lg p-2"
        style={{ backgroundColor: `color-mix(in srgb, ${railColor} 6%, transparent)` }}
      >
        <p className="text-xs leading-relaxed font-medium text-theme">
          {isPremiumExpensive
            ? 'Consider selling premium (iron condors, strangles) — options appear expensive'
            : isPremiumCheap
            ? 'Consider buying protection (straddles, puts) — options appear cheap'
            : 'Options fairly priced — no strong directional signal from volatility'}
        </p>
      </div>
    </div>
  );
}

// Demo component
export function ImpliedVolatilityDemo() {
  const demoSymbols = ['AAPL', 'NVDA', 'TSLA', 'MSFT'];
  return <ImpliedVolatility symbols={demoSymbols} />;
}
