/**
 * Shared types and constants for Options sub-components.
 */

// ── Types ──────────────────────────────────────────────────────

export type OptionType = 'call' | 'put';
export type GreekType = 'delta' | 'gamma' | 'theta' | 'vega';
export type StrategyType =
  | 'covered_call'
  | 'protective_put'
  | 'bull_call_spread'
  | 'bear_put_spread'
  | 'iron_condor'
  | 'straddle'
  | 'strangle';

export interface ChainContract {
  strike: number;
  expiration: string;
  type: OptionType;
  bid: number;
  ask: number;
  last: number;
  volume: number;
  openInterest: number;
  iv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
}

export interface GreeksHeatmapCell {
  strike: number;
  expiration: string;
  callDelta: number;
  callGamma: number;
  callTheta: number;
  callVega: number;
  putDelta: number;
  putGamma: number;
  putTheta: number;
  putVega: number;
}

export interface VolSurfacePoint {
  strike: number;
  expiration: string;
  daysToExpiry: number;
  iv: number;
}

export interface StrategyLeg {
  type: OptionType | 'stock';
  strike: number;
  quantity: number;
  premium: number;
}

export interface StrategyDef {
  type: StrategyType;
  name: string;
  description: string;
  outlook: string;
  legs: StrategyLeg[];
}

export interface PnLPoint {
  price: number;
  profit: number;
}

// ── Constants ──────────────────────────────────────────────────

export const UNDERLYING_PRICE = 185.50;
export const UNDERLYING_SYMBOL = 'AAPL';

export const EXPIRATIONS = [
  '2026-02-20',
  '2026-02-27',
  '2026-03-06',
  '2026-03-20',
  '2026-04-17',
  '2026-06-19',
];

export const EXPIRATION_LABELS: Record<string, string> = {
  '2026-02-20': 'Feb 20',
  '2026-02-27': 'Feb 27',
  '2026-03-06': 'Mar 6',
  '2026-03-20': 'Mar 20',
  '2026-04-17': 'Apr 17',
  '2026-06-19': 'Jun 19',
};

export const STRIKES = [170, 172.5, 175, 177.5, 180, 182.5, 185, 187.5, 190, 192.5, 195, 197.5, 200];

// ── Utility Functions ──────────────────────────────────────────

