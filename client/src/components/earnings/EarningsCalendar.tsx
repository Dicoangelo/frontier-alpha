import { Calendar, Clock } from 'lucide-react';
import { Card } from '@/components/shared/Card';
import { Spinner } from '@/components/shared/Spinner';
import { getReportTimeLabel } from '@/hooks/useEarnings';
import type { EarningsCalendarItem } from '@/api/earnings';

interface EarningsCalendarProps {
  earnings: EarningsCalendarItem[];
  isLoading?: boolean;
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
}

export function EarningsCalendar({
  earnings,
  isLoading,
  selectedSymbol,
  onSelect
}: EarningsCalendarProps) {
  if (isLoading) {
    return (
      <Card title="Upcoming Earnings">
        <div className="flex items-center justify-center min-h-[256px]">
          <Spinner className="w-8 h-8" />
        </div>
      </Card>
    );
  }

  if (earnings.length === 0) {
    return (
      <Card title="Upcoming Earnings">
        <div className="glass-slab gradient-brand-subtle rounded-2xl flex flex-col items-center justify-center min-h-[256px] p-8 text-theme-muted">
          <Calendar className="w-12 h-12 mb-4 opacity-60" aria-hidden="true" />
          <p className="mono text-[10px] tracking-[0.3em] uppercase">No upcoming earnings</p>
          <p className="text-sm text-theme-secondary mt-1">Add positions to track their earnings</p>
        </div>
      </Card>
    );
  }

  const sortedEarnings = [...earnings].sort((a, b) => a.daysUntil - b.daysUntil);

  return (
    <Card title="Upcoming Earnings">
      <div className="space-y-2 animate-stagger">
        {sortedEarnings.map((earning) => {
          const isSelected = selectedSymbol === earning.symbol;
          const isImminent = earning.daysUntil <= 1;
          const isThisWeek = earning.daysUntil <= 7;
          const rail = isImminent
            ? 'before:bg-[var(--color-negative)]'
            : isThisWeek
            ? 'before:bg-[var(--color-warning)]'
            : isSelected
            ? 'before:bg-[image:var(--gradient-sovereign)]'
            : 'before:bg-[var(--color-info)]';

          const countdownColor = isImminent
            ? 'text-[var(--color-negative)]'
            : isThisWeek
            ? 'text-[var(--color-warning)]'
            : 'text-theme-secondary';

          return (
            <button
              key={`${earning.symbol}-${earning.fiscalQuarter}`}
              onClick={() => onSelect(earning.symbol)}
              aria-pressed={isSelected}
              className={`
                glass-slab-floating animate-enter animate-press w-full text-left p-4 pl-5 rounded-xl relative overflow-hidden
                before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px]
                ${rail}
                transition-[transform,box-shadow] duration-200
                ${isSelected ? 'shadow-[0_18px_60px_-20px_rgba(123,44,255,0.45)]' : ''}
              `}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="mono uppercase tracking-wider font-bold text-theme">{earning.symbol}</span>
                    <span className={`mono tabular-nums text-[10px] tracking-[0.2em] uppercase font-semibold px-2 py-0.5 rounded-full ${
                      isImminent
                        ? 'bg-[color-mix(in_srgb,var(--color-negative)_12%,transparent)] text-[var(--color-negative)]'
                        : isThisWeek
                        ? 'bg-[color-mix(in_srgb,var(--color-warning)_12%,transparent)] text-[var(--color-warning)]'
                        : 'bg-theme-tertiary text-theme-secondary'
                    }`}>
                      {earning.daysUntil === 0 ? 'Today' :
                       earning.daysUntil === 1 ? 'Tomorrow' :
                       `In ${earning.daysUntil}d`}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-2 mono tabular-nums text-xs text-theme-muted">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
                      {new Date(earning.reportDate).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                      {getReportTimeLabel(earning.reportTime)}
                    </span>
                  </div>
                  {earning.fiscalQuarter && (
                    <span className="mono text-[10px] tracking-wider uppercase text-theme-muted mt-1 block">
                      {earning.fiscalQuarter}
                    </span>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  {earning.expectedMove !== undefined && (
                    <span className={`mono tabular-nums text-sm font-bold ${countdownColor}`}>
                      ±{(earning.expectedMove * 100).toFixed(1)}%
                    </span>
                  )}
                  {earning.status === 'confirmed' && (
                    <span className="mono text-[10px] tracking-[0.2em] uppercase font-semibold px-2 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--color-positive)_12%,transparent)] text-[var(--color-positive)]">
                      Confirmed
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
