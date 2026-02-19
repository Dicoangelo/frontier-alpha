import { useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '@/components/shared/Card';
import { useThemeStore } from '@/stores/themeStore';

interface DataPoint {
  date: string;
  portfolio: number;
  benchmark: number;
}

interface EquityCurveProps {
  portfolioValue: number;
  portfolioReturns?: number[];
  benchmarkReturns?: number[];
  timeframe?: '1W' | '1M' | '3M' | '6M' | '1Y' | 'YTD' | 'ALL';
}

// Seeded pseudo-random for deterministic mock data
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
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

// Generate mock data for demo — deterministic per timeframe
function generateMockData(currentValue: number, days: number): DataPoint[] {
  const rand = seededRandom(days * 7919 + 42);
  const points: DataPoint[] = [];
  const now = new Date();

  let portfolioValue = currentValue * 0.85;
  let benchmarkValue = currentValue * 0.88;

  for (let i = days; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);

    points.push({
      date: date.toISOString().split('T')[0],
      portfolio: portfolioValue,
      benchmark: benchmarkValue,
    });

    // Deterministic walk with slight upward bias
    portfolioValue *= 1 + (rand() - 0.45) * 0.015;
    benchmarkValue *= 1 + (rand() - 0.47) * 0.012;
  }

  // Adjust to match current value
  const scale = currentValue / points[points.length - 1].portfolio;
  return points.map(p => ({
    ...p,
    portfolio: p.portfolio * scale,
    benchmark: p.benchmark * scale * 0.95,
  }));
}

// Theme-aware canvas colors
function getChartColors(isDark: boolean) {
  return {
    grid: isDark ? 'rgba(255, 255, 255, 0.08)' : 'var(--color-border)',
    label: isDark ? 'rgba(255, 255, 255, 0.5)' : 'var(--color-text-muted)',
    benchmark: isDark ? 'rgba(255, 255, 255, 0.35)' : 'var(--color-text-muted)',
    line: isDark ? '#60a5fa' : '#3b82f6',
    gradientTop: isDark ? 'rgba(96, 165, 250, 0.25)' : 'rgba(59, 130, 246, 0.3)',
    gradientBottom: isDark ? 'rgba(96, 165, 250, 0)' : 'rgba(59, 130, 246, 0)',
    dot: isDark ? '#60a5fa' : '#3b82f6',
    dotStroke: isDark ? '#0F1219' : '#ffffff',
  };
}

const TIMEFRAME_DAYS: Record<string, number> = {
  '1W': 7,
  '1M': 30,
  '3M': 90,
  '6M': 180,
  '1Y': 365,
  'YTD': Math.floor((new Date().getTime() - new Date(new Date().getFullYear(), 0, 1).getTime()) / (1000 * 60 * 60 * 24)),
  'ALL': 365,
};

