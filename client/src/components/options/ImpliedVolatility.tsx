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
  high_iv: 'text-[var(--color-warning)] bg-[rgba(249, 115, 22,0.1)]',
  low_iv: 'text-[var(--color-positive)] bg-[rgba(16, 185, 129,0.1)]',
  neutral: 'text-[var(--color-text-secondary)] bg-[var(--color-bg-tertiary)]',
};

const signalIcons: Record<string, typeof TrendingUp> = {
  high_iv: TrendingUp,
  low_iv: TrendingDown,
  neutral: Minus,
};

const termStructureColors: Record<string, string> = {
  contango: 'text-[var(--color-info)] bg-[rgba(59, 130, 246,0.1)]',
  backwardation: 'text-[var(--color-warning)] bg-[rgba(245, 158, 11,0.1)]',
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
        className={`h-full ${getColor(rank)} transition-all`}
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
    if (v >= 70) return '#f97316'; // orange
    if (v <= 30) return '#22c55e'; // green
    return '#3b82f6'; // blue
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
        <p className="text-lg font-bold text-[var(--color-text)]">{Math.round(value)}</p>
        <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
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
      <div className="flex justify-between text-xs text-[var(--color-text-muted)]">
        <span>HV30: {hv}%</span>
        <span>IV: {iv}%</span>
      </div>
      <div className="relative h-2 bg-[var(--color-border)] rounded-full overflow-hidden">
        <div
          className="absolute h-full bg-[var(--color-bg-tertiary)]"
          style={{ width: `${Math.min(hv / 100 * 100, 100)}%` }}
        />
        <div
          className={`absolute h-full ${ratio >= 1.2 ? 'bg-[var(--color-warning)]' : ratio <= 0.9 ? 'bg-[var(--color-positive)]' : 'bg-[var(--color-info)]'}`}
          style={{ width: `${Math.min(iv / 100 * 100, 100)}%` }}
        />
      </div>
      <p className="text-xs text-center text-[var(--color-text-secondary)]">
        IV/HV: {ratio.toFixed(2)}x ({premium}{premiumPercent}%)
      </p>
    </div>
  );
}

