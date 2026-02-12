/**
 * Options Dashboard Page
 *
 * Interactive options analytics with four sections:
 * - Chain: Options chain table (calls left, puts right, strike center)
 * - Greeks: Delta/gamma heatmap by strike and expiration
 * - Vol Surface: 3D-style surface chart (strike x expiration x IV)
 * - Strategies: P&L payoff diagram with strategy selection
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Layers,
  BarChart3,
  Target,
  ChevronDown,
  RefreshCw,
  Grip,
} from 'lucide-react';
import * as d3 from 'd3';
import { Card } from '@/components/shared/Card';
import { Button } from '@/components/shared/Button';

// ── Types ──────────────────────────────────────────────────────

type OptionType = 'call' | 'put';
type GreekType = 'delta' | 'gamma' | 'theta' | 'vega';
type StrategyType =
  | 'covered_call'
  | 'protective_put'
  | 'bull_call_spread'
  | 'bear_put_spread'
  | 'iron_condor'
  | 'straddle'
  | 'strangle';

interface ChainContract {
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

interface GreeksHeatmapCell {
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

interface VolSurfacePoint {
  strike: number;
  expiration: string;
  daysToExpiry: number;
  iv: number;
}

interface StrategyLeg {
  type: OptionType | 'stock';
  strike: number;
  quantity: number;
  premium: number;
}

interface StrategyDef {
  type: StrategyType;
  name: string;
  description: string;
  outlook: string;
  legs: StrategyLeg[];
}

interface PnLPoint {
  price: number;
  profit: number;
}

// ── Mock Data Generation ────────────────────────────────────────

const UNDERLYING_PRICE = 185.50;
const UNDERLYING_SYMBOL = 'AAPL';

const EXPIRATIONS = [
  '2026-02-20',
  '2026-02-27',
  '2026-03-06',
  '2026-03-20',
  '2026-04-17',
  '2026-06-19',
];

const EXPIRATION_LABELS: Record<string, string> = {
  '2026-02-20': 'Feb 20',
  '2026-02-27': 'Feb 27',
  '2026-03-06': 'Mar 6',
  '2026-03-20': 'Mar 20',
  '2026-04-17': 'Apr 17',
  '2026-06-19': 'Jun 19',
};

const STRIKES = [170, 172.5, 175, 177.5, 180, 182.5, 185, 187.5, 190, 192.5, 195, 197.5, 200];

function daysToExpiry(exp: string): number {
  const now = new Date('2026-02-12');
  const expDate = new Date(exp);
  return Math.max(1, Math.round((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
}

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
  const exp = EXPIRATIONS[0]; // Use nearest expiration for chain display
  const dte = daysToExpiry(exp);
  const T = dte / 365;

  for (const strike of STRIKES) {
    const moneyness = (strike - UNDERLYING_PRICE) / UNDERLYING_PRICE;
    const baseIV = 0.25 + Math.abs(moneyness) * 0.4;

    // Call contract
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

    // Put contract
    const putIV = baseIV + 0.02 + rng() * 0.02; // Put skew
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

// Error function approximation for normal CDF
function erf(x: number): number {
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

function generateVolSurface(): VolSurfacePoint[] {
  const points: VolSurfacePoint[] = [];

  for (const exp of EXPIRATIONS) {
    const dte = daysToExpiry(exp);
    const T = dte / 365;

    for (const strike of STRIKES) {
      const moneyness = (strike - UNDERLYING_PRICE) / UNDERLYING_PRICE;
      // IV smile: higher IV for OTM options, lower for ATM
      const smile = 0.22 + Math.abs(moneyness) * 0.35 + moneyness * moneyness * 0.8;
      // Term structure: slight contango (higher IV for longer dates)
      const termEffect = 0.02 * Math.sqrt(T);
      // Skew: puts have higher IV
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

const MOCK_CHAIN = generateChainContracts();
const MOCK_HEATMAP = generateGreeksHeatmap();
const MOCK_VOL_SURFACE = generateVolSurface();

const STRATEGIES: Record<StrategyType, StrategyDef> = {
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

const STRATEGY_LIST = Object.values(STRATEGIES);

// ── Tabs ────────────────────────────────────────────────────────

type TabId = 'chain' | 'greeks' | 'surface' | 'strategies';

const TABS: { id: TabId; label: string; icon: typeof Activity }[] = [
  { id: 'chain', label: 'Chain', icon: Layers },
  { id: 'greeks', label: 'Greeks', icon: BarChart3 },
  { id: 'surface', label: 'Vol Surface', icon: Activity },
  { id: 'strategies', label: 'Strategies', icon: Target },
];

// ── Chain Section ───────────────────────────────────────────────

function ChainSection({ contracts }: { contracts: ChainContract[] }) {
  const [selectedExp, setSelectedExp] = useState(EXPIRATIONS[0]);

  const calls = useMemo(
    () => contracts.filter((c) => c.type === 'call' && c.expiration === selectedExp),
    [contracts, selectedExp]
  );
  const puts = useMemo(
    () => contracts.filter((c) => c.type === 'put' && c.expiration === selectedExp),
    [contracts, selectedExp]
  );
  const strikes = useMemo(
    () => [...new Set(calls.map((c) => c.strike))].sort((a, b) => a - b),
    [calls]
  );

  const callsByStrike = useMemo(() => {
    const map = new Map<number, ChainContract>();
    for (const c of calls) map.set(c.strike, c);
    return map;
  }, [calls]);

  const putsByStrike = useMemo(() => {
    const map = new Map<number, ChainContract>();
    for (const p of puts) map.set(p.strike, p);
    return map;
  }, [puts]);

  return (
    <Card>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold text-[var(--color-text)] flex items-center gap-2">
          <Layers className="w-5 h-5 text-indigo-500" />
          Options Chain
          <span className="text-sm font-normal text-[var(--color-text-muted)]">
            {UNDERLYING_SYMBOL} @ ${UNDERLYING_PRICE.toFixed(2)}
          </span>
        </h2>
        <div className="flex items-center gap-2">
          <label htmlFor="chain-exp" className="text-sm text-[var(--color-text-muted)]">Expiry:</label>
          <div className="relative">
            <select
              id="chain-exp"
              value={selectedExp}
              onChange={(e) => setSelectedExp(e.target.value)}
              className="appearance-none bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-3 py-2 pr-8 text-sm text-[var(--color-text)] min-h-[44px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {EXPIRATIONS.map((exp) => (
                <option key={exp} value={exp}>
                  {EXPIRATION_LABELS[exp]} ({daysToExpiry(exp)}d)
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)] pointer-events-none" />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto -mx-6 px-6">
        <table className="w-full text-sm" aria-label={`Options chain for ${UNDERLYING_SYMBOL}`}>
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <th colSpan={5} className="text-center text-green-600 text-xs font-semibold pb-2 border-r border-[var(--color-border)]">
                CALLS
              </th>
              <th className="text-center text-xs font-semibold pb-2 text-[var(--color-text)] border-r border-[var(--color-border)]">
                STRIKE
              </th>
              <th colSpan={5} className="text-center text-red-500 text-xs font-semibold pb-2">
                PUTS
              </th>
            </tr>
            <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
              <th className="text-right px-2 py-2 text-xs">Bid</th>
              <th className="text-right px-2 py-2 text-xs">Ask</th>
              <th className="text-right px-2 py-2 text-xs">Last</th>
              <th className="text-right px-2 py-2 text-xs">Vol</th>
              <th className="text-right px-2 py-2 text-xs border-r border-[var(--color-border)]">OI</th>
              <th className="text-center px-2 py-2 text-xs border-r border-[var(--color-border)]" />
              <th className="text-right px-2 py-2 text-xs">Bid</th>
              <th className="text-right px-2 py-2 text-xs">Ask</th>
              <th className="text-right px-2 py-2 text-xs">Last</th>
              <th className="text-right px-2 py-2 text-xs">Vol</th>
              <th className="text-right px-2 py-2 text-xs">OI</th>
            </tr>
          </thead>
          <tbody>
            {strikes.map((strike) => {
              const call = callsByStrike.get(strike);
              const put = putsByStrike.get(strike);
              const isITMCall = strike < UNDERLYING_PRICE;
              const isITMPut = strike > UNDERLYING_PRICE;
              const isATM = Math.abs(strike - UNDERLYING_PRICE) <= 1.25;

              return (
                <tr
                  key={strike}
                  className={`border-b border-[var(--color-border)] hover:bg-[var(--color-bg-secondary)] transition-colors ${
                    isATM ? 'bg-indigo-500/5' : ''
                  }`}
                >
                  {/* Call side */}
                  <td className={`text-right px-2 py-2 font-mono text-xs ${isITMCall ? 'bg-green-500/5' : ''}`}>
                    {call?.bid.toFixed(2)}
                  </td>
                  <td className={`text-right px-2 py-2 font-mono text-xs ${isITMCall ? 'bg-green-500/5' : ''}`}>
                    {call?.ask.toFixed(2)}
                  </td>
                  <td className={`text-right px-2 py-2 font-mono text-xs font-medium ${isITMCall ? 'bg-green-500/5' : ''}`}>
                    {call?.last.toFixed(2)}
                  </td>
                  <td className={`text-right px-2 py-2 font-mono text-xs text-[var(--color-text-muted)] ${isITMCall ? 'bg-green-500/5' : ''}`}>
                    {call ? formatVolume(call.volume) : ''}
                  </td>
                  <td className={`text-right px-2 py-2 font-mono text-xs text-[var(--color-text-muted)] border-r border-[var(--color-border)] ${isITMCall ? 'bg-green-500/5' : ''}`}>
                    {call ? formatVolume(call.openInterest) : ''}
                  </td>

                  {/* Strike */}
                  <td className={`text-center px-3 py-2 font-mono text-xs font-bold border-r border-[var(--color-border)] ${
                    isATM ? 'text-indigo-600' : 'text-[var(--color-text)]'
                  }`}>
                    {strike.toFixed(1)}
                  </td>

                  {/* Put side */}
                  <td className={`text-right px-2 py-2 font-mono text-xs ${isITMPut ? 'bg-red-500/5' : ''}`}>
                    {put?.bid.toFixed(2)}
                  </td>
                  <td className={`text-right px-2 py-2 font-mono text-xs ${isITMPut ? 'bg-red-500/5' : ''}`}>
                    {put?.ask.toFixed(2)}
                  </td>
                  <td className={`text-right px-2 py-2 font-mono text-xs font-medium ${isITMPut ? 'bg-red-500/5' : ''}`}>
                    {put?.last.toFixed(2)}
                  </td>
                  <td className={`text-right px-2 py-2 font-mono text-xs text-[var(--color-text-muted)] ${isITMPut ? 'bg-red-500/5' : ''}`}>
                    {put ? formatVolume(put.volume) : ''}
                  </td>
                  <td className={`text-right px-2 py-2 font-mono text-xs text-[var(--color-text-muted)] ${isITMPut ? 'bg-red-500/5' : ''}`}>
                    {put ? formatVolume(put.openInterest) : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center gap-4 text-xs text-[var(--color-text-muted)]">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-green-500/20 border border-green-500/30" />
          ITM Calls
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-red-500/20 border border-red-500/30" />
          ITM Puts
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-indigo-500/20 border border-indigo-500/30" />
          ATM
        </span>
      </div>
    </Card>
  );
}

