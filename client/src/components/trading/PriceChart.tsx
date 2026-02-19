import { useState, useCallback, useId } from 'react';
import { Card } from '@/components/shared/Card';
import { Badge } from '@/components/shared/Badge';

interface PriceChartProps {
  symbol: string;
  currentPrice?: number;
  className?: string;
}

function generatePriceData(symbol: string, basePrice: number): number[] {
  let seed = 0;
  for (let i = 0; i < symbol.length; i++) seed += symbol.charCodeAt(i);
  const prices: number[] = [];
  let price = basePrice * 0.98; // Start slightly below current
  for (let i = 0; i < 20; i++) {
    seed = (seed * 16807) % 2147483647;
    const change = ((seed % 200) - 100) / 10000; // ±1% changes
    price *= (1 + change);
    prices.push(price);
  }
  // Ensure last point is near currentPrice
  prices[prices.length - 1] = basePrice;
  return prices;
}

const SVG_WIDTH = 300;
const SVG_HEIGHT = 120;
const PADDING_X = 8;
const PADDING_Y = 12;

function pricesToPoints(prices: number[]): { x: number; y: number }[] {
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const usableWidth = SVG_WIDTH - PADDING_X * 2;
  const usableHeight = SVG_HEIGHT - PADDING_Y * 2;

  return prices.map((price, i) => ({
    x: PADDING_X + (i / (prices.length - 1)) * usableWidth,
    y: PADDING_Y + (1 - (price - min) / range) * usableHeight,
  }));
}

