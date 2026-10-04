import React from 'react';
import { Card } from '@/components/shared/Card';
import { Badge } from '@/components/shared/Badge';

interface PriceChartProps {
  symbol: string;
  currentPrice?: number;
  changePercent?: number;
  timestamp?: string;
  isLoading?: boolean;
  error?: string;
  className?: string;
}

/** A quote snapshot. Historical charts require a historical series, not a fabricated trend. */
export const PriceChart = React.memo(function PriceChart({
  symbol, currentPrice, changePercent, timestamp, isLoading, error, className,
}: PriceChartProps) {
  const hasPrice = currentPrice != null && Number.isFinite(currentPrice);
  const hasChange = changePercent != null && Number.isFinite(changePercent);
  const quoteDate = timestamp ? new Date(timestamp) : null;
  const hasDate = quoteDate && Number.isFinite(quoteDate.getTime());

  return (
    <Card className={className} title="Latest quote" action={<Badge variant="neutral">{symbol}</Badge>}>
      {isLoading && !hasPrice ? (
        <p role="status" className="text-sm text-theme-muted">Loading quote…</p>
      ) : error ? (
        <p role="status" className="text-sm text-theme-muted">{error}</p>
      ) : hasPrice ? (
        <div className="space-y-3">
          <div className="flex items-baseline gap-3">
            <span className="mono text-2xl font-semibold tabular-nums text-theme">${currentPrice.toFixed(2)}</span>
            {hasChange && <span className="mono text-sm tabular-nums" style={{ color: changePercent >= 0 ? 'var(--color-positive)' : 'var(--color-negative)' }}>
              {changePercent >= 0 ? '+' : ''}{changePercent.toFixed(2)}%
            </span>}
          </div>
          <p className="text-xs text-theme-muted">Quotes are delayed by 15 minutes.</p>
          {hasDate && <p className="text-xs text-theme-muted">As of <time dateTime={quoteDate.toISOString()}>{quoteDate.toLocaleString()}</time></p>}
        </div>
      ) : (
        <p className="text-sm text-theme-muted">No quote is available for {symbol}. Check the symbol or try again later.</p>
      )}
    </Card>
  );
});
