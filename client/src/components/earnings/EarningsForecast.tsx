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
        <div className="glass-slab gradient-brand-subtle rounded-2xl flex flex-col items-center justify-center min-h-[256px] p-8 text-theme-muted">
          <BarChart3 className="w-12 h-12 mb-4 opacity-60" aria-hidden="true" />
          <p className="mono text-[10px] tracking-[0.3em] uppercase">No selection</p>
          <p className="text-sm text-theme-secondary mt-1">Select an earnings event to see the forecast</p>
        </div>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card title={`${symbol} Forecast`}>
        <div className="flex items-center justify-center min-h-[256px]">
          <Spinner className="w-8 h-8" />
        </div>
      </Card>
    );
  }

  if (!forecast) {
    return (
      <Card title={`${symbol} Forecast`}>
        <div className="glass-slab gradient-brand-subtle rounded-2xl flex flex-col items-center justify-center min-h-[256px] p-8 text-theme-muted">
          <p className="mono text-[10px] tracking-[0.3em] uppercase">No forecast yet</p>
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

  const directionRail = forecast.expectedDirection === 'up'
    ? 'before:bg-[var(--color-positive)]'
    : forecast.expectedDirection === 'down'
    ? 'before:bg-[var(--color-negative)]'
    : 'before:bg-[var(--color-info)]';

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
      <div className="space-y-6 animate-stagger">
        {/* Expected Move - Historical */}
        <div className="glass-slab rounded-xl p-4 flex items-center justify-between animate-enter">
          <div>
            <div className="flex items-center gap-1">
              <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Historical Expected Move</p>
              <HelpTooltip metricKey="expectedMove" size="sm" />
            </div>
            <p className="mono tabular-nums text-2xl font-bold text-theme mt-1">
              ±{(forecast.expectedMove * 100).toFixed(1)}%
            </p>
          </div>
          <div className="text-right">
            <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Past 8 Quarters Avg</p>
            <p className="mono tabular-nums text-lg font-medium text-theme-secondary mt-1">
              {forecast.historicalAvgMove
                ? `±${(forecast.historicalAvgMove * 100).toFixed(1)}%`
                : 'N/A'}
            </p>
          </div>
        </div>

        {/* Options-Implied Move */}
        <div className="animate-enter">
          <EarningsIV
            symbol={symbol}
            daysToEarnings={daysToEarnings}
            historicalAvgMove={forecast.expectedMove * 100}
          />
        </div>

        {/* Direction & Confidence */}
        <div className="grid grid-cols-2 gap-4 animate-enter">
          <div
            className={`glass-slab-floating relative overflow-hidden rounded-xl p-4 pl-5 before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] ${directionRail}`}
          >
            <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted mb-2">Expected Direction</p>
            <div className={`flex items-center gap-2 ${getDirectionColor(forecast.expectedDirection)}`}>
              <DirectionIcon className="w-5 h-5" aria-hidden="true" />
              <span className="mono uppercase tracking-wider font-bold">{forecast.expectedDirection}</span>
            </div>
          </div>
          <div className="glass-slab rounded-xl p-4">
            <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted mb-2">Confidence</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-[var(--color-bg-tertiary)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[image:var(--gradient-sovereign)] rounded-full transition-[width] duration-500"
                  style={{ width: `${forecast.confidence * 100}%` }}
                />
              </div>
              <span className="mono tabular-nums font-semibold text-theme">
                {(forecast.confidence * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>

        {/* Recommendation */}
        <div className="glass-slab rounded-xl p-4 animate-enter">
          <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted mb-2">Recommendation</p>
          <Badge className={recommendationBadge.color}>
            {recommendationBadge.label}
          </Badge>
        </div>

        {/* Beat Rate (if available) */}
        {forecast.beatRate !== undefined && (
          <div className="glass-slab rounded-xl p-4 animate-enter">
            <div className="flex items-center gap-1 mb-2">
              <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Historical Beat Rate</p>
              <HelpTooltip metricKey="beatRate" size="sm" />
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-3 bg-[var(--color-bg-tertiary)] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-[width] duration-500 ${
                    forecast.beatRate > 60 ? 'bg-[var(--color-positive)]' :
                    forecast.beatRate < 40 ? 'bg-[var(--color-negative)]' : 'bg-[var(--color-warning)]'
                  }`}
                  style={{ width: `${forecast.beatRate}%` }}
                />
              </div>
              <span className={`mono tabular-nums font-bold ${
                forecast.beatRate > 60 ? 'text-[var(--color-positive)]' :
                forecast.beatRate < 40 ? 'text-[var(--color-negative)]' : 'text-[var(--color-warning)]'
              }`}>
                {forecast.beatRate.toFixed(0)}%
              </span>
            </div>
          </div>
        )}

        {/* AI Explanation */}
        <div className="glass-slab gradient-brand-subtle relative overflow-hidden rounded-xl p-4 pl-5 before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[image:var(--gradient-sovereign)] animate-enter">
          <p className="mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-accent)] mb-2">AI Analysis</p>
          <p className="text-sm text-theme-secondary leading-relaxed">{forecast.explanation}</p>
        </div>

        {/* Factor Analysis (if available) */}
        {forecast.factors && (
          <div className="space-y-2 animate-enter">
            <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Factor Analysis</p>
            <div className="grid gap-2 text-sm">
              <div className="flex justify-between p-3 glass-slab rounded-lg">
                <span className="mono text-[10px] tracking-wider uppercase text-theme-muted">Historical Pattern</span>
                <span className="text-theme-secondary">{forecast.factors.historicalPattern}</span>
              </div>
              <div className="flex justify-between p-3 glass-slab rounded-lg">
                <span className="mono text-[10px] tracking-wider uppercase text-theme-muted">Recent Trend</span>
                <span className="text-theme-secondary">{forecast.factors.recentTrend}</span>
              </div>
              <div className="flex justify-between p-3 glass-slab rounded-lg">
                <span className="mono text-[10px] tracking-wider uppercase text-theme-muted">Risk Assessment</span>
                <span className={`mono uppercase tracking-wider font-medium ${
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
        <div className="text-center mono tabular-nums text-xs text-theme-muted animate-enter">
          Report Date · {new Date(forecast.reportDate).toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })}
        </div>

        {/* Learn More Link */}
        <div className="text-center animate-enter">
          <Link
            to="/help#earnings-forecasts"
            className="inline-flex items-center gap-1 mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-info)] hover:opacity-80 transition-opacity duration-200 animate-press"
          >
            <HelpCircle className="w-4 h-4" aria-hidden="true" />
            How forecasts work
          </Link>
        </div>
      </div>
    </Card>
  );
}