export function PriceChart({ symbol, currentPrice, className }: PriceChartProps) {
  const uid = useId().replace(/:/g, '');
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const basePrice = currentPrice ?? 100;
  const prices = generatePriceData(symbol, basePrice);
  const points = pricesToPoints(prices);

  const firstPrice = prices[0];
  const lastPrice = prices[prices.length - 1];
  const isUp = lastPrice >= firstPrice;

  const lineColor = isUp ? 'var(--color-positive)' : 'var(--color-negative)';
  const gradientId = `price-gradient-${uid}`;

  // Build polyline points string
  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(' ');

  // Build polygon points (area fill): line points + bottom-right + bottom-left
  const polygonPoints = [
    ...points.map((p) => `${p.x},${p.y}`),
    `${points[points.length - 1].x},${SVG_HEIGHT - PADDING_Y}`,
    `${points[0].x},${SVG_HEIGHT - PADDING_Y}`,
  ].join(' ');

  // Hover handler: find nearest data point based on SVG x coordinate
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      // Scale from rendered width to SVG viewBox width
      const svgX = ((e.clientX - rect.left) / rect.width) * SVG_WIDTH;
      // Find nearest point index
      const usableWidth = SVG_WIDTH - PADDING_X * 2;
      const rawIdx = ((svgX - PADDING_X) / usableWidth) * (prices.length - 1);
      const idx = Math.max(0, Math.min(prices.length - 1, Math.round(rawIdx)));
      setHoverIdx(idx);
      setHoverX(points[idx].x);
    },
    [points, prices.length]
  );

  const handleMouseLeave = useCallback(() => {
    setHoverX(null);
    setHoverIdx(null);
  }, []);

  // Tooltip positioning — keep within SVG bounds
  const tooltipHoverPoint = hoverIdx !== null ? points[hoverIdx] : null;
  const tooltipPrice = hoverIdx !== null ? prices[hoverIdx] : null;

  const priceChange = lastPrice - firstPrice;
  const priceChangePct = ((priceChange / firstPrice) * 100).toFixed(2);
  const priceChangeFormatted = `${priceChange >= 0 ? '+' : ''}${priceChangePct}%`;

  return (
    <Card
      className={className}
      title="Price"
      action={
        <div className="flex items-center gap-2">
          <Badge variant="neutral" className="font-mono text-xs">
            {symbol}
          </Badge>
          <span
            className="text-xs font-medium"
            style={{ color: isUp ? 'var(--color-positive)' : 'var(--color-negative)' }}
          >
            {priceChangeFormatted}
          </span>
        </div>
      }
    >
      {currentPrice ? (
        <div className="space-y-2">
          {/* Current price display */}
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-[var(--color-text)]">
              ${currentPrice.toFixed(2)}
            </span>
            <span
              className="text-sm font-medium"
              style={{ color: isUp ? 'var(--color-positive)' : 'var(--color-negative)' }}
            >
              {priceChangeFormatted}
            </span>
          </div>

          {/* SVG chart */}
          <div className="relative">
            <svg
              viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
              width="100%"
              preserveAspectRatio="none"
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              style={{ display: 'block', cursor: hoverX !== null ? 'crosshair' : 'default' }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={isUp ? 'var(--color-positive)' : 'var(--color-negative)'}
                    stopOpacity="0.3"
                  />
                  <stop
                    offset="100%"
                    stopColor={isUp ? 'var(--color-positive)' : 'var(--color-negative)'}
                    stopOpacity="0"
                  />
                </linearGradient>
              </defs>

              {/* Gradient fill area */}
              <polygon
                points={polygonPoints}
                fill={`url(#${gradientId})`}
                stroke="none"
              />

              {/* Price line */}
              <polyline
                points={polylinePoints}
                fill="none"
                stroke={lineColor}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />

              {/* Hover crosshair */}
              {hoverX !== null && tooltipHoverPoint && (
                <>
                  {/* Vertical dashed line */}
                  <line
                    x1={hoverX}
                    y1={PADDING_Y}
                    x2={hoverX}
                    y2={SVG_HEIGHT - PADDING_Y}
                    stroke="var(--color-text-muted)"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                  />
                  {/* Dot at intersection */}
                  <circle
                    cx={tooltipHoverPoint.x}
                    cy={tooltipHoverPoint.y}
                    r="4"
                    fill={lineColor}
                    stroke="var(--color-bg-secondary)"
                    strokeWidth="2"
                  />
                  {/* Horizontal dashed line to y-axis */}
                  <line
                    x1={PADDING_X}
                    y1={tooltipHoverPoint.y}
                    x2={tooltipHoverPoint.x}
                    y2={tooltipHoverPoint.y}
                    stroke="var(--color-text-muted)"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                    opacity="0.5"
                  />

                  {/* Tooltip box — clamp so it stays inside viewBox */}
                  {tooltipPrice !== null && (() => {
                    const tooltipW = 72;
                    const tooltipH = 22;
                    const tooltipPad = 6;
                    let tx = tooltipHoverPoint.x - tooltipW / 2;
                    if (tx < PADDING_X) tx = PADDING_X;
                    if (tx + tooltipW > SVG_WIDTH - PADDING_X) tx = SVG_WIDTH - PADDING_X - tooltipW;
                    let ty = tooltipHoverPoint.y - tooltipH - tooltipPad;
                    if (ty < PADDING_Y) ty = tooltipHoverPoint.y + tooltipPad;

                    return (
                      <g>
                        <rect
                          x={tx}
                          y={ty}
                          width={tooltipW}
                          height={tooltipH}
                          rx="4"
                          fill="var(--color-bg-secondary)"
                          stroke="var(--color-border)"
                          strokeWidth="1"
                        />
                        <text
                          x={tx + tooltipW / 2}
                          y={ty + tooltipH / 2 + 4}
                          textAnchor="middle"
                          fill="var(--color-text)"
                          fontSize="11"
                          fontFamily="var(--font-mono, monospace)"
                        >
                          ${tooltipPrice.toFixed(2)}
                        </text>
                      </g>
                    );
                  })()}
                </>
              )}
            </svg>
          </div>

          {/* X-axis labels: start/end */}
          <div className="flex justify-between text-xs text-[var(--color-text-muted)]">
            <span>Open</span>
            <span>Now</span>
          </div>
        </div>
      ) : (
        <div className="py-8 text-center text-[var(--color-text-muted)]">
          <p className="text-sm">Enter a symbol to view price chart</p>
        </div>
      )}
    </Card>
  );
}
