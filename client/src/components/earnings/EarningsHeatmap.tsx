import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/shared/Card';
import type { EarningsCalendarItem } from '@/api/earnings';

interface EarningsHeatmapProps {
  earnings: EarningsCalendarItem[];
  onSelect: (symbol: string) => void;
  selectedSymbol: string | null;
}

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPad = firstDay.getDay(); // 0=Sun
  const totalDays = lastDay.getDate();

  const days: Array<{ date: Date | null; day: number | null }> = [];

  // Padding for days before the 1st
  for (let i = 0; i < startPad; i++) {
    days.push({ date: null, day: null });
  }

  for (let d = 1; d <= totalDays; d++) {
    days.push({ date: new Date(year, month, d), day: d });
  }

  return days;
}

function getImpactColor(maxMove: number): string {
  if (maxMove >= 0.08) return 'bg-[var(--color-danger)]/30 border-[var(--color-danger)]/40';
  if (maxMove >= 0.05) return 'bg-[var(--color-warning)]/30 border-[var(--color-warning)]/40';
  if (maxMove >= 0.02) return 'bg-[var(--color-accent)]/20 border-[var(--color-accent)]/30';
  return 'bg-[var(--color-positive)]/15 border-[var(--color-positive)]/25';
}

function getImpactLabel(maxMove: number): string {
  if (maxMove >= 0.08) return 'High Impact';
  if (maxMove >= 0.05) return 'Moderate';
  if (maxMove >= 0.02) return 'Low';
  return 'Minimal';
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

export function EarningsHeatmap({ earnings, onSelect, selectedSymbol }: EarningsHeatmapProps) {
  const today = new Date();
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const days = useMemo(() => getMonthDays(viewYear, viewMonth), [viewYear, viewMonth]);

  // Group earnings by date string
  const earningsByDate = useMemo(() => {
    const map = new Map<string, EarningsCalendarItem[]>();
    for (const e of earnings) {
      const d = new Date(e.reportDate);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [earnings]);

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
    setExpandedDay(null);
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
    setExpandedDay(null);
  };

  const goToday = () => {
    setViewMonth(today.getMonth());
    setViewYear(today.getFullYear());
    setExpandedDay(null);
  };

  return (
    <Card title="Earnings Heatmap">
      {/* Navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={prevMonth}
          className="p-2 hover:bg-[var(--color-bg-tertiary)] rounded-lg transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft className="w-5 h-5 text-[var(--color-text-secondary)]" />
        </button>
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-[var(--color-text)]">
            {MONTHS[viewMonth]} {viewYear}
          </h3>
          {(viewMonth !== today.getMonth() || viewYear !== today.getFullYear()) && (
            <button
              onClick={goToday}
              className="text-xs px-2 py-1 rounded bg-[var(--color-accent)]/10 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/20 transition-colors"
            >
              Today
            </button>
          )}
        </div>
        <button
          onClick={nextMonth}
          className="p-2 hover:bg-[var(--color-bg-tertiary)] rounded-lg transition-colors"
          aria-label="Next month"
        >
          <ChevronRight className="w-5 h-5 text-[var(--color-text-secondary)]" />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS.map((day) => (
          <div key={day} className="text-center text-xs font-medium text-[var(--color-text-muted)] py-1">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {days.map(({ date, day }, idx) => {
          if (!date || day === null) {
            return <div key={`pad-${idx}`} className="aspect-square" />;
          }

          const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
          const dayEarnings = earningsByDate.get(dateKey) || [];
          const hasEarnings = dayEarnings.length > 0;
          const isToday = isSameDay(date, today);
          const isExpanded = expandedDay === dateKey;
          const maxMove = hasEarnings
            ? Math.max(...dayEarnings.map(e => e.expectedMove || 0))
            : 0;

          return (
            <button
              key={dateKey}
              onClick={() => {
                if (hasEarnings) {
                  setExpandedDay(isExpanded ? null : dateKey);
                  if (dayEarnings.length === 1) {
                    onSelect(dayEarnings[0].symbol);
                  }
                }
              }}
              disabled={!hasEarnings}
              className={`
                aspect-square rounded-lg border text-sm relative transition-all
                ${isToday ? 'ring-2 ring-[var(--color-accent)]' : ''}
                ${hasEarnings
                  ? `${getImpactColor(maxMove)} cursor-pointer hover:scale-105`
                  : 'border-transparent text-[var(--color-text-muted)]'
                }
                ${isExpanded ? 'ring-2 ring-[var(--color-info)]' : ''}
              `}
              aria-label={hasEarnings
                ? `${day} ${MONTHS[viewMonth]} — ${dayEarnings.length} earning${dayEarnings.length > 1 ? 's' : ''}`
                : `${day} ${MONTHS[viewMonth]}`
              }
            >
              <span className={`text-xs ${isToday ? 'font-bold text-[var(--color-accent)]' : hasEarnings ? 'font-semibold text-[var(--color-text)]' : ''}`}>
                {day}
              </span>
              {hasEarnings && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex gap-0.5">
                  {dayEarnings.slice(0, 3).map((e, i) => (
                    <span
                      key={i}
                      className="w-1 h-1 rounded-full bg-[var(--color-text)]"
                    />
                  ))}
                  {dayEarnings.length > 3 && (
                    <span className="text-[8px] text-[var(--color-text-muted)]">+</span>
                  )}
                </span>
              )}
              {hasEarnings && maxMove >= 0.08 && (
                <AlertTriangle className="absolute top-0.5 right-0.5 w-2.5 h-2.5 text-[var(--color-danger)]" />
              )}
            </button>
          );
        })}
      </div>

      {/* Expanded day detail */}
      {expandedDay && earningsByDate.has(expandedDay) && (
        <div className="mt-4 space-y-2 border-t border-[var(--color-border)] pt-4">
          <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
            Earnings on this day
          </p>
          {earningsByDate.get(expandedDay)!.map((e) => (
            <button
              key={`${e.symbol}-${e.fiscalQuarter}`}
              onClick={() => onSelect(e.symbol)}
              className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors text-left ${
                selectedSymbol === e.symbol
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10'
                  : 'border-[var(--color-border)] hover:bg-[var(--color-bg-tertiary)]'
              }`}
            >
              <div>
                <span className="font-semibold text-[var(--color-text)]">{e.symbol}</span>
                {e.fiscalQuarter && (
                  <span className="ml-2 text-xs text-[var(--color-text-muted)]">{e.fiscalQuarter}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {e.expectedMove !== undefined && (
                  <span className={`text-sm font-medium ${
                    e.expectedMove >= 0.08 ? 'text-[var(--color-danger)]' :
                    e.expectedMove >= 0.05 ? 'text-[var(--color-warning)]' :
                    'text-[var(--color-text-secondary)]'
                  }`}>
                    ±{(e.expectedMove * 100).toFixed(1)}%
                  </span>
                )}
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  e.expectedMove >= 0.08
                    ? 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]'
                    : e.expectedMove >= 0.05
                    ? 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]'
                    : 'bg-[var(--color-positive)]/10 text-[var(--color-positive)]'
                }`}>
                  {getImpactLabel(e.expectedMove || 0)}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-3 text-xs text-[var(--color-text-muted)]">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-[var(--color-positive)]/15 border border-[var(--color-positive)]/25" />
          Minimal
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-[var(--color-accent)]/20 border border-[var(--color-accent)]/30" />
          Low
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-[var(--color-warning)]/30 border border-[var(--color-warning)]/40" />
          Moderate
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-[var(--color-danger)]/30 border border-[var(--color-danger)]/40" />
          High Impact
        </div>
      </div>
    </Card>
  );
}
