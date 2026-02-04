import { useQuery } from '@tanstack/react-query';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { Card } from '@/components/shared/Card';
import { Button } from '@/components/shared/Button';
import { api } from '@/api/client';

interface IVData {
  symbol: string;
  ivRank: number;
  ivPercentile: number;
  atmIV: number;
  iv30: number;
  putCallRatio: number;
  expectedMove: {
    weekly: number;
    monthly: number;
    quarterly: number;
  };
  skew: number;
  signal: 'high_iv' | 'low_iv' | 'neutral';
  recommendation: string;
}

interface PortfolioIV {
  averageIV: number;
  averageIVRank: number;
  highIVPositions: string[];
  lowIVPositions: string[];
}

interface ImpliedVolatilityProps {
  symbols: string[];
  className?: string;
}

const signalColors: Record<string, string> = {
  high_iv: 'text-orange-600 bg-orange-50',
  low_iv: 'text-green-600 bg-green-50',
  neutral: 'text-gray-600 bg-gray-50',
};

const signalIcons: Record<string, typeof TrendingUp> = {
  high_iv: TrendingUp,
  low_iv: TrendingDown,
  neutral: Minus,
};

function IVRankBar({ rank }: { rank: number }) {
  const getColor = (r: number) => {
    if (r >= 70) return 'bg-orange-500';
    if (r <= 30) return 'bg-green-500';
    return 'bg-blue-500';
  };

  return (
    <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
      <div
        className={`h-full ${getColor(rank)} transition-all`}
        style={{ width: `${rank}%` }}
      />
    </div>
  );
}

export function ImpliedVolatility({
  symbols,
  className = '',
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

  return (
    <Card className={`p-6 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Activity className="w-5 h-5 text-purple-600" />
          <h3 className="text-lg font-semibold text-gray-900">Implied Volatility</h3>
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
          <div>
            <p className="text-xs text-gray-500 mb-1">Avg IV</p>
            <p className="text-xl font-bold text-gray-900">{portfolioIV.averageIV}%</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Avg IV Rank</p>
            <p className="text-xl font-bold text-gray-900">{portfolioIV.averageIVRank}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">High IV</p>
            <p className="text-lg font-semibold text-orange-600">
              {portfolioIV.highIVPositions.length > 0
                ? portfolioIV.highIVPositions.join(', ')
                : 'None'}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Low IV</p>
            <p className="text-lg font-semibold text-green-600">
              {portfolioIV.lowIVPositions.length > 0
                ? portfolioIV.lowIVPositions.join(', ')
                : 'None'}
            </p>
          </div>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="py-8 text-center text-gray-500">
          <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin" />
          <p>Loading IV data...</p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="py-6 text-center">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 text-amber-500" />
          <p className="text-gray-600">Failed to load IV data</p>
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
        <div className="py-8 text-center text-gray-500">
          <Activity className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          <p>No IV data available</p>
          <p className="text-sm mt-1">Add symbols to see implied volatility</p>
        </div>
      )}

      {/* IV List */}
      {ivList.length > 0 && (
        <div className="space-y-4">
          {ivList.map((iv) => {
            const SignalIcon = signalIcons[iv.signal];
            return (
              <div
                key={iv.symbol}
                className="p-4 border border-gray-100 rounded-lg"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-gray-900">{iv.symbol}</span>
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
                  </div>
                  <span className="text-2xl font-bold text-purple-600">{iv.atmIV}%</span>
                </div>

                {/* IV Rank Bar */}
                <div className="mb-3">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>IV Rank</span>
                    <span>{iv.ivRank}/100</span>
                  </div>
                  <IVRankBar rank={iv.ivRank} />
                </div>

                {/* Expected Moves */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="text-center p-2 bg-gray-50 rounded">
                    <p className="text-xs text-gray-500">Weekly</p>
                    <p className="font-semibold">±{iv.expectedMove.weekly}%</p>
                  </div>
                  <div className="text-center p-2 bg-gray-50 rounded">
                    <p className="text-xs text-gray-500">Monthly</p>
                    <p className="font-semibold">±{iv.expectedMove.monthly}%</p>
                  </div>
                  <div className="text-center p-2 bg-gray-50 rounded">
                    <p className="text-xs text-gray-500">Quarterly</p>
                    <p className="font-semibold">±{iv.expectedMove.quarterly}%</p>
                  </div>
                </div>

                {/* Additional metrics */}
                <div className="flex items-center justify-between text-sm text-gray-600">
                  <span>P/C Ratio: {iv.putCallRatio}</span>
                  <span>Skew: {iv.skew > 0 ? '+' : ''}{iv.skew}%</span>
                </div>

                {/* Recommendation */}
                {iv.recommendation && (
                  <p className="text-xs text-gray-500 mt-2 italic">{iv.recommendation}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      {symbols.length > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-100 text-xs text-gray-500">
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
      <div className={`p-4 bg-gray-50 rounded-lg ${className}`}>
        <div className="animate-pulse flex items-center gap-3">
          <div className="w-8 h-8 bg-gray-200 rounded" />
          <div className="flex-1">
            <div className="h-4 bg-gray-200 rounded w-24 mb-1" />
            <div className="h-3 bg-gray-200 rounded w-16" />
          </div>
        </div>
      </div>
    );
  }

  if (!portfolioIV) return null;

  return (
    <div className={`p-4 bg-purple-50 rounded-lg ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="w-5 h-5 text-purple-600" />
          <div>
            <p className="text-sm font-medium text-gray-700">Portfolio IV</p>
            <p className="text-xs text-gray-500">Avg Rank: {portfolioIV.averageIVRank}</p>
          </div>
        </div>
        <p className="text-2xl font-bold text-purple-600">{portfolioIV.averageIV}%</p>
      </div>
    </div>
  );
}

// Demo component
export function ImpliedVolatilityDemo() {
  const demoSymbols = ['AAPL', 'NVDA', 'TSLA', 'MSFT'];
  return <ImpliedVolatility symbols={demoSymbols} />;
}
