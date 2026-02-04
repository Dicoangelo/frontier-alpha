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
  high_iv: 'text-orange-600 bg-orange-50',
  low_iv: 'text-green-600 bg-green-50',
  neutral: 'text-gray-600 bg-gray-50',
};

const signalIcons: Record<string, typeof TrendingUp> = {
  high_iv: TrendingUp,
  low_iv: TrendingDown,
  neutral: Minus,
};

const termStructureColors: Record<string, string> = {
  contango: 'text-blue-600 bg-blue-50',
  backwardation: 'text-amber-600 bg-amber-50',
  flat: 'text-gray-600 bg-gray-50',
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
          stroke="#e5e7eb"
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
        className="absolute bottom-0 left-1/2 w-0.5 h-8 bg-gray-800 origin-bottom rounded-full"
        style={{ transform: `translateX(-50%) rotate(${rotation}deg)` }}
      />
      {/* Value display */}
      <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-center">
        <p className="text-lg font-bold text-gray-900">{Math.round(value)}</p>
        <p className="text-xs text-gray-500">{label}</p>
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
      <div className="flex justify-between text-xs text-gray-500">
        <span>HV30: {hv}%</span>
        <span>IV: {iv}%</span>
      </div>
      <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="absolute h-full bg-gray-400"
          style={{ width: `${Math.min(hv / 100 * 100, 100)}%` }}
        />
        <div
          className={`absolute h-full ${ratio >= 1.2 ? 'bg-orange-500' : ratio <= 0.9 ? 'bg-green-500' : 'bg-blue-500'}`}
          style={{ width: `${Math.min(iv / 100 * 100, 100)}%` }}
        />
      </div>
      <p className="text-xs text-center text-gray-600">
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
        <div className="space-y-4 mb-6">
          {/* IV Gauge and Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
            <div className="flex flex-col items-center justify-center py-2">
              <IVGauge value={portfolioIV.averageIVRank} label="IV Rank" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="text-center p-2 bg-white rounded">
                <p className="text-xs text-gray-500">Avg IV</p>
                <p className="text-lg font-bold text-gray-900">{portfolioIV.averageIV}%</p>
              </div>
              <div className="text-center p-2 bg-white rounded">
                <p className="text-xs text-gray-500">Avg HV</p>
                <p className="text-lg font-bold text-gray-900">{portfolioIV.averageHV}%</p>
              </div>
              <div className="text-center p-2 bg-white rounded col-span-2">
                <p className="text-xs text-gray-500">IV/HV Ratio</p>
                <p className={`text-lg font-bold ${
                  portfolioIV.averageIVvsHV >= 1.2 ? 'text-orange-600' :
                  portfolioIV.averageIVvsHV <= 0.9 ? 'text-green-600' : 'text-blue-600'
                }`}>
                  {portfolioIV.averageIVvsHV}x
                </p>
              </div>
            </div>
            <div className="flex flex-col justify-center">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-orange-500" />
                  <span className="text-sm text-gray-600">High IV:</span>
                  <span className="text-sm font-medium">
                    {portfolioIV.highIVPositions.length > 0
                      ? portfolioIV.highIVPositions.slice(0, 3).join(', ')
                      : 'None'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-green-500" />
                  <span className="text-sm text-gray-600">Low IV:</span>
                  <span className="text-sm font-medium">
                    {portfolioIV.lowIVPositions.length > 0
                      ? portfolioIV.lowIVPositions.slice(0, 3).join(', ')
                      : 'None'}
                  </span>
                </div>
                {portfolioIV.backwardationPositions.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-amber-500" />
                    <span className="text-sm text-gray-600">Backwardation:</span>
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
                ? 'bg-orange-50 border-orange-200'
                : portfolioIV.insights.overallSignal === 'low_iv'
                ? 'bg-green-50 border-green-200'
                : 'bg-blue-50 border-blue-200'
            }`}>
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 mt-0.5 text-gray-600" />
                <p className="text-sm text-gray-700">{portfolioIV.insights.recommendation}</p>
              </div>
            </div>
          )}
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
      {sortedIVList.length > 0 && (
        <div className="space-y-4">
          {sortedIVList.map((iv) => {
            const SignalIcon = signalIcons[iv.signal];
            return (
              <div
                key={iv.symbol}
                className="p-4 border border-gray-100 rounded-lg hover:border-gray-200 transition-colors"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-gray-900">{iv.symbol}</span>
                    {iv.currentPrice > 0 && (
                      <span className="text-sm text-gray-500">${iv.currentPrice}</span>
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
                    <span className="text-2xl font-bold text-purple-600">{iv.atmIV}%</span>
                    <p className="text-xs text-gray-500">ATM IV</p>
                  </div>
                </div>

                {/* IV Rank Bar */}
                <div className="mb-3">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
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
                  <div className="text-center p-2 bg-gray-50 rounded">
                    <p className="text-xs text-gray-500">Weekly</p>
                    <p className="font-semibold">±{iv.expectedMove.weekly}%</p>
                    {showDollars && iv.expectedMoveInDollars && (
                      <p className="text-xs text-gray-400">
                        ±${iv.expectedMoveInDollars.weekly}
                      </p>
                    )}
                  </div>
                  <div className="text-center p-2 bg-gray-50 rounded">
                    <p className="text-xs text-gray-500">Monthly</p>
                    <p className="font-semibold">±{iv.expectedMove.monthly}%</p>
                    {showDollars && iv.expectedMoveInDollars && (
                      <p className="text-xs text-gray-400">
                        ±${iv.expectedMoveInDollars.monthly}
                      </p>
                    )}
                  </div>
                  <div className="text-center p-2 bg-gray-50 rounded">
                    <p className="text-xs text-gray-500">Quarterly</p>
                    <p className="font-semibold">±{iv.expectedMove.quarterly}%</p>
                    {showDollars && iv.expectedMoveInDollars && (
                      <p className="text-xs text-gray-400">
                        ±${iv.expectedMoveInDollars.quarterly}
                      </p>
                    )}
                  </div>
                </div>

                {/* Earnings Expected Move (if available) */}
                {iv.expectedMove.earnings !== undefined && (
                  <div className="mb-3 p-2 bg-purple-50 rounded-lg border border-purple-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-purple-600" />
                        <span className="text-sm font-medium text-purple-800">
                          Options-Implied Earnings Move
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-lg font-bold text-purple-600">
                          ±{iv.expectedMove.earnings}%
                        </span>
                        {iv.straddlePrice && (
                          <p className="text-xs text-purple-500">
                            Straddle: ${iv.straddlePrice}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Term Structure */}
                <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
                  <div className="text-center p-1.5 bg-gray-50 rounded">
                    <p className="text-gray-500">IV30</p>
                    <p className="font-medium">{iv.iv30}%</p>
                  </div>
                  <div className="text-center p-1.5 bg-gray-50 rounded">
                    <p className="text-gray-500">IV60</p>
                    <p className="font-medium">{iv.iv60}%</p>
                  </div>
                  <div className="text-center p-1.5 bg-gray-50 rounded">
                    <p className="text-gray-500">IV90</p>
                    <p className="font-medium">{iv.iv90}%</p>
                  </div>
                </div>

                {/* Additional metrics */}
                <div className="flex items-center justify-between text-sm text-gray-600">
                  <span>P/C Ratio: {iv.putCallRatio}</span>
                  <span>Skew: {iv.skew > 0 ? '+' : ''}{iv.skew}%</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    iv.dataSource === 'options' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {iv.dataSource === 'options' ? 'Live Options' : 'Historical'}
                  </span>
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

  const signalColor = portfolioIV.insights?.overallSignal === 'high_iv'
    ? 'bg-orange-50 border-orange-200'
    : portfolioIV.insights?.overallSignal === 'low_iv'
    ? 'bg-green-50 border-green-200'
    : 'bg-purple-50 border-purple-200';

  return (
    <div className={`p-4 rounded-lg border ${signalColor} ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="w-5 h-5 text-purple-600" />
          <div>
            <p className="text-sm font-medium text-gray-700">Portfolio IV</p>
            <p className="text-xs text-gray-500">
              Rank: {portfolioIV.averageIVRank} | IV/HV: {portfolioIV.averageIVvsHV}x
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-purple-600">{portfolioIV.averageIV}%</p>
          <p className="text-xs text-gray-500">HV: {portfolioIV.averageHV}%</p>
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
      <div className={`p-4 bg-gray-50 rounded-lg animate-pulse ${className}`}>
        <div className="h-6 bg-gray-200 rounded w-3/4 mb-2" />
        <div className="h-4 bg-gray-200 rounded w-1/2" />
      </div>
    );
  }

  if (!ivData) {
    return (
      <div className={`p-4 bg-gray-50 rounded-lg ${className}`}>
        <p className="text-sm text-gray-500">IV data not available for {symbol}</p>
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
      isPremiumExpensive ? 'bg-orange-50 border-orange-200' :
      isPremiumCheap ? 'bg-green-50 border-green-200' :
      'bg-blue-50 border-blue-200'
    } ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="w-5 h-5 text-purple-600" />
        <h4 className="font-medium text-gray-900">Options-Implied Move</h4>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-3">
        <div>
          <p className="text-xs text-gray-500">Options Pricing</p>
          <p className="text-xl font-bold text-purple-600">±{optionsMove.toFixed(1)}%</p>
          {ivData.straddlePrice && ivData.currentPrice > 0 && (
            <p className="text-xs text-gray-500">
              ${ivData.straddlePrice} straddle
            </p>
          )}
        </div>
        <div>
          <p className="text-xs text-gray-500">Historical Avg</p>
          <p className="text-xl font-bold text-gray-600">±{historicalMovePercent.toFixed(1)}%</p>
          <p className="text-xs text-gray-500">past 8 quarters</p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <ArrowRight className="w-4 h-4 text-gray-400" />
        <span className={`text-sm font-medium ${
          isPremiumExpensive ? 'text-orange-700' :
          isPremiumCheap ? 'text-green-700' :
          'text-blue-700'
        }`}>
          {isPremiumExpensive
            ? `Options are pricing ${Math.abs(ivPremium).toFixed(1)}% MORE volatility than historical`
            : isPremiumCheap
            ? `Options are pricing ${Math.abs(ivPremium).toFixed(1)}% LESS volatility than historical`
            : 'Options pricing is in line with historical volatility'}
        </span>
      </div>

      <div className="flex items-center gap-2 text-xs text-gray-600">
        <span>IV Rank: {ivData.ivRank}</span>
        <span>|</span>
        <span>P/C: {ivData.putCallRatio}</span>
        <span>|</span>
        <span>{daysToEarnings} days to earnings</span>
      </div>

      {/* Recommendation */}
      <div className={`mt-3 p-2 rounded ${
        isPremiumExpensive ? 'bg-orange-100' :
        isPremiumCheap ? 'bg-green-100' :
        'bg-blue-100'
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
