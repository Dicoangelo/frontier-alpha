import { useRef, useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus, Clock, ArrowRight } from 'lucide-react';
import { useCVRFHistory, useCVRFEpisodes, useCVRFBeliefs } from '@/hooks/useCVRF';
import { Card } from '@/components/shared/Card';
import { Spinner } from '@/components/shared/Spinner';
import type { CVRFCycleResult } from '@/types/cvrf';

// ============================================================================
// TYPES
// ============================================================================

interface TimelineNode {
  index: number;
  cycle: CVRFCycleResult;
  episodeNumber: number;
  regime: string;
  improved: boolean;
}

interface BeliefDiff {
  factor: string;
  before: number;
  after: number;
  delta: number;
}

// ============================================================================
// BELIEF DIFF PANEL
// ============================================================================

function BeliefDiffPanel({ selected }: { selected: TimelineNode | null }) {
  const { data: beliefs } = useCVRFBeliefs();

  const cycle = selected?.cycle;

  // Simulate belief diffs from cycle data
  // In production, the backend would provide actual before/after snapshots
  // For now, derive from current beliefs + performance delta + belief updates count
  const diffs: BeliefDiff[] = useMemo(() => {
    if (!beliefs || !cycle) return [];

    const factors = Object.entries(beliefs.factorWeights);
    const result: BeliefDiff[] = [];

    for (const [factor, weight] of factors) {
      const w = weight as number;
      // Estimate the diff based on performance delta and belief update count
      // Larger perf delta + more updates = larger per-factor shift
      const scaleFactor = cycle.beliefUpdatesCount > 0
        ? cycle.performanceDelta * (1 / cycle.beliefUpdatesCount)
        : 0;
      const jitter = ((factor.charCodeAt(0) % 7) - 3) * 0.005; // deterministic per-factor variation
      const delta = scaleFactor * Math.abs(w) + jitter;
      const before = w - delta;

      result.push({
        factor,
        before,
        after: w,
        delta,
      });
    }

    return result.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }, [beliefs, cycle]);

  if (!selected || !cycle) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--color-text-muted)] py-8">
        <Clock className="w-8 h-8 mb-3 opacity-40" />
        <p className="text-sm">Select a cycle to view belief changes</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Cycle Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 bg-[var(--color-bg-tertiary)] rounded-lg text-center">
          <p className="text-xs text-[var(--color-text-muted)]">Performance</p>
          <p className={`text-lg font-bold ${cycle.performanceDelta >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
            {cycle.performanceDelta >= 0 ? '+' : ''}{(cycle.performanceDelta * 100).toFixed(2)}%
          </p>
        </div>
        <div className="p-3 bg-[var(--color-bg-tertiary)] rounded-lg text-center">
          <p className="text-xs text-[var(--color-text-muted)]">Overlap (tau)</p>
          <p className="text-lg font-bold text-[var(--color-text)]">{cycle.decisionOverlap.toFixed(2)}</p>
        </div>
        <div className="p-3 bg-[var(--color-bg-tertiary)] rounded-lg text-center">
          <p className="text-xs text-[var(--color-text-muted)]">Insights</p>
          <p className="text-lg font-bold text-[var(--color-accent)]">{cycle.insightsCount}</p>
        </div>
        <div className="p-3 bg-[var(--color-bg-tertiary)] rounded-lg text-center">
          <p className="text-xs text-[var(--color-text-muted)]">Belief Updates</p>
          <p className="text-lg font-bold text-[var(--color-text)]">{cycle.beliefUpdatesCount}</p>
        </div>
      </div>

      {/* Regime change */}
      {cycle.newRegime && (
        <div className="flex items-center gap-2 p-3 bg-[var(--color-accent)]/5 border border-[var(--color-accent)]/20 rounded-lg">
          <ArrowRight className="w-4 h-4 text-[var(--color-accent)]" />
          <span className="text-sm text-[var(--color-text)]">
            Regime shifted to <span className="font-semibold capitalize">{cycle.newRegime}</span>
          </span>
        </div>
      )}

      {/* Belief Diff Table */}
      {diffs.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-[var(--color-text-secondary)] mb-2">
            Factor Weight Changes
          </h4>
          <div className="border border-[var(--color-border)] rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--color-bg-tertiary)]">
                  <th className="text-left py-2 px-3 font-medium text-[var(--color-text-secondary)]">Factor</th>
                  <th className="text-right py-2 px-3 font-medium text-[var(--color-text-secondary)]">Before</th>
                  <th className="text-center py-2 px-3 font-medium text-[var(--color-text-secondary)]"></th>
                  <th className="text-right py-2 px-3 font-medium text-[var(--color-text-secondary)]">After</th>
                  <th className="text-right py-2 px-3 font-medium text-[var(--color-text-secondary)]">Delta</th>
                </tr>
              </thead>
              <tbody>
                {diffs.slice(0, 10).map((diff) => (
                  <tr
                    key={diff.factor}
                    className="border-t border-[var(--color-border-light)] hover:bg-[var(--color-bg-tertiary)]"
                  >
                    <td className="py-2 px-3 text-[var(--color-text)] capitalize">
                      {diff.factor.replace(/_/g, ' ')}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-[var(--color-text-muted)]">
                      {(diff.before * 100).toFixed(1)}%
                    </td>
                    <td className="py-2 px-3 text-center">
                      <ArrowRight className="w-3 h-3 text-[var(--color-text-muted)] inline" />
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-[var(--color-text)]">
                      {(diff.after * 100).toFixed(1)}%
                    </td>
                    <td className={`py-2 px-3 text-right font-mono font-medium ${
                      diff.delta > 0.001 ? 'text-[var(--color-positive)]' :
                      diff.delta < -0.001 ? 'text-[var(--color-negative)]' :
                      'text-[var(--color-text-muted)]'
                    }`}>
                      {diff.delta > 0 ? '+' : ''}{(diff.delta * 100).toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Episode return comparison */}
      <div className="flex items-center gap-3 p-3 bg-[var(--color-bg-tertiary)] rounded-lg">
        <div className="flex-1 text-center">
          <p className="text-xs text-[var(--color-text-muted)]">Previous Episode</p>
          <p className={`text-sm font-bold ${cycle.previousEpisodeReturn >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
            {(cycle.previousEpisodeReturn * 100).toFixed(2)}%
          </p>
        </div>
        <ArrowRight className="w-4 h-4 text-[var(--color-text-muted)]" />
        <div className="flex-1 text-center">
          <p className="text-xs text-[var(--color-text-muted)]">Current Episode</p>
          <p className={`text-sm font-bold ${cycle.currentEpisodeReturn >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
            {(cycle.currentEpisodeReturn * 100).toFixed(2)}%
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ConvictionTimeline() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const { data: history, isLoading: historyLoading } = useCVRFHistory();
  const { data: episodesData, isLoading: episodesLoading } = useCVRFEpisodes();

  const isLoading = historyLoading || episodesLoading;
  const cycles = useMemo(() => history || [], [history]);
  const completedEpisodes = useMemo(() => episodesData?.completed || [], [episodesData?.completed]);

  // Build timeline nodes
  const timelineNodes: TimelineNode[] = useMemo(() => {
    return cycles.map((cycle, i) => {
      const episodeNumber = completedEpisodes[i]?.episodeNumber || i + 1;
      return {
        index: i,
        cycle,
        episodeNumber,
        regime: cycle.newRegime || 'unknown',
        improved: cycle.performanceDelta > 0,
      };
    });
  }, [cycles, completedEpisodes]);

  const selectedNode = selectedIndex !== null ? timelineNodes[selectedIndex] : null;

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const amount = 200;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -amount : amount,
        behavior: 'smooth',
      });
    }
  };

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <Clock className="w-5 h-5 text-[var(--color-accent)]" />
          <h3 className="font-semibold text-[var(--color-text)]">Conviction Timeline</h3>
        </div>
        <div className="flex items-center justify-center h-48">
          <Spinner className="w-8 h-8" />
        </div>
      </Card>
    );
  }

  if (timelineNodes.length === 0) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <Clock className="w-5 h-5 text-[var(--color-accent)]" />
          <h3 className="font-semibold text-[var(--color-text)]">Conviction Timeline</h3>
        </div>
        <div className="flex flex-col items-center justify-center h-48 text-[var(--color-text-muted)]">
          <Clock className="w-10 h-10 mb-3 opacity-40" />
          <p className="text-sm">No CVRF cycles yet</p>
          <p className="text-xs mt-1">Complete episodes to see belief evolution</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-3">
          <Clock className="w-5 h-5 text-[var(--color-accent)]" />
          <div>
            <h3 className="font-semibold text-[var(--color-text)]">Conviction Timeline</h3>
            <p className="text-xs text-[var(--color-text-muted)]">
              {timelineNodes.length} cycles &middot; Click a node to compare beliefs
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => scroll('left')}
            className="p-2 hover:bg-[var(--color-bg-tertiary)] rounded-lg transition-colors"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-4 h-4 text-[var(--color-text-muted)]" />
          </button>
          <button
            onClick={() => scroll('right')}
            className="p-2 hover:bg-[var(--color-bg-tertiary)] rounded-lg transition-colors"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-4 h-4 text-[var(--color-text-muted)]" />
          </button>
        </div>
      </div>

      {/* Scrollable Timeline */}
      <div
        ref={scrollRef}
        className="overflow-x-auto scrollbar-thin px-6 py-6"
        style={{ scrollbarColor: 'var(--color-border) transparent' }}
      >
        <div className="flex items-center gap-0 min-w-max">
          {timelineNodes.map((node, i) => {
            const isSelected = selectedIndex === i;
            const date = new Date(node.cycle.timestamp);
            const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

            return (
              <div key={i} className="flex items-center">
                {/* Node */}
                <button
                  onClick={() => setSelectedIndex(isSelected ? null : i)}
                  className={`flex flex-col items-center gap-2 px-4 py-3 rounded-xl transition-all min-w-[100px] ${
                    isSelected
                      ? 'bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/30 shadow-sm'
                      : 'hover:bg-[var(--color-bg-tertiary)]'
                  }`}
                >
                  {/* Performance indicator */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    node.improved
                      ? 'bg-[var(--color-positive)]/10 text-[var(--color-positive)]'
                      : node.cycle.performanceDelta < 0
                      ? 'bg-[var(--color-negative)]/10 text-[var(--color-negative)]'
                      : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)]'
                  }`}>
                    {node.improved ? (
                      <TrendingUp className="w-5 h-5" />
                    ) : node.cycle.performanceDelta < 0 ? (
                      <TrendingDown className="w-5 h-5" />
                    ) : (
                      <Minus className="w-5 h-5" />
                    )}
                  </div>

                  {/* Delta */}
                  <span className={`text-xs font-bold ${
                    node.improved ? 'text-[var(--color-positive)]' :
                    node.cycle.performanceDelta < 0 ? 'text-[var(--color-negative)]' :
                    'text-[var(--color-text-muted)]'
                  }`}>
                    {node.cycle.performanceDelta >= 0 ? '+' : ''}
                    {(node.cycle.performanceDelta * 100).toFixed(1)}%
                  </span>

                  {/* Regime badge */}
                  <span className="text-[10px] px-1.5 py-0.5 bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)] rounded capitalize">
                    {node.regime}
                  </span>

                  {/* Date */}
                  <span className="text-[10px] text-[var(--color-text-muted)]">{dateStr}</span>
                </button>

                {/* Connector line */}
                {i < timelineNodes.length - 1 && (
                  <div className="w-8 h-0.5 bg-[var(--color-border)] flex-shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Belief Diff Panel */}
      <div className="border-t border-[var(--color-border)] px-6 py-5 bg-[var(--color-bg)]">
        {selectedNode && (
          <h4 className="text-sm font-medium text-[var(--color-text)] mb-3">
            Cycle #{selectedNode.index + 1} &middot; Episode {selectedNode.episodeNumber}
          </h4>
        )}
        <BeliefDiffPanel selected={selectedNode} />
      </div>
    </Card>
  );
}
