/**
 * VolSurface — 3D implied volatility surface visualization using d3.
 * Extracted from Options.tsx (Story UXR2-004).
 */

import React, { useMemo, useCallback, useRef, useEffect, useState } from 'react';
import { Activity, Grip } from 'lucide-react';
import * as d3 from 'd3';
import { Card } from '@/components/shared/Card';
import type { VolSurfacePoint } from './options-types';
import {
  UNDERLYING_SYMBOL,
  getATMIV,
  getIVSkew,
  getTermSlope,
} from './options-types';

interface VolSurfaceProps {
  points: VolSurfacePoint[];
}

function StatMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2 bg-[var(--color-bg-secondary)] rounded-lg border border-[var(--color-border)] hover:shadow-lg transition-all duration-200 active:scale-[0.98]">
      <div className="text-xs text-[var(--color-text-muted)]">{label}</div>
      <div className="text-sm font-bold font-mono text-[var(--color-text)]">{value}</div>
    </div>
  );
}

function VolSurfaceInner({ points }: VolSurfaceProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [rotation, setRotation] = useState({ x: 25, z: -35 });
  const isDragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const expirations = useMemo(() => [...new Set(points.map((p) => p.expiration))], [points]);
  const strikes = useMemo(() => [...new Set(points.map((p) => p.strike))].sort((a, b) => a - b), [points]);

  const pointMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of points) {
      map.set(`${p.strike}-${p.expiration}`, p.iv);
    }
    return map;
  }, [points]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    setRotation((prev) => ({
      x: Math.max(5, Math.min(80, prev.x + dy * 0.3)),
      z: prev.z - dx * 0.3,
    }));
    lastPos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    const container = containerRef.current;
    if (!svg || !container) return;

    const width = container.clientWidth;
    const height = 360;
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));

    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const cx = width / 2;
    const cy = height / 2;
    const scale = Math.min(width, height) * 0.35;

    const radX = (rotation.x * Math.PI) / 180;
    const radZ = (rotation.z * Math.PI) / 180;

    const strikeMin = Math.min(...strikes);
    const strikeMax = Math.max(...strikes);
    const expMax = expirations.length - 1;

    const ivValues = points.map((p) => p.iv);
    const ivMin = Math.min(...ivValues);
    const ivMax = Math.max(...ivValues);

    const colorScale = d3.scaleSequential(d3.interpolateViridis).domain([ivMin, ivMax]);

    function project(sx: number, sy: number, sz: number): [number, number] {
      const x1 = sx * Math.cos(radZ) - sy * Math.sin(radZ);
      const y1 = sx * Math.sin(radZ) + sy * Math.cos(radZ);
      const z1 = sz;
      const y2 = y1 * Math.cos(radX) - z1 * Math.sin(radX);
      const z2 = y1 * Math.sin(radX) + z1 * Math.cos(radX);
      return [cx + x1 * scale, cy - (y2 * scale * 0.6 + z2 * scale * 0.4)];
    }

    const g = d3.select(svg).append('g');

    interface Face {
      points: [number, number][];
      iv: number;
      depth: number;
    }
    const faces: Face[] = [];

    for (let ei = 0; ei < expirations.length - 1; ei++) {
      for (let si = 0; si < strikes.length - 1; si++) {
        const corners = [
          { si, ei },
          { si: si + 1, ei },
          { si: si + 1, ei: ei + 1 },
          { si, ei: ei + 1 },
        ];

        const projected: [number, number][] = [];
        let totalIV = 0;
        let totalDepth = 0;

        for (const c of corners) {
          const nx = (2 * (strikes[c.si] - strikeMin)) / (strikeMax - strikeMin) - 1;
          const ny = expMax === 0 ? 0 : (2 * c.ei) / expMax - 1;
          const iv = pointMap.get(`${strikes[c.si]}-${expirations[c.ei]}`) || ivMin;
          const nz = ivMax === ivMin ? 0 : (iv - ivMin) / (ivMax - ivMin);
          totalIV += iv;

          const pt = project(nx, ny, nz);
          projected.push(pt);

          const rotY = nx * Math.sin(radZ) + ny * Math.cos(radZ);
          totalDepth += rotY * Math.sin(radX) + nz * Math.cos(radX);
        }

        faces.push({
          points: projected,
          iv: totalIV / 4,
          depth: totalDepth / 4,
        });
      }
    }

    faces.sort((a, b) => a.depth - b.depth);

    for (const face of faces) {
      const pathData = `M ${face.points.map(([x, y]) => `${x},${y}`).join(' L ')} Z`;
      g.append('path')
        .attr('d', pathData)
        .attr('fill', colorScale(face.iv))
        .attr('stroke', 'var(--color-border-light)')
        .attr('stroke-width', 0.5)
        .attr('opacity', 0.85);
    }

    for (let ei = 0; ei < expirations.length; ei++) {
      const linePoints: [number, number][] = [];
      for (const strike of strikes) {
        const nx = (2 * (strike - strikeMin)) / (strikeMax - strikeMin) - 1;
        const ny = expMax === 0 ? 0 : (2 * ei) / expMax - 1;
        const iv = pointMap.get(`${strike}-${expirations[ei]}`) || ivMin;
        const nz = ivMax === ivMin ? 0 : (iv - ivMin) / (ivMax - ivMin);
        linePoints.push(project(nx, ny, nz));
      }
      g.append('path')
        .attr('d', `M ${linePoints.map(([x, y]) => `${x},${y}`).join(' L ')}`)
        .attr('fill', 'none')
        .attr('stroke', 'var(--color-border)')
        .attr('stroke-width', 0.5);
    }

    for (const strike of strikes) {
      const linePoints: [number, number][] = [];
      for (let ei = 0; ei < expirations.length; ei++) {
        const nx = (2 * (strike - strikeMin)) / (strikeMax - strikeMin) - 1;
        const ny = expMax === 0 ? 0 : (2 * ei) / expMax - 1;
        const iv = pointMap.get(`${strike}-${expirations[ei]}`) || ivMin;
        const nz = ivMax === ivMin ? 0 : (iv - ivMin) / (ivMax - ivMin);
        linePoints.push(project(nx, ny, nz));
      }
      g.append('path')
        .attr('d', `M ${linePoints.map(([x, y]) => `${x},${y}`).join(' L ')}`)
        .attr('fill', 'none')
        .attr('stroke', 'var(--color-border)')
        .attr('stroke-width', 0.5);
    }

    const labelStyle = {
      fill: 'var(--color-text-muted, var(--color-text-muted))',
      fontSize: '11px',
      fontFamily: 'monospace',
    };

    const strikeEnd = project(1, -1, 0);
    g.append('text')
      .attr('x', strikeEnd[0] + 10)
      .attr('y', strikeEnd[1] + 15)
      .attr('fill', labelStyle.fill)
      .attr('font-size', labelStyle.fontSize)
      .attr('font-family', labelStyle.fontFamily)
      .text('Strike \u2192');

    const expEnd = project(-1, 1, 0);
    g.append('text')
      .attr('x', expEnd[0] - 40)
      .attr('y', expEnd[1] + 15)
      .attr('fill', labelStyle.fill)
      .attr('font-size', labelStyle.fontSize)
      .attr('font-family', labelStyle.fontFamily)
      .text('\u2190 Expiry');

    const ivTop = project(0, 0, 1.1);
    g.append('text')
      .attr('x', ivTop[0])
      .attr('y', ivTop[1] - 10)
      .attr('text-anchor', 'middle')
      .attr('fill', labelStyle.fill)
      .attr('font-size', labelStyle.fontSize)
      .attr('font-family', labelStyle.fontFamily)
      .text('IV \u2191');

    const legendWidth = 120;
    const legendHeight = 10;
    const legendX = width - legendWidth - 20;
    const legendY = 15;

    const defs = d3.select(svg).append('defs');
    const gradient = defs.append('linearGradient').attr('id', 'iv-gradient');
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      gradient
        .append('stop')
        .attr('offset', `${t * 100}%`)
        .attr('stop-color', colorScale(ivMin + t * (ivMax - ivMin)));
    }

    g.append('rect')
      .attr('x', legendX)
      .attr('y', legendY)
      .attr('width', legendWidth)
      .attr('height', legendHeight)
      .attr('fill', 'url(#iv-gradient)')
      .attr('rx', 3);

    g.append('text')
      .attr('x', legendX)
      .attr('y', legendY + legendHeight + 12)
      .attr('fill', labelStyle.fill)
      .attr('font-size', '10px')
      .attr('font-family', labelStyle.fontFamily)
      .text(`${(ivMin * 100).toFixed(0)}%`);

    g.append('text')
      .attr('x', legendX + legendWidth)
      .attr('y', legendY + legendHeight + 12)
      .attr('text-anchor', 'end')
      .attr('fill', labelStyle.fill)
      .attr('font-size', '10px')
      .attr('font-family', labelStyle.fontFamily)
      .text(`${(ivMax * 100).toFixed(0)}%`);
  }, [points, rotation, strikes, expirations, pointMap]);

  return (
    <Card>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold text-[var(--color-text)] flex items-center gap-2">
          <Activity className="w-5 h-5 text-[var(--color-accent)]" />
          Volatility Surface
        </h2>
        <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
          <Grip className="w-4 h-4" />
          Drag to rotate
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative cursor-grab active:cursor-grabbing select-none animate-fade-in"
        role="img"
        aria-label={`3D implied volatility surface for ${UNDERLYING_SYMBOL} showing IV across strikes and expirations`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <svg ref={svgRef} className="w-full" style={{ minHeight: 360 }} aria-hidden="true" />
      </div>

      {/* Summary stats */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatMini label="ATM IV" value={`${(getATMIV(points) * 100).toFixed(1)}%`} />
        <StatMini label="IV Skew" value={`${(getIVSkew(points) * 100).toFixed(1)}%`} />
        <StatMini label="Term Slope" value={getTermSlope(points)} />
        <StatMini label="Min/Max IV" value={`${(Math.min(...points.map((p) => p.iv)) * 100).toFixed(0)}\u2013${(Math.max(...points.map((p) => p.iv)) * 100).toFixed(0)}%`} />
      </div>
    </Card>
  );
}

export const VolSurface = React.memo(VolSurfaceInner);
export default VolSurface;
