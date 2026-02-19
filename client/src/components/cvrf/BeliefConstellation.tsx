import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { Orbit, Info, X } from 'lucide-react';
import { useCVRFBeliefs, useRegimeDisplay } from '@/hooks/useCVRF';
import { Card } from '@/components/shared/Card';
import { Spinner } from '@/components/shared/Spinner';

// ============================================================================
// TYPES
// ============================================================================

type FactorCategory = 'style' | 'quality' | 'volatility' | 'sentiment' | 'macro' | 'sector';

interface FactorNode extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  weight: number;
  confidence: number;
  category: FactorCategory;
  radius: number;
  lastUpdated?: string;
  beliefText?: string;
  history?: Array<{ value: number; ts: string }>;
}

interface FactorLink extends d3.SimulationLinkDatum<FactorNode> {
  strength: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Colors per spec: style=blue, quality=green, volatility=red, sentiment=purple, macro=amber, sector=cyan
const CATEGORY_COLORS: Record<FactorCategory, string> = {
  style: '#3B82F6',       // blue
  quality: '#22C55E',     // green
  volatility: '#EF4444',  // red
  sentiment: '#A855F7',   // purple
  macro: '#F59E0B',       // amber
  sector: '#06B6D4',      // cyan
};

const CATEGORY_LABELS: Record<FactorCategory, string> = {
  style: 'Style',
  quality: 'Quality',
  volatility: 'Volatility',
  sentiment: 'Sentiment',
  macro: 'Macro',
  sector: 'Sector',
};

const MIN_NODE_RADIUS = 8;
const MAX_NODE_RADIUS = 32;

// ============================================================================
// HELPERS
// ============================================================================

function categorizeFactor(name: string): FactorCategory {
  const n = name.toLowerCase();
  if (['quality', 'roe', 'roa', 'margin', 'earnings_quality', 'profitability'].some(f => n.includes(f))) return 'quality';
  if (['momentum', 'value', 'size', 'growth'].some(f => n.includes(f))) return 'style';
  if (['rate', 'inflation', 'credit', 'gdp', 'yield'].some(f => n.includes(f))) return 'macro';
  if (['tech', 'health', 'finance', 'energy', 'consumer', 'industrial'].some(f => n.includes(f))) return 'sector';
  if (['vol', 'volatility', 'vix', 'variance'].some(f => n.includes(f))) return 'volatility';
  if (['sentiment', 'news', 'social', 'analyst'].some(f => n.includes(f))) return 'sentiment';
  return 'style';
}

function formatFactorLabel(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

// ============================================================================
// DETAIL PANEL
// ============================================================================

interface DetailPanelProps {
  node: FactorNode | null;
  onClose: () => void;
}

function DetailPanel({ node, onClose }: DetailPanelProps) {
  if (!node) return null;

  const isPositive = node.weight >= 0;

  return (
    <div className="absolute top-4 right-4 w-72 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl shadow-lg z-10 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: CATEGORY_COLORS[node.category] }}
          />
          <span className="font-semibold text-sm text-[var(--color-text)]">
            {node.label}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-[var(--color-bg-tertiary)] rounded"
          aria-label="Close factor details"
        >
          <X className="w-4 h-4 text-[var(--color-text-muted)]" aria-hidden="true" />
        </button>
      </div>
      <div className="px-4 py-3 space-y-3">
        {/* Belief text */}
        {node.beliefText && (
          <div className="p-2 bg-[var(--color-bg-tertiary)] rounded-lg">
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">{node.beliefText}</p>
          </div>
        )}
        <div className="flex justify-between items-center">
          <span className="text-xs text-[var(--color-text-muted)]">Category</span>
          <span
            className="text-xs font-medium px-2 py-0.5 rounded"
            style={{
              backgroundColor: CATEGORY_COLORS[node.category] + '20',
              color: CATEGORY_COLORS[node.category],
            }}
          >
            {CATEGORY_LABELS[node.category]}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-[var(--color-text-muted)]">Conviction</span>
          <span className={`text-sm font-mono font-medium ${isPositive ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
            {isPositive ? '+' : ''}{(node.weight * 100).toFixed(1)}%
          </span>
        </div>
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-[var(--color-text-muted)]">Confidence</span>
            <span className="text-xs font-mono text-[var(--color-text)]">
              {(node.confidence * 100).toFixed(0)}%
            </span>
          </div>
          <div className="h-1.5 bg-[var(--color-bg-secondary)] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${node.confidence * 100}%`,
                backgroundColor: CATEGORY_COLORS[node.category],
              }}
            />
          </div>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-[var(--color-text-muted)]">Direction</span>
          <span className={`text-xs font-medium ${isPositive ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
            {isPositive ? 'Bullish' : 'Bearish'}
          </span>
        </div>
        {/* History sparkline */}
        {node.history && node.history.length > 1 && (
          <div>
            <span className="text-xs text-[var(--color-text-muted)]">History</span>
            <div className="mt-1 flex items-end gap-0.5 h-8">
              {node.history.slice(-8).map((h, i) => {
                const maxAbs = Math.max(...node.history!.map(x => Math.abs(x.value)), 0.01);
                const pct = Math.abs(h.value) / maxAbs;
                return (
                  <div
                    key={i}
                    className="flex-1 rounded-sm"
                    style={{
                      height: `${Math.max(10, pct * 100)}%`,
                      backgroundColor: h.value >= 0 ? 'var(--color-positive)' : 'var(--color-negative)',
                      opacity: 0.4 + pct * 0.6,
                    }}
                  />
                );
              })}
            </div>
          </div>
        )}
        {node.lastUpdated && (
          <div className="flex justify-between items-center">
            <span className="text-xs text-[var(--color-text-muted)]">Last Updated</span>
            <span className="text-xs text-[var(--color-text-muted)]">
              {new Date(node.lastUpdated).toLocaleDateString()}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function BeliefConstellation() {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<d3.Simulation<FactorNode, FactorLink> | null>(null);
  const pulseRafRef = useRef<number | null>(null);
  const prevBeliefsRef = useRef<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 500 });
  const [selectedNode, setSelectedNode] = useState<FactorNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<FactorNode | null>(null);

  const { data: beliefs, isLoading, isError } = useCVRFBeliefs();
  const regime = useRegimeDisplay(beliefs?.currentRegime, beliefs?.regimeConfidence);

  // Build graph data from beliefs
  const { nodes, links } = useMemo(() => {
    if (!beliefs) return { nodes: [], links: [] };

    const factorEntries = Object.entries(beliefs.factorWeights);
    const maxWeight = Math.max(...factorEntries.map(([, w]) => Math.abs(w as number)), 0.01);

    const nodeList: FactorNode[] = factorEntries.map(([factor, weight]) => {
      const w = weight as number;
      const confidence = (beliefs.factorConfidences[factor] as number) || 0.5;
      const category = categorizeFactor(factor);
      const normalizedSize = Math.abs(w) / maxWeight;
      const radius = MIN_NODE_RADIUS + normalizedSize * (MAX_NODE_RADIUS - MIN_NODE_RADIUS);

      return {
        id: factor,
        label: formatFactorLabel(factor),
        weight: w,
        confidence,
        category,
        radius,
      };
    });

    // Build links between same-category factors + strong cross-category correlations
    const linkList: FactorLink[] = [];
    for (let i = 0; i < nodeList.length; i++) {
      for (let j = i + 1; j < nodeList.length; j++) {
        const a = nodeList[i];
        const b = nodeList[j];

        // Same category = stronger link
        if (a.category === b.category) {
          linkList.push({
            source: a.id,
            target: b.id,
            strength: 0.4 + Math.min(a.confidence, b.confidence) * 0.3,
          });
        }
        // Cross-category: link if both have strong weights in same direction
        else if (
          Math.sign(a.weight) === Math.sign(b.weight) &&
          Math.abs(a.weight) > maxWeight * 0.3 &&
          Math.abs(b.weight) > maxWeight * 0.3
        ) {
          linkList.push({
            source: a.id,
            target: b.id,
            strength: 0.1,
          });
        }
      }
    }

    return { nodes: nodeList, links: linkList };
  }, [beliefs]);

  // ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        setDimensions({ width, height: Math.max(400, Math.min(width * 0.7, 600)) });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Pulse animation via requestAnimationFrame (no D3 transitions > 300ms)
  const triggerPulse = useCallback((nodeSelection: d3.Selection<SVGGElement, FactorNode, SVGGElement, unknown>) => {
    const startTime = performance.now();
    const duration = 300;

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out: sin curve
      const scale = 1 + Math.sin(progress * Math.PI) * 0.3;

      nodeSelection.select('circle:first-child')
        .attr('r', (d: FactorNode) => d.radius * scale);

      if (progress < 1) {
        pulseRafRef.current = requestAnimationFrame(animate);
      } else {
        // Reset to base radius
        nodeSelection.select('circle:first-child')
          .attr('r', (d: FactorNode) => d.radius);
      }
    };

    pulseRafRef.current = requestAnimationFrame(animate);
  }, []);

  // D3 force simulation
  const renderGraph = useCallback(() => {
    const svg = d3.select(svgRef.current);
    if (!svgRef.current || nodes.length === 0) return;

    const { width, height } = dimensions;

    // Clear previous
    svg.selectAll('*').remove();

    // Cancel any active pulse RAF
    if (pulseRafRef.current !== null) {
      cancelAnimationFrame(pulseRafRef.current);
    }

    // Defs for glow filter
    const defs = svg.append('defs');
    const filter = defs.append('filter').attr('id', 'glow');
    filter.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'coloredBlur');
    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    const g = svg.append('g');

    // Zoom + pan behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });
    svg.call(zoom as unknown as (selection: d3.Selection<SVGSVGElement | null, unknown, null, undefined>) => void);

    // Build simulation
    const simulation = d3.forceSimulation<FactorNode>(nodes)
      .force('link', d3.forceLink<FactorNode, FactorLink>(links)
        .id(d => d.id)
        .distance(d => 80 / (d.strength + 0.1))
        .strength(d => d.strength * 0.5)
      )
      .force('charge', d3.forceManyBody<FactorNode>()
        .strength(d => -d.radius * 8)
      )
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide<FactorNode>()
        .radius(d => d.radius + 4)
      )
      .force('x', d3.forceX(width / 2).strength(0.05))
      .force('y', d3.forceY(height / 2).strength(0.05));

    simulationRef.current = simulation;

    // Links — opacity by correlation (strength)
    const link = g.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', 'var(--color-border)')
      .attr('stroke-opacity', d => d.strength * 0.5)
      .attr('stroke-width', d => d.strength * 2);

    // Node groups
    const node = g.append('g')
      .selectAll<SVGGElement, FactorNode>('g')
      .data(nodes, d => d.id)
      .join('g')
      .style('cursor', 'pointer');

    // Outer circle — sized by conviction strength, colored by category
    node.append('circle')
      .attr('r', d => d.radius)
      .attr('fill', d => CATEGORY_COLORS[d.category])
      .attr('fill-opacity', d => 0.15 + d.confidence * 0.6)
      .attr('stroke', d => CATEGORY_COLORS[d.category])
      .attr('stroke-width', d => d.weight >= 0 ? 2 : 1.5)
      .attr('stroke-dasharray', d => d.weight < 0 ? '4,2' : 'none')
      .attr('filter', 'url(#glow)');

    // Inner dot showing conviction direction
    node.append('circle')
      .attr('r', d => Math.max(2, d.radius * 0.25))
      .attr('fill', d => d.weight >= 0 ? 'var(--color-positive)' : 'var(--color-negative)');

    // Labels
    node.append('text')
      .attr('dy', d => d.radius + 14)
      .attr('text-anchor', 'middle')
      .attr('font-size', d => d.radius > 16 ? '11px' : '9px')
      .attr('fill', 'var(--color-text-secondary)')
      .attr('pointer-events', 'none')
      .text(d => d.label);

    // Hover tooltip: name, conviction (0-1), last updated
    node
      .on('mouseenter', function (_event, d) {
        setHoveredNode(d);
        // Short D3 transition (<= 200ms, well under 300ms limit)
        d3.select(this).select('circle')
          .transition().duration(200)
          .attr('r', d.radius * 1.2)
          .attr('fill-opacity', 0.8);
      })
      .on('mouseleave', function (_, d) {
        setHoveredNode(null);
        d3.select(this).select('circle')
          .transition().duration(200)
          .attr('r', d.radius)
          .attr('fill-opacity', 0.15 + d.confidence * 0.6);
      })
      .on('click', (_, d) => {
        setSelectedNode(prev => prev?.id === d.id ? null : d);
      });

    // Drag behavior
    const drag = d3.drag<SVGGElement, FactorNode>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    node.call(drag);

    // Tick handler
    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as FactorNode).x || 0)
        .attr('y1', d => (d.source as FactorNode).y || 0)
        .attr('x2', d => (d.target as FactorNode).x || 0)
        .attr('y2', d => (d.target as FactorNode).y || 0);

      node.attr('transform', d => `translate(${d.x || 0},${d.y || 0})`);
    });

    // Pulse on first render (simulates belief update animation)
    const beliefKey = JSON.stringify(Object.keys(beliefs?.factorWeights || {}).sort());
    if (prevBeliefsRef.current && prevBeliefsRef.current !== beliefKey) {
      // Beliefs changed — trigger pulse on all nodes
      triggerPulse(node);
    }
    prevBeliefsRef.current = beliefKey;

    return () => {
      simulation.stop();
      if (pulseRafRef.current !== null) {
        cancelAnimationFrame(pulseRafRef.current);
      }
    };
  }, [nodes, links, dimensions, beliefs, triggerPulse]);

  useEffect(() => {
    const cleanup = renderGraph();
    return () => cleanup?.();
  }, [renderGraph]);

  // Loading
  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <Orbit className="w-5 h-5 text-[var(--color-accent)]" />
          <h3 className="font-semibold text-[var(--color-text)]">Belief Constellation</h3>
        </div>
        <div className="flex items-center justify-center h-[400px]">
          <Spinner className="w-8 h-8" />
        </div>
      </Card>
    );
  }

  // Error
  if (isError || !beliefs) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <Orbit className="w-5 h-5 text-[var(--color-accent)]" />
          <h3 className="font-semibold text-[var(--color-text)]">Belief Constellation</h3>
        </div>
        <div className="flex items-center justify-center h-[400px] text-[var(--color-text-muted)]">
          <p className="text-sm">Failed to load belief data</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-3">
          <Orbit className="w-5 h-5 text-[var(--color-accent)]" />
          <div>
            <h3 className="font-semibold text-[var(--color-text)]">Belief Constellation</h3>
            <p className="text-xs text-[var(--color-text-muted)]">
              {nodes.length} factors &middot; Regime: {regime.label} ({regime.confidence})
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
          <Info className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Drag to explore &middot; Scroll to zoom &middot; Click for details</span>
          <span className="sm:hidden">Tap for details</span>
        </div>
      </div>

      {/* Graph */}
      <div ref={containerRef} className="relative" role="img" aria-label={`Belief constellation showing ${nodes.length} factors across categories. Regime: ${regime.label}`}>
        <svg
          ref={svgRef}
          width={dimensions.width}
          height={dimensions.height}
          className="bg-[var(--color-bg-tertiary)]"
          aria-hidden="true"
        />

        {/* Detail Panel */}
        <DetailPanel node={selectedNode} onClose={() => setSelectedNode(null)} />

        {/* Hover Tooltip: name, conviction 0-1, last updated */}
        {hoveredNode && !selectedNode && (
          <div className="absolute bottom-4 left-4 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 shadow-lg pointer-events-none z-10">
            <div className="flex items-center gap-2">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: CATEGORY_COLORS[hoveredNode.category] }}
              />
              <span className="text-sm font-medium text-[var(--color-text)]">{hoveredNode.label}</span>
              <span
                className="text-xs px-1.5 py-0.5 rounded"
                style={{
                  backgroundColor: CATEGORY_COLORS[hoveredNode.category] + '20',
                  color: CATEGORY_COLORS[hoveredNode.category],
                }}
              >
                {CATEGORY_LABELS[hoveredNode.category]}
              </span>
            </div>
            <div className="flex gap-3 mt-1 text-xs text-[var(--color-text-muted)]">
              <span>
                Conviction: <span className="text-[var(--color-text)] font-mono">
                  {hoveredNode.confidence.toFixed(2)}
                </span>
              </span>
              <span className={hoveredNode.weight >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}>
                {hoveredNode.weight >= 0 ? '+' : ''}{(hoveredNode.weight * 100).toFixed(1)}%
              </span>
            </div>
            {hoveredNode.lastUpdated && (
              <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                Updated {new Date(hoveredNode.lastUpdated).toLocaleDateString()}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 px-6 py-3 border-t border-[var(--color-border)] bg-[var(--color-bg)]">
        {(Object.entries(CATEGORY_COLORS) as [FactorCategory, string][]).map(([cat, color]) => {
          const count = nodes.filter(n => n.category === cat).length;
          if (count === 0) return null;
          return (
            <div key={cat} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-xs text-[var(--color-text-secondary)]">
                {CATEGORY_LABELS[cat]} ({count})
              </span>
            </div>
          );
        })}
        <div className="flex items-center gap-1.5 ml-auto">
          <div className="w-3 h-3 rounded-full bg-[var(--color-positive)]" />
          <span className="text-xs text-[var(--color-text-muted)]">Bullish</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[var(--color-negative)]" />
          <span className="text-xs text-[var(--color-text-muted)]">Bearish</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-[var(--color-text-muted)]">Size = weight magnitude</span>
        </div>
      </div>
    </Card>
  );
}