export function ImpliedVolatility({
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
        <div className="flex items-center gap-3">
          <Activity className="w-5 h-5 text-[var(--color-accent)]" />
          <h3 className="text-lg font-semibold text-[var(--color-text)]">Implied Volatility</h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw
            className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`}
          />
        </Button>
      </div>

      {/* Portfolio Summary */}
      {portfolioIV && (
        <div className="space-y-4 mb-6">
          {/* IV Gauge and Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-[var(--color-bg-tertiary)] rounded-lg">
            <div className="flex flex-col items-center justify-center py-2">
              <IVGauge value={portfolioIV.averageIVRank} label="IV Rank" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="text-center p-2 bg-[var(--color-bg)] rounded">
                <p className="text-xs text-[var(--color-text-muted)]">Avg IV</p>
                <p className="text-lg font-bold text-[var(--color-text)]">{portfolioIV.averageIV}%</p>
              </div>
              <div className="text-center p-2 bg-[var(--color-bg)] rounded">
                <p className="text-xs text-[var(--color-text-muted)]">Avg HV</p>
                <p className="text-lg font-bold text-[var(--color-text)]">{portfolioIV.averageHV}%</p>
              </div>
              <div className="text-center p-2 bg-[var(--color-bg)] rounded col-span-2">
                <p className="text-xs text-[var(--color-text-muted)]">IV/HV Ratio</p>
                <p className={`text-lg font-bold ${
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
          {portfolioIV.insights && (
            <div className={`p-3 rounded-lg border ${
              portfolioIV.insights.overallSignal === 'high_iv'
                ? 'bg-[rgba(249, 115, 22,0.1)] border-[rgba(249, 115, 22,0.2)]'
                : portfolioIV.insights.overallSignal === 'low_iv'
                ? 'bg-[rgba(16, 185, 129,0.1)] border-[rgba(16, 185, 129,0.2)]'
                : 'bg-[rgba(59, 130, 246,0.1)] border-[rgba(59, 130, 246,0.2)]'
            }`}>
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 mt-0.5 text-[var(--color-text-secondary)]" />
                <p className="text-sm text-[var(--color-text-secondary)]">{portfolioIV.insights.recommendation}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="py-8 text-center text-[var(--color-text-muted)]">
          <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin" />
          <p>Loading IV data...</p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="py-6 text-center">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 text-[var(--color-warning)]" />
          <p className="text-[var(--color-text-secondary)]">Failed to load IV data</p>
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
        <div className="py-8 text-center text-[var(--color-text-muted)]">
          <Activity className="w-8 h-8 mx-auto mb-2 text-[var(--color-text-muted)]" />
          <p>No IV data available</p>
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
                className="p-4 border border-[var(--color-border-light)] rounded-lg hover:border-[var(--color-border)] transition-colors"
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
                    <span className="text-2xl font-bold text-[var(--color-accent)]">{iv.atmIV}%</span>
                    <p className="text-xs text-[var(--color-text-muted)]">ATM IV</p>
                  </div>
                </div>

                {/* IV Rank Bar */}
                <div className="mb-3">
                  <div className="flex justify-between text-xs text-[var(--color-text-muted)] mb-1">
                    <span>IV Rank</span>
                    <span>{iv.ivRank}/100</span>
                  </div>
                  <IVRankBar rank={iv.ivRank} />
                </div>

                {/* IV vs HV */}
                <div className="mb-3">
                  <IVvsHVBar iv={iv.atmIV} hv={iv.hv30} />
                </div>

                {/* Expected Moves */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="text-center p-2 bg-[var(--color-bg-tertiary)] rounded">
                    <p className="text-xs text-[var(--color-text-muted)]">Weekly</p>
                    <p className="font-semibold">±{iv.expectedMove.weekly}%</p>
                    {showDollars && iv.expectedMoveInDollars && (
                      <p className="text-xs text-[var(--color-text-muted)]">
                        ±${iv.expectedMoveInDollars.weekly}
                      </p>
                    )}
                  </div>
                  <div className="text-center p-2 bg-[var(--color-bg-tertiary)] rounded">
                    <p className="text-xs text-[var(--color-text-muted)]">Monthly</p>
                    <p className="font-semibold">±{iv.expectedMove.monthly}%</p>
                    {showDollars && iv.expectedMoveInDollars && (
                      <p className="text-xs text-[var(--color-text-muted)]">
                        ±${iv.expectedMoveInDollars.monthly}
                      </p>
                    )}
                  </div>
                  <div className="text-center p-2 bg-[var(--color-bg-tertiary)] rounded">
                    <p className="text-xs text-[var(--color-text-muted)]">Quarterly</p>
                    <p className="font-semibold">±{iv.expectedMove.quarterly}%</p>
                    {showDollars && iv.expectedMoveInDollars && (
                      <p className="text-xs text-[var(--color-text-muted)]">
                        ±${iv.expectedMoveInDollars.quarterly}
                      </p>
                    )}
                  </div>
                </div>

                {/* Earnings Expected Move (if available) */}
                {iv.expectedMove.earnings !== undefined && (
                  <div className="mb-3 p-2 bg-[rgba(123, 44, 255,0.1)] rounded-lg border border-[rgba(123, 44, 255,0.2)]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-[var(--color-accent)]" />
                        <span className="text-sm font-medium text-[var(--color-accent)]">
                          Options-Implied Earnings Move
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-lg font-bold text-[var(--color-accent)]">
                          ±{iv.expectedMove.earnings}%
                        </span>
                        {iv.straddlePrice && (
                          <p className="text-xs text-[var(--color-accent)]">
                            Straddle: ${iv.straddlePrice}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Term Structure */}
                <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
                  <div className="text-center p-1.5 bg-[var(--color-bg-tertiary)] rounded">
                    <p className="text-[var(--color-text-muted)]">IV30</p>
                    <p className="font-medium">{iv.iv30}%</p>
                  </div>
                  <div className="text-center p-1.5 bg-[var(--color-bg-tertiary)] rounded">
                    <p className="text-[var(--color-text-muted)]">IV60</p>
                    <p className="font-medium">{iv.iv60}%</p>
                  </div>
                  <div className="text-center p-1.5 bg-[var(--color-bg-tertiary)] rounded">
                    <p className="text-[var(--color-text-muted)]">IV90</p>
                    <p className="font-medium">{iv.iv90}%</p>
                  </div>
                </div>

                {/* Additional metrics */}
                <div className="flex items-center justify-between text-sm text-[var(--color-text-secondary)]">
                  <span>P/C Ratio: {iv.putCallRatio}</span>
                  <span>Skew: {iv.skew > 0 ? '+' : ''}{iv.skew}%</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    iv.dataSource === 'options' ? 'bg-[rgba(16, 185, 129,0.1)] text-[var(--color-positive)]' : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]'
                  }`}>
                    {iv.dataSource === 'options' ? 'Live Options' : 'Historical'}
                  </span>
                </div>

                {/* Recommendation */}
                {iv.recommendation && (
                  <p className="text-xs text-[var(--color-text-muted)] mt-2 italic">{iv.recommendation}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      {symbols.length > 0 && (
        <div className="mt-4 pt-3 border-t border-[var(--color-border-light)] text-xs text-[var(--color-text-muted)]">
          <p>
            IV Rank shows where current IV stands vs 52-week range. High IV (&gt;70) suggests
            expensive options, low IV (&lt;30) suggests cheap options.
          </p>
        </div>
      )}
    </Card>
  );
}

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
      <div className={`p-4 bg-[var(--color-bg-tertiary)] rounded-lg ${className}`}>
        <div className="animate-pulse flex items-center gap-3">
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

  const signalColor = portfolioIV.insights?.overallSignal === 'high_iv'
    ? 'bg-[rgba(249, 115, 22,0.1)] border-[rgba(249, 115, 22,0.2)]'
    : portfolioIV.insights?.overallSignal === 'low_iv'
    ? 'bg-[rgba(16, 185, 129,0.1)] border-[rgba(16, 185, 129,0.2)]'
    : 'bg-[rgba(123, 44, 255,0.1)] border-[rgba(123, 44, 255,0.2)]';

  return (
    <div className={`p-4 rounded-lg border ${signalColor} ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="w-5 h-5 text-[var(--color-accent)]" />
          <div>
            <p className="text-sm font-medium text-[var(--color-text-secondary)]">Portfolio IV</p>
            <p className="text-xs text-[var(--color-text-muted)]">
              Rank: {portfolioIV.averageIVRank} | IV/HV: {portfolioIV.averageIVvsHV}x
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-[var(--color-accent)]">{portfolioIV.averageIV}%</p>
          <p className="text-xs text-[var(--color-text-muted)]">HV: {portfolioIV.averageHV}%</p>
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
      <div className={`p-4 bg-[var(--color-bg-tertiary)] rounded-lg animate-pulse ${className}`}>
        <div className="h-6 bg-[var(--color-border)] rounded w-3/4 mb-2" />
        <div className="h-4 bg-[var(--color-border)] rounded w-1/2" />
      </div>
    );
  }

  if (!ivData) {
    return (
      <div className={`p-4 bg-[var(--color-bg-tertiary)] rounded-lg ${className}`}>
        <p className="text-sm text-[var(--color-text-muted)]">IV data not available for {symbol}</p>
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

  return (
    <div className={`p-4 rounded-lg border ${
      isPremiumExpensive ? 'bg-[rgba(249, 115, 22,0.1)] border-[rgba(249, 115, 22,0.2)]' :
      isPremiumCheap ? 'bg-[rgba(16, 185, 129,0.1)] border-[rgba(16, 185, 129,0.2)]' :
      'bg-[rgba(59, 130, 246,0.1)] border-[rgba(59, 130, 246,0.2)]'
    } ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="w-5 h-5 text-[var(--color-accent)]" />
        <h4 className="font-medium text-[var(--color-text)]">Options-Implied Move</h4>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-3">
        <div>
          <p className="text-xs text-[var(--color-text-muted)]">Options Pricing</p>
          <p className="text-xl font-bold text-[var(--color-accent)]">±{optionsMove.toFixed(1)}%</p>
          {ivData.straddlePrice && ivData.currentPrice > 0 && (
            <p className="text-xs text-[var(--color-text-muted)]">
              ${ivData.straddlePrice} straddle
            </p>
          )}
        </div>
        <div>
          <p className="text-xs text-[var(--color-text-muted)]">Historical Avg</p>
          <p className="text-xl font-bold text-[var(--color-text-secondary)]">±{historicalMovePercent.toFixed(1)}%</p>
          <p className="text-xs text-[var(--color-text-muted)]">past 8 quarters</p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <ArrowRight className="w-4 h-4 text-[var(--color-text-muted)]" />
        <span className={`text-sm font-medium ${
          isPremiumExpensive ? 'text-[var(--color-warning)]' :
          isPremiumCheap ? 'text-[var(--color-positive)]' :
          'text-[var(--color-info)]'
        }`}>
          {isPremiumExpensive
            ? `Options are pricing ${Math.abs(ivPremium).toFixed(1)}% MORE volatility than historical`
            : isPremiumCheap
            ? `Options are pricing ${Math.abs(ivPremium).toFixed(1)}% LESS volatility than historical`
            : 'Options pricing is in line with historical volatility'}
        </span>
      </div>

      <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
        <span>IV Rank: {ivData.ivRank}</span>
        <span>|</span>
        <span>P/C: {ivData.putCallRatio}</span>
        <span>|</span>
        <span>{daysToEarnings} days to earnings</span>
      </div>

      {/* Recommendation */}
      <div className={`mt-3 p-2 rounded ${
        isPremiumExpensive ? 'bg-[rgba(249, 115, 22,0.1)]' :
        isPremiumCheap ? 'bg-[rgba(16, 185, 129,0.1)]' :
        'bg-[rgba(59, 130, 246,0.1)]'
      }`}>
        <p className="text-xs font-medium">
          {isPremiumExpensive
            ? 'Consider selling premium (iron condors, strangles) - options appear expensive'
            : isPremiumCheap
            ? 'Consider buying protection (straddles, puts) - options appear cheap'
            : 'Options fairly priced - no strong directional signal from volatility'}
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
