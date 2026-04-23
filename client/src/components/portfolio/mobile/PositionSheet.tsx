import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, TrendingDown, Pencil, Bell, Zap, X as XIcon } from 'lucide-react';
import { BottomSheet } from '@/components/shared/BottomSheet';
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

interface PositionSheetProps {
  position: PositionLike | null;
  onClose: () => void;
  onEdit?: (symbol: string) => void;
  onDelete?: (id: string | undefined) => void;
}

export function PositionSheet({ position, onClose, onEdit, onDelete }: PositionSheetProps) {
  const navigate = useNavigate();

  const stats = useMemo(() => {
    if (!position) return null;
    const basis = position.costBasis * position.shares;
    const value = (position.currentPrice || position.costBasis) * position.shares;
    const pnlPct = basis ? (position.unrealizedPnL / basis) * 100 : 0;
    return { basis, value, pnlPct };
  }, [position]);

  if (!position || !stats) {
    return <BottomSheet isOpen={false} onClose={onClose}>{null}</BottomSheet>;
  }

  const isUp = position.unrealizedPnL >= 0;
  const color = isUp ? 'var(--color-positive)' : 'var(--color-negative)';

  return (
    <BottomSheet
      isOpen
      onClose={onClose}
      title={position.symbol}
      height="auto"
    >
      <div className="space-y-5 pb-4" style={{ paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}>
        {/* Hero: price + PnL */}
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-[10px] mono tracking-[0.3em] uppercase text-[var(--color-text-muted)] mb-1">
              Current price
            </div>
            <div className="text-2xl font-bold tabular-nums text-[var(--color-text)]">
              ${(position.currentPrice || position.costBasis).toFixed(2)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] mono tracking-[0.3em] uppercase text-[var(--color-text-muted)] mb-1">
              Unrealized P&L
            </div>
            <div className="flex items-center gap-1.5 justify-end text-lg font-semibold tabular-nums" style={{ color }}>
              {isUp ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {isUp ? '+' : ''}${position.unrealizedPnL.toFixed(2)}
              <span className="text-[11px] mono ml-1">({isUp ? '+' : ''}{stats.pnlPct.toFixed(2)}%)</span>
            </div>
          </div>
        </div>

        {/* Sparkline, wider */}
        <div className="rounded-sm border border-[var(--color-border-light)] bg-[var(--color-bg-tertiary)] p-4">
          <Sparkline
            data={position.history && position.history.length > 1 ? position.history : [position.costBasis, position.currentPrice || position.costBasis]}
            width={320}
            height={40}
            stroke={color}
            fill={color}
            baseline
            className="w-full"
            ariaLabel={`${position.symbol} price history`}
          />
        </div>

        {/* Detail grid */}
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-sm bg-[var(--color-bg-tertiary)] p-3">
            <dt className="text-[9px] mono tracking-[0.3em] uppercase text-[var(--color-text-muted)]">Shares</dt>
            <dd className="mt-1 tabular-nums text-[var(--color-text)]">{position.shares.toFixed(2)}</dd>
          </div>
          <div className="rounded-sm bg-[var(--color-bg-tertiary)] p-3">
            <dt className="text-[9px] mono tracking-[0.3em] uppercase text-[var(--color-text-muted)]">Cost Basis</dt>
            <dd className="mt-1 tabular-nums text-[var(--color-text)]">${position.costBasis.toFixed(2)}</dd>
          </div>
          <div className="rounded-sm bg-[var(--color-bg-tertiary)] p-3">
            <dt className="text-[9px] mono tracking-[0.3em] uppercase text-[var(--color-text-muted)]">Position Value</dt>
            <dd className="mt-1 tabular-nums text-[var(--color-text)]">${stats.value.toFixed(2)}</dd>
          </div>
          <div className="rounded-sm bg-[var(--color-bg-tertiary)] p-3">
            <dt className="text-[9px] mono tracking-[0.3em] uppercase text-[var(--color-text-muted)]">Weight</dt>
            <dd className="mt-1 tabular-nums text-[var(--color-text)]">
              {position.weight != null ? `${(position.weight * (position.weight > 1 ? 1 : 100)).toFixed(1)}%` : '—'}
            </dd>
          </div>
        </dl>

        {/* Actions */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <button
            type="button"
            onClick={() => { onClose(); navigate(`/trade?symbol=${position.symbol}`); }}
            className="flex flex-col items-center gap-1.5 p-3 rounded-sm border border-[var(--color-border-light)] bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:text-[var(--color-accent-secondary)] hover:border-[var(--color-accent-secondary)] transition-colors animate-press"
          >
            <Zap className="w-4 h-4" />
            <span className="text-[10px] mono tracking-[0.2em] uppercase">Trade</span>
          </button>
          <button
            type="button"
            onClick={() => { onClose(); navigate(`/alerts?symbol=${position.symbol}`); }}
            className="flex flex-col items-center gap-1.5 p-3 rounded-sm border border-[var(--color-border-light)] bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:text-[var(--color-accent-secondary)] hover:border-[var(--color-accent-secondary)] transition-colors animate-press"
          >
            <Bell className="w-4 h-4" />
            <span className="text-[10px] mono tracking-[0.2em] uppercase">Alert</span>
          </button>
          <button
            type="button"
            onClick={() => { onEdit?.(position.symbol); }}
            className="flex flex-col items-center gap-1.5 p-3 rounded-sm border border-[var(--color-border-light)] bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:text-[var(--color-accent-secondary)] hover:border-[var(--color-accent-secondary)] transition-colors animate-press"
          >
            <Pencil className="w-4 h-4" />
            <span className="text-[10px] mono tracking-[0.2em] uppercase">Edit</span>
          </button>
        </div>

        {onDelete && position.id && (
          <button
            type="button"
            onClick={() => { onDelete(position.id); onClose(); }}
            className="w-full flex items-center justify-center gap-2 p-3 rounded-sm border border-[color-mix(in_srgb,var(--color-negative)_25%,transparent)] text-[var(--color-negative)] hover:bg-[color-mix(in_srgb,var(--color-negative)_8%,transparent)] transition-colors mono text-[10px] tracking-[0.3em] uppercase"
          >
            <XIcon className="w-4 h-4" />
            Close Position
          </button>
        )}
      </div>
    </BottomSheet>
  );
}

export default PositionSheet;
