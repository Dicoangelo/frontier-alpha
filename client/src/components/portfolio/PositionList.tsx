import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { Card } from '@/components/shared/Card';
import { Badge } from '@/components/shared/Badge';
import { quotesApi, type HistoricalPrices } from '@/api/quotes';
import type { Position, Quote } from '@/types';

// Real-data sparkline rendered from 7-day daily closes.
// Loading: thin shimmering placeholder bar.
// Empty/failed: render nothing (the parent cell falls back to em-dash).
const Sparkline = React.memo(function Sparkline({
  closes,
  isLoading,
}: {
  closes: number[] | undefined;
  isLoading: boolean;
}) {
  const W = 40;
  const H = 16;

  if (isLoading) {
    return (
      <span
        aria-hidden="true"
        className="inline-block shrink-0 rounded-sm bg-[var(--color-border-light)] animate-pulse-subtle"
        style={{ width: W, height: 4, marginTop: 6, marginBottom: 6 }}
      />
    );
  }

  if (!closes || closes.length < 2) {
    return null;
  }

  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;

  const coords = closes.map((v, i) => {
    const x = (i / (closes.length - 1)) * W;
    const y = H - ((v - min) / range) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const isUp = closes[closes.length - 1] >= closes[0];
  const colorVar = isUp ? '--color-positive' : '--color-negative';

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden="true"
      className="shrink-0"
    >
      <polyline
        points={coords.join(' ')}
        fill="none"
        stroke={`var(${colorVar})`}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
});

interface SparklineEntry {
  closes: number[] | undefined;
  isLoading: boolean;
  changePct: number | null; // 7-day % change vs prior close, or null when unavailable
}

/**
 * Fetch 7-day daily closes for every position in parallel and expose them
 * keyed by symbol. Each query fails closed (returns null) so a single bad
 * ticker can't blank the table.
 */
function useSparklineData(positions: Position[]): Map<string, SparklineEntry> {
  // Stable list of symbols (uppercased) for query keys
  const symbols = useMemo(
    () => Array.from(new Set(positions.map((p) => p.symbol.toUpperCase()))).sort(),
    [positions]
  );

  const results = useQueries({
    queries: symbols.map((symbol) => ({
      queryKey: ['quotes', symbol, 'history', 7] as const,
      queryFn: () => quotesApi.getHistoricalPrices(symbol, 7),
      staleTime: 5 * 60 * 1000, // 5 min — daily-bar data is slow-moving
      retry: 1,
    })),
  });

  return useMemo(() => {
    const map = new Map<string, SparklineEntry>();
    symbols.forEach((symbol, i) => {
      const r = results[i];
      const data = r.data as HistoricalPrices | null | undefined;
      const closes = data?.closes;
      let changePct: number | null = null;
      if (closes && closes.length >= 2) {
        const first = closes[0];
        const last = closes[closes.length - 1];
        if (Number.isFinite(first) && Number.isFinite(last) && first !== 0) {
          changePct = ((last - first) / first) * 100;
        }
      }
      map.set(symbol, {
        closes,
        isLoading: r.isLoading,
        changePct,
      });
    });
    return map;
  }, [symbols, results]);
}

type SortField = 'symbol' | 'shares' | 'currentPrice' | 'value' | 'unrealizedPnL' | 'weight';
type SortDir = 'asc' | 'desc';

interface PositionListProps {
  positions: Position[];
  quotes?: Map<string, Quote>;
}

function pnlColor(pnl: number) {
  return pnl >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]';
}

function pnlSign(pnl: number) {
  return pnl >= 0 ? '+' : '';
}

// Track previous prices to detect changes for flash animation
function useQuoteFlash(quotes: Map<string, Quote> | undefined) {
  const prevPrices = useRef<Map<string, number>>(new Map());
  const [flashMap, setFlashMap] = useState<Map<string, 'up' | 'down'>>(new Map());
  const timerRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const clearFlash = useCallback((symbol: string) => {
    setFlashMap(prev => {
      const next = new Map(prev);
      next.delete(symbol);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!quotes || quotes.size === 0) return;

    const newFlashes = new Map<string, 'up' | 'down'>();

    for (const [symbol, quote] of quotes) {
      const prevPrice = prevPrices.current.get(symbol);
      if (prevPrice !== undefined && quote.last !== prevPrice) {
        const direction = quote.last > prevPrice ? 'up' : 'down';
        newFlashes.set(symbol, direction);

        // Clear existing timer for this symbol
        const existing = timerRefs.current.get(symbol);
        if (existing) clearTimeout(existing);

        // Auto-clear flash after animation completes
        timerRefs.current.set(symbol, setTimeout(() => clearFlash(symbol), 650));
      }
      prevPrices.current.set(symbol, quote.last);
    }

    if (newFlashes.size > 0) {
      setFlashMap(prev => {
        const merged = new Map(prev);
        for (const [s, d] of newFlashes) merged.set(s, d);
        return merged;
      });
    }
  }, [quotes, clearFlash]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      for (const t of timerRefs.current.values()) clearTimeout(t);
    };
  }, []);

  return flashMap;
}

