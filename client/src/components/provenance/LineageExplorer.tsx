/**
 * Decision Lineage Explorer (IDEA-FF-3)
 *
 * The user-facing surface of the provenance DAG. Lists the user's recent
 * pipeline nodes; expanding one walks its ancestry server-side and renders
 * the full derivation chain — market_data → factor_compute → optimizer_run →
 * recommendation → insight → user_action. "How did the AI decide?" becomes
 * a visible graph instead of a black box.
 *
 * Until the `frontier_provenance_nodes` migration is applied in production,
 * the API returns an empty list and this section renders its empty state.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  GitBranch,
  Database,
  SlidersHorizontal,
  Lightbulb,
  Target,
  MousePointerClick,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { provenanceApi, type ProvenanceNode } from '@/api/provenance';

const NODE_TYPE_META: Record<
  ProvenanceNode['node_type'],
  { label: string; Icon: typeof Database; tone: string }
> = {
  market_data: { label: 'Market Data', Icon: Database, tone: 'var(--color-info)' },
  factor_compute: { label: 'Factor Compute', Icon: Layers, tone: 'var(--color-accent)' },
  optimizer_run: { label: 'Optimizer', Icon: SlidersHorizontal, tone: 'var(--color-accent)' },
  recommendation: { label: 'Recommendation', Icon: Target, tone: 'var(--color-positive)' },
  insight: { label: 'Insight', Icon: Lightbulb, tone: 'var(--color-warning)' },
  user_action: { label: 'Your Action', Icon: MousePointerClick, tone: 'var(--color-positive)' },
};

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function NodeTypeChip({ nodeType }: { nodeType: ProvenanceNode['node_type'] }) {
  const meta = NODE_TYPE_META[nodeType];
  return (
    <span
      className="mono uppercase px-1.5 py-0.5 text-[10px] tracking-[0.2em] rounded inline-flex items-center gap-1"
      style={{
        color: meta.tone,
        backgroundColor: `color-mix(in srgb, ${meta.tone} 10%, transparent)`,
      }}
    >
      <meta.Icon className="w-3 h-3" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

/** Ancestry chain for one expanded node, oldest (root cause) last. */
function LineageChain({ nodeId }: { nodeId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['provenance', 'lineage', nodeId],
    queryFn: () => provenanceApi.getLineage(nodeId),
    retry: false,
  });

  if (isLoading) {
    return <div className="h-16 rounded-lg animate-pulse-subtle bg-theme-tertiary mt-3" aria-busy="true" />;
  }
  if (isError || !data) {
    return (
      <p className="text-xs text-[var(--color-negative)] mt-3">Could not load lineage for this node.</p>
    );
  }

  return (
    <ol className="mt-3 space-y-0" data-testid="lineage-chain">
      {data.nodes.map((node, index) => (
        <li key={node.id} className="relative pl-6 pb-3 last:pb-0">
          {/* Rail connecting the chain */}
          {index < data.nodes.length - 1 && (
            <span
              aria-hidden="true"
              className="absolute left-[7px] top-4 bottom-0 w-px bg-[var(--color-border-light)]"
            />
          )}
          <span
            aria-hidden="true"
            className="absolute left-0 top-1.5 w-[15px] h-[15px] rounded-full border-2 border-[var(--color-border-light)] bg-theme-tertiary"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <NodeTypeChip nodeType={node.node_type} />
            <span className="mono tabular-nums text-[10px] text-theme-muted">
              {formatTimestamp(node.created_at)}
            </span>
          </div>
          <p className="text-sm text-theme-secondary mt-1">{node.label}</p>
        </li>
      ))}
      {data.truncated && (
        <li className="pl-6 text-[10px] mono uppercase tracking-[0.2em] text-theme-muted">
          Lineage truncated
        </li>
      )}
    </ol>
  );
}

function NodeRow({ node, index }: { node: ProvenanceNode; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const hasAncestry = node.parents.length > 0;

  return (
    <section
      className="glass-slab rounded-xl p-4 animate-enter animate-fade-in-up"
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms`, animationFillMode: 'both' }}
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="w-full flex items-center justify-between gap-3 text-left animate-press"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <NodeTypeChip nodeType={node.node_type} />
            <span className="mono tabular-nums text-[10px] text-theme-muted">
              {formatTimestamp(node.created_at)}
            </span>
          </div>
          <p className="text-sm text-theme mt-1.5 truncate">{node.label}</p>
        </div>
        <span className="text-theme-muted flex-shrink-0">
          {expanded ? (
            <ChevronUp className="w-4 h-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-4 h-4" aria-hidden="true" />
          )}
        </span>
      </button>

      {expanded &&
        (hasAncestry || node.node_type !== 'market_data' ? (
          <LineageChain nodeId={node.id} />
        ) : (
          <p className="text-xs text-theme-muted mt-3">
            Root node — no upstream derivation.
          </p>
        ))}
    </section>
  );
}

export function LineageExplorer() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['provenance', 'recent'],
    queryFn: () => provenanceApi.getRecent({ limit: 10 }),
    retry: false,
  });

  const nodes = data?.nodes ?? [];

  return (
    <div className="space-y-4">
      <div>
        <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted mb-1 inline-flex items-center gap-2">
          <GitBranch className="w-3.5 h-3.5" aria-hidden="true" />
          Decision Lineage
        </p>
        <p className="text-sm text-theme-secondary">
          Every recommendation traces back through the pipeline that produced it
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className="glass-slab rounded-xl h-20 animate-pulse-subtle" />
          ))}
        </div>
      ) : isError ? (
        <div className="glass-slab rounded-xl p-6 text-center">
          <p className="text-sm text-theme-secondary">Could not load decision lineage.</p>
        </div>
      ) : nodes.length === 0 ? (
        <div className="glass-slab rounded-xl p-6 text-center">
          <GitBranch className="w-8 h-8 mx-auto mb-3 text-theme-muted" aria-hidden="true" />
          <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Lineage · Empty</p>
          <p className="text-sm text-theme-secondary mt-2 max-w-md mx-auto">
            Run the optimizer, generate an insight, or place an order and its full
            derivation chain will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3 animate-stagger">
          {nodes.map((node, index) => (
            <NodeRow key={node.id} node={node} index={index} />
          ))}
        </div>
      )}
    </div>
  );
}
