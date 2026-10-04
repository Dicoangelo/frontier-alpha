/**
 * Signal Timing (IDEAS Topic D — temporal saliency UX)
 *
 * "Your momentum signal was driven 73% by the last 14 days." Renders the
 * server's additive window attribution (recent / mid / far) for one symbol
 * as stacked contribution bars with the dominant-window sentence. The
 * decomposition is exact — momentum shares sum log returns, volatility
 * shares sum squared returns — so the bar is attribution, not decoration.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Timer } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { Card } from '@/components/shared/Card';
import { factorsApi, type FactorSaliency } from '@/api/factors';

const WINDOW_TONES: Record<string, string> = {
  recent: 'var(--color-accent)',
  mid: 'var(--color-info)',
  far: 'var(--color-text-muted)',
};

function AttributionBar({ saliency }: { saliency: FactorSaliency }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="mono text-[10px] tracking-[0.2em] uppercase text-theme-muted">
          {saliency.factor}
        </p>
        <p className="mono tabular-nums text-[10px] text-theme-muted">
          {saliency.dominantWindow.sharePct}% · {saliency.dominantWindow.label}
        </p>
      </div>
      <div
        className="flex h-2.5 mt-1.5 rounded-full overflow-hidden bg-theme-tertiary"
        role="img"
        aria-label={saliency.copy}
      >
        {saliency.windows.map(
          (w) =>
            w.sharePct > 0 && (
              <div
                key={w.key}
                title={`${w.label}: ${w.sharePct}%`}
                style={{ width: `${w.sharePct}%`, backgroundColor: WINDOW_TONES[w.key] }}
              />
            ),
        )}
      </div>
      <p className="text-xs text-theme-secondary mt-1.5 leading-relaxed">{saliency.copy}</p>
    </div>
  );
}

export interface SignalTimingProps {
  symbols: string[];
}

export function SignalTiming({ symbols }: SignalTimingProps) {
  const [selected, setSelected] = useState(0);
  const symbol = symbols[Math.min(selected, Math.max(0, symbols.length - 1))];

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['factors', 'saliency', symbol],
    queryFn: () => factorsApi.getSaliency(symbol),
    enabled: Boolean(symbol),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  if (symbols.length === 0) return null;

  return (
    <Card
      title="Signal Timing"
      action={
        symbols.length > 1 ? (
          <select aria-label="Signal timing holding" value={symbol} onChange={event => setSelected(symbols.indexOf(event.target.value))} className="max-w-[160px] rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-2 py-1.5 text-xs text-theme">
            {symbols.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        ) : undefined
      }
    >
      {isLoading ? (
        <div className="space-y-4" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className="h-12 rounded-lg animate-pulse-subtle bg-theme-tertiary" />
          ))}
        </div>
      ) : isError || !data || data.factors.length === 0 ? (
        <div className="py-6 text-center">
          <Timer className="w-7 h-7 mx-auto mb-2 text-theme-muted" aria-hidden="true" />
          <p className="text-sm text-theme-secondary">
            {isError ? `Signal timing could not be loaded for ${symbol}.` : `Not enough price history for ${symbol} to attribute signal timing yet.`}
          </p>
          {isError && <Button variant="outline" size="sm" onClick={() => refetch()} className="mx-auto mt-3">Retry signal timing</Button>}
        </div>
      ) : (
        <div className="space-y-5">
          {data.factors.map((f) => (
            <AttributionBar key={f.factor} saliency={f} />
          ))}
          <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-[var(--color-border-light)]">
            {(['recent', 'mid', 'far'] as const).map((key) => {
              const w = data.factors[0]?.windows.find((x) => x.key === key);
              return (
                <span key={key} className="inline-flex items-center gap-1.5 mono text-[10px] uppercase tracking-wider text-theme-muted">
                  <span
                    aria-hidden="true"
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: WINDOW_TONES[key] }}
                  />
                  {w?.label ?? key}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
