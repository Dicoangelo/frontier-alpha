import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { ScrollableTable } from '@/components/shared/ScrollableTable';
import { ArrowDown, ArrowUp, ArrowUpDown, Search, X } from 'lucide-react';
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
  return pnl > 0 ? 'text-[var(--color-positive)]' : pnl < 0 ? 'text-[var(--color-negative)]' : 'text-[var(--color-text-muted)]';
}

function pnlSign(pnl: number) {
  return pnl > 0 ? '+' : pnl < 0 ? '−' : '';
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
      const frame = requestAnimationFrame(() => setFlashMap(prev => {
        const merged = new Map(prev);
        for (const [s, d] of newFlashes) merged.set(s, d);
        return merged;
      }));
      return () => cancelAnimationFrame(frame);
    }
  }, [quotes, clearFlash]);

  // Cleanup timers on unmount
  useEffect(() => {
    const timers = timerRefs.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  return flashMap;
}

function SortableHeader({ field, label, sortField, sortDir, onSort, align = 'right' }: {
  field: SortField;
  label: string;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
  align?: 'left' | 'right';
}) {
  const selected = field === sortField;
  const SortIcon = selected ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th scope="col" aria-sort={selected ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'} className={align === 'left' ? 'text-left' : 'text-right'}>
      <button type="button" className={`holdings-sort ${align === 'left' ? '' : 'ml-auto'}`} onClick={() => onSort(field)} aria-label={`Sort by ${label}`}>
        {label}<SortIcon size={12} aria-hidden="true" className={selected ? 'text-[var(--color-accent)]' : 'opacity-40'} />
      </button>
    </th>
  );
}

export function PositionList({ positions, quotes }: PositionListProps) {
  const [sortField, setSortField] = useState<SortField>('value');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [search, setSearch] = useState('');
  const flashMap = useQuoteFlash(quotes);
  const sparklineMap = useSparklineData(positions);

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else {
      setSortField(field);
      setSortDir(field === 'symbol' ? 'asc' : 'desc');
    }
  };

  const sorted = useMemo(() => {
    const query = search.trim().toUpperCase();
    const valueOf = (position: Position): string | number => sortField === 'value'
      ? position.shares * position.currentPrice
      : position[sortField];
    return positions.filter(p => p.symbol.toUpperCase().includes(query)).sort((a, b) => {
      const av = valueOf(a);
      const bv = valueOf(b);
      const comparison = typeof av === 'string' ? av.localeCompare(bv as string) : av - (bv as number);
      return sortDir === 'asc' ? comparison : -comparison;
    });
  }, [positions, search, sortField, sortDir]);

  const sortProps = { sortField, sortDir, onSort: handleSort };
  const currency = (value: number, digits = 2) => value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

  return (
    <section className="holdings-panel desk-panel" aria-labelledby="holdings-heading">
      <header className="holdings-toolbar">
        <div>
          <h2 id="holdings-heading">Holdings <span className="desk-count">{positions.length}</span></h2>
          <p>Position-level exposure and unrealized returns</p>
        </div>
        <div className="holdings-tools">
          <div className="holdings-search">
            <Search size={14} aria-hidden="true" />
            <input type="search" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') setSearch(''); }} aria-label="Search holdings" placeholder="Search symbol" />
            {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear holdings search"><X size={14} /></button>}
          </div>
          <select className="holdings-sort-select" aria-label="Sort holdings" value={`${sortField}-${sortDir}`} onChange={e => {
            const [field, direction] = e.target.value.split('-') as [SortField, SortDir];
            setSortField(field);
            setSortDir(direction);
          }}>
            <option value="symbol-asc">Symbol A–Z</option>
            <option value="symbol-desc">Symbol Z–A</option>
            <option value="shares-desc">Shares: high to low</option>
            <option value="shares-asc">Shares: low to high</option>
            <option value="currentPrice-desc">Price: high to low</option>
            <option value="currentPrice-asc">Price: low to high</option>
            <option value="value-desc">Value: high to low</option>
            <option value="value-asc">Value: low to high</option>
            <option value="unrealizedPnL-desc">P&amp;L: high to low</option>
            <option value="unrealizedPnL-asc">P&amp;L: low to high</option>
            <option value="weight-desc">Weight: high to low</option>
            <option value="weight-asc">Weight: low to high</option>
          </select>
        </div>
      </header>
      <ScrollableTable className="holdings-table-wrap" label="Scroll holdings table horizontally">
        <table className="holdings-table">
          <thead>
            <tr>
              <SortableHeader field="symbol" label="Symbol" align="left" {...sortProps} />
              <SortableHeader field="shares" label="Shares" {...sortProps} />
              <SortableHeader field="currentPrice" label="Price" {...sortProps} />
              <SortableHeader field="value" label="Market value" {...sortProps} />
              <th scope="col" className="text-right">7D trend</th>
              <SortableHeader field="unrealizedPnL" label="Unrealized P&L" {...sortProps} />
              <SortableHeader field="weight" label="Portfolio weight" {...sortProps} />
              <th scope="col" className="text-right">7D change</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(position => {
              const sparkline = sparklineMap.get(position.symbol.toUpperCase());
              const changePct = sparkline?.changePct ?? null;
              const flash = flashMap.get(position.symbol);
              return (
                <tr key={position.symbol} className={flash === 'up' ? 'quote-flash-up' : flash === 'down' ? 'quote-flash-down' : ''}>
                  <th scope="row"><span className="holdings-symbol">{position.symbol}</span></th>
                  <td>{position.shares.toLocaleString('en-US', { maximumFractionDigits: 6 })}</td>
                  <td>${currency(position.currentPrice)}</td>
                  <td className="font-medium">${currency(position.shares * position.currentPrice)}</td>
                  <td><span className="inline-flex items-center justify-end"><Sparkline closes={sparkline?.closes} isLoading={sparkline?.isLoading ?? false} /></span></td>
                  <td className={`font-medium ${pnlColor(position.unrealizedPnL)}`}>{pnlSign(position.unrealizedPnL)}${currency(Math.abs(position.unrealizedPnL))}</td>
                  <td>{(position.weight * 100).toFixed(1)}%</td>
                  <td className={changePct === null ? 'text-[var(--color-text-muted)]' : pnlColor(changePct)}>
                    {sparkline?.isLoading ? <span aria-label="Loading seven day change">—</span> : changePct === null ? '—' : `${pnlSign(changePct)}${Math.abs(changePct).toFixed(2)}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollableTable>
      {sorted.length === 0 && <div className="holdings-empty" role="status">{search ? `No holdings match “${search}”.` : 'No positions to display.'}{search && <button type="button" onClick={() => setSearch('')}>Clear search</button>}</div>}
      <footer className="holdings-footer" id="holdings-table-note">
        <span aria-live="polite">{sorted.length} of {positions.length} positions</span>
        <span>Weights include cash in portfolio value. 7D data uses cached daily closes.</span>
      </footer>
    </section>
  );
}
