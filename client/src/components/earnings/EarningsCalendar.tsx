import { Calendar, Clock } from 'lucide-react';
import { Card } from '@/components/shared/Card';
import { Badge } from '@/components/shared/Badge';
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
        <div className="flex items-center justify-center h-64">
          <Spinner className="w-8 h-8" />
        </div>
      </Card>
    );
  }

  if (earnings.length === 0) {
    return (
      <Card title="Upcoming Earnings">
        <div className="flex flex-col items-center justify-center h-64 text-[var(--color-text-muted)]">
          <Calendar className="w-12 h-12 mb-4 opacity-50" />
          <p>No upcoming earnings in your portfolio</p>
          <p className="text-sm mt-1">Add positions to track their earnings</p>
        </div>
      </Card>
    );
  }

  const sortedEarnings = [...earnings].sort((a, b) => a.daysUntil - b.daysUntil);

  return (
    <Card title="Upcoming Earnings">
      <div className="space-y-2">
        {sortedEarnings.map((earning) => (
          <button
            key={`${earning.symbol}-${earning.fiscalQuarter}`}
            onClick={() => onSelect(earning.symbol)}
            className={`w-full p-4 rounded-lg border transition-all text-left ${
              selectedSymbol === earning.symbol
                ? 'border-[var(--color-info)] bg-[rgba(59, 130, 246,0.1)]'
                : 'border-[var(--color-border)] hover:border-[var(--color-border)] hover:bg-[var(--color-bg-tertiary)]'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[var(--color-text)]">{earning.symbol}</span>
                  <Badge variant={earning.daysUntil <= 7 ? 'warning' : 'default'}>
                    {earning.daysUntil === 0 ? 'Today' :
                     earning.daysUntil === 1 ? 'Tomorrow' :
                     `In ${earning.daysUntil} days`}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 mt-2 text-sm text-[var(--color-text-muted)]">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {new Date(earning.reportDate).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {getReportTimeLabel(earning.reportTime)}
                  </span>
                </div>
                {earning.fiscalQuarter && (
                  <span className="text-xs text-[var(--color-text-muted)] mt-1 block">
                    {earning.fiscalQuarter}
                  </span>
                )}
              </div>
              <div className="flex flex-col items-end">
                {earning.expectedMove !== undefined && (
                  <span className="text-sm font-medium text-[var(--color-text-secondary)]">
                    ±{(earning.expectedMove * 100).toFixed(1)}%
                  </span>
                )}
                {earning.status === 'confirmed' && (
                  <Badge variant="success" className="mt-1">Confirmed</Badge>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </Card>
  );
}
