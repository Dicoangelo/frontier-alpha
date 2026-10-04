import type { Portfolio, Quote } from '@/types';

/** Revalue a fetched snapshot against the current cache, even if the cache did
 * not change while the snapshot loaded (for example when revisiting a page). */
export function markPortfolio<T extends Portfolio>(snapshot: T, quotes: ReadonlyMap<string, Pick<Quote, 'last'>>): T {
  const positions = snapshot.positions.map(position => {
    const quote = quotes.get(position.symbol.toUpperCase());
    if (!quote || !Number.isFinite(quote.last) || quote.last < 0) return position;
    return {
      ...position,
      currentPrice: quote.last,
      unrealizedPnL: (quote.last - position.costBasis) * position.shares,
    };
  });
  const totalValue = snapshot.cash + positions.reduce((sum, position) => sum + position.shares * position.currentPrice, 0);
  return {
    ...snapshot,
    totalValue,
    positions: positions.map(position => ({
      ...position,
      weight: totalValue > 0 ? position.shares * position.currentPrice / totalValue : 0,
    })),
  };
}
