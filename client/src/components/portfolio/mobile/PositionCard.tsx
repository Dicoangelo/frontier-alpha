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

/**
 * Synthesize a deterministic sparkline when no price history is provided —
 * random-but-stable noise walking around currentPrice, biased by PnL sign
 * so the visual direction matches reality. Real data from useQuotes/history
 * will override this.
 */
function synthesizeHistory(symbol: string, currentPrice: number, pnl: number): number[] {
  let seed = 0;
  for (let i = 0; i < symbol.length; i++) seed = (seed * 31 + symbol.charCodeAt(i)) | 0;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const steps = 24;
  const drift = pnl >= 0 ? 0.004 : -0.004;
  const vals: number[] = [];
  let v = currentPrice * (1 - drift * steps * 0.5);
  for (let i = 0; i < steps; i++) {
    v = v * (1 + drift + (rand() - 0.5) * 0.018);
    vals.push(v);
  }
  vals.push(currentPrice);
  return vals;
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
    : synthesizeHistory(position.symbol, position.currentPrice || position.costBasis, position.unrealizedPnL);

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

      {/* Row 3: sparkline spanning card */}
      <div className="mt-3 -mx-1">
        <Sparkline
          data={history}
          width={280}
          height={20}
          stroke={color}
          fill={color}
          className="w-full"
          ariaLabel={`${position.symbol} recent price sparkline`}
        />
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`w-full text-left block p-4 min-h-[44px] border-b border-[var(--color-border-light)] last:border-b-0 bg-transparent hover:bg-[var(--color-bg-tertiary)] active:scale-[0.99] transition-all touch-manipulation ${className}`}
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
