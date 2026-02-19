import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, AlertTriangle, List, Grid } from 'lucide-react';
import { Card } from '@/components/shared/Card';
import type { EarningsCalendarItem } from '@/api/earnings';

interface EarningsHeatmapProps {
  earnings: EarningsCalendarItem[];
  onSelect: (symbol: string) => void;
  selectedSymbol: string | null;
}

// Mon-Fri only (no weekends in earnings calendar)
const WEEKDAYS_5 = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Build Mon-Fri only week rows for a given month.
 * Returns an array of weeks, each week an array of 5 slots (Mon=0..Fri=4).
 * Slots are { date: Date | null } where null means a day in another month
 * or a pad at the start of the first week.
 */
function getWeekdayMonthGrid(year: number, month: number): Array<Array<Date | null>> {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Find the Monday on or before firstDay
  const firstDow = firstDay.getDay(); // 0=Sun..6=Sat
  // Days back to Monday: Sun->1, Mon->0, Tue->6, Wed->5, Thu->4, Fri->3, Sat->2
  const daysBack = firstDow === 0 ? 1 : firstDow - 1;
  const gridStart = new Date(firstDay);
  gridStart.setDate(gridStart.getDate() - daysBack);

  const weeks: Array<Array<Date | null>> = [];
  const cursor = new Date(gridStart);

  while (cursor <= lastDay) {
    const week: Array<Date | null> = [];
    for (let d = 0; d < 5; d++) {
      const dayDate = new Date(cursor);
      // Only include if in the target month
      week.push(dayDate.getMonth() === month ? dayDate : null);
      cursor.setDate(cursor.getDate() + 1);
    }
    // Skip weekends (Sat & Sun)
    cursor.setDate(cursor.getDate() + 2);
    // Only add the week if at least one day is in this month
    if (week.some(d => d !== null)) {
      weeks.push(week);
    }
  }

  return weeks;
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

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** BMO = before market open (pre_market), AMC = after market close (post_market) */
function TimingBadge({ timing }: { timing: string | undefined }) {
  if (!timing) return null;
  const isBMO = timing === 'pre_market';
  const isAMC = timing === 'post_market';
  if (!isBMO && !isAMC) return null;
  return (
    <span
      data-testid={isBMO ? 'bmo-badge' : 'amc-badge'}
      className={`absolute top-0.5 left-0.5 text-[7px] font-bold leading-none px-0.5 rounded ${
        isBMO
          ? 'bg-[rgba(59, 130, 246,0.2)] text-[var(--color-info)]'
          : 'bg-[rgba(245, 158, 11,0.2)] text-[var(--color-warning)]'
      }`}
    >
      {isBMO ? 'BMO' : 'AMC'}
    </span>
  );
}

export function EarningsHeatmap({ earnings, onSelect, selectedSymbol }: EarningsHeatmapProps) {
  const today = new Date();
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [listView, setListView] = useState(false);

  const weeks = useMemo(() => getWeekdayMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  // Group earnings by date key
  const earningsByDate = useMemo(() => {
    const map = new Map<string, EarningsCalendarItem[]>();
    for (const e of earnings) {
      const d = new Date(e.reportDate);
      const key = dateKey(d);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [earnings]);

  // Earnings sorted by date for list view
  const sortedEarnings = useMemo(() => {
    return [...earnings]
      .filter(e => {
        const d = new Date(e.reportDate);
        return d.getFullYear() === viewYear && d.getMonth() === viewMonth;
      })
      .sort((a, b) => new Date(a.reportDate).getTime() - new Date(b.reportDate).getTime());
  }, [earnings, viewMonth, viewYear]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else { setViewMonth(viewMonth - 1); }
    setExpandedDay(null);
  };

  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else { setViewMonth(viewMonth + 1); }
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
          {/* View toggle */}
          <button
            onClick={() => setListView(v => !v)}
            className="p-1.5 hover:bg-[var(--color-bg-tertiary)] rounded-lg transition-colors"
            aria-label={listView ? 'Switch to grid view' : 'Switch to list view'}
            data-testid="view-toggle"
          >
            {listView
              ? <Grid className="w-4 h-4 text-[var(--color-text-muted)]" />
              : <List className="w-4 h-4 text-[var(--color-text-muted)]" />
            }
          </button>
        </div>
        <button
          onClick={nextMonth}
          className="p-2 hover:bg-[var(--color-bg-tertiary)] rounded-lg transition-colors"
          aria-label="Next month"
        >
          <ChevronRight className="w-5 h-5 text-[var(--color-text-secondary)]" />
        </button>
      </div>

      {listView ? (
        /* ── LIST VIEW (mobile-friendly) ── */
        <div className="space-y-2" data-testid="earnings-list-view">
          {sortedEarnings.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)] text-center py-8">
              No earnings this month
            </p>
          ) : (
            sortedEarnings.map((e) => {
              const d = new Date(e.reportDate);
              const isSelected = selectedSymbol === e.symbol;
              return (
                <button
                  key={`${e.symbol}-${e.fiscalQuarter}`}
                  onClick={() => onSelect(e.symbol)}
                  className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors text-left ${
                    isSelected
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10'
                      : 'border-[var(--color-border)] hover:bg-[var(--color-bg-tertiary)]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="text-center min-w-[36px]">
                      <p className="text-xs text-[var(--color-text-muted)]">{MONTHS[d.getMonth()].slice(0, 3)}</p>
                      <p className="text-base font-bold text-[var(--color-text)]">{d.getDate()}</p>
                    </div>
                    <div>
                      <span className="font-semibold text-[var(--color-text)]">{e.symbol}</span>
                      {e.fiscalQuarter && (
                        <span className="ml-2 text-xs text-[var(--color-text-muted)]">{e.fiscalQuarter}</span>
                      )}
                      {e.reportTime && (e.reportTime === 'pre_market' || e.reportTime === 'post_market') && (
                        <span className={`ml-2 text-xs font-medium ${
                          e.reportTime === 'pre_market' ? 'text-[var(--color-info)]' : 'text-[var(--color-warning)]'
                        }`}>
                          {e.reportTime === 'pre_market' ? 'BMO' : 'AMC'}
                        </span>
                      )}
                    </div>
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
                      (e.expectedMove || 0) >= 0.08
                        ? 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]'
                        : (e.expectedMove || 0) >= 0.05
                        ? 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]'
                        : 'bg-[var(--color-positive)]/10 text-[var(--color-positive)]'
                    }`}>
                      {getImpactLabel(e.expectedMove || 0)}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      ) : (
        /* ── GRID VIEW (Mon-Fri 5-column) ── */
        <>
          {/* Weekday headers — Mon to Fri */}
          <div className="grid grid-cols-5 gap-1 mb-1" data-testid="weekday-headers">
            {WEEKDAYS_5.map((day) => (
              <div key={day} className="text-center text-xs font-medium text-[var(--color-text-muted)] py-1">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar grid — Mon-Fri only */}
          <div className="space-y-1" data-testid="earnings-grid">
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-5 gap-1">
                {week.map((date, di) => {
                  if (!date) {
                    return <div key={`empty-${wi}-${di}`} className="aspect-square" />;
                  }

                  const key = dateKey(date);
                  const dayEarnings = earningsByDate.get(key) || [];
                  const hasEarnings = dayEarnings.length > 0;
                  const isToday = isSameDay(date, today);
                  const isExpanded = expandedDay === key;
                  const maxMove = hasEarnings
                    ? Math.max(...dayEarnings.map(e => e.expectedMove || 0))
                    : 0;

                  // Pick first earnings item's timing for the badge
                  const primaryTiming = hasEarnings ? dayEarnings[0].reportTime : undefined;

                  return (
                    <button
                      key={key}
                      data-testid={`day-cell-${date.getDate()}`}
                      onClick={() => {
                        if (hasEarnings) {
                          setExpandedDay(isExpanded ? null : key);
                          if (dayEarnings.length === 1) {
                            onSelect(dayEarnings[0].symbol);
                          }
                        }
                      }}
                      disabled={!hasEarnings}
                      className={`
                        aspect-square rounded-lg border text-sm relative transition-all flex flex-col items-center justify-center
                        ${isToday ? 'ring-2 ring-[var(--color-accent)]' : ''}
                        ${hasEarnings
                          ? `${getImpactColor(maxMove)} cursor-pointer hover:scale-105`
                          : 'border-transparent text-[var(--color-text-muted)]'
                        }
                        ${isExpanded ? 'ring-2 ring-[var(--color-info)]' : ''}
                      `}
                      aria-label={hasEarnings
                        ? `${date.getDate()} ${MONTHS[viewMonth]} — ${dayEarnings.length} earning${dayEarnings.length > 1 ? 's' : ''}`
                        : `${date.getDate()} ${MONTHS[viewMonth]}`
                      }
                    >
                      {/* BMO/AMC timing badge */}
                      {hasEarnings && <TimingBadge timing={primaryTiming} />}

                      <span className={`text-xs ${isToday ? 'font-bold text-[var(--color-accent)]' : hasEarnings ? 'font-semibold text-[var(--color-text)]' : ''}`}>
                        {date.getDate()}
                      </span>

                      {/* Dot indicators */}
                      {hasEarnings && (
                        <span className="flex gap-0.5 mt-0.5">
                          {dayEarnings.slice(0, 3).map((_e, i) => (
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

                      {/* High impact alert icon */}
                      {hasEarnings && maxMove >= 0.08 && (
                        <AlertTriangle className="absolute top-0.5 right-0.5 w-2.5 h-2.5 text-[var(--color-danger)]" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
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
                    {e.reportTime && (e.reportTime === 'pre_market' || e.reportTime === 'post_market') && (
                      <span className={`ml-2 text-xs font-medium ${
                        e.reportTime === 'pre_market' ? 'text-[var(--color-info)]' : 'text-[var(--color-warning)]'
                      }`}>
                        {e.reportTime === 'pre_market' ? 'BMO' : 'AMC'}
                      </span>
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
                      (e.expectedMove || 0) >= 0.08
                        ? 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]'
                        : (e.expectedMove || 0) >= 0.05
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
        </>
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
        <div className="flex items-center gap-1.5 ml-2 border-l border-[var(--color-border)] pl-2">
          <span className="text-[8px] font-bold text-[var(--color-info)] bg-[rgba(59, 130, 246,0.2)] px-0.5 rounded">BMO</span>
          Pre-market
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[8px] font-bold text-[var(--color-warning)] bg-[rgba(245, 158, 11,0.2)] px-0.5 rounded">AMC</span>
          Post-market
        </div>
      </div>
    </Card>
  );
}
