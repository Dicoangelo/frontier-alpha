import { useMemo } from 'react';
import { Sparkline } from '@/components/shared/Sparkline';

interface PositionLike {
  id?: string;
  symbol: string;
  shares: number;
  costBasis: number;
  currentPrice: number;
  unrealizedPnL: number;
  weight?: number;
  history?: number[];
}

interface PositionCardProps {
  position: PositionLike;
  onClick?: () => void;
  className?: string;
}

export function PositionCard({ position, onClick, className = '' }: PositionCardProps) {
  const isUp = (position.unrealizedPnL ?? 0) >= 0;
  const color = isUp ? 'var(--color-positive)' : 'var(--color-negative)';
  const pnlPct = useMemo(() => {
    const basis = position.costBasis * position.shares;
    if (!basis) return 0;
    return (position.unrealizedPnL / basis) * 100;
  }, [position.unrealizedPnL, position.costBasis, position.shares]);

  const history = position.history && position.history.length > 1
    ? position.history
    : null;

  const weightPct = position.weight != null ? position.weight * (position.weight > 1 ? 1 : 100) : null;

  const content = (
    <>
      {/* Row 1: symbol + weight */}
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[20px] font-bold text-[var(--color-text)] tracking-tight">
          {position.symbol}
        </h3>
        {weightPct != null && (
          <span className="text-[11px] mono tabular-nums text-[var(--color-text-muted)]">
            {weightPct.toFixed(1)}%
          </span>
        )}
      </div>

      {/* Row 2: PnL$ + PnL% */}
      <div className="flex items-baseline justify-between gap-3 mt-1.5">
        <span className="text-[15px] font-semibold tabular-nums" style={{ color }}>
          {isUp ? '+' : ''}${position.unrealizedPnL.toFixed(2)}
        </span>
        <span className="text-[12px] mono tabular-nums" style={{ color }}>
          {isUp ? '+' : ''}{pnlPct.toFixed(2)}%
        </span>
      </div>

      {/* Render a trend only when price history is supplied. */}
      {history && <div className="mt-3 -mx-1">
        <Sparkline
          data={history}
          width={280}
          height={20}
          stroke={color}
          fill={color}
          className="w-full"
          ariaLabel={`${position.symbol} recent price sparkline`}
        />
      </div>}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`w-full text-left block p-4 min-h-[44px] border-b border-[var(--color-border-light)] last:border-b-0 bg-transparent hover:bg-[var(--color-bg-tertiary)] active:scale-[0.99] transition-[transform,background-color] duration-200 touch-manipulation ${className}`}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={`p-4 border-b border-[var(--color-border-light)] last:border-b-0 ${className}`}>
      {content}
    </div>
  );
}

export default PositionCard;
