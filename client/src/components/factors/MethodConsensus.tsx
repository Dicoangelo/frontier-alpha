/**
 * Method Consensus (IDEA-FF-2 v1)
 *
 * Shows whether three independent factor-ranking methods agree on what
 * matters for a symbol — exposure magnitude, 5-day temporal delta, and
 * statistical significance. Agreement is a stronger trust signal than any
 * single paragraph; disagreement is surfaced, not hidden.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Scale, ShieldCheck, ShieldAlert, ShieldQuestion } from 'lucide-react';
import { Card } from '@/components/shared/Card';
import { api } from '@/api/client';

interface RankedFactor {
  factor: string;
  score: number;
  rank: number;
}

interface MethodConsensusData {
  symbol: string;
  topK: number;
  methods: Array<{ method: string; description: string; ranking: RankedFactor[] }>;
  agreement: {
    overallScore: number;
    verdict: 'strong_agreement' | 'partial_agreement' | 'disagreement';
  };
  consensusFactors: Array<{ factor: string; avgRank: number; methodsInTopK: number }>;
}

const METHOD_LABELS: Record<string, string> = {
  exposure_magnitude: 'Exposure',
  temporal_delta: '5d Move',
  statistical_significance: 'Significance',
};

const VERDICT_META = {
  strong_agreement: {
    label: 'Methods Agree',
    tone: 'var(--color-positive)',
    Icon: ShieldCheck,
    blurb: 'All ranking methods point at the same factors — high confidence read.',
  },
  partial_agreement: {
    label: 'Partial Agreement',
    tone: 'var(--color-warning)',
    Icon: ShieldQuestion,
    blurb: 'Methods overlap but not fully — treat single-factor claims with care.',
  },
  disagreement: {
    label: 'Methods Disagree',
    tone: 'var(--color-negative)',
    Icon: ShieldAlert,
    blurb: 'Size, movement, and significance each tell a different story right now.',
  },
} as const;

async function fetchConsensus(symbol: string): Promise<MethodConsensusData> {
  const response = await api.get(`/explain/methods/${symbol}`);
  return (response as unknown as { data: MethodConsensusData }).data;
}

export function MethodConsensus({ symbols }: { symbols: string[] }) {
  const [selected, setSelected] = useState(0);
  const symbol = symbols[Math.min(selected, Math.max(0, symbols.length - 1))];

  const { data, isLoading, isError } = useQuery({
    queryKey: ['explain', 'methods', symbol],
    queryFn: () => fetchConsensus(symbol),
    enabled: Boolean(symbol),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  if (symbols.length === 0) return null;

  const meta = data ? VERDICT_META[data.agreement.verdict] : null;

  return (
    <Card
      title="Method Consensus"
      action={
        symbols.length > 1 ? (
          <div className="flex gap-1 flex-wrap justify-end">
            {symbols.slice(0, 6).map((s, i) => (
              <button
                key={s}
                onClick={() => setSelected(i)}
                aria-pressed={i === selected}
                className={`px-2 py-0.5 mono text-[10px] tracking-wider uppercase rounded-md animate-press transition-[background-color,color] duration-200 ${
                  i === selected ? 'bg-theme shadow text-theme' : 'text-theme-secondary hover:text-theme'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        ) : undefined
      }
    >
      {isLoading ? (
        <div className="h-28 rounded-lg animate-pulse-subtle bg-theme-tertiary" aria-busy="true" />
      ) : isError || !data || !meta ? (
        <div className="py-6 text-center">
          <Scale className="w-7 h-7 mx-auto mb-2 text-theme-muted" aria-hidden="true" />
          <p className="text-sm text-theme-secondary">
            Method consensus unavailable for {symbol} right now.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span
              className="inline-flex items-center gap-1.5 mono uppercase px-2 py-1 text-[10px] tracking-[0.2em] rounded"
              style={{
                color: meta.tone,
                backgroundColor: `color-mix(in srgb, ${meta.tone} 10%, transparent)`,
              }}
            >
              <meta.Icon className="w-3.5 h-3.5" aria-hidden="true" />
              {meta.label}
            </span>
            <span className="mono tabular-nums text-[10px] text-theme-muted uppercase tracking-wider">
              overlap {(data.agreement.overallScore * 100).toFixed(0)}%
            </span>
          </div>
          <p className="text-xs text-theme-secondary leading-relaxed">{meta.blurb}</p>

          <div className="space-y-2">
            {data.consensusFactors.slice(0, 4).map((cf) => (
              <div key={cf.factor} className="flex items-center justify-between gap-3">
                <span className="text-sm text-theme">{cf.factor.replace(/_/g, ' ')}</span>
                <span className="mono tabular-nums text-[10px] text-theme-muted uppercase tracking-wider">
                  {cf.methodsInTopK}/{data.methods.length} methods
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-4 pt-2 border-t border-[var(--color-border-light)] flex-wrap">
            {data.methods.map((m) => (
              <span key={m.method} title={m.description} className="mono text-[10px] uppercase tracking-wider text-theme-muted">
                {METHOD_LABELS[m.method] ?? m.method}: {m.ranking[0]?.factor.replace(/_/g, ' ') ?? '—'}
              </span>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
