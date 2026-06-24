/**
 * Golden-state demo fixtures — the single source of truth for the data shown
 * to unauthenticated (demo-mode) visitors on the public app.
 *
 * Dashboard and Portfolio (and any future public preview surface) read from
 * here so a visitor sees the SAME holdings everywhere: NVDA 50 shares on the
 * Dashboard is NVDA 50 shares on the Portfolio page. These are illustrative
 * numbers, not live data — demo-mode pages always render under the persistent
 * "Demo Mode" banner so the source is unambiguous.
 */

export interface DemoHolding {
  symbol: string;
  shares: number;
  weight: number;
  costBasis: number;
  currentPrice: number;
  unrealizedPnL: number;
}

/** Canonical demo holdings (sum of position values + cash = DEMO_TOTAL_VALUE). */
export const DEMO_HOLDINGS: DemoHolding[] = [
  { symbol: 'NVDA', shares: 50, weight: 0.22, costBasis: 450, currentPrice: 520, unrealizedPnL: 3500 },
  { symbol: 'MSFT', shares: 30, weight: 0.18, costBasis: 380, currentPrice: 415, unrealizedPnL: 1050 },
  { symbol: 'AAPL', shares: 100, weight: 0.15, costBasis: 175, currentPrice: 195, unrealizedPnL: 2000 },
  { symbol: 'GOOGL', shares: 25, weight: 0.14, costBasis: 140, currentPrice: 165, unrealizedPnL: 625 },
  { symbol: 'AMZN', shares: 40, weight: 0.12, costBasis: 180, currentPrice: 205, unrealizedPnL: 1000 },
];

export const DEMO_CASH = 15000;
export const DEMO_TOTAL_VALUE = 125000;
export const DEMO_SYMBOLS = DEMO_HOLDINGS.map((h) => h.symbol);

export interface DemoFactor {
  factor: string;
  exposure: number;
  tStat: number;
  confidence: number;
  contribution: number;
}

/** Canonical demo factor exposures (Dashboard factor card + future surfaces). */
export const DEMO_FACTORS: DemoFactor[] = [
  { factor: 'momentum_12m', exposure: 0.85, tStat: 2.31, confidence: 0.92, contribution: 0.04 },
  { factor: 'roe', exposure: 0.62, tStat: 1.89, confidence: 0.85, contribution: 0.02 },
  { factor: 'low_vol', exposure: -0.42, tStat: -1.45, confidence: 0.78, contribution: 0.01 },
  { factor: 'value', exposure: -0.28, tStat: -0.92, confidence: 0.65, contribution: -0.01 },
  { factor: 'sector_tech', exposure: 0.85, tStat: 8.5, confidence: 0.99, contribution: 0.05 },
];