// ── Greeks Heatmap Section ──────────────────────────────────────

function GreeksSection({ cells }: { cells: GreeksHeatmapCell[] }) {
  const [selectedGreek, setSelectedGreek] = useState<GreekType>('delta');
  const [optionSide, setOptionSide] = useState<OptionType>('call');

  const greekKey = useMemo(
    () => `${optionSide}${selectedGreek.charAt(0).toUpperCase()}${selectedGreek.slice(1)}` as keyof GreeksHeatmapCell,
    [optionSide, selectedGreek]
  );

  const expirations = useMemo(() => [...new Set(cells.map((c) => c.expiration))], [cells]);
  const strikes = useMemo(() => [...new Set(cells.map((c) => c.strike))].sort((a, b) => a - b), [cells]);

  const cellMap = useMemo(() => {
    const map = new Map<string, GreeksHeatmapCell>();
    for (const cell of cells) {
      map.set(`${cell.strike}-${cell.expiration}`, cell);
    }
    return map;
  }, [cells]);

  // Compute value range for color scale
  const values = useMemo(() => cells.map((c) => c[greekKey] as number), [cells, greekKey]);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);

  const getColor = useCallback(
    (value: number) => {
      if (selectedGreek === 'theta') {
        // Theta is negative — red for more negative, white for near-zero
        const normalized = maxVal === minVal ? 0.5 : (value - minVal) / (maxVal - minVal);
        const r = Math.round(220 - normalized * 170);
        const g = Math.round(50 + normalized * 170);
        const b = Math.round(50 + normalized * 120);
        return `rgb(${r},${g},${b})`;
      }
      // Delta/gamma/vega: blue for low, green for high
      const normalized = maxVal === minVal ? 0.5 : (value - minVal) / (maxVal - minVal);
      const r = Math.round(60 + (1 - normalized) * 100);
      const g = Math.round(80 + normalized * 140);
      const b = Math.round(180 - normalized * 80);
      return `rgb(${r},${g},${b})`;
    },
    [selectedGreek, minVal, maxVal]
  );

  const greekLabels: Record<GreekType, string> = {
    delta: 'Delta',
    gamma: 'Gamma',
    theta: 'Theta',
    vega: 'Vega',
  };

  return (
    <Card>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold text-[var(--color-text)] flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-indigo-500" />
          Greeks Heatmap
        </h2>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden" role="group" aria-label="Option side selector">
            {(['call', 'put'] as const).map((side) => (
              <button
                key={side}
                onClick={() => setOptionSide(side)}
                aria-pressed={optionSide === side}
                className={`px-3 py-2 text-xs font-medium min-h-[44px] transition-colors ${
                  optionSide === side
                    ? side === 'call'
                      ? 'bg-green-500/10 text-green-600'
                      : 'bg-red-500/10 text-red-500'
                    : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                }`}
              >
                {side === 'call' ? 'Calls' : 'Puts'}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden" role="group" aria-label="Greek selector">
            {(['delta', 'gamma', 'theta', 'vega'] as const).map((greek) => (
              <button
                key={greek}
                onClick={() => setSelectedGreek(greek)}
                aria-pressed={selectedGreek === greek}
                className={`px-2.5 py-2 text-xs font-medium min-h-[44px] transition-colors ${
                  selectedGreek === greek
                    ? 'bg-indigo-500/10 text-indigo-600'
                    : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                }`}
              >
                {greekLabels[greek]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto -mx-6 px-6">
        <table
          className="w-full text-xs"
          role="img"
          aria-label={`${greekLabels[selectedGreek]} heatmap for ${optionSide}s across strikes and expirations`}
        >
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <th className="text-left px-2 py-2 text-[var(--color-text-muted)] font-medium sticky left-0 bg-[var(--color-bg)] z-10">
                Strike
              </th>
              {expirations.map((exp) => (
                <th key={exp} className="text-center px-2 py-2 text-[var(--color-text-muted)] font-medium">
                  {EXPIRATION_LABELS[exp]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {strikes.map((strike) => {
              const isATM = Math.abs(strike - UNDERLYING_PRICE) <= 1.25;
              return (
                <tr key={strike} className="border-b border-[var(--color-border)]">
                  <td className={`px-2 py-2 font-mono font-medium sticky left-0 bg-[var(--color-bg)] z-10 ${
                    isATM ? 'text-indigo-600 font-bold' : 'text-[var(--color-text)]'
                  }`}>
                    {strike.toFixed(1)}
                  </td>
                  {expirations.map((exp) => {
                    const cell = cellMap.get(`${strike}-${exp}`);
                    const value = cell ? (cell[greekKey] as number) : 0;
                    return (
                      <td
                        key={exp}
                        className="text-center px-2 py-2 font-mono"
                        style={{ backgroundColor: getColor(value), color: '#fff' }}
                        title={`Strike ${strike}, ${EXPIRATION_LABELS[exp]}: ${value.toFixed(4)}`}
                      >
                        {selectedGreek === 'gamma' ? value.toFixed(5) : value.toFixed(3)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ── Vol Surface Section ─────────────────────────────────────────

function VolSurfaceSection({ points }: { points: VolSurfacePoint[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [rotation, setRotation] = useState({ x: 25, z: -35 });
  const isDragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const expirations = useMemo(() => [...new Set(points.map((p) => p.expiration))], [points]);
  const strikes = useMemo(() => [...new Set(points.map((p) => p.strike))].sort((a, b) => a - b), [points]);

  const pointMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of points) {
      map.set(`${p.strike}-${p.expiration}`, p.iv);
    }
    return map;
  }, [points]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    setRotation((prev) => ({
      x: Math.max(5, Math.min(80, prev.x + dy * 0.3)),
      z: prev.z - dx * 0.3,
    }));
    lastPos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    const container = containerRef.current;
    if (!svg || !container) return;

    const width = container.clientWidth;
    const height = 360;
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));

    // Clear previous content
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // Isometric-style 3D projection
    const cx = width / 2;
    const cy = height / 2;
    const scale = Math.min(width, height) * 0.35;

    const radX = (rotation.x * Math.PI) / 180;
    const radZ = (rotation.z * Math.PI) / 180;

    // Normalize strike and expiry to [-1, 1]
    const strikeMin = Math.min(...strikes);
    const strikeMax = Math.max(...strikes);
    const expMax = expirations.length - 1;

    // IV range for color and height
    const ivValues = points.map((p) => p.iv);
    const ivMin = Math.min(...ivValues);
    const ivMax = Math.max(...ivValues);

    const colorScale = d3.scaleSequential(d3.interpolateViridis).domain([ivMin, ivMax]);

    // Project 3D to 2D
    function project(sx: number, sy: number, sz: number): [number, number] {
      // Rotate around Z
      const x1 = sx * Math.cos(radZ) - sy * Math.sin(radZ);
      const y1 = sx * Math.sin(radZ) + sy * Math.cos(radZ);
      const z1 = sz;
      // Rotate around X
      const y2 = y1 * Math.cos(radX) - z1 * Math.sin(radX);
      const z2 = y1 * Math.sin(radX) + z1 * Math.cos(radX);
      return [cx + x1 * scale, cy - (y2 * scale * 0.6 + z2 * scale * 0.4)];
    }

    // Draw grid lines and surface patches
    const g = d3.select(svg).append('g');

    // Build faces (quads) for painter's algorithm (back-to-front)
    interface Face {
      points: [number, number][];
      iv: number;
      depth: number;
    }
    const faces: Face[] = [];

    for (let ei = 0; ei < expirations.length - 1; ei++) {
      for (let si = 0; si < strikes.length - 1; si++) {
        const corners = [
          { si, ei },
          { si: si + 1, ei },
          { si: si + 1, ei: ei + 1 },
          { si, ei: ei + 1 },
        ];

        const projected: [number, number][] = [];
        let totalIV = 0;
        let totalDepth = 0;

        for (const c of corners) {
          const nx = (2 * (strikes[c.si] - strikeMin)) / (strikeMax - strikeMin) - 1;
          const ny = expMax === 0 ? 0 : (2 * c.ei) / expMax - 1;
          const iv = pointMap.get(`${strikes[c.si]}-${expirations[c.ei]}`) || ivMin;
          const nz = ivMax === ivMin ? 0 : (iv - ivMin) / (ivMax - ivMin);
          totalIV += iv;

          const pt = project(nx, ny, nz);
          projected.push(pt);

          // Compute depth for sorting (only y-component after rotation matters)
          const rotY = nx * Math.sin(radZ) + ny * Math.cos(radZ);
          totalDepth += rotY * Math.sin(radX) + nz * Math.cos(radX);
        }

        faces.push({
          points: projected,
          iv: totalIV / 4,
          depth: totalDepth / 4,
        });
      }
    }

    // Sort by depth (painter's algorithm: far to near)
    faces.sort((a, b) => a.depth - b.depth);

    // Draw faces
    for (const face of faces) {
      const pathData = `M ${face.points.map(([x, y]) => `${x},${y}`).join(' L ')} Z`;
      g.append('path')
        .attr('d', pathData)
        .attr('fill', colorScale(face.iv))
        .attr('stroke', 'rgba(255,255,255,0.15)')
        .attr('stroke-width', 0.5)
        .attr('opacity', 0.85);
    }

    // Draw wireframe grid lines along strike axis
    for (let ei = 0; ei < expirations.length; ei++) {
      const linePoints: [number, number][] = [];
      for (const strike of strikes) {
        const nx = (2 * (strike - strikeMin)) / (strikeMax - strikeMin) - 1;
        const ny = expMax === 0 ? 0 : (2 * ei) / expMax - 1;
        const iv = pointMap.get(`${strike}-${expirations[ei]}`) || ivMin;
        const nz = ivMax === ivMin ? 0 : (iv - ivMin) / (ivMax - ivMin);
        linePoints.push(project(nx, ny, nz));
      }
      g.append('path')
        .attr('d', `M ${linePoints.map(([x, y]) => `${x},${y}`).join(' L ')}`)
        .attr('fill', 'none')
        .attr('stroke', 'rgba(255,255,255,0.2)')
        .attr('stroke-width', 0.5);
    }

    // Draw wireframe grid lines along expiry axis
    for (const strike of strikes) {
      const linePoints: [number, number][] = [];
      for (let ei = 0; ei < expirations.length; ei++) {
        const nx = (2 * (strike - strikeMin)) / (strikeMax - strikeMin) - 1;
        const ny = expMax === 0 ? 0 : (2 * ei) / expMax - 1;
        const iv = pointMap.get(`${strike}-${expirations[ei]}`) || ivMin;
        const nz = ivMax === ivMin ? 0 : (iv - ivMin) / (ivMax - ivMin);
        linePoints.push(project(nx, ny, nz));
      }
      g.append('path')
        .attr('d', `M ${linePoints.map(([x, y]) => `${x},${y}`).join(' L ')}`)
        .attr('fill', 'none')
        .attr('stroke', 'rgba(255,255,255,0.2)')
        .attr('stroke-width', 0.5);
    }

    // Axis labels
    const labelStyle = {
      fill: 'var(--color-text-muted, #9ca3af)',
      fontSize: '11px',
      fontFamily: 'monospace',
    };

    // Strike axis label (bottom-right)
    const strikeEnd = project(1, -1, 0);
    g.append('text')
      .attr('x', strikeEnd[0] + 10)
      .attr('y', strikeEnd[1] + 15)
      .attr('fill', labelStyle.fill)
      .attr('font-size', labelStyle.fontSize)
      .attr('font-family', labelStyle.fontFamily)
      .text('Strike →');

    // Expiry axis label (bottom-left)
    const expEnd = project(-1, 1, 0);
    g.append('text')
      .attr('x', expEnd[0] - 40)
      .attr('y', expEnd[1] + 15)
      .attr('fill', labelStyle.fill)
      .attr('font-size', labelStyle.fontSize)
      .attr('font-family', labelStyle.fontFamily)
      .text('← Expiry');

    // IV axis label (top)
    const ivTop = project(0, 0, 1.1);
    g.append('text')
      .attr('x', ivTop[0])
      .attr('y', ivTop[1] - 10)
      .attr('text-anchor', 'middle')
      .attr('fill', labelStyle.fill)
      .attr('font-size', labelStyle.fontSize)
      .attr('font-family', labelStyle.fontFamily)
      .text('IV ↑');

    // Color legend
    const legendWidth = 120;
    const legendHeight = 10;
    const legendX = width - legendWidth - 20;
    const legendY = 15;

    const defs = d3.select(svg).append('defs');
    const gradient = defs.append('linearGradient').attr('id', 'iv-gradient');
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      gradient
        .append('stop')
        .attr('offset', `${t * 100}%`)
        .attr('stop-color', colorScale(ivMin + t * (ivMax - ivMin)));
    }

    g.append('rect')
      .attr('x', legendX)
      .attr('y', legendY)
      .attr('width', legendWidth)
      .attr('height', legendHeight)
      .attr('fill', 'url(#iv-gradient)')
      .attr('rx', 3);

    g.append('text')
      .attr('x', legendX)
      .attr('y', legendY + legendHeight + 12)
      .attr('fill', labelStyle.fill)
      .attr('font-size', '10px')
      .attr('font-family', labelStyle.fontFamily)
      .text(`${(ivMin * 100).toFixed(0)}%`);

    g.append('text')
      .attr('x', legendX + legendWidth)
      .attr('y', legendY + legendHeight + 12)
      .attr('text-anchor', 'end')
      .attr('fill', labelStyle.fill)
      .attr('font-size', '10px')
      .attr('font-family', labelStyle.fontFamily)
      .text(`${(ivMax * 100).toFixed(0)}%`);
  }, [points, rotation, strikes, expirations, pointMap]);

  return (
    <Card>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold text-[var(--color-text)] flex items-center gap-2">
          <Activity className="w-5 h-5 text-indigo-500" />
          Volatility Surface
        </h2>
        <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
          <Grip className="w-4 h-4" />
          Drag to rotate
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative cursor-grab active:cursor-grabbing select-none"
        role="img"
        aria-label={`3D implied volatility surface for ${UNDERLYING_SYMBOL} showing IV across strikes and expirations`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <svg ref={svgRef} className="w-full" style={{ minHeight: 360 }} aria-hidden="true" />
      </div>

      {/* Summary stats */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatMini label="ATM IV" value={`${(getATMIV(points) * 100).toFixed(1)}%`} />
        <StatMini label="IV Skew" value={`${(getIVSkew(points) * 100).toFixed(1)}%`} />
        <StatMini label="Term Slope" value={getTermSlope(points)} />
        <StatMini label="Min/Max IV" value={`${(Math.min(...points.map((p) => p.iv)) * 100).toFixed(0)}–${(Math.max(...points.map((p) => p.iv)) * 100).toFixed(0)}%`} />
      </div>
    </Card>
  );
}

function StatMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2 bg-[var(--color-bg-secondary)] rounded-lg border border-[var(--color-border)]">
      <div className="text-xs text-[var(--color-text-muted)]">{label}</div>
      <div className="text-sm font-bold font-mono text-[var(--color-text)]">{value}</div>
    </div>
  );
}

function getATMIV(points: VolSurfacePoint[]): number {
  const nearest = points
    .filter((p) => p.expiration === EXPIRATIONS[0])
    .reduce((best, p) =>
      Math.abs(p.strike - UNDERLYING_PRICE) < Math.abs(best.strike - UNDERLYING_PRICE) ? p : best
    );
  return nearest.iv;
}

function getIVSkew(points: VolSurfacePoint[]): number {
  const nearExp = points.filter((p) => p.expiration === EXPIRATIONS[0]);
  const otmPut = nearExp.find((p) => p.strike === 175);
  const otmCall = nearExp.find((p) => p.strike === 195);
  if (!otmPut || !otmCall) return 0;
  return otmPut.iv - otmCall.iv;
}

function getTermSlope(points: VolSurfacePoint[]): string {
  const atmStrike = STRIKES.reduce((best, s) =>
    Math.abs(s - UNDERLYING_PRICE) < Math.abs(best - UNDERLYING_PRICE) ? s : best
  );
  const nearIV = points.find((p) => p.strike === atmStrike && p.expiration === EXPIRATIONS[0])?.iv || 0;
  const farIV = points.find((p) => p.strike === atmStrike && p.expiration === EXPIRATIONS[EXPIRATIONS.length - 1])?.iv || 0;
  if (farIV > nearIV + 0.005) return 'Contango';
  if (nearIV > farIV + 0.005) return 'Backwardation';
  return 'Flat';
}

// ── Strategies Section ──────────────────────────────────────────

function StrategiesSection() {
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyType>('bull_call_spread');

  const strategy = STRATEGIES[selectedStrategy];
  const pnlData = useMemo(() => generateStrategyPnL(strategy), [strategy]);

  const maxProfit = useMemo(() => Math.max(...pnlData.map((p) => p.profit)), [pnlData]);
  const maxLoss = useMemo(() => Math.min(...pnlData.map((p) => p.profit)), [pnlData]);

  const breakevens = useMemo(() => {
    const brkPts: number[] = [];
    for (let i = 1; i < pnlData.length; i++) {
      if (
        (pnlData[i - 1].profit <= 0 && pnlData[i].profit > 0) ||
        (pnlData[i - 1].profit >= 0 && pnlData[i].profit < 0)
      ) {
        // Linear interpolation
        const x0 = pnlData[i - 1].price;
        const x1 = pnlData[i].price;
        const y0 = pnlData[i - 1].profit;
        const y1 = pnlData[i].profit;
        brkPts.push(+(x0 - y0 * (x1 - x0) / (y1 - y0)).toFixed(2));
      }
    }
    return brkPts;
  }, [pnlData]);

  const netDebit = useMemo(() => {
    return strategy.legs
      .filter((l) => l.type !== 'stock')
      .reduce((sum, l) => sum + l.quantity * l.premium, 0);
  }, [strategy]);

  return (
    <Card>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold text-[var(--color-text)] flex items-center gap-2">
          <Target className="w-5 h-5 text-indigo-500" />
          Strategy P&L
        </h2>
        <div className="relative">
          <select
            value={selectedStrategy}
            onChange={(e) => setSelectedStrategy(e.target.value as StrategyType)}
            className="appearance-none bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-3 py-2 pr-8 text-sm text-[var(--color-text)] min-h-[44px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
            aria-label="Select options strategy"
          >
            {STRATEGY_LIST.map((s) => (
              <option key={s.type} value={s.type}>
                {s.name}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)] pointer-events-none" />
        </div>
      </div>

      {/* Strategy Info */}
      <div className="mb-4 p-3 bg-[var(--color-bg-secondary)] rounded-lg border border-[var(--color-border)]">
        <div className="text-sm text-[var(--color-text)]">{strategy.description}</div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 border border-indigo-500/20">
            {strategy.outlook}
          </span>
          {strategy.legs.map((leg, i) => (
            <span
              key={i}
              className={`px-2 py-0.5 rounded-full border ${
                leg.quantity > 0
                  ? 'bg-green-500/10 text-green-600 border-green-500/20'
                  : 'bg-red-500/10 text-red-500 border-red-500/20'
              }`}
            >
              {leg.quantity > 0 ? 'Long' : 'Short'}{' '}
              {leg.type === 'stock' ? '100 shares' : `${leg.strike} ${leg.type.toUpperCase()}`}
              {leg.type !== 'stock' && ` @ $${leg.premium.toFixed(2)}`}
            </span>
          ))}
        </div>
      </div>

      {/* P&L Chart */}
      <div className="h-64 mb-4" role="img" aria-label={`P&L payoff diagram for ${strategy.name} strategy`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={pnlData} margin={{ top: 10, right: 10, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light, #e5e7eb)" vertical={false} />
            <XAxis
              dataKey="price"
              tick={{ fill: 'var(--color-text-muted, #9ca3af)', fontSize: 11 }}
              tickFormatter={(v: number) => `$${v.toFixed(0)}`}
              axisLine={{ stroke: 'var(--color-border, #e5e7eb)' }}
            />
            <YAxis
              tick={{ fill: 'var(--color-text-muted, #9ca3af)', fontSize: 11 }}
              tickFormatter={(v: number) => `$${v.toFixed(0)}`}
              axisLine={{ stroke: 'var(--color-border, #e5e7eb)' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--color-bg, #fff)',
                border: '1px solid var(--color-border, #e5e7eb)',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              formatter={(value: unknown) => [`$${Number(value).toFixed(2)}`, 'P&L']}
              labelFormatter={(label: unknown) => `Price: $${Number(label).toFixed(2)}`}
            />
            <ReferenceLine y={0} stroke="var(--color-text-muted, #9ca3af)" strokeDasharray="2 2" />
            <ReferenceLine
              x={UNDERLYING_PRICE}
              stroke="var(--color-text-muted, #9ca3af)"
              strokeDasharray="2 2"
              label={{ value: 'Current', position: 'top', fill: 'var(--color-text-muted, #9ca3af)', fontSize: 10 }}
            />
            {breakevens.map((be, i) => (
              <ReferenceLine
                key={i}
                x={be}
                stroke="#f59e0b"
                strokeDasharray="4 4"
                label={{ value: `BE: $${be.toFixed(0)}`, position: 'top', fill: '#f59e0b', fontSize: 10 }}
              />
            ))}
            <Legend />
            <Line
              type="monotone"
              dataKey="profit"
              name="P&L at Expiry"
              stroke="#6366f1"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#6366f1' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Strategy Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="px-3 py-2 bg-[var(--color-bg-secondary)] rounded-lg border border-[var(--color-border)]">
          <div className="text-xs text-[var(--color-text-muted)]">Max Profit</div>
          <div className="text-sm font-bold font-mono text-green-600">
            {maxProfit >= 1e6 ? 'Unlimited' : `$${maxProfit.toFixed(0)}`}
          </div>
        </div>
        <div className="px-3 py-2 bg-[var(--color-bg-secondary)] rounded-lg border border-[var(--color-border)]">
          <div className="text-xs text-[var(--color-text-muted)]">Max Loss</div>
          <div className="text-sm font-bold font-mono text-red-500">
            ${maxLoss.toFixed(0)}
          </div>
        </div>
        <div className="px-3 py-2 bg-[var(--color-bg-secondary)] rounded-lg border border-[var(--color-border)]">
          <div className="text-xs text-[var(--color-text-muted)]">Breakeven</div>
          <div className="text-sm font-bold font-mono text-[var(--color-text)]">
            {breakevens.length > 0 ? breakevens.map((b) => `$${b.toFixed(1)}`).join(', ') : 'N/A'}
          </div>
        </div>
        <div className="px-3 py-2 bg-[var(--color-bg-secondary)] rounded-lg border border-[var(--color-border)]">
          <div className="text-xs text-[var(--color-text-muted)]">Net Debit</div>
          <div className={`text-sm font-bold font-mono ${netDebit > 0 ? 'text-red-500' : 'text-green-600'}`}>
            {netDebit > 0 ? `-$${netDebit.toFixed(2)}` : `+$${Math.abs(netDebit).toFixed(2)}`}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ── Utility Functions ───────────────────────────────────────────

function formatVolume(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(0)}K`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

// ── Main Page ───────────────────────────────────────────────────

export function Options() {
  const [activeTab, setActiveTab] = useState<TabId>('chain');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Options</h1>
          <p className="text-[var(--color-text-muted)] mt-1">
            Chain, Greeks, volatility surface &amp; strategy analysis
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)]">
            <span className="text-xs text-[var(--color-text-muted)]">Underlying</span>
            <span className="ml-2 text-sm font-bold text-[var(--color-text)]">{UNDERLYING_SYMBOL}</span>
            <span className="ml-1 text-sm font-mono text-[var(--color-text-muted)]">${UNDERLYING_PRICE.toFixed(2)}</span>
          </div>
          <Button variant="outline" disabled>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="ATM IV"
          value={`${(getATMIV(MOCK_VOL_SURFACE) * 100).toFixed(1)}%`}
          icon={<Activity className="w-4 h-4" />}
          color="text-indigo-600"
        />
        <MetricCard
          label="IV Skew"
          value={`${(getIVSkew(MOCK_VOL_SURFACE) * 100).toFixed(1)}%`}
          icon={<TrendingDown className="w-4 h-4" />}
          color="text-amber-600"
        />
        <MetricCard
          label="Put/Call Ratio"
          value="0.78"
          subtitle="Below average"
          icon={<BarChart3 className="w-4 h-4" />}
        />
        <MetricCard
          label="Exp. Move"
          value={`±$${(UNDERLYING_PRICE * getATMIV(MOCK_VOL_SURFACE) * Math.sqrt(8 / 365) * 100 / 100).toFixed(2)}`}
          subtitle="Weekly"
          icon={<TrendingUp className="w-4 h-4" />}
          color="text-green-600"
        />
      </div>

      {/* Tab Navigation */}
      <div className="flex overflow-x-auto border-b border-[var(--color-border)]" role="tablist" aria-label="Options sections">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors min-h-[44px] ${
                activeTab === tab.id
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-border)]'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      <div id={`panel-${activeTab}`} role="tabpanel" aria-labelledby={activeTab}>
        {activeTab === 'chain' && <ChainSection contracts={MOCK_CHAIN} />}
        {activeTab === 'greeks' && <GreeksSection cells={MOCK_HEATMAP} />}
        {activeTab === 'surface' && <VolSurfaceSection points={MOCK_VOL_SURFACE} />}
        {activeTab === 'strategies' && <StrategiesSection />}
      </div>
    </div>
  );
}

// ── Shared Helper ───────────────────────────────────────────────

interface MetricCardProps {
  label: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  color?: string;
}

function MetricCard({ label, value, subtitle, icon, color = 'text-[var(--color-text)]' }: MetricCardProps) {
  return (
    <div className="p-4 bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)]">
      <div className="flex items-center gap-2 text-[var(--color-text-muted)] mb-2">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {subtitle && <div className="text-xs text-[var(--color-text-muted)] mt-1">{subtitle}</div>}
    </div>
  );
}

export default Options;