export function EquityCurve({
  portfolioValue,
  portfolioReturns = [],
  benchmarkReturns = [],
  timeframe = '3M',
}: EquityCurveProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedTimeframe, setSelectedTimeframe] = useState(timeframe);
  const [hoveredPoint, setHoveredPoint] = useState<DataPoint | null>(null);
  const [hoveredX, setHoveredX] = useState<number | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [animationProgress, setAnimationProgress] = useState(0);
  const animationRef = useRef<number | null>(null);
  const isDark = useThemeStore((s) => s.resolved === 'dark');

  const days = TIMEFRAME_DAYS[selectedTimeframe];

  // Stable reference to portfolioValue — only update when it changes significantly (>1%)
  const stableValue = useRef(portfolioValue);
  if (Math.abs(portfolioValue - stableValue.current) / stableValue.current > 0.01) {
    stableValue.current = portfolioValue;
  }

  // Generate data — memoized, only changes on timeframe or significant value shift
  const data = useMemo(() => {
    const val = stableValue.current;
    return portfolioReturns.length > 0 && benchmarkReturns.length > 0
      ? generateDataPoints(val, portfolioReturns, benchmarkReturns, days)
      : generateMockData(val, days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stableValue.current, portfolioReturns, benchmarkReturns, days]);

  // Calculate metrics
  const { totalReturn, alpha } = useMemo(() => {
    const startValue = data[0]?.portfolio || portfolioValue;
    const endValue = data[data.length - 1]?.portfolio || portfolioValue;
    const tr = ((endValue - startValue) / startValue) * 100;

    const benchmarkStart = data[0]?.benchmark || portfolioValue;
    const benchmarkEnd = data[data.length - 1]?.benchmark || portfolioValue;
    const benchmarkReturn = ((benchmarkEnd - benchmarkStart) / benchmarkStart) * 100;

    return { totalReturn: tr, alpha: tr - benchmarkReturn };
  }, [data, portfolioValue]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setDimensions({
          width: entry.contentRect.width,
          height: Math.max(200, entry.contentRect.height),
        });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Animate chart on timeframe change only (not on value ticks)
  useEffect(() => {
    setAnimationProgress(0);
    const startTime = performance.now();
    const duration = 800;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimationProgress(eased);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [selectedTimeframe]);

  // Draw chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || dimensions.width === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const colors = getChartColors(isDark);

    // Set canvas size
    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    canvas.style.width = `${dimensions.width}px`;
    canvas.style.height = `${dimensions.height}px`;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.clearRect(0, 0, dimensions.width, dimensions.height);

    if (data.length < 2) return;

    // Calculate bounds
    const padding = { top: 20, right: 20, bottom: 30, left: 60 };
    const chartWidth = dimensions.width - padding.left - padding.right;
    const chartHeight = dimensions.height - padding.top - padding.bottom;

    const allValues = data.flatMap(d => [d.portfolio, d.benchmark]);
    const minValue = Math.min(...allValues) * 0.98;
    const maxValue = Math.max(...allValues) * 1.02;

    const xScale = (i: number) => padding.left + (i / (data.length - 1)) * chartWidth;
    const yScale = (v: number) => padding.top + chartHeight - ((v - minValue) / (maxValue - minValue)) * chartHeight;

    // Draw grid
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;

    // Horizontal grid lines
    const yTicks = 5;
    for (let i = 0; i <= yTicks; i++) {
      const y = padding.top + (i / yTicks) * chartHeight;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(dimensions.width - padding.right, y);
      ctx.stroke();

      // Y-axis labels
      const value = maxValue - (i / yTicks) * (maxValue - minValue);
      ctx.fillStyle = colors.label;
      ctx.font = '11px system-ui';
      ctx.textAlign = 'right';
      ctx.fillText(`$${(value / 1000).toFixed(0)}k`, padding.left - 8, y + 4);
    }

    // Calculate how many points to draw based on animation progress
    const pointsToDraw = Math.floor(data.length * animationProgress);
    const animatedData = data.slice(0, Math.max(2, pointsToDraw));

    // Draw benchmark line (dashed)
    ctx.strokeStyle = colors.benchmark;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.globalAlpha = animationProgress;
    ctx.beginPath();
    animatedData.forEach((point, i) => {
      const x = xScale(i);
      const y = yScale(point.benchmark);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Draw portfolio line with gradient
    const gradient = ctx.createLinearGradient(0, padding.top, 0, dimensions.height - padding.bottom);
    gradient.addColorStop(0, colors.gradientTop);
    gradient.addColorStop(1, colors.gradientBottom);

    // Fill area under portfolio line
    ctx.beginPath();
    ctx.moveTo(xScale(0), yScale(animatedData[0].portfolio));
    animatedData.forEach((point, i) => {
      ctx.lineTo(xScale(i), yScale(point.portfolio));
    });
    ctx.lineTo(xScale(animatedData.length - 1), dimensions.height - padding.bottom);
    ctx.lineTo(xScale(0), dimensions.height - padding.bottom);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw portfolio line
    ctx.strokeStyle = colors.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    animatedData.forEach((point, i) => {
      const x = xScale(i);
      const y = yScale(point.portfolio);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Draw animated endpoint dot
    if (animatedData.length > 0 && animationProgress < 1) {
      const lastPoint = animatedData[animatedData.length - 1];
      const lastX = xScale(animatedData.length - 1);
      const lastY = yScale(lastPoint.portfolio);

      ctx.beginPath();
      ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
      ctx.fillStyle = colors.dot;
      ctx.fill();
      ctx.strokeStyle = colors.dotStroke;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // X-axis labels
    const labelCount = Math.min(6, data.length);
    const step = Math.floor(data.length / labelCount);
    ctx.fillStyle = colors.label;
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';

    for (let i = 0; i < data.length; i += step) {
      const date = new Date(data[i].date);
      const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      ctx.fillText(label, xScale(i), dimensions.height - 8);
    }

    // Draw crosshair at hovered position
    if (hoveredX !== null && hoveredX >= padding.left && hoveredX <= dimensions.width - padding.right) {
      ctx.save();
      ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(hoveredX, padding.top);
      ctx.lineTo(hoveredX, dimensions.height - padding.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

  }, [data, dimensions, animationProgress, isDark, hoveredX]);

  // Shared logic for updating hovered state from a canvas X coordinate
  const updateHoverFromX = (clientX: number) => {
    if (!canvasRef.current || data.length === 0) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const padding = { left: 60, right: 20 };
    const chartWidth = dimensions.width - padding.left - padding.right;

    const relativeX = x - padding.left;
    const index = Math.round((relativeX / chartWidth) * (data.length - 1));

    setHoveredX(x);

    if (index >= 0 && index < data.length) {
      setHoveredPoint(data[index]);
    }
  };

  // Mouse handling for hover
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    updateHoverFromX(e.clientX);
  };

  const handleMouseLeave = () => {
    setHoveredPoint(null);
    setHoveredX(null);
  };

  // Touch handling — mirrors mouse hover behavior
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const touch = e.touches[0];
    if (touch) updateHoverFromX(touch.clientX);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const touch = e.touches[0];
    if (touch) updateHoverFromX(touch.clientX);
  };

  const handleTouchEnd = () => {
    setHoveredPoint(null);
    setHoveredX(null);
  };

  return (
    <Card title="Portfolio Performance" className="animate-fade-in-up">
      {/* Header metrics */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-6">
          <div>
            <p className="text-sm text-[var(--color-text-muted)]">Total Return</p>
            <p className={`text-xl font-bold ${totalReturn >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
              {totalReturn >= 0 ? '+' : ''}{totalReturn.toFixed(2)}%
            </p>
          </div>
          <div>
            <p className="text-sm text-[var(--color-text-muted)]">vs S&P 500</p>
            <p className={`text-xl font-bold ${alpha >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
              {alpha >= 0 ? '+' : ''}{alpha.toFixed(2)}%
            </p>
          </div>
          {hoveredPoint && (
            <div className="border-l pl-4 border-[var(--color-border)]">
              <p className="text-sm text-[var(--color-text-muted)]">{new Date(hoveredPoint.date).toLocaleDateString()}</p>
              <p className="text-lg font-semibold text-[var(--color-text)]">
                ${hoveredPoint.portfolio.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            </div>
          )}
        </div>

        {/* Timeframe selector */}
        <div className="flex gap-1 bg-[var(--color-bg-tertiary)] rounded-lg p-1" role="group" aria-label="Chart timeframe">
          {(['1W', '1M', '3M', '6M', '1Y', 'YTD'] as const).map((tf) => (
            <button
              key={tf}
              onClick={() => setSelectedTimeframe(tf)}
              className={`px-3 py-2 min-h-[36px] text-xs rounded-md transition-colors touch-manipulation ${
                selectedTimeframe === tf
                  ? 'bg-[var(--color-bg)] shadow text-[var(--color-text)]'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
              }`}
              aria-pressed={selectedTimeframe === tf}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div ref={containerRef} className="h-64 w-full relative" role="img" aria-label={`Portfolio equity curve showing ${totalReturn >= 0 ? '+' : ''}${totalReturn.toFixed(1)}% total return over ${selectedTimeframe} timeframe`}>
        <canvas
          ref={canvasRef}
          className="w-full h-full cursor-crosshair touch-none"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          aria-hidden="true"
        />
        {/* Tooltip near cursor */}
        {hoveredPoint && hoveredX !== null && (() => {
          const padding = { left: 60, right: 20 };
          const tooltipWidth = 160;
          // Clamp tooltip to canvas bounds
          const rawLeft = hoveredX + 12;
          const clampedLeft = Math.min(
            Math.max(rawLeft, padding.left),
            dimensions.width - padding.right - tooltipWidth
          );
          const dailyChange = data.length > 1
            ? ((hoveredPoint.portfolio - data[0].portfolio) / data[0].portfolio) * 100
            : 0;
          return (
            <div
              className="pointer-events-none absolute top-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg shadow-lg px-3 py-2 text-xs z-10"
              style={{ left: clampedLeft, width: tooltipWidth }}
            >
              <p className="text-[var(--color-text-muted)] mb-1">{new Date(hoveredPoint.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
              <p className="font-semibold text-[var(--color-text)]">${hoveredPoint.portfolio.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              <p className="text-[var(--color-text-muted)]">Benchmark: ${hoveredPoint.benchmark.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              <p className={dailyChange >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}>
                {dailyChange >= 0 ? '+' : ''}{dailyChange.toFixed(2)}%
              </p>
            </div>
          );
        })()}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-[var(--color-info)] dark:bg-[var(--color-info)]" />
          <span className="text-[var(--color-text-secondary)]">Portfolio</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 border-dashed border-t-2 border-[var(--color-text-muted)]" />
          <span className="text-[var(--color-text-secondary)]">S&P 500</span>
        </div>
      </div>
    </Card>
  );
}
