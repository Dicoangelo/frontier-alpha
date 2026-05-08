/**
 * Weekly-digest metrics builder.
 *
 * Pulls a user's portfolio + per-position 7-day returns and shapes the result
 * for `renderWeeklyDigest`. The 7-day window matches the Monday 13:00 UTC cron
 * cadence — top/worst movers cover the prior calendar week.
 *
 * Failure posture: any per-symbol fetch error is logged and that symbol is
 * skipped rather than poisoning the whole digest. If we cannot resolve enough
 * data to compute a delta, we return null and the caller skips that recipient.
 */
import { portfolioService } from '../services/PortfolioService.js';
import { marketDataProvider } from '../data/MarketDataProvider.js';
import { logger } from '../observability/logger.js';
import type { Price } from '../types/index.js';

export interface WeeklyMetrics {
  portfolioValue: number;
  portfolioDelta: number;
  portfolioDeltaPct: number;
  topMover: { symbol: string; pct: number; because: string };
  worstMover: { symbol: string; pct: number };
}

interface PositionMove {
  symbol: string;
  shares: number;
  currentPrice: number;
  priorPrice: number;
  pct: number;
}

const ZERO_MOVE: { symbol: string; pct: number; because: string } = {
  symbol: '—',
  pct: 0,
  because: 'No active positions this week',
};

/**
 * Pick the close price closest to (but not after) `cutoffMs`. Walks the price
 * series newest → oldest because Alpha Vantage returns ascending dates.
 */
function priorClose(prices: Price[], cutoffMs: number): number | null {
  for (let i = prices.length - 1; i >= 0; i -= 1) {
    const ts = prices[i].timestamp.getTime();
    if (ts <= cutoffMs) return prices[i].close;
  }
  return null;
}

export async function computeWeeklyMetrics(userId: string): Promise<WeeklyMetrics | null> {
  const portfolio = await portfolioService.getPortfolio(userId);
  if (!portfolio) return null;

  const cashBalance = Number(portfolio.cash_balance ?? 0);
  const positions = portfolio.positions ?? [];

  if (positions.length === 0) {
    return {
      portfolioValue: cashBalance,
      portfolioDelta: 0,
      portfolioDeltaPct: 0,
      topMover: ZERO_MOVE,
      worstMover: { symbol: '—', pct: 0 },
    };
  }

  const cutoffMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const moves: PositionMove[] = [];

  await Promise.all(
    positions.map(async (p) => {
      const symbol = p.symbol;
      const shares = Number(p.shares);
      const fallback = Number(p.avg_cost);

      try {
        const [quote, history] = await Promise.all([
          marketDataProvider.getQuote(symbol).catch(() => null),
          marketDataProvider.getHistoricalPrices(symbol, 14).catch(() => [] as Price[]),
        ]);

        const currentPrice = quote?.last ?? priorClose(history, Date.now()) ?? fallback;
        const priorPrice = priorClose(history, cutoffMs) ?? currentPrice;

        const pct = priorPrice > 0 ? ((currentPrice - priorPrice) / priorPrice) * 100 : 0;
        moves.push({ symbol, shares, currentPrice, priorPrice, pct });
      } catch (err) {
        logger.warn({ err, userId, symbol }, 'Digest metrics: per-symbol fetch failed');
      }
    })
  );

  if (moves.length === 0) return null;

  const positionValueNow = moves.reduce((s, m) => s + m.shares * m.currentPrice, 0);
  const positionValueThen = moves.reduce((s, m) => s + m.shares * m.priorPrice, 0);

  const portfolioValue = positionValueNow + cashBalance;
  const totalThen = positionValueThen + cashBalance;
  const portfolioDelta = portfolioValue - totalThen;
  const portfolioDeltaPct = totalThen > 0 ? (portfolioDelta / totalThen) * 100 : 0;

  const sortedByPct = [...moves].sort((a, b) => b.pct - a.pct);
  const top = sortedByPct[0];
  const worst = sortedByPct[sortedByPct.length - 1];

  // Best-effort "because" — prefer absolute dollar swing on the position so
  // the email surfaces the largest contributor, not the largest %-mover on a
  // tiny position.
  const topDollarSwing = top.shares * (top.currentPrice - top.priorPrice);
  const sign = topDollarSwing >= 0 ? '+' : '-';
  const because =
    Math.abs(topDollarSwing) >= 1
      ? `Position contributed ${sign}$${Math.abs(topDollarSwing).toFixed(0)} this week`
      : 'Largest 7-day percentage move in your portfolio';

  return {
    portfolioValue,
    portfolioDelta,
    portfolioDeltaPct,
    topMover: { symbol: top.symbol, pct: top.pct, because },
    worstMover: { symbol: worst.symbol, pct: worst.pct },
  };
}