export function daysToExpiry(exp: string): number {
  const now = new Date('2026-02-12');
  const expDate = new Date(exp);
  return Math.max(1, Math.round((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
}

export function formatVolume(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(0)}K`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

// Error function approximation for normal CDF
export function erf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const t = 1.0 / (1.0 + p * Math.abs(x));
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

export function getATMIV(points: VolSurfacePoint[]): number {
  const nearest = points
    .filter((p) => p.expiration === EXPIRATIONS[0])
    .reduce((best, p) =>
      Math.abs(p.strike - UNDERLYING_PRICE) < Math.abs(best.strike - UNDERLYING_PRICE) ? p : best
    );
  return nearest.iv;
}

export function getIVSkew(points: VolSurfacePoint[]): number {
  const nearExp = points.filter((p) => p.expiration === EXPIRATIONS[0]);
  const otmPut = nearExp.find((p) => p.strike === 175);
  const otmCall = nearExp.find((p) => p.strike === 195);
  if (!otmPut || !otmCall) return 0;
  return otmPut.iv - otmCall.iv;
}

export function getTermSlope(points: VolSurfacePoint[]): string {
  const atmStrike = STRIKES.reduce((best, s) =>
    Math.abs(s - UNDERLYING_PRICE) < Math.abs(best - UNDERLYING_PRICE) ? s : best
  );
  const nearIV = points.find((p) => p.strike === atmStrike && p.expiration === EXPIRATIONS[0])?.iv || 0;
  const farIV = points.find((p) => p.strike === atmStrike && p.expiration === EXPIRATIONS[EXPIRATIONS.length - 1])?.iv || 0;
  if (farIV > nearIV + 0.005) return 'Contango';
  if (nearIV > farIV + 0.005) return 'Backwardation';
  return 'Flat';
}

// ── Mock Data Generation ────────────────────────────────────────

// Seeded PRNG (Mulberry32) for deterministic mock data
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(42);

function generateChainContracts(): ChainContract[] {
  const contracts: ChainContract[] = [];
  const exp = EXPIRATIONS[0];
  const dte = daysToExpiry(exp);
  const T = dte / 365;

  for (const strike of STRIKES) {
    const moneyness = (strike - UNDERLYING_PRICE) / UNDERLYING_PRICE;
    const baseIV = 0.25 + Math.abs(moneyness) * 0.4;

    const callIV = baseIV + rng() * 0.02;
    const callIntrinsic = Math.max(0, UNDERLYING_PRICE - strike);
    const callTimeValue = callIV * UNDERLYING_PRICE * Math.sqrt(T) * 0.4;
    const callMid = callIntrinsic + callTimeValue;
    const callSpread = Math.max(0.05, callMid * 0.02 + rng() * 0.03);
    const callDelta = 1 / (1 + Math.exp(-(UNDERLYING_PRICE - strike) / (UNDERLYING_PRICE * callIV * Math.sqrt(T) * 0.5)));
    const callGamma = (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * moneyness * moneyness / (callIV * callIV * T)) / (UNDERLYING_PRICE * callIV * Math.sqrt(T));

    contracts.push({
      strike,
      expiration: exp,
      type: 'call',
      bid: +Math.max(0.01, callMid - callSpread / 2).toFixed(2),
      ask: +(callMid + callSpread / 2).toFixed(2),
      last: +callMid.toFixed(2),
      volume: Math.round(100 + rng() * 5000),
      openInterest: Math.round(500 + rng() * 20000),
      iv: +callIV.toFixed(4),
      delta: +callDelta.toFixed(4),
      gamma: +callGamma.toFixed(4),
      theta: +(-callIV * UNDERLYING_PRICE / (2 * Math.sqrt(T)) / 365 * 0.01).toFixed(4),
      vega: +(UNDERLYING_PRICE * Math.sqrt(T) * 0.01 * callGamma * UNDERLYING_PRICE * callIV * T).toFixed(4),
    });

    const putIV = baseIV + 0.02 + rng() * 0.02;
    const putIntrinsic = Math.max(0, strike - UNDERLYING_PRICE);
    const putTimeValue = putIV * UNDERLYING_PRICE * Math.sqrt(T) * 0.4;
    const putMid = putIntrinsic + putTimeValue;
    const putSpread = Math.max(0.05, putMid * 0.02 + rng() * 0.03);
    const putDelta = callDelta - 1;

    contracts.push({
      strike,
      expiration: exp,
      type: 'put',
      bid: +Math.max(0.01, putMid - putSpread / 2).toFixed(2),
      ask: +(putMid + putSpread / 2).toFixed(2),
      last: +putMid.toFixed(2),
      volume: Math.round(80 + rng() * 4000),
      openInterest: Math.round(400 + rng() * 15000),
      iv: +putIV.toFixed(4),
      delta: +putDelta.toFixed(4),
      gamma: +callGamma.toFixed(4),
      theta: +(-putIV * UNDERLYING_PRICE / (2 * Math.sqrt(T)) / 365 * 0.01).toFixed(4),
      vega: +(UNDERLYING_PRICE * Math.sqrt(T) * 0.01 * callGamma * UNDERLYING_PRICE * putIV * T).toFixed(4),
    });
  }

  return contracts;
}

function generateGreeksHeatmap(): GreeksHeatmapCell[] {
  const cells: GreeksHeatmapCell[] = [];

  for (const exp of EXPIRATIONS) {
    const dte = daysToExpiry(exp);
    const T = dte / 365;

    for (const strike of STRIKES) {
      const moneyness = (strike - UNDERLYING_PRICE) / UNDERLYING_PRICE;
      const iv = 0.25 + Math.abs(moneyness) * 0.4;
      const d1 = (Math.log(UNDERLYING_PRICE / strike) + (0.05 + iv * iv / 2) * T) / (iv * Math.sqrt(T));
      const nd1 = (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * d1 * d1);

      const callDelta = 0.5 * (1 + erf(d1 / Math.sqrt(2)));
      const gamma = nd1 / (UNDERLYING_PRICE * iv * Math.sqrt(T));

      cells.push({
        strike,
        expiration: exp,
        callDelta: +callDelta.toFixed(4),
        callGamma: +gamma.toFixed(6),
        callTheta: +(-(UNDERLYING_PRICE * nd1 * iv) / (2 * Math.sqrt(T)) / 365).toFixed(4),
        callVega: +(UNDERLYING_PRICE * nd1 * Math.sqrt(T) / 100).toFixed(4),
        putDelta: +(callDelta - 1).toFixed(4),
        putGamma: +gamma.toFixed(6),
        putTheta: +(-(UNDERLYING_PRICE * nd1 * iv) / (2 * Math.sqrt(T)) / 365).toFixed(4),
        putVega: +(UNDERLYING_PRICE * nd1 * Math.sqrt(T) / 100).toFixed(4),
      });
    }
  }

  return cells;
}

function generateVolSurface(): VolSurfacePoint[] {
  const points: VolSurfacePoint[] = [];

  for (const exp of EXPIRATIONS) {
    const dte = daysToExpiry(exp);

    for (const strike of STRIKES) {
      const moneyness = (strike - UNDERLYING_PRICE) / UNDERLYING_PRICE;
      const T = dte / 365;
      const smile = 0.22 + Math.abs(moneyness) * 0.35 + moneyness * moneyness * 0.8;
      const termEffect = 0.02 * Math.sqrt(T);
      const skew = moneyness < 0 ? 0.015 : 0;

      points.push({
        strike,
        expiration: exp,
        daysToExpiry: dte,
        iv: +(smile + termEffect + skew + rng() * 0.005).toFixed(4),
      });
    }
  }

  return points;
}

function generateStrategyPnL(strategy: StrategyDef): PnLPoint[] {
  const points: PnLPoint[] = [];
  const low = UNDERLYING_PRICE * 0.8;
  const high = UNDERLYING_PRICE * 1.2;
  const step = (high - low) / 100;

  for (let price = low; price <= high; price += step) {
    let profit = 0;
    for (const leg of strategy.legs) {
      if (leg.type === 'stock') {
        profit += leg.quantity * (price - UNDERLYING_PRICE);
      } else if (leg.type === 'call') {
        const intrinsic = Math.max(0, price - leg.strike);
        profit += leg.quantity * (intrinsic - leg.premium);
      } else {
        const intrinsic = Math.max(0, leg.strike - price);
        profit += leg.quantity * (intrinsic - leg.premium);
      }
    }
    points.push({ price: +price.toFixed(2), profit: +profit.toFixed(2) });
  }

  return points;
}

export const MOCK_CHAIN = generateChainContracts();
export const MOCK_HEATMAP = generateGreeksHeatmap();
export const MOCK_VOL_SURFACE = generateVolSurface();

export const STRATEGIES: Record<StrategyType, StrategyDef> = {
  covered_call: {
    type: 'covered_call',
    name: 'Covered Call',
    description: 'Long stock + short call. Income generation on existing position.',
    outlook: 'Neutral to mildly bullish',
    legs: [
      { type: 'stock', strike: 0, quantity: 100, premium: 0 },
      { type: 'call', strike: 190, quantity: -1, premium: 3.20 },
    ],
  },
  protective_put: {
    type: 'protective_put',
    name: 'Protective Put',
    description: 'Long stock + long put. Downside insurance.',
    outlook: 'Bullish with protection',
    legs: [
      { type: 'stock', strike: 0, quantity: 100, premium: 0 },
      { type: 'put', strike: 180, quantity: 1, premium: 2.85 },
    ],
  },
  bull_call_spread: {
    type: 'bull_call_spread',
    name: 'Bull Call Spread',
    description: 'Long lower-strike call + short higher-strike call. Limited risk bull bet.',
    outlook: 'Moderately bullish',
    legs: [
      { type: 'call', strike: 185, quantity: 1, premium: 5.40 },
      { type: 'call', strike: 195, quantity: -1, premium: 1.80 },
    ],
  },
  bear_put_spread: {
    type: 'bear_put_spread',
    name: 'Bear Put Spread',
    description: 'Long higher-strike put + short lower-strike put. Limited risk bear bet.',
    outlook: 'Moderately bearish',
    legs: [
      { type: 'put', strike: 185, quantity: 1, premium: 4.60 },
      { type: 'put', strike: 175, quantity: -1, premium: 1.50 },
    ],
  },
  iron_condor: {
    type: 'iron_condor',
    name: 'Iron Condor',
    description: 'Short strangle inside long strangle. Profits from low volatility.',
    outlook: 'Neutral / low volatility',
    legs: [
      { type: 'put', strike: 175, quantity: 1, premium: 1.50 },
      { type: 'put', strike: 180, quantity: -1, premium: 2.85 },
      { type: 'call', strike: 190, quantity: -1, premium: 3.20 },
      { type: 'call', strike: 195, quantity: 1, premium: 1.80 },
    ],
  },
  straddle: {
    type: 'straddle',
    name: 'Long Straddle',
    description: 'Long ATM call + long ATM put. Profits from large move in either direction.',
    outlook: 'High volatility expected',
    legs: [
      { type: 'call', strike: 185, quantity: 1, premium: 5.40 },
      { type: 'put', strike: 185, quantity: 1, premium: 4.60 },
    ],
  },
  strangle: {
    type: 'strangle',
    name: 'Long Strangle',
    description: 'Long OTM call + long OTM put. Cheaper vol bet than straddle.',
    outlook: 'High volatility expected',
    legs: [
      { type: 'call', strike: 190, quantity: 1, premium: 3.20 },
      { type: 'put', strike: 180, quantity: 1, premium: 2.85 },
    ],
  },
};

export const STRATEGY_LIST = Object.values(STRATEGIES);

export { generateStrategyPnL };
