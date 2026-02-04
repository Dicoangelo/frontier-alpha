import { useEffect, useRef, useState } from 'react';
import { Card } from '@/components/shared/Card';
import { TrendingUp, TrendingDown, Target, AlertTriangle } from 'lucide-react';

interface MonteCarloResult {
  medianReturn: number;
  var95: number;
  cvar95: number;
  probPositive: number;
  confidenceInterval: {
    p5: number;
    p25: number;
    p50: number;
    p75: number;
    p95: number;
  };
  simulations?: number[];
}

interface MonteCarloChartProps {
  result: MonteCarloResult;
  timeHorizon?: string;
  className?: string;
}

export function MonteCarloChart({
  result,
  timeHorizon = '1 Year',
  className = '',
}: MonteCarloChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 200 });

  // Generate histogram data from simulations or confidence interval
  const generateHistogramData = () => {
    if (result.simulations && result.simulations.length > 0) {
      return result.simulations;
    }

    // Generate synthetic distribution from confidence intervals
    const samples: number[] = [];
    const { p5, p25, p50, p75, p95 } = result.confidenceInterval;

    // Normal-ish distribution based on percentiles
    for (let i = 0; i < 1000; i++) {
      const rand = Math.random();
      let value: number;

      if (rand < 0.05) {
        value = p5 + (p25 - p5) * (rand / 0.05) * 0.3;
      } else if (rand < 0.25) {
        value = p5 + (p25 - p5) * ((rand - 0.05) / 0.20);
      } else if (rand < 0.50) {
        value = p25 + (p50 - p25) * ((rand - 0.25) / 0.25);
      } else if (rand < 0.75) {
        value = p50 + (p75 - p50) * ((rand - 0.50) / 0.25);
      } else if (rand < 0.95) {
        value = p75 + (p95 - p75) * ((rand - 0.75) / 0.20);
      } else {
        value = p95 + (p95 - p75) * ((rand - 0.95) / 0.05) * 0.3;
      }

      samples.push(value);
    }

    return samples;
  };

  // Resize observer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const container = canvas.parentElement;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setDimensions({
          width: entry.contentRect.width,
          height: 200,
        });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Draw histogram
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || dimensions.width === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    canvas.style.width = `${dimensions.width}px`;
    canvas.style.height = `${dimensions.height}px`;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, dimensions.width, dimensions.height);

    const samples = generateHistogramData();
    const padding = { top: 20, right: 20, bottom: 40, left: 50 };
    const chartWidth = dimensions.width - padding.left - padding.right;
    const chartHeight = dimensions.height - padding.top - padding.bottom;

    // Create histogram bins
    const minVal = Math.min(...samples);
    const maxVal = Math.max(...samples);
    const binCount = 40;
    const binWidth = (maxVal - minVal) / binCount;
    const bins: number[] = new Array(binCount).fill(0);

    samples.forEach((val) => {
      const binIndex = Math.min(Math.floor((val - minVal) / binWidth), binCount - 1);
      bins[binIndex]++;
    });

    const maxBinCount = Math.max(...bins);

    // Draw bars
    const barWidth = chartWidth / binCount - 1;

    bins.forEach((count, i) => {
      const x = padding.left + (i / binCount) * chartWidth;
      const barHeight = (count / maxBinCount) * chartHeight;
      const y = padding.top + chartHeight - barHeight;
      const binValue = minVal + i * binWidth;

      // Color based on return (red for negative, green for positive)
      if (binValue < 0) {
        const intensity = Math.min(Math.abs(binValue) / Math.abs(minVal), 1);
        ctx.fillStyle = `rgba(239, 68, 68, ${0.3 + intensity * 0.5})`;
      } else {
        const intensity = Math.min(binValue / maxVal, 1);
        ctx.fillStyle = `rgba(34, 197, 94, ${0.3 + intensity * 0.5})`;
      }

      ctx.fillRect(x, y, barWidth, barHeight);
    });

    // Draw zero line
    const zeroX = padding.left + ((0 - minVal) / (maxVal - minVal)) * chartWidth;
    if (zeroX > padding.left && zeroX < dimensions.width - padding.right) {
      ctx.strokeStyle = '#374151';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(zeroX, padding.top);
      ctx.lineTo(zeroX, padding.top + chartHeight);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#374151';
      ctx.font = 'bold 11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('0%', zeroX, padding.top + chartHeight + 20);
    }

    // Draw VaR line
    const { p5 } = result.confidenceInterval;
    const varX = padding.left + ((p5 - minVal) / (maxVal - minVal)) * chartWidth;
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(varX, padding.top);
    ctx.lineTo(varX, padding.top + chartHeight);
    ctx.stroke();

    ctx.fillStyle = '#dc2626';
    ctx.font = '10px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(`VaR ${(p5 * 100).toFixed(1)}%`, varX, padding.top - 5);

    // Draw median line
    const { p50 } = result.confidenceInterval;
    const medianX = padding.left + ((p50 - minVal) / (maxVal - minVal)) * chartWidth;
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(medianX, padding.top);
    ctx.lineTo(medianX, padding.top + chartHeight);
    ctx.stroke();

    ctx.fillStyle = '#3b82f6';
    ctx.fillText(`Median ${(p50 * 100).toFixed(1)}%`, medianX, padding.top - 5);

    // X-axis labels
    ctx.fillStyle = '#6b7280';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';

    const labelValues = [minVal, minVal + (maxVal - minVal) * 0.25, minVal + (maxVal - minVal) * 0.75, maxVal];
    labelValues.forEach((val) => {
      const x = padding.left + ((val - minVal) / (maxVal - minVal)) * chartWidth;
      ctx.fillText(`${(val * 100).toFixed(0)}%`, x, padding.top + chartHeight + 20);
    });

    // Y-axis label
    ctx.save();
    ctx.translate(15, padding.top + chartHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('Frequency', 0, 0);
    ctx.restore();

  }, [result, dimensions]);

  const isPositive = result.medianReturn > 0;

  return (
    <Card className={`p-6 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Monte Carlo Simulation</h3>
        <span className="text-sm text-gray-500">10,000 scenarios • {timeHorizon}</span>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <Target className="w-4 h-4 text-blue-500" />
            <span className="text-xs text-gray-500">Median Return</span>
          </div>
          <p className={`text-lg font-bold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
            {isPositive ? '+' : ''}{(result.medianReturn * 100).toFixed(1)}%
          </p>
        </div>

        <div className="p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            {result.probPositive >= 0.5 ? (
              <TrendingUp className="w-4 h-4 text-green-500" />
            ) : (
              <TrendingDown className="w-4 h-4 text-red-500" />
            )}
            <span className="text-xs text-gray-500">Prob. Positive</span>
          </div>
          <p className={`text-lg font-bold ${result.probPositive >= 0.5 ? 'text-green-600' : 'text-red-600'}`}>
            {(result.probPositive * 100).toFixed(0)}%
          </p>
        </div>

        <div className="p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span className="text-xs text-gray-500">VaR (95%)</span>
          </div>
          <p className="text-lg font-bold text-red-600">
            {(result.var95 * 100).toFixed(1)}%
          </p>
        </div>

        <div className="p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <span className="text-xs text-gray-500">CVaR (95%)</span>
          </div>
          <p className="text-lg font-bold text-red-600">
            {(result.cvar95 * 100).toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Distribution Chart */}
      <div className="relative">
        <canvas ref={canvasRef} className="w-full" />
      </div>

      {/* Confidence Intervals */}
      <div className="mt-4 pt-4 border-t border-gray-100">
        <p className="text-sm font-medium text-gray-700 mb-2">Confidence Intervals</p>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-8 relative">
            {/* Background track */}
            <div className="absolute inset-y-2 inset-x-0 bg-gray-100 rounded-full" />

            {/* 90% interval (5th to 95th percentile) */}
            <div
              className="absolute inset-y-2 bg-blue-200 rounded-full"
              style={{
                left: `${((result.confidenceInterval.p5 - result.confidenceInterval.p5) / (result.confidenceInterval.p95 - result.confidenceInterval.p5)) * 100}%`,
                right: `${100 - ((result.confidenceInterval.p95 - result.confidenceInterval.p5) / (result.confidenceInterval.p95 - result.confidenceInterval.p5)) * 100}%`,
              }}
            />

            {/* 50% interval (25th to 75th percentile) */}
            <div
              className="absolute inset-y-1 bg-blue-400 rounded-full"
              style={{
                left: `${((result.confidenceInterval.p25 - result.confidenceInterval.p5) / (result.confidenceInterval.p95 - result.confidenceInterval.p5)) * 100}%`,
                width: `${((result.confidenceInterval.p75 - result.confidenceInterval.p25) / (result.confidenceInterval.p95 - result.confidenceInterval.p5)) * 100}%`,
              }}
            />

            {/* Median marker */}
            <div
              className="absolute top-0 bottom-0 w-1 bg-blue-600 rounded-full"
              style={{
                left: `${((result.confidenceInterval.p50 - result.confidenceInterval.p5) / (result.confidenceInterval.p95 - result.confidenceInterval.p5)) * 100}%`,
              }}
            />
          </div>
        </div>
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>{(result.confidenceInterval.p5 * 100).toFixed(1)}%</span>
          <span>{(result.confidenceInterval.p25 * 100).toFixed(1)}%</span>
          <span className="font-medium text-blue-600">{(result.confidenceInterval.p50 * 100).toFixed(1)}%</span>
          <span>{(result.confidenceInterval.p75 * 100).toFixed(1)}%</span>
          <span>{(result.confidenceInterval.p95 * 100).toFixed(1)}%</span>
        </div>
        <div className="flex justify-between text-xs text-gray-400 mt-0.5">
          <span>5th</span>
          <span>25th</span>
          <span>Median</span>
          <span>75th</span>
          <span>95th</span>
        </div>
      </div>
    </Card>
  );
}

// Demo/preview component with sample data
export function MonteCarloChartDemo() {
  const sampleResult: MonteCarloResult = {
    medianReturn: 0.082,
    var95: -0.15,
    cvar95: -0.22,
    probPositive: 0.73,
    confidenceInterval: {
      p5: -0.15,
      p25: 0.02,
      p50: 0.082,
      p75: 0.14,
      p95: 0.25,
    },
  };

  return <MonteCarloChart result={sampleResult} />;
}
