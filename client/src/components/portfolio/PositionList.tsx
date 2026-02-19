import { useState } from 'react';
import { Card } from '@/components/shared/Card';
import { Badge } from '@/components/shared/Badge';
import type { Position, Quote } from '@/types';

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

export function PositionList({ positions, quotes }: PositionListProps) {
  const [sortField, setSortField] = useState<SortField>('value');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const sorted = [...positions].sort((a, b) => {
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
  });

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
          const quote = quotes?.get(position.symbol);
          const changePercent = quote?.changePercent ?? 0;
          const positionValue = position.shares * position.currentPrice;

          return (
            <div
              key={position.symbol}
              className="p-3 bg-[var(--color-bg-tertiary)] rounded-lg border border-[var(--color-border-light)]"
            >
              {/* Top row: symbol + P&L prominent */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div
                    className="w-9 h-9 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold text-xs flex-shrink-0"
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
                  <p className="mb-0.5">Day Change</p>
                  <div className="mt-0.5">
                    <Badge variant={changePercent >= 0 ? 'success' : 'danger'}>
                      {changePercent >= 0 ? '↑' : '↓'} {Math.abs(changePercent).toFixed(2)}%
                    </Badge>
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
              const quote = quotes?.get(position.symbol);
              const changePercent = quote?.changePercent ?? 0;
              const positionValue = position.shares * position.currentPrice;

              return (
                <tr
                  key={position.symbol}
                  className="border-b border-[var(--color-border-light)] last:border-0 hover:bg-[var(--color-bg-tertiary)] transition-colors"
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold text-xs flex-shrink-0"
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
                    <Badge variant={changePercent >= 0 ? 'success' : 'danger'}>
                      {changePercent >= 0 ? '↑' : '↓'} {Math.abs(changePercent).toFixed(2)}%
                    </Badge>
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
