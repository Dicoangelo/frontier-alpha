import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, Minus, RefreshCw, BarChart3, HelpCircle } from 'lucide-react';
import { Card } from '@/components/shared/Card';
import { Badge } from '@/components/shared/Badge';
import { Button } from '@/components/shared/Button';
import { Spinner } from '@/components/shared/Spinner';
import { HelpTooltip } from '@/components/help';
import { getDirectionColor, getRecommendationBadge } from '@/hooks/useEarnings';
import { EarningsIV } from '@/components/options/ImpliedVolatility';
import type { EarningsImpactForecast } from '@/types';

interface EarningsForecastProps {
  symbol: string | null;
  forecast: EarningsImpactForecast | undefined;
  isLoading?: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function EarningsForecast({
  symbol,
  forecast,
  isLoading,
  onRefresh,
  isRefreshing,
}: EarningsForecastProps) {
  if (!symbol) {
    return (
      <Card title="Earnings Forecast">
        <div className="flex flex-col items-center justify-center h-64 text-[var(--color-text-muted)]">
          <BarChart3 className="w-12 h-12 mb-4 opacity-50" />
          <p>Select an earnings event</p>
          <p className="text-sm mt-1">Click on an upcoming event to see the forecast</p>
        </div>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card title={`${symbol} Forecast`}>
        <div className="flex items-center justify-center h-64">
          <Spinner className="w-8 h-8" />
        </div>
      </Card>
    );
  }

  if (!forecast) {
    return (
      <Card title={`${symbol} Forecast`}>
        <div className="flex flex-col items-center justify-center h-64 text-[var(--color-text-muted)]">
          <p>No forecast available</p>
          {onRefresh && (
            <Button onClick={onRefresh} className="mt-4" disabled={isRefreshing}>
              {isRefreshing ? <Spinner className="w-4 h-4 mr-2" /> : null}
              Generate Forecast
            </Button>
          )}
        </div>
      </Card>
    );
  }

  // Calculate days to earnings (uses current time, which is inherently impure but necessary)
  // eslint-disable-next-line react-hooks/purity -- Date.now() needed for time-sensitive calculation
  const daysToEarnings = Math.max(1, Math.ceil((new Date(forecast.reportDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

  const DirectionIcon = forecast.expectedDirection === 'up'
    ? TrendingUp
    : forecast.expectedDirection === 'down'
    ? TrendingDown
    : Minus;

  const recommendationBadge = getRecommendationBadge(forecast.recommendation);

  return (
    <Card
      title={`${symbol} Forecast`}
      action={
        onRefresh && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={isRefreshing}
            aria-label="Refresh earnings forecast"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
          </Button>
        )
      }
    >
      <div className="space-y-6">
        {/* Expected Move - Historical */}
        <div className="flex items-center justify-between p-4 bg-[var(--color-bg-tertiary)] rounded-lg">
          <div>
            <div className="flex items-center gap-1">
              <p className="text-sm text-[var(--color-text-muted)]">Historical Expected Move</p>
              <HelpTooltip metricKey="expectedMove" size="sm" />
            </div>
            <p className="text-2xl font-bold text-[var(--color-text)]">
              ±{(forecast.expectedMove * 100).toFixed(1)}%
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-[var(--color-text-muted)]">Past 8 Quarters Avg</p>
            <p className="text-lg font-medium text-[var(--color-text-secondary)]">
              {forecast.historicalAvgMove
                ? `±${(forecast.historicalAvgMove * 100).toFixed(1)}%`
                : 'N/A'}
            </p>
          </div>
        </div>

        {/* Options-Implied Move */}
        <EarningsIV
          symbol={symbol}
          daysToEarnings={daysToEarnings}
          historicalAvgMove={forecast.expectedMove * 100}
        />

        {/* Direction & Confidence */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 border rounded-lg">
            <p className="text-sm text-[var(--color-text-muted)] mb-2">Expected Direction</p>
            <div className={`flex items-center gap-2 ${getDirectionColor(forecast.expectedDirection)}`}>
              <DirectionIcon className="w-5 h-5" />
              <span className="font-semibold capitalize">{forecast.expectedDirection}</span>
            </div>
          </div>
          <div className="p-4 border rounded-lg">
            <p className="text-sm text-[var(--color-text-muted)] mb-2">Confidence</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-[var(--color-border)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--color-info)] rounded-full"
                  style={{ width: `${forecast.confidence * 100}%` }}
                />
              </div>
              <span className="font-semibold text-[var(--color-text)]">
                {(forecast.confidence * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>

        {/* Recommendation */}
        <div className="p-4 border rounded-lg">
          <p className="text-sm text-[var(--color-text-muted)] mb-2">Recommendation</p>
          <Badge className={recommendationBadge.color}>
            {recommendationBadge.label}
          </Badge>
        </div>

        {/* Beat Rate (if available) */}
        {forecast.beatRate !== undefined && (
          <div className="p-4 border rounded-lg">
            <div className="flex items-center gap-1 mb-2">
              <p className="text-sm text-[var(--color-text-muted)]">Historical Beat Rate</p>
              <HelpTooltip metricKey="beatRate" size="sm" />
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-3 bg-[var(--color-border)] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    forecast.beatRate > 60 ? 'bg-[var(--color-positive)]' :
                    forecast.beatRate < 40 ? 'bg-[var(--color-negative)]' : 'bg-[var(--color-warning)]'
                  }`}
                  style={{ width: `${forecast.beatRate}%` }}
                />
              </div>
              <span className={`font-bold ${
                forecast.beatRate > 60 ? 'text-[var(--color-positive)]' :
                forecast.beatRate < 40 ? 'text-[var(--color-negative)]' : 'text-[var(--color-warning)]'
              }`}>
                {forecast.beatRate.toFixed(0)}%
              </span>
            </div>
          </div>
        )}

        {/* AI Explanation */}
        <div className="p-4 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-lg border border-[rgba(59, 130, 246,0.2)]">
          <p className="text-sm font-medium text-[var(--color-info)] mb-2">AI Analysis</p>
          <p className="text-sm text-[var(--color-info)]">{forecast.explanation}</p>
        </div>

        {/* Factor Analysis (if available) */}
        {forecast.factors && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-[var(--color-text-secondary)]">Factor Analysis</p>
            <div className="grid gap-2 text-sm">
              <div className="flex justify-between p-2 bg-[var(--color-bg-tertiary)] rounded">
                <span className="text-[var(--color-text-muted)]">Historical Pattern</span>
                <span className="text-[var(--color-text-secondary)]">{forecast.factors.historicalPattern}</span>
              </div>
              <div className="flex justify-between p-2 bg-[var(--color-bg-tertiary)] rounded">
                <span className="text-[var(--color-text-muted)]">Recent Trend</span>
                <span className="text-[var(--color-text-secondary)]">{forecast.factors.recentTrend}</span>
              </div>
              <div className="flex justify-between p-2 bg-[var(--color-bg-tertiary)] rounded">
                <span className="text-[var(--color-text-muted)]">Risk Assessment</span>
                <span className={`font-medium ${
                  forecast.factors.riskAssessment.includes('HIGH') ? 'text-[var(--color-negative)]' :
                  forecast.factors.riskAssessment.includes('LOW') ? 'text-[var(--color-positive)]' : 'text-[var(--color-warning)]'
                }`}>
                  {forecast.factors.riskAssessment}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Report Date */}
        <div className="text-center text-sm text-[var(--color-text-muted)]">
          Report Date: {new Date(forecast.reportDate).toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })}
        </div>

        {/* Learn More Link */}
        <div className="text-center">
          <Link
            to="/help#earnings-forecasts"
            className="inline-flex items-center gap-1 text-sm text-[var(--color-info)] hover:text-[var(--color-info)]"
          >
            <HelpCircle className="w-4 h-4" />
            How forecasts work
          </Link>
        </div>
      </div>
    </Card>
  );
}
