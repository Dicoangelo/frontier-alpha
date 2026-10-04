import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import type { EquityPoint } from '@/lib/equitySeries';
import type { EquitySeriesStatus } from '@/hooks/useEquityHistory';

type DataPoint = EquityPoint;
type Timeframe = '1W' | '1M' | '3M' | '6M' | '1Y' | 'YTD' | 'ALL';
interface EquityCurveProps {
  portfolioValue: number;
  series?: EquityPoint[] | null;
  seriesStatus?: EquitySeriesStatus;
  portfolioReturns?: number[];
  benchmarkReturns?: number[];
  timeframe?: Timeframe;
  expanded?: boolean;
  onToggleExpand?: () => void;
}

// Generate historical data points from returns
function generateDataPoints(
  currentValue: number,
  portfolioReturns: number[],
  benchmarkReturns: number[],
  days: number
): DataPoint[] {
  const now = new Date();

  // Work backwards from current value
  let portfolioValue = currentValue;
  let benchmarkValue = currentValue;

  const numPoints = Math.min(days, portfolioReturns.length, benchmarkReturns.length);

  // Generate points going backwards
  const tempPoints: DataPoint[] = [];
  for (let i = 0; i < numPoints; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);

    tempPoints.unshift({
      date: date.toISOString().split('T')[0],
      portfolio: portfolioValue,
      benchmark: benchmarkValue,
    });

    // Apply inverse returns to go backwards
    if (i < numPoints - 1) {
      portfolioValue = portfolioValue / (1 + (portfolioReturns[numPoints - 1 - i] || 0));
      benchmarkValue = benchmarkValue / (1 + (benchmarkReturns[numPoints - 1 - i] || 0));
    }
  }

  return tempPoints;
}