export function PositionList({ positions, quotes }: PositionListProps) {
  const [sortField, setSortField] = useState<SortField>('value');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const flashMap = useQuoteFlash(quotes);
  const sparklineMap = useSparklineData(positions);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const sorted = useMemo(() => [...positions].sort((a, b) => {
    let av: number | string;
    let bv: number | string;
    switch (sortField) {
      case 'symbol':
        av = a.symbol;
        bv = b.symbol;
        break;
      case 'shares':
        av = a.shares;
        bv = b.shares;
        break;
      case 'currentPrice':
        av = a.currentPrice;
        bv = b.currentPrice;
        break;
      case 'value':
        av = a.shares * a.currentPrice;
        bv = b.shares * b.currentPrice;
        break;
      case 'unrealizedPnL':
        av = a.unrealizedPnL;
        bv = b.unrealizedPnL;
        break;
      case 'weight':
        av = a.weight;
        bv = b.weight;
        break;
      default:
        av = 0;
        bv = 0;
    }
    const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number);
    return sortDir === 'asc' ? cmp : -cmp;
  }), [positions, sortField, sortDir]);

  const SortArrow = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <span className="ml-1 opacity-20">↕</span>;
    return <span className="ml-1 text-[var(--color-accent)]">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  const SortTh = ({
    field,
    label,
    align = 'right',
  }: {
    field: SortField;
    label: string;
    align?: 'left' | 'right';
  }) => (
    <th
      scope="col"
      onClick={() => handleSort(field)}
      className={`py-3 px-4 font-medium text-xs uppercase tracking-wider text-[var(--color-text-muted)] cursor-pointer select-none hover:text-[var(--color-text)] transition-colors ${align === 'right' ? 'text-right' : 'text-left'}`}
    >
      {label}
      <SortArrow field={field} />
    </th>
  );

  return (
    <Card title="Holdings">
      {/* Mobile sort dropdown — visible only below md */}
      <div className="md:hidden mb-3 flex items-center gap-2">
        <label htmlFor="mobile-sort" className="text-xs text-[var(--color-text-muted)]">
          Sort by:
        </label>
        <select
          id="mobile-sort"
          value={`${sortField}-${sortDir}`}
          onChange={(e) => {
            const [f, d] = e.target.value.split('-') as [SortField, SortDir];
            setSortField(f);
            setSortDir(d);
          }}
          className="text-xs border border-[var(--color-border)] rounded px-2 py-1 bg-[var(--color-bg)] text-[var(--color-text)]"
        >
          <option value="symbol-asc">Symbol A-Z</option>
          <option value="symbol-desc">Symbol Z-A</option>
          <option value="value-desc">Value (High-Low)</option>
          <option value="value-asc">Value (Low-High)</option>
          <option value="unrealizedPnL-desc">P&L (High-Low)</option>
          <option value="unrealizedPnL-asc">P&L (Low-High)</option>
          <option value="weight-desc">Weight (High-Low)</option>
        </select>
      </div>

      {/* Mobile card layout — hidden at md and above */}
      <div className="md:hidden space-y-3">
        {sorted.map((position) => {
          const sparkline = sparklineMap.get(position.symbol.toUpperCase());
          const changePct = sparkline?.changePct ?? null;
          const isLoadingSpark = sparkline?.isLoading ?? false;
          const positionValue = position.shares * position.currentPrice;

          const flash = flashMap.get(position.symbol);
          const flashClass = flash === 'up' ? 'quote-flash-up' : flash === 'down' ? 'quote-flash-down' : '';

          return (
            <div
              key={`${position.symbol}-${flash ?? 'none'}`}
              className={`p-3 bg-[var(--color-bg-tertiary)] rounded-lg border border-[var(--color-border-light)] ${flashClass}`}
            >
              {/* Top row: symbol + P&L prominent */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div
                    className="w-9 h-9 bg-[var(--color-accent)] rounded-lg flex items-center justify-center text-white font-bold text-xs flex-shrink-0"
                    aria-hidden="true"
                  >
                    {position.symbol.slice(0, 2)}
                  </div>
                  <span className="font-semibold text-[var(--color-text)]">{position.symbol}</span>
                </div>
                <span className={`text-sm font-bold ${pnlColor(position.unrealizedPnL)}`}>
                  {pnlSign(position.unrealizedPnL)}$
                  {Math.abs(position.unrealizedPnL).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>

              {/* Detail grid */}
              <div className="grid grid-cols-3 gap-2 text-xs text-[var(--color-text-muted)]">
                <div>
                  <p className="mb-0.5">Price</p>
                  <p className="text-[var(--color-text)] font-medium">${position.currentPrice.toFixed(2)}</p>
                </div>
                <div>
                  <p className="mb-0.5">Value</p>
                  <p className="text-[var(--color-text)] font-medium">
                    ${positionValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </p>
                </div>
                <div>
                  <p className="mb-0.5">Weight</p>
                  <p className="text-[var(--color-text)] font-medium">{(position.weight * 100).toFixed(1)}%</p>
                </div>
                <div>
                  <p className="mb-0.5">Shares</p>
                  <p className="text-[var(--color-text)] font-medium">{position.shares}</p>
                </div>
                <div className="col-span-2">
                  <p className="mb-0.5">7D Change</p>
                  <div className="mt-0.5 flex items-center gap-2">
                    {isLoadingSpark ? (
                      <span
                        aria-hidden="true"
                        className="inline-block h-3 w-16 rounded-sm bg-[var(--color-border-light)] animate-pulse-subtle"
                      />
                    ) : changePct === null ? (
                      <span className="text-[var(--color-text-muted)]">—</span>
                    ) : (
                      <Badge variant={changePct >= 0 ? 'success' : 'danger'}>
                        {changePct >= 0 ? '+' : ''}
                        {changePct.toFixed(2)}%
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop table layout — hidden below md */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full" role="table">
          <thead>
            <tr className="border-b border-[var(--color-border-light)]">
              <SortTh field="symbol" label="Symbol" align="left" />
              <SortTh field="shares" label="Shares" />
              <SortTh field="currentPrice" label="Price" />
              <SortTh field="value" label="Value" />
              <th
                scope="col"
                className="py-3 px-4 text-right font-medium text-xs uppercase tracking-wider text-[var(--color-text-muted)]"
              >
                7D
              </th>
              <SortTh field="unrealizedPnL" label="P&L" />
              <SortTh field="weight" label="Weight" />
              <th
                scope="col"
                className="py-3 px-4 text-right font-medium text-xs uppercase tracking-wider text-[var(--color-text-muted)]"
              >
                Change
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((position) => {
              const sparkline = sparklineMap.get(position.symbol.toUpperCase());
              const changePct = sparkline?.changePct ?? null;
              const isLoadingSpark = sparkline?.isLoading ?? false;
              const positionValue = position.shares * position.currentPrice;

              const flash = flashMap.get(position.symbol);
              const flashClass = flash === 'up' ? 'quote-flash-up' : flash === 'down' ? 'quote-flash-down' : '';

              return (
                <tr
                  key={`${position.symbol}-${flash ?? 'none'}`}
                  className={`border-b border-[var(--color-border-light)] last:border-0 hover:bg-[var(--color-bg-tertiary)] transition-colors ${flashClass}`}
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 bg-[var(--color-accent)] rounded-lg flex items-center justify-center text-white font-bold text-xs flex-shrink-0"
                        aria-hidden="true"
                      >
                        {position.symbol.slice(0, 2)}
                      </div>
                      <div>
                        <p className="font-semibold text-[var(--color-text)]">{position.symbol}</p>
                        <p className="text-xs text-[var(--color-text-muted)]">{position.shares} shares</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right text-[var(--color-text)]">{position.shares}</td>
                  <td className="py-3 px-4 text-right text-[var(--color-text)]">
                    ${position.currentPrice.toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-right text-[var(--color-text)]">
                    ${positionValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex justify-end">
                      <Sparkline closes={sparkline?.closes} isLoading={isLoadingSpark} />
                    </div>
                  </td>
                  <td className={`py-3 px-4 text-right font-semibold ${pnlColor(position.unrealizedPnL)}`}>
                    {pnlSign(position.unrealizedPnL)}$
                    {Math.abs(position.unrealizedPnL).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className="py-3 px-4 text-right text-[var(--color-text)]">
                    {(position.weight * 100).toFixed(1)}%
                  </td>
                  <td className="py-3 px-4 text-right">
                    {isLoadingSpark ? (
                      <span
                        aria-hidden="true"
                        className="inline-block h-3 w-14 rounded-sm bg-[var(--color-border-light)] animate-pulse-subtle"
                      />
                    ) : changePct === null ? (
                      <span className="text-[var(--color-text-muted)]">—</span>
                    ) : (
                      <Badge variant={changePct >= 0 ? 'success' : 'danger'}>
                        {changePct >= 0 ? '+' : ''}
                        {changePct.toFixed(2)}%
                      </Badge>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
