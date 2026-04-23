import { useMemo } from 'react';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  /** draw a horizontal baseline at the first data point */
  baseline?: boolean;
  className?: string;
  /** aria-label; if omitted treats as decorative */
  ariaLabel?: string;
}

/**
 * Inline SVG sparkline — deterministic, CSS-token-aware, no external deps.
 * Empty or single-point data renders a flat line at midline (safe default).
 */
export function Sparkline({
  data,
  width = 80,
  height = 20,
  stroke = 'var(--color-accent-secondary)',
  fill = 'none',
  baseline = false,
  className = '',
  ariaLabel,
}: SparklineProps) {
  const { path, baselineY, areaPath } = useMemo(() => {
    if (!data || data.length === 0) {
      const midY = height / 2;
      return { path: `M0,${midY} L${width},${midY}`, baselineY: midY, areaPath: '' };
    }
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const stepX = data.length > 1 ? width / (data.length - 1) : 0;
    const points = data.map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * height;
      return { x, y };
    });
    const d = points.reduce((acc, p, i) => acc + `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)} `, '');
    const first = data[0];
    const baseY = height - ((first - min) / range) * height;
    const area = `${d}L${width},${height} L0,${height} Z`;
    return { path: d.trim(), baselineY: baseY, areaPath: area };
  }, [data, width, height]);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    >
      {fill !== 'none' && areaPath && (
        <path d={areaPath} fill={fill} opacity={0.18} />
      )}
      {baseline && (
        <line
          x1={0}
          x2={width}
          y1={baselineY}
          y2={baselineY}
          stroke="var(--color-border-light)"
          strokeDasharray="2 3"
          strokeWidth={1}
        />
      )}
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default Sparkline;
