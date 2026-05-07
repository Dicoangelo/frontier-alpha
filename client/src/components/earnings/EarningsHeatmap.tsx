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
      className={`mono absolute top-0.5 left-0.5 text-[7px] font-bold leading-none px-0.5 rounded ${
        isBMO
          ? 'bg-[color-mix(in_srgb,var(--color-info)_20%,transparent)] text-[var(--color-info)]'
          : 'bg-[color-mix(in_srgb,var(--color-warning)_20%,transparent)] text-[var(--color-warning)]'
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
      <div className="min-h-[420px]">
        {/* Navigation */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={prevMonth}
            className="p-2 hover:bg-theme-tertiary rounded-lg transition-colors duration-200 animate-press"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-5 h-5 text-theme-secondary" aria-hidden="true" />
          </button>
          <div className="flex items-center gap-3">
            <h3 className="mono text-sm sm:text-base tracking-[0.2em] uppercase font-semibold text-theme">
              {MONTHS[viewMonth]} <span className="tabular-nums">{viewYear}</span>
            </h3>
            {(viewMonth !== today.getMonth() || viewYear !== today.getFullYear()) && (
              <button
                onClick={goToday}
                className="mono text-[10px] tracking-[0.2em] uppercase font-semibold px-2 py-1 rounded bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-[var(--color-accent)] hover:bg-[color-mix(in_srgb,var(--color-accent)_18%,transparent)] transition-colors duration-200 animate-press"
              >
                Today
              </button>
            )}
            {/* View toggle */}
            <button
              onClick={() => setListView(v => !v)}
              className="p-1.5 hover:bg-theme-tertiary rounded-lg transition-colors duration-200 animate-press"
              aria-label={listView ? 'Switch to grid view' : 'Switch to list view'}
              data-testid="view-toggle"
            >
              {listView
                ? <Grid className="w-4 h-4 text-theme-muted" aria-hidden="true" />
                : <List className="w-4 h-4 text-theme-muted" aria-hidden="true" />
              }
            </button>
          </div>
          <button
            onClick={nextMonth}
            className="p-2 hover:bg-theme-tertiary rounded-lg transition-colors duration-200 animate-press"
            aria-label="Next month"
          >
            <ChevronRight className="w-5 h-5 text-theme-secondary" aria-hidden="true" />
          </button>
        </div>

        {listView ? (
          /* ── LIST VIEW (mobile-friendly) ── */
          <div className="space-y-2 animate-stagger" data-testid="earnings-list-view">
            {sortedEarnings.length === 0 ? (
              <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted text-center py-8">
                No earnings this month
              </p>
            ) : (
              sortedEarnings.map((e) => {
                const d = new Date(e.reportDate);
                const isSelected = selectedSymbol === e.symbol;
                const isHighImpact = (e.expectedMove || 0) >= 0.08;
                const isModerate = (e.expectedMove || 0) >= 0.05;
                const rail = isSelected
                  ? 'before:bg-[image:var(--gradient-sovereign)]'
                  : isHighImpact
                  ? 'before:bg-[var(--color-negative)]'
                  : isModerate
                  ? 'before:bg-[var(--color-warning)]'
                  : 'before:bg-[var(--color-positive)]';
                return (
                  <button
                    key={`${e.symbol}-${e.fiscalQuarter}`}
                    onClick={() => onSelect(e.symbol)}
                    aria-pressed={isSelected}
                    className={`
                      glass-slab-floating animate-enter animate-press relative overflow-hidden
                      w-full flex items-center justify-between p-3 pl-5 rounded-xl text-left
                      before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px]
                      ${rail}
                      transition-[transform,box-shadow] duration-200
                    `}
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-center min-w-[36px]">
                        <p className="mono text-[10px] tracking-wider uppercase text-theme-muted">{MONTHS[d.getMonth()].slice(0, 3)}</p>
                        <p className="mono tabular-nums text-base font-bold text-theme">{d.getDate()}</p>
                      </div>
                      <div>
                        <span className="mono uppercase tracking-wider font-bold text-theme">{e.symbol}</span>
                        {e.fiscalQuarter && (
                          <span className="ml-2 mono text-[10px] tracking-wider uppercase text-theme-muted">{e.fiscalQuarter}</span>
                        )}
                        {e.reportTime && (e.reportTime === 'pre_market' || e.reportTime === 'post_market') && (
                          <span className={`ml-2 mono text-[10px] tracking-wider uppercase font-semibold ${
                            e.reportTime === 'pre_market' ? 'text-[var(--color-info)]' : 'text-[var(--color-warning)]'
                          }`}>
                            {e.reportTime === 'pre_market' ? 'BMO' : 'AMC'}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {e.expectedMove !== undefined && (
                        <span className={`mono tabular-nums text-sm font-semibold ${
                          isHighImpact ? 'text-[var(--color-negative)]' :
                          isModerate ? 'text-[var(--color-warning)]' :
                          'text-theme-secondary'
                        }`}>
                          ±{(e.expectedMove * 100).toFixed(1)}%
                        </span>
                      )}
                      <span className={`mono text-[10px] tracking-wider uppercase font-semibold px-1.5 py-0.5 rounded ${
                        isHighImpact
                          ? 'bg-[color-mix(in_srgb,var(--color-negative)_12%,transparent)] text-[var(--color-negative)]'
                          : isModerate
                          ? 'bg-[color-mix(in_srgb,var(--color-warning)_12%,transparent)] text-[var(--color-warning)]'
                          : 'bg-[color-mix(in_srgb,var(--color-positive)_12%,transparent)] text-[var(--color-positive)]'
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
                <div key={day} className="text-center mono text-[10px] tracking-[0.3em] uppercase font-semibold text-theme-muted py-1">
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
                          aspect-square rounded-lg border text-sm relative flex flex-col items-center justify-center
                          ${isToday ? 'ring-2 ring-[var(--color-accent)]' : ''}
                          ${hasEarnings
                            ? `${getImpactColor(maxMove)} cursor-pointer hover:scale-105 transition-[transform] duration-150 animate-press`
                            : 'border-transparent text-theme-muted'
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

                        <span className={`mono tabular-nums text-xs ${isToday ? 'font-bold text-[var(--color-accent)]' : hasEarnings ? 'font-semibold text-theme' : ''}`}>
                          {date.getDate()}
                        </span>

                        {/* Dot indicators */}
                        {hasEarnings && (
                          <span className="flex gap-0.5 mt-0.5">
                            {dayEarnings.slice(0, 3).map((_e, i) => (
                              <span
                                key={i}
                                className="w-1 h-1 rounded-full bg-theme"
                                aria-hidden="true"
                              />
                            ))}
                            {dayEarnings.length > 3 && (
                              <span className="text-[8px] text-theme-muted">+</span>
                            )}
                          </span>
                        )}

                        {/* High impact alert icon */}
                        {hasEarnings && maxMove >= 0.08 && (
                          <AlertTriangle className="absolute top-0.5 right-0.5 w-2.5 h-2.5 text-[var(--color-danger)]" aria-hidden="true" />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Expanded day detail */}
            {expandedDay && earningsByDate.has(expandedDay) && (
              <div className="mt-4 space-y-2 border-t border-theme-light pt-4 animate-stagger">
                <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">
                  Earnings on this day
                </p>
                {earningsByDate.get(expandedDay)!.map((e) => {
                  const isSelected = selectedSymbol === e.symbol;
                  const isHighImpact = (e.expectedMove || 0) >= 0.08;
                  const isModerate = (e.expectedMove || 0) >= 0.05;
                  const rail = isSelected
                    ? 'before:bg-[image:var(--gradient-sovereign)]'
                    : isHighImpact
                    ? 'before:bg-[var(--color-negative)]'
                    : isModerate
                    ? 'before:bg-[var(--color-warning)]'
                    : 'before:bg-[var(--color-positive)]';
                  return (
                    <button
                      key={`${e.symbol}-${e.fiscalQuarter}`}
                      onClick={() => onSelect(e.symbol)}
                      aria-pressed={isSelected}
                      className={`
                        glass-slab-floating animate-enter animate-press relative overflow-hidden
                        w-full flex items-center justify-between p-3 pl-5 rounded-xl text-left
                        before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px]
                        ${rail}
                        transition-[transform,box-shadow] duration-200
                      `}
                    >
                      <div>
                        <span className="mono uppercase tracking-wider font-bold text-theme">{e.symbol}</span>
                        {e.fiscalQuarter && (
                          <span className="ml-2 mono text-[10px] tracking-wider uppercase text-theme-muted">{e.fiscalQuarter}</span>
                        )}
                        {e.reportTime && (e.reportTime === 'pre_market' || e.reportTime === 'post_market') && (
                          <span className={`ml-2 mono text-[10px] tracking-wider uppercase font-semibold ${
                            e.reportTime === 'pre_market' ? 'text-[var(--color-info)]' : 'text-[var(--color-warning)]'
                          }`}>
                            {e.reportTime === 'pre_market' ? 'BMO' : 'AMC'}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {e.expectedMove !== undefined && (
                          <span className={`mono tabular-nums text-sm font-semibold ${
                            isHighImpact ? 'text-[var(--color-negative)]' :
                            isModerate ? 'text-[var(--color-warning)]' :
                            'text-theme-secondary'
                          }`}>
                            ±{(e.expectedMove * 100).toFixed(1)}%
                          </span>
                        )}
                        <span className={`mono text-[10px] tracking-wider uppercase font-semibold px-1.5 py-0.5 rounded ${
                          isHighImpact
                            ? 'bg-[color-mix(in_srgb,var(--color-negative)_12%,transparent)] text-[var(--color-negative)]'
                            : isModerate
                            ? 'bg-[color-mix(in_srgb,var(--color-warning)_12%,transparent)] text-[var(--color-warning)]'
                            : 'bg-[color-mix(in_srgb,var(--color-positive)_12%,transparent)] text-[var(--color-positive)]'
                        }`}>
                          {getImpactLabel(e.expectedMove || 0)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-3 mono text-[10px] tracking-wider uppercase text-theme-muted">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-[var(--color-positive)]/15 border border-[var(--color-positive)]/25" aria-hidden="true" />
            Minimal
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-[var(--color-accent)]/20 border border-[var(--color-accent)]/30" aria-hidden="true" />
            Low
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-[var(--color-warning)]/30 border border-[var(--color-warning)]/40" aria-hidden="true" />
            Moderate
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-[var(--color-danger)]/30 border border-[var(--color-danger)]/40" aria-hidden="true" />
            High Impact
          </div>
          <div className="flex items-center gap-1.5 ml-2 border-l border-theme-light pl-2">
            <span className="text-[8px] font-bold text-[var(--color-info)] bg-[color-mix(in_srgb,var(--color-info)_20%,transparent)] px-0.5 rounded">BMO</span>
            Pre-market
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] font-bold text-[var(--color-warning)] bg-[color-mix(in_srgb,var(--color-warning)_20%,transparent)] px-0.5 rounded">AMC</span>
            Post-market
          </div>
        </div>
      </div>
    </Card>
  );
}
