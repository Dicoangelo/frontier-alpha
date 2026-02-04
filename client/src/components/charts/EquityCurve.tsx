import { useEffect, useRef, useState } from 'react';
import { Card } from '@/components/shared/Card';

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

// Generate mock data for demo
function generateMockData(currentValue: number, days: number): DataPoint[] {
  const points: DataPoint[] = [];
  const now = new Date();

  let portfolioValue = currentValue * 0.85; // Start lower
  let benchmarkValue = currentValue * 0.88;

  for (let i = days; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);

    points.push({
      date: date.toISOString().split('T')[0],
      portfolio: portfolioValue,
      benchmark: benchmarkValue,
    });

    // Random walk with slight upward bias
    portfolioValue *= 1 + (Math.random() - 0.45) * 0.015;
    benchmarkValue *= 1 + (Math.random() - 0.47) * 0.012;
  }

  // Adjust to match current value
  const scale = currentValue / points[points.length - 1].portfolio;
  return points.map(p => ({
    ...p,
    portfolio: p.portfolio * scale,
    benchmark: p.benchmark * scale * 0.95,
  }));
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
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [animationProgress, setAnimationProgress] = useState(0);
  const animationRef = useRef<number | null>(null);

  const days = TIMEFRAME_DAYS[selectedTimeframe];

  // Generate data
  const data = portfolioReturns.length > 0 && benchmarkReturns.length > 0
    ? generateDataPoints(portfolioValue, portfolioReturns, benchmarkReturns, days)
    : generateMockData(portfolioValue, days);

  // Calculate metrics
  const startValue = data[0]?.portfolio || portfolioValue;
  const endValue = data[data.length - 1]?.portfolio || portfolioValue;
  const totalReturn = ((endValue - startValue) / startValue) * 100;

  const benchmarkStart = data[0]?.benchmark || portfolioValue;
  const benchmarkEnd = data[data.length - 1]?.benchmark || portfolioValue;
  const benchmarkReturn = ((benchmarkEnd - benchmarkStart) / benchmarkStart) * 100;

  const alpha = totalReturn - benchmarkReturn;

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

  // Animate chart on data change
  useEffect(() => {
    setAnimationProgress(0);
    const startTime = performance.now();
    const duration = 800; // ms

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
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
  }, [selectedTimeframe, portfolioValue]);

  // Draw chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || dimensions.width === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

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
    ctx.strokeStyle = '#e5e7eb';
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
      ctx.fillStyle = '#6b7280';
      ctx.font = '11px system-ui';
      ctx.textAlign = 'right';
      ctx.fillText(`$${(value / 1000).toFixed(0)}k`, padding.left - 8, y + 4);
    }

    // Calculate how many points to draw based on animation progress
    const pointsToDraw = Math.floor(data.length * animationProgress);
    const animatedData = data.slice(0, Math.max(2, pointsToDraw));

    // Draw benchmark line (dashed)
    ctx.strokeStyle = '#9ca3af';
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
    gradient.addColorStop(0, `rgba(59, 130, 246, ${0.3 * animationProgress})`);
    gradient.addColorStop(1, 'rgba(59, 130, 246, 0)');

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
    ctx.strokeStyle = '#3b82f6';
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
      ctx.fillStyle = '#3b82f6';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // X-axis labels
    const labelCount = Math.min(6, data.length);
    const step = Math.floor(data.length / labelCount);
    ctx.fillStyle = '#6b7280';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';

    for (let i = 0; i < data.length; i += step) {
      const date = new Date(data[i].date);
      const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      ctx.fillText(label, xScale(i), dimensions.height - 8);
    }

  }, [data, dimensions, animationProgress]);

  // Mouse handling for hover
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || data.length === 0) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const padding = { left: 60, right: 20 };
    const chartWidth = dimensions.width - padding.left - padding.right;

    const relativeX = x - padding.left;
    const index = Math.round((relativeX / chartWidth) * (data.length - 1));

    if (index >= 0 && index < data.length) {
      setHoveredPoint(data[index]);
    }
  };

  const handleMouseLeave = () => {
    setHoveredPoint(null);
  };

  return (
    <Card title="Portfolio Performance" className="animate-fade-in-up">
      {/* Header metrics */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-6">
          <div>
            <p className="text-sm text-gray-500">Total Return</p>
            <p className={`text-xl font-bold ${totalReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {totalReturn >= 0 ? '+' : ''}{totalReturn.toFixed(2)}%
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">vs S&P 500</p>
            <p className={`text-xl font-bold ${alpha >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {alpha >= 0 ? '+' : ''}{alpha.toFixed(2)}%
            </p>
          </div>
          {hoveredPoint && (
            <div className="border-l pl-4 border-gray-200">
              <p className="text-sm text-gray-500">{new Date(hoveredPoint.date).toLocaleDateString()}</p>
              <p className="text-lg font-semibold text-gray-900">
                ${hoveredPoint.portfolio.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            </div>
          )}
        </div>

        {/* Timeframe selector */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(['1W', '1M', '3M', '6M', '1Y', 'YTD'] as const).map((tf) => (
            <button
              key={tf}
              onClick={() => setSelectedTimeframe(tf)}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                selectedTimeframe === tf
                  ? 'bg-white shadow text-gray-900'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div ref={containerRef} className="h-64 w-full">
        <canvas
          ref={canvasRef}
          className="w-full h-full cursor-crosshair"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        />
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-blue-500" />
          <span className="text-gray-600">Portfolio</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-gray-400 border-dashed border-t-2 border-gray-400" style={{ borderStyle: 'dashed' }} />
          <span className="text-gray-600">S&P 500</span>
        </div>
      </div>
    </Card>
  );
}