const TIMEFRAMES: Timeframe[] = ['1W', '1M', '3M', '6M', '1Y', 'YTD', 'ALL'];
const PERIOD_DAYS: Record<Exclude<Timeframe, 'YTD' | 'ALL'>, number> = { '1W': 7, '1M': 30, '3M': 90, '6M': 180, '1Y': 365 };
const dateLabel = (date: string, year = false) => new Date(`${date.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}) });
const money = (value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const percent = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;

// Windows end at the latest available daily close; the actual range is always
// visible. Include one real anchor before the boundary for return calculations.
function selectWindow(points: DataPoint[], timeframe: Timeframe): DataPoint[] {
  if (points.length < 2 || timeframe === 'ALL') return points;
  const latest = new Date(`${points[points.length - 1].date.slice(0, 10)}T12:00:00Z`);
  const cutoff = timeframe === 'YTD'
    ? `${latest.getUTCFullYear()}-01-01`
    : new Date(latest.getTime() - PERIOD_DAYS[timeframe] * 86400000).toISOString().slice(0, 10);
  const index = points.findIndex(p => p.date >= cutoff);
  return index < 0 ? [] : points.slice(points[index].date === cutoff ? index : Math.max(0, index - 1));
}

export const EquityCurve = React.memo(function EquityCurve({ portfolioValue, series = null, seriesStatus = 'idle', portfolioReturns = [], benchmarkReturns = [], timeframe = '3M', expanded = false, onToggleExpand }: EquityCurveProps) {
  const plotId = useId();
  const inspectorId = useId();
  const [showBenchmark, setShowBenchmark] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>(timeframe);
  const [inspection, setInspection] = useState<number | null>(null);

  const data = useMemo(() => {
    if (series && series.length >= 2) return selectWindow(series, selectedTimeframe);
    const now = new Date();
    const days = selectedTimeframe === 'ALL' ? Math.max(portfolioReturns.length, benchmarkReturns.length)
      : selectedTimeframe === 'YTD' ? Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86400000) + 1
      : PERIOD_DAYS[selectedTimeframe];
    return portfolioReturns.length > 0 && benchmarkReturns.length > 0
      ? generateDataPoints(portfolioValue, portfolioReturns, benchmarkReturns, days) : [];
  }, [series, selectedTimeframe, portfolioReturns, benchmarkReturns, portfolioValue]);
  const hasData = data.length >= 2;
  const isLoading = seriesStatus === 'loading' && !hasData;
  const first = data[0];
  const last = data[data.length - 1];
  const canCalculate = hasData && first.portfolio !== 0 && first.benchmark !== 0;
  const totalReturn = canCalculate ? (last.portfolio / first.portfolio - 1) * 100 : 0;
  const alpha = canCalculate ? totalReturn - (last.benchmark / first.benchmark - 1) * 100 : 0;
  const activeIndex = inspection === null ? data.length - 1 : Math.max(0, Math.min(inspection, data.length - 1));
  const activePoint = data[activeIndex];

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(entries => {
      if (entries[0]?.contentRect.width) setWidth(Math.max(280, entries[0].contentRect.width));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const height = expanded ? 360 : 224;
  const padding = { left: 64, right: 12, top: 14, bottom: 28 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const values = data.flatMap(point => showBenchmark ? [point.portfolio, point.benchmark] : [point.portfolio]);
  const lowest = hasData ? Math.min(...values) : 0;
  const highest = hasData ? Math.max(...values) : 1;
  const buffer = Math.max((highest - lowest) * 0.15, Math.abs(highest) * 0.005, 1);
  const min = lowest - buffer;
  const max = highest + buffer;
  const x = (index: number) => padding.left + index / Math.max(1, data.length - 1) * plotWidth;
  const y = (value: number) => padding.top + (max - value) / (max - min) * plotHeight;
  const line = (key: 'portfolio' | 'benchmark') => data.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index)},${y(point[key])}`).join(' ');
  const tickCount = width < 440 ? 3 : 5;
  const tickIndices = [...new Set(Array.from({ length: tickCount }, (_, i) => Math.round(i * (data.length - 1) / (tickCount - 1))))];
  const inspectAt = (clientX: number, rect: DOMRect) => {
    const relative = (clientX - rect.left) / rect.width * width;
    setInspection(Math.max(0, Math.min(data.length - 1, Math.round((relative - padding.left) / plotWidth * (data.length - 1)))));
  };
  const tone = (value: number) => value > 0 ? 'var(--color-positive)' : value < 0 ? 'var(--color-negative)' : 'var(--color-text)';

  return (
    <section className={`desk-panel equity-panel${expanded ? ' equity-panel-expanded' : ''}`} aria-label="Portfolio Performance" onKeyDown={event => { if (event.key === 'Escape' && expanded && onToggleExpand) { event.stopPropagation(); onToggleExpand(); } }}>
      <header className="equity-header">
        <div><h2>Portfolio performance</h2><p>{hasData ? `${dateLabel(first.date)} – ${dateLabel(last.date, true)}` : 'Daily closes · S&P 500 benchmark'}</p></div>
        <div className="equity-header-controls">
        <div className="equity-periods" role="group" aria-label="Chart timeframe">
          {TIMEFRAMES.map(period => <button type="button" key={period} aria-pressed={selectedTimeframe === period} onClick={() => { setSelectedTimeframe(period); setInspection(null); }}>{period === 'ALL' ? 'All' : period}</button>)}
        </div>
        {onToggleExpand && <button type="button" className="desk-panel-action" aria-expanded={expanded} aria-controls={plotId} onClick={onToggleExpand} title={expanded ? 'Restore the chart and allocation layout (Escape)' : 'Give the performance chart more space'}>
          {expanded ? <Minimize2 size={14} aria-hidden="true" /> : <Maximize2 size={14} aria-hidden="true" />}
          {expanded ? 'Restore layout' : 'Expand chart'}
        </button>}
        </div>
      </header>
      <div className="equity-metrics">
        <div><span>Period return</span><strong style={{ color: canCalculate ? tone(totalReturn) : 'var(--color-text-muted)' }}>{canCalculate ? percent(totalReturn) : '—'}</strong></div>
        <div title="Portfolio return minus S&P 500 return, in percentage points"><span>vs S&amp;P 500</span><strong style={{ color: canCalculate ? tone(alpha) : 'var(--color-text-muted)' }}>{canCalculate ? `${alpha > 0 ? '+' : ''}${alpha.toFixed(2)} pp` : '—'}</strong></div>
        <div className="equity-observation" aria-live="polite"><span>{activePoint ? dateLabel(activePoint.date) : 'Latest close'}</span><strong>{activePoint ? money(activePoint.portfolio) : '—'}</strong></div>
      </div>
      <div ref={containerRef} id={plotId} className="equity-plot" style={{ height }}>
        {hasData ? <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Portfolio equity curve showing ${percent(totalReturn)} return over ${selectedTimeframe}; ${dateLabel(first.date, true)} to ${dateLabel(last.date, true)}`} onMouseMove={event => inspectAt(event.clientX, event.currentTarget.getBoundingClientRect())} onMouseLeave={() => setInspection(null)}>
          {Array.from({ length: 5 }, (_, i) => {
            const value = max - i / 4 * (max - min);
            const pointY = y(value);
            return <g key={i}><line x1={padding.left} y1={pointY} x2={width - padding.right} y2={pointY} className="equity-grid-line" /><text x={padding.left - 9} y={pointY + 4} textAnchor="end" className="equity-axis">{Math.abs(value) >= 1000 && max - min >= 1000 ? `$${(value / 1000).toFixed(max - min < 10000 ? 1 : 0)}k` : money(value)}</text></g>;
          })}
          <path d={`${line('portfolio')} L${x(data.length - 1)},${height - padding.bottom} L${x(0)},${height - padding.bottom} Z`} className="equity-area" />
          {showBenchmark && <path d={line('benchmark')} className="equity-benchmark" />}
          <path d={line('portfolio')} className="equity-line" />
          {tickIndices.map(index => <text key={index} x={x(index)} y={height - 6} textAnchor={index === 0 ? 'start' : index === data.length - 1 ? 'end' : 'middle'} className="equity-axis">{dateLabel(data[index].date)}</text>)}
          {activePoint && <g><line x1={x(activeIndex)} y1={padding.top} x2={x(activeIndex)} y2={height - padding.bottom} className="equity-crosshair" /><circle cx={x(activeIndex)} cy={y(activePoint.portfolio)} r={3.5} className="equity-dot" /></g>}
        </svg> : <div className="equity-empty" data-testid={isLoading ? 'equity-curve-loading' : 'equity-curve-unavailable'}>
          <strong>{isLoading ? 'Loading daily closes…' : 'Performance history unavailable'}</strong>
          <p>{seriesStatus === 'idle' ? 'Add a position to chart your holdings against the S&P 500.' : 'Daily history appears once every holding has enough cached closes. No estimated returns are shown.'}</p>
        </div>}
      </div>
      {hasData && <div className="equity-inspector"><label htmlFor={inspectorId}>Inspect date</label><input id={inspectorId} aria-label="Inspect chart date" type="range" min="0" max={data.length - 1} value={activeIndex} onChange={event => setInspection(Number(event.target.value))} aria-valuetext={activePoint ? `${dateLabel(activePoint.date, true)}: ${money(activePoint.portfolio)}` : undefined} /></div>}
      <footer className="equity-footer"><div className="equity-legend"><span><i />Portfolio</span><button type="button" aria-label="Show S&P 500 benchmark" aria-pressed={showBenchmark} onClick={() => setShowBenchmark(value => !value)}><i />S&amp;P 500<span className="equity-legend-state">{showBenchmark ? 'Shown' : 'Hidden'}</span></button></div><span>{hasData && series ? "Today's holdings at daily closes. Not your transaction history." : 'Daily closing prices'}</span></footer>
    </section>
  );
});
