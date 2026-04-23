import { Search, X } from 'lucide-react';

export type SortKey = 'weight' | 'pnl' | 'pnlpct' | 'alpha';
export type FilterKey = 'all' | 'winners' | 'losers';

interface FilterBarProps {
  sort: SortKey;
  onSortChange: (s: SortKey) => void;
  filter: FilterKey;
  onFilterChange: (f: FilterKey) => void;
  query: string;
  onQueryChange: (q: string) => void;
}

const SORTS: Array<{ id: SortKey; label: string }> = [
  { id: 'weight', label: 'Weight' },
  { id: 'pnl', label: 'PnL $' },
  { id: 'pnlpct', label: 'PnL %' },
  { id: 'alpha', label: 'A-Z' },
];

const FILTERS: Array<{ id: FilterKey; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'winners', label: 'Winners' },
  { id: 'losers', label: 'Losers' },
];

export function FilterBar({ sort, onSortChange, filter, onFilterChange, query, onQueryChange }: FilterBarProps) {
  const hasActive = filter !== 'all' || !!query;

  const clearAll = () => {
    onFilterChange('all');
    onQueryChange('');
  };

  return (
    <div
      className="sticky top-9 z-30 -mx-4 px-4 py-2 bg-[var(--color-bg-secondary)] backdrop-blur-md border-b border-[var(--color-border-light)]"
      role="toolbar"
      aria-label="Portfolio filters"
    >
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        {/* Search */}
        <label className="relative shrink-0 w-36 sm:w-44">
          <span className="sr-only">Filter by symbol</span>
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-muted)]" />
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value.toUpperCase())}
            placeholder="AAPL…"
            className="w-full pl-7 pr-2 py-1.5 text-[11px] mono tracking-[0.1em] uppercase bg-[var(--color-bg-tertiary)] border border-[var(--color-border-light)] rounded-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
          />
        </label>

        {/* Sort pills */}
        <div className="flex items-center gap-1 shrink-0 border-l border-[var(--color-border-light)] pl-2 ml-0.5">
          {SORTS.map((s) => {
            const active = sort === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onSortChange(s.id)}
                className={`px-2 py-1 text-[10px] mono tracking-[0.2em] uppercase rounded-sm transition-colors animate-press ${
                  active
                    ? 'text-[var(--color-accent-secondary)] bg-[color-mix(in_srgb,var(--color-accent-secondary)_12%,transparent)]'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
                }`}
                aria-pressed={active}
              >
                {s.label}
              </button>
            );
          })}
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-1 shrink-0 border-l border-[var(--color-border-light)] pl-2">
          {FILTERS.map((f) => {
            const active = filter === f.id;
            const tint =
              f.id === 'winners' ? 'var(--color-positive)' : f.id === 'losers' ? 'var(--color-negative)' : 'var(--color-accent)';
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => onFilterChange(f.id)}
                className={`px-2 py-1 text-[10px] mono tracking-[0.2em] uppercase rounded-sm transition-colors animate-press ${
                  active ? '' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
                }`}
                style={active ? {
                  color: tint,
                  backgroundColor: `color-mix(in srgb, ${tint} 14%, transparent)`,
                } : undefined}
                aria-pressed={active}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {hasActive && (
          <button
            type="button"
            onClick={clearAll}
            className="shrink-0 flex items-center gap-1 px-2 py-1 text-[10px] mono tracking-[0.2em] uppercase text-[var(--color-text-muted)] hover:text-[var(--color-negative)] transition-colors animate-press ml-auto"
            aria-label="Clear filters"
          >
            <X className="w-3 h-3" />
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

export default FilterBar;
