/**
 * Insight History (IDEA-CIN-2)
 *
 * The user-facing surface of the provenance ledger. Every Cognitive Insight a
 * user generates is persisted with a receipt — which model and substrate
 * produced it, whether the request escaped to a fallback, its latency, and the
 * factor snapshot it was grounded on. This page replays that history and lets
 * the user rate a past explanation (thumbs-down sentinel through 5 stars).
 *
 * Until Dico applies the `frontier_insight_ledger` migration in production, the
 * API returns an empty history and this page renders its empty state.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ScrollText,
  Cpu,
  ShieldAlert,
  ShieldCheck,
  Clock,
  ThumbsDown,
  ThumbsUp,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { SectionErrorBoundary } from '@/components/shared/ErrorBoundary';
import { insightsApi, type InsightLedgerEntry } from '@/api/insights';

const PAGE_SIZE = 25;

// ── Helpers ────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatLatency(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

// ── Substrate Badge ────────────────────────────────────────────

function SubstrateBadge({ substrate }: { substrate: string | null }) {
  const label = substrate ?? 'unknown';
  return (
    <span
      className="mono uppercase px-1.5 py-0.5 text-[10px] tracking-[0.2em] rounded text-[var(--color-accent)]"
      style={{ backgroundColor: 'color-mix(in srgb, var(--color-accent) 10%, transparent)' }}
    >
      {label}
    </span>
  );
}

// ── Rating Control ─────────────────────────────────────────────

function RatingControl({ entry }: { entry: InsightLedgerEntry }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (rating: number) => insightsApi.rate(entry.id, rating),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['insights', 'history'] });
    },
  });

  const current = entry.user_rating;

  return (
    <div className="flex items-center gap-2" role="group" aria-label="Rate this insight">
      <button
        type="button"
        onClick={() => mutation.mutate(-1)}
        disabled={mutation.isPending}
        aria-pressed={current === -1}
        aria-label="Rate insight unhelpful"
        className={`min-h-[36px] min-w-[36px] flex items-center justify-center rounded-md animate-press transition-colors duration-200 ${
          current === -1
            ? 'text-[var(--color-negative)]'
            : 'text-theme-muted hover:text-theme'
        }`}
        style={
          current === -1
            ? { backgroundColor: 'color-mix(in srgb, var(--color-negative) 12%, transparent)' }
            : undefined
        }
      >
        <ThumbsDown className="w-4 h-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => mutation.mutate(5)}
        disabled={mutation.isPending}
        aria-pressed={current === 5}
        aria-label="Rate insight helpful"
        className={`min-h-[36px] min-w-[36px] flex items-center justify-center rounded-md animate-press transition-colors duration-200 ${
          current === 5
            ? 'text-[var(--color-positive)]'
            : 'text-theme-muted hover:text-theme'
        }`}
        style={
          current === 5
            ? { backgroundColor: 'color-mix(in srgb, var(--color-positive) 12%, transparent)' }
            : undefined
        }
      >
        <ThumbsUp className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
}

// ── Receipt Row ────────────────────────────────────────────────

function ReceiptCard({ entry, index }: { entry: InsightLedgerEntry; index: number }) {
  return (
    <section
      className="glass-slab rounded-xl p-4 sm:p-6 animate-enter animate-fade-in-up"
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms`, animationFillMode: 'both' }}
    >
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <SubstrateBadge substrate={entry.substrate} />
            {entry.escaped ? (
              <span
                className="mono uppercase px-1.5 py-0.5 text-[10px] tracking-[0.2em] rounded text-[var(--color-warning)] inline-flex items-center gap-1"
                style={{ backgroundColor: 'color-mix(in srgb, var(--color-warning) 10%, transparent)' }}
              >
                <ShieldAlert className="w-3 h-3" aria-hidden="true" />
                Escaped
              </span>
            ) : (
              <span
                className="mono uppercase px-1.5 py-0.5 text-[10px] tracking-[0.2em] rounded text-[var(--color-positive)] inline-flex items-center gap-1"
                style={{ backgroundColor: 'color-mix(in srgb, var(--color-positive) 10%, transparent)' }}
              >
                <ShieldCheck className="w-3 h-3" aria-hidden="true" />
                Substrate
              </span>
            )}
          </div>
          <p className="mono tabular-nums text-[11px] text-theme-muted mt-2">
            {formatTimestamp(entry.generated_at)}
          </p>
        </div>
        <RatingControl entry={entry} />
      </div>

      {entry.output && (
        <p className="text-sm text-theme-secondary mt-3 leading-relaxed whitespace-pre-wrap">
          {entry.output}
        </p>
      )}

      {entry.escaped && entry.escape_reason && (
        <p className="text-xs text-[var(--color-warning)] mt-3">
          <span className="mono uppercase tracking-[0.2em]">Escape:</span> {entry.escape_reason}
        </p>
      )}

      <div className="mt-4 pt-3 border-t border-[var(--color-border-light)] flex items-center gap-4 flex-wrap text-theme-muted">
        <span className="inline-flex items-center gap-1.5 text-xs">
          <Cpu className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="mono">{entry.model ?? 'template'}</span>
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs">
          <Clock className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="mono tabular-nums">{formatLatency(entry.latency_ms)}</span>
        </span>
        <span className="mono tabular-nums text-[10px] tracking-[0.2em] uppercase">
          #{entry.prompt_hash.slice(0, 10)}
        </span>
      </div>
    </section>
  );
}

// ── Empty State ────────────────────────────────────────────────

function EmptyHistory() {
  return (
    <div className="glass-slab rounded-2xl p-10 text-center animate-fade-in-up">
      <ScrollText className="w-10 h-10 mx-auto mb-4 text-theme-muted" aria-hidden="true" />
      <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Provenance · Empty</p>
      <h3 className="text-lg font-bold text-theme mt-2">No insights logged yet</h3>
      <p className="text-sm text-theme-secondary mt-2 max-w-md mx-auto leading-relaxed">
        Every Cognitive Insight you generate is recorded here with a provenance receipt:
        which model produced it, whether it escaped to a fallback, and how long it took.
        Generate an explanation and it will appear in this history.
      </p>
    </div>
  );
}

// ── History Body ───────────────────────────────────────────────

function HistoryBody() {
  const [page, setPage] = useState(0);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['insights', 'history', page],
    queryFn: () => insightsApi.getHistory({ limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="space-y-3" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="glass-slab rounded-xl h-32 animate-pulse-subtle" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="glass-slab rounded-2xl p-10 text-center">
        <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Provenance · Error</p>
        <h3 className="text-lg font-bold text-theme mt-2">Could not load insight history</h3>
        <p className="text-sm text-theme-secondary mt-2">Please try again in a moment.</p>
      </div>
    );
  }

  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;

  if (entries.length === 0 && page === 0) {
    return <EmptyHistory />;
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="space-y-3 animate-stagger">
        {entries.map((entry, index) => (
          <ReceiptCard key={entry.id} entry={entry} index={index} />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-4 pt-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="glass-slab inline-flex items-center gap-2 px-4 py-2.5 rounded-sm text-theme mono text-[10px] tracking-[0.3em] uppercase animate-press disabled:opacity-40 disabled:cursor-not-allowed transition-[border-color] duration-200"
            aria-label="Previous page"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            Prev
          </button>
          <span className="mono tabular-nums text-[10px] tracking-[0.3em] uppercase text-theme-muted">
            Page {page + 1} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))}
            disabled={page + 1 >= totalPages}
            className="glass-slab inline-flex items-center gap-2 px-4 py-2.5 rounded-sm text-theme mono text-[10px] tracking-[0.3em] uppercase animate-press disabled:opacity-40 disabled:cursor-not-allowed transition-[border-color] duration-200"
            aria-label="Next page"
          >
            Next
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────

export function InsightHistory() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in-up"
        style={{ animationDelay: '0ms', animationFillMode: 'both' }}
      >
        <div>
          <p className="mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-theme-muted mb-2">
            Intelligence · Provenance
          </p>
          <h1 className="text-2xl lg:text-3xl font-bold text-theme">
            <span className="text-gradient-brand">Insight History</span>
          </h1>
          <p className="text-sm text-theme-secondary mt-1">
            A provenance receipt for every Cognitive Insight, replayable and disputable
          </p>
        </div>
      </div>

      <SectionErrorBoundary sectionName="Insight History">
        <HistoryBody />
      </SectionErrorBoundary>
    </div>
  );
}

export default InsightHistory;
