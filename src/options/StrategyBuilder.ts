/**
 * Options Strategy Builder Engine
 *
 * Builds and analyzes multi-leg options strategies including covered calls,
 * protective puts, spreads, iron condors, straddles, and strangles.
 *
 * For each strategy: calculates max profit, max loss, breakeven points,
 * probability of profit, and generates P&L chart data.
 *
 * Recommends strategies based on IV rank and market regime.
 */

import { normalCDF } from './GreeksCalculator.js';

// ============================================================================
// TYPES
// ============================================================================

export type StrategyType =
  | 'covered_call'
  | 'protective_put'
  | 'bull_call_spread'
  | 'bear_put_spread'
  | 'iron_condor'
  | 'straddle'
  | 'strangle';

export type MarketOutlook = 'bullish' | 'bearish' | 'neutral' | 'volatile';

export interface StrategyLeg {
  type: 'call' | 'put' | 'stock';
  strike: number;       // 0 for stock legs
  expiration: string;
  quantity: number;      // Positive = long, negative = short
  premium: number;       // Per-share premium (positive = paid, negative = received)
  impliedVolatility?: number;
}

export interface StrategyDefinition {
  name: string;
  type: StrategyType;
  legs: StrategyLeg[];
  underlyingPrice: number;
  description: string;
  outlook: MarketOutlook;
}

export interface PnLPoint {
  price: number;
  profit: number;
}

export interface StrategyAnalysis {
  strategy: StrategyDefinition;
  maxProfit: number;       // Per-share basis; Infinity if unbounded
  maxLoss: number;         // Per-share basis; -Infinity if unbounded (stored as negative)
  breakevens: number[];    // Underlying prices where P&L = 0
  probabilityOfProfit: number; // 0-1, based on lognormal distribution
  netDebit: number;        // Positive = net debit, negative = net credit
  pnlData: PnLPoint[];    // P&L curve for charting
  riskRewardRatio: number; // |maxProfit / maxLoss|, Infinity if maxLoss is 0
}

export interface StrategyRecommendation {
  type: StrategyType;
  name: string;
  rationale: string;
  outlook: MarketOutlook;
  score: number; // 0-1 suitability score
}

export interface StrategyBuilderConfig {
  riskFreeRate?: number;
  pnlPriceRange?: number;    // Fraction of underlying price to span (default 0.3 = ±30%)
  pnlSteps?: number;         // Number of price points in P&L curve (default 100)
  daysInYear?: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_RISK_FREE_RATE = 0.0525;
const DEFAULT_PNL_RANGE = 0.3;
const DEFAULT_PNL_STEPS = 100;
const DAYS_IN_YEAR = 365;

// ============================================================================
// STRATEGY BUILDER
// ============================================================================

export class StrategyBuilder {
  private riskFreeRate: number;
  private pnlPriceRange: number;
  private pnlSteps: number;
  private daysInYear: number;

  constructor(config: StrategyBuilderConfig = {}) {
    this.riskFreeRate = config.riskFreeRate ?? DEFAULT_RISK_FREE_RATE;
    this.pnlPriceRange = config.pnlPriceRange ?? DEFAULT_PNL_RANGE;
    this.pnlSteps = config.pnlSteps ?? DEFAULT_PNL_STEPS;
    this.daysInYear = config.daysInYear ?? DAYS_IN_YEAR;
  }

  // ==========================================================================
  // STRATEGY BUILDERS
  // ==========================================================================

  /**
   * Build a covered call: long 100 shares + short 1 call.
   */
  buildCoveredCall(
    underlyingPrice: number,
    callStrike: number,
    callPremium: number,
    expiration: string,
    iv?: number,
  ): StrategyDefinition {
    return {
      name: 'Covered Call',
      type: 'covered_call',
      legs: [
        { type: 'stock', strike: 0, expiration, quantity: 100, premium: underlyingPrice },
        { type: 'call', strike: callStrike, expiration, quantity: -1, premium: -callPremium, impliedVolatility: iv },
      ],
      underlyingPrice,
      description: 'Long stock + short call. Generate income with limited upside.',
      outlook: 'neutral',
    };
  }

  /**
   * Build a protective put: long 100 shares + long 1 put.
   */
  buildProtectivePut(
    underlyingPrice: number,
    putStrike: number,
    putPremium: number,
    expiration: string,
    iv?: number,
  ): StrategyDefinition {
    return {
      name: 'Protective Put',
      type: 'protective_put',
      legs: [
        { type: 'stock', strike: 0, expiration, quantity: 100, premium: underlyingPrice },
        { type: 'put', strike: putStrike, expiration, quantity: 1, premium: putPremium, impliedVolatility: iv },
      ],
      underlyingPrice,
      description: 'Long stock + long put. Insure against downside risk.',
      outlook: 'bullish',
    };
  }

  /**
   * Build a bull call spread: long lower-strike call + short higher-strike call.
   */
  buildBullCallSpread(
    underlyingPrice: number,
    longStrike: number,
    shortStrike: number,
    longPremium: number,
    shortPremium: number,
    expiration: string,
    iv?: number,
  ): StrategyDefinition {
    return {
      name: 'Bull Call Spread',
      type: 'bull_call_spread',
      legs: [
        { type: 'call', strike: longStrike, expiration, quantity: 1, premium: longPremium, impliedVolatility: iv },
        { type: 'call', strike: shortStrike, expiration, quantity: -1, premium: -shortPremium, impliedVolatility: iv },
      ],
      underlyingPrice,
      description: 'Long lower-strike call + short higher-strike call. Bullish with defined risk.',
      outlook: 'bullish',
    };
  }

  /**
   * Build a bear put spread: long higher-strike put + short lower-strike put.
   */
  buildBearPutSpread(
    underlyingPrice: number,
    longStrike: number,
    shortStrike: number,
    longPremium: number,
    shortPremium: number,
    expiration: string,
    iv?: number,
  ): StrategyDefinition {
    return {
      name: 'Bear Put Spread',
      type: 'bear_put_spread',
      legs: [
        { type: 'put', strike: longStrike, expiration, quantity: 1, premium: longPremium, impliedVolatility: iv },
        { type: 'put', strike: shortStrike, expiration, quantity: -1, premium: -shortPremium, impliedVolatility: iv },
      ],
      underlyingPrice,
      description: 'Long higher-strike put + short lower-strike put. Bearish with defined risk.',
      outlook: 'bearish',
    };
  }

  /**
   * Build an iron condor: bull put spread + bear call spread.
   * Short put at putShort, long put at putLong (lower), short call at callShort, long call at callLong (higher).
   */
  buildIronCondor(
    underlyingPrice: number,
    putLongStrike: number,
    putShortStrike: number,
    callShortStrike: number,
    callLongStrike: number,
    putLongPremium: number,
    putShortPremium: number,
    callShortPremium: number,
    callLongPremium: number,
    expiration: string,
    iv?: number,
  ): StrategyDefinition {
    return {
      name: 'Iron Condor',
      type: 'iron_condor',
      legs: [
        { type: 'put', strike: putLongStrike, expiration, quantity: 1, premium: putLongPremium, impliedVolatility: iv },
        { type: 'put', strike: putShortStrike, expiration, quantity: -1, premium: -putShortPremium, impliedVolatility: iv },
        { type: 'call', strike: callShortStrike, expiration, quantity: -1, premium: -callShortPremium, impliedVolatility: iv },
        { type: 'call', strike: callLongStrike, expiration, quantity: 1, premium: callLongPremium, impliedVolatility: iv },
      ],
      underlyingPrice,
      description: 'Bull put spread + bear call spread. Profit from low volatility in a range.',
      outlook: 'neutral',
    };
  }

  /**
   * Build a straddle: long 1 ATM call + long 1 ATM put (same strike).
   */
  buildStraddle(
    underlyingPrice: number,
    strike: number,
    callPremium: number,
    putPremium: number,
    expiration: string,
    iv?: number,
  ): StrategyDefinition {
    return {
      name: 'Long Straddle',
      type: 'straddle',
      legs: [
        { type: 'call', strike, expiration, quantity: 1, premium: callPremium, impliedVolatility: iv },
        { type: 'put', strike, expiration, quantity: 1, premium: putPremium, impliedVolatility: iv },
      ],
      underlyingPrice,
      description: 'Long call + long put at same strike. Profit from large moves in either direction.',
      outlook: 'volatile',
    };
  }

  /**
   * Build a strangle: long 1 OTM call + long 1 OTM put (different strikes).
   */
  buildStrangle(
    underlyingPrice: number,
    callStrike: number,
    putStrike: number,
    callPremium: number,
    putPremium: number,
    expiration: string,
    iv?: number,
  ): StrategyDefinition {
    return {
      name: 'Long Strangle',
      type: 'strangle',
      legs: [
        { type: 'call', strike: callStrike, expiration, quantity: 1, premium: callPremium, impliedVolatility: iv },
        { type: 'put', strike: putStrike, expiration, quantity: 1, premium: putPremium, impliedVolatility: iv },
      ],
      underlyingPrice,
      description: 'Long OTM call + long OTM put. Cheaper than straddle, needs bigger move.',
      outlook: 'volatile',
    };
  }

  // ==========================================================================
  // ANALYSIS ENGINE
  // ==========================================================================

  /**
   * Fully analyze a strategy: max profit, max loss, breakevens, P&L curve, PoP.
   */
  analyzeStrategy(strategy: StrategyDefinition): StrategyAnalysis {
    const pnlData = this.generatePnLData(strategy);
    const netDebit = this.calculateNetDebit(strategy);
    const { maxProfit, maxLoss } = this.calculateMaxProfitLoss(strategy, pnlData);
    const breakevens = this.calculateBreakevens(strategy, pnlData);
    const probabilityOfProfit = this.calculateProbabilityOfProfit(strategy, breakevens);

    const riskRewardRatio = maxLoss === 0
      ? Infinity
      : Math.abs(maxProfit / maxLoss);

    return {
      strategy,
      maxProfit,
      maxLoss,
      breakevens,
      probabilityOfProfit,
      netDebit,
      pnlData,
      riskRewardRatio,
    };
  }

  // ==========================================================================
  // P&L CALCULATION
  // ==========================================================================

  /**
   * Calculate P&L at expiration for a given underlying price.
   */
  calculatePnLAtExpiration(strategy: StrategyDefinition, priceAtExpiration: number): number {
    let totalPnL = 0;

    for (const leg of strategy.legs) {
      if (leg.type === 'stock') {
        // Stock P&L: quantity * (exitPrice - entryPrice)
        // premium holds the entry price for stock legs
        totalPnL += leg.quantity * (priceAtExpiration - leg.premium);
      } else if (leg.type === 'call') {
        // Call at expiration: max(0, S - K) - premium
        const intrinsic = Math.max(0, priceAtExpiration - leg.strike);
        // quantity > 0 (long): paid premium (positive), get intrinsic
        // quantity < 0 (short): received premium (negative = credit), owe intrinsic
        totalPnL += leg.quantity * (intrinsic - leg.premium);
      } else {
        // Put at expiration: max(0, K - S) - premium
        const intrinsic = Math.max(0, leg.strike - priceAtExpiration);
        totalPnL += leg.quantity * (intrinsic - leg.premium);
      }
    }

    return totalPnL;
  }

  /**
   * Generate P&L data points across a price range.
   */
  generatePnLData(strategy: StrategyDefinition): PnLPoint[] {
    const S = strategy.underlyingPrice;
    const low = S * (1 - this.pnlPriceRange);
    const high = S * (1 + this.pnlPriceRange);
    const step = (high - low) / this.pnlSteps;

    const points: PnLPoint[] = [];
    for (let i = 0; i <= this.pnlSteps; i++) {
      const price = low + i * step;
      const profit = this.calculatePnLAtExpiration(strategy, price);
      points.push({ price: +price.toFixed(2), profit: +profit.toFixed(2) });
    }

    return points;
  }

  // ==========================================================================
  // MAX PROFIT / MAX LOSS
  // ==========================================================================

  /**
   * Calculate max profit and max loss.
   * For strategies with stock legs, tests extreme prices.
   * For options-only strategies, uses critical prices (strikes, 0, 2×S).
   */
  private calculateMaxProfitLoss(
    strategy: StrategyDefinition,
    pnlData: PnLPoint[],
  ): { maxProfit: number; maxLoss: number } {
    const hasStock = strategy.legs.some(l => l.type === 'stock');

    // Test critical points: all strikes, 0, high price, and P&L curve extremes
    const criticalPrices = [
      0,
      ...strategy.legs.filter(l => l.type !== 'stock').map(l => l.strike),
      strategy.underlyingPrice * 2,
      strategy.underlyingPrice * 3,
    ];

    const allPnLs = [
      ...pnlData.map(p => p.profit),
      ...criticalPrices.map(p => this.calculatePnLAtExpiration(strategy, p)),
    ];

    let maxProfit = Math.max(...allPnLs);
    let maxLoss = Math.min(...allPnLs);

    // Check for unbounded profit/loss
    if (hasStock) {
      // Stock + options: profit unbounded upward (unless fully covered)
      const longCalls = strategy.legs.filter(l => l.type === 'call' && l.quantity > 0);
      const shortCalls = strategy.legs.filter(l => l.type === 'call' && l.quantity < 0);
      const stockQty = strategy.legs.filter(l => l.type === 'stock').reduce((s, l) => s + l.quantity, 0);

      // Covered call: upside is capped at short call strike
      if (shortCalls.length > 0 && stockQty > 0 && longCalls.length === 0) {
        // Max profit is at/above short call strike
        const cappedPrice = Math.max(...shortCalls.map(l => l.strike));
        maxProfit = this.calculatePnLAtExpiration(strategy, cappedPrice);
      }

      // Protective put: max loss is at/below put strike
      const longPuts = strategy.legs.filter(l => l.type === 'put' && l.quantity > 0);
      if (longPuts.length > 0 && stockQty > 0) {
        const floorPrice = Math.min(...longPuts.map(l => l.strike));
        maxLoss = this.calculatePnLAtExpiration(strategy, floorPrice);
        // Profit unbounded (stock rises indefinitely)
        maxProfit = Infinity;
      }

      // If still has stock without protection, loss extends to 0
      if (longPuts.length === 0 && stockQty > 0) {
        maxLoss = this.calculatePnLAtExpiration(strategy, 0);
      }
    } else {
      // Options-only: check slope at extremes for unboundedness
      const veryHighPrice = strategy.underlyingPrice * 10;
      const veryHighPnL = this.calculatePnLAtExpiration(strategy, veryHighPrice);
      const highPnL = this.calculatePnLAtExpiration(strategy, strategy.underlyingPrice * 3);

      if (veryHighPnL > highPnL * 2 && veryHighPnL > maxProfit * 2) {
        maxProfit = Infinity;
      }
      if (veryHighPnL < highPnL * 2 && veryHighPnL < maxLoss * 2) {
        maxLoss = -Infinity;
      }

      const zeroPnL = this.calculatePnLAtExpiration(strategy, 0);
      if (zeroPnL < maxLoss) maxLoss = zeroPnL;
      if (zeroPnL > maxProfit) maxProfit = zeroPnL;
    }

    return { maxProfit, maxLoss };
  }

  // ==========================================================================
  // BREAKEVEN
  // ==========================================================================

  /**
   * Find breakeven prices by scanning P&L data for sign changes.
   */
  private calculateBreakevens(
    strategy: StrategyDefinition,
    pnlData: PnLPoint[],
  ): number[] {
    const breakevens: number[] = [];

    for (let i = 1; i < pnlData.length; i++) {
      const prev = pnlData[i - 1];
      const curr = pnlData[i];

      // Sign change or exact zero
      if (prev.profit * curr.profit < 0) {
        // Linear interpolation for exact breakeven
        const ratio = Math.abs(prev.profit) / (Math.abs(prev.profit) + Math.abs(curr.profit));
        const be = prev.price + ratio * (curr.price - prev.price);
        breakevens.push(+be.toFixed(2));
      } else if (curr.profit === 0) {
        breakevens.push(curr.price);
      }
    }

    // Refine with analytical breakevens for known strategy types
    const analytical = this.analyticalBreakevens(strategy);
    if (analytical.length > 0) return analytical;

    return breakevens;
  }

  /**
   * Calculate analytical breakeven prices for known strategy types.
   */
  private analyticalBreakevens(strategy: StrategyDefinition): number[] {
    const legs = strategy.legs;

    switch (strategy.type) {
      case 'covered_call': {
        // BE = purchase price - call premium received
        const stock = legs.find(l => l.type === 'stock')!;
        const call = legs.find(l => l.type === 'call')!;
        return [+(stock.premium + call.premium).toFixed(2)];
      }

      case 'protective_put': {
        // BE = purchase price + put premium paid
        const stock = legs.find(l => l.type === 'stock')!;
        const put = legs.find(l => l.type === 'put')!;
        return [+(stock.premium + put.premium).toFixed(2)];
      }

      case 'bull_call_spread': {
        // BE = long strike + net debit
        const netDebit = this.calculateNetDebit(strategy);
        const longCall = legs.find(l => l.type === 'call' && l.quantity > 0)!;
        return [+(longCall.strike + netDebit).toFixed(2)];
      }

      case 'bear_put_spread': {
        // BE = long put strike - net debit
        const netDebit = this.calculateNetDebit(strategy);
        const longPut = legs.find(l => l.type === 'put' && l.quantity > 0)!;
        return [+(longPut.strike - netDebit).toFixed(2)];
      }

      case 'iron_condor': {
        // Two breakevens: short put - net credit, short call + net credit
        const netCredit = -this.calculateNetDebit(strategy); // Iron condor is a credit strategy
        const shortPut = legs.find(l => l.type === 'put' && l.quantity < 0)!;
        const shortCall = legs.find(l => l.type === 'call' && l.quantity < 0)!;
        return [
          +(shortPut.strike - netCredit).toFixed(2),
          +(shortCall.strike + netCredit).toFixed(2),
        ];
      }

      case 'straddle': {
        // Two breakevens: strike - total premium, strike + total premium
        const netDebit = this.calculateNetDebit(strategy);
        const strike = legs[0].strike;
        return [
          +(strike - netDebit).toFixed(2),
          +(strike + netDebit).toFixed(2),
        ];
      }

      case 'strangle': {
        // Two breakevens: put strike - total premium, call strike + total premium
        const netDebit = this.calculateNetDebit(strategy);
        const put = legs.find(l => l.type === 'put')!;
        const call = legs.find(l => l.type === 'call')!;
        return [
          +(put.strike - netDebit).toFixed(2),
          +(call.strike + netDebit).toFixed(2),
        ];
      }

      default:
        return [];
    }
  }

  // ==========================================================================
  // PROBABILITY OF PROFIT
  // ==========================================================================

  /**
   * Estimate probability of profit using the lognormal distribution.
   * P(S > X) = N(-d2) for a call breakeven, P(S < X) = N(d2) for a put breakeven.
   *
   * Uses average IV across legs (or a default 0.25) and time to expiration.
   */
  calculateProbabilityOfProfit(
    strategy: StrategyDefinition,
    breakevens: number[],
  ): number {
    if (breakevens.length === 0) return 1; // Always profitable

    const S = strategy.underlyingPrice;
    const T = this.estimateTimeToExpiry(strategy);
    const iv = this.estimateStrategyIV(strategy);
    const r = this.riskFreeRate;

    if (T <= 0) {
      // Already expired: check current P&L
      return this.calculatePnLAtExpiration(strategy, S) >= 0 ? 1 : 0;
    }

    // For strategies with one breakeven:
    if (breakevens.length === 1) {
      const be = breakevens[0];
      // Need to determine if profit is above or below breakeven
      const pnlAbove = this.calculatePnLAtExpiration(strategy, be + 1);
      const pnlBelow = this.calculatePnLAtExpiration(strategy, be - 1);

      const d2 = (Math.log(S / be) + (r - 0.5 * iv * iv) * T) / (iv * Math.sqrt(T));

      if (pnlAbove > pnlBelow) {
        // Profit when price is above breakeven
        return normalCDF(d2);
      } else {
        // Profit when price is below breakeven
        return normalCDF(-d2);
      }
    }

    // For strategies with two breakevens (iron condor, straddle, strangle):
    if (breakevens.length === 2) {
      const [beLow, beHigh] = breakevens.sort((a, b) => a - b);
      const pnlMiddle = this.calculatePnLAtExpiration(strategy, (beLow + beHigh) / 2);

      const d2Low = (Math.log(S / beLow) + (r - 0.5 * iv * iv) * T) / (iv * Math.sqrt(T));
      const d2High = (Math.log(S / beHigh) + (r - 0.5 * iv * iv) * T) / (iv * Math.sqrt(T));

      if (pnlMiddle > 0) {
        // Profit between breakevens (iron condor)
        return normalCDF(d2Low) - normalCDF(d2High);
      } else {
        // Profit outside breakevens (straddle/strangle)
        return normalCDF(-d2Low) + normalCDF(d2High);
      }
    }

    // Fallback for complex strategies: use P&L data
    return this.estimatePoPFromPnL(strategy);
  }

  // ==========================================================================
  // NET DEBIT / CREDIT
  // ==========================================================================

  /**
   * Calculate net debit (positive) or credit (negative) of a strategy.
   * Excludes stock legs — only counts option premiums.
   */
  calculateNetDebit(strategy: StrategyDefinition): number {
    let netDebit = 0;
    for (const leg of strategy.legs) {
      if (leg.type === 'stock') continue;
      // quantity > 0 + premium > 0 = paid (debit)
      // quantity < 0 + premium < 0 = received (credit, but neg*neg=positive, then negate)
      netDebit += leg.quantity * leg.premium;
    }
    return +netDebit.toFixed(2);
  }

  // ==========================================================================
  // STRATEGY RECOMMENDATION
  // ==========================================================================

  /**
   * Recommend strategies based on IV rank (0-100) and market regime.
   * Returns scored recommendations sorted by suitability.
   */
  recommendStrategies(
    ivRank: number,
    regime: 'bull' | 'bear' | 'sideways' | 'volatile',
  ): StrategyRecommendation[] {
    const recommendations: StrategyRecommendation[] = [];

    // High IV (rank > 60): sell premium strategies
    // Low IV (rank < 40): buy premium strategies
    // Middle: directional strategies based on regime

    const highIV = ivRank > 60;
    const lowIV = ivRank < 40;

    // Covered call: best in neutral-to-slightly-bullish, high IV
    recommendations.push({
      type: 'covered_call',
      name: 'Covered Call',
      rationale: highIV
        ? 'IV is elevated — sell calls against stock to capture high premiums.'
        : 'Generate income on existing stock position.',
      outlook: 'neutral',
      score: this.scoreStrategy('covered_call', ivRank, regime),
    });

    // Protective put: best in bullish but worried, low IV
    recommendations.push({
      type: 'protective_put',
      name: 'Protective Put',
      rationale: lowIV
        ? 'IV is depressed — cheap insurance for your stock position.'
        : 'Protect stock gains with a floor on losses.',
      outlook: 'bullish',
      score: this.scoreStrategy('protective_put', ivRank, regime),
    });

    // Bull call spread: bullish, moderate IV
    recommendations.push({
      type: 'bull_call_spread',
      name: 'Bull Call Spread',
      rationale: regime === 'bull'
        ? 'Bullish market regime — defined-risk upside exposure.'
        : 'Defined-risk bullish bet with known max loss.',
      outlook: 'bullish',
      score: this.scoreStrategy('bull_call_spread', ivRank, regime),
    });

    // Bear put spread: bearish, moderate IV
    recommendations.push({
      type: 'bear_put_spread',
      name: 'Bear Put Spread',
      rationale: regime === 'bear'
        ? 'Bearish market regime — defined-risk downside exposure.'
        : 'Defined-risk bearish bet with known max loss.',
      outlook: 'bearish',
      score: this.scoreStrategy('bear_put_spread', ivRank, regime),
    });

    // Iron condor: neutral/sideways, high IV
    recommendations.push({
      type: 'iron_condor',
      name: 'Iron Condor',
      rationale: highIV && (regime === 'sideways' || regime === 'bull')
        ? 'High IV + sideways regime — ideal for selling premium with defined risk.'
        : 'Profit from range-bound price action.',
      outlook: 'neutral',
      score: this.scoreStrategy('iron_condor', ivRank, regime),
    });

    // Straddle: volatile regime, low IV
    recommendations.push({
      type: 'straddle',
      name: 'Long Straddle',
      rationale: lowIV
        ? 'IV is cheap — buy volatility before a potential breakout.'
        : 'Profit from large moves in either direction.',
      outlook: 'volatile',
      score: this.scoreStrategy('straddle', ivRank, regime),
    });

    // Strangle: volatile regime, low IV (cheaper than straddle)
    recommendations.push({
      type: 'strangle',
      name: 'Long Strangle',
      rationale: lowIV
        ? 'IV is cheap — cheaper than a straddle, needs a bigger move.'
        : 'Profit from large moves with lower capital outlay than a straddle.',
      outlook: 'volatile',
      score: this.scoreStrategy('strangle', ivRank, regime),
    });

    return recommendations.sort((a, b) => b.score - a.score);
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  /**
   * Score a strategy based on IV rank and regime (0-1).
   */
  private scoreStrategy(
    type: StrategyType,
    ivRank: number,
    regime: 'bull' | 'bear' | 'sideways' | 'volatile',
  ): number {
    // IV factor: 0-1, higher means higher IV rank
    const ivFactor = ivRank / 100;

    // Strategy-specific scoring
    switch (type) {
      case 'covered_call':
        // Prefers high IV, neutral/bull regime
        return (
          ivFactor * 0.4 +
          (regime === 'sideways' ? 0.3 : regime === 'bull' ? 0.2 : 0.05) +
          0.2 // Base (always somewhat suitable for stock holders)
        );

      case 'protective_put':
        // Prefers low IV (cheap), bear/volatile regime
        return (
          (1 - ivFactor) * 0.4 +
          (regime === 'bear' ? 0.3 : regime === 'volatile' ? 0.25 : 0.05) +
          0.1
        );

      case 'bull_call_spread':
        // Prefers moderate IV, bull regime
        return (
          (1 - Math.abs(ivFactor - 0.5) * 2) * 0.3 +
          (regime === 'bull' ? 0.4 : regime === 'sideways' ? 0.1 : 0.0) +
          0.1
        );

      case 'bear_put_spread':
        // Prefers moderate IV, bear regime
        return (
          (1 - Math.abs(ivFactor - 0.5) * 2) * 0.3 +
          (regime === 'bear' ? 0.4 : regime === 'volatile' ? 0.1 : 0.0) +
          0.1
        );

      case 'iron_condor':
        // Prefers high IV, sideways regime
        return (
          ivFactor * 0.4 +
          (regime === 'sideways' ? 0.4 : regime === 'bull' ? 0.1 : 0.0) +
          0.05
        );

      case 'straddle':
        // Prefers low IV, volatile regime
        return (
          (1 - ivFactor) * 0.4 +
          (regime === 'volatile' ? 0.4 : regime === 'bear' ? 0.1 : 0.0) +
          0.05
        );

      case 'strangle':
        // Prefers low IV, volatile regime (slightly less than straddle)
        return (
          (1 - ivFactor) * 0.4 +
          (regime === 'volatile' ? 0.35 : regime === 'bear' ? 0.1 : 0.0) +
          0.05
        );

      default:
        return 0.5;
    }
  }

  /**
   * Estimate time to expiry from the strategy legs.
   */
  private estimateTimeToExpiry(strategy: StrategyDefinition): number {
    const optionLegs = strategy.legs.filter(l => l.type !== 'stock');
    if (optionLegs.length === 0) return 0;

    const expDate = new Date(optionLegs[0].expiration);
    const now = new Date();
    const msToExpiry = expDate.getTime() - now.getTime();
    return Math.max(0, msToExpiry / (this.daysInYear * 24 * 60 * 60 * 1000));
  }

  /**
   * Estimate average IV across strategy legs.
   */
  private estimateStrategyIV(strategy: StrategyDefinition): number {
    const ivValues = strategy.legs
      .filter(l => l.impliedVolatility !== undefined && l.impliedVolatility > 0)
      .map(l => l.impliedVolatility!);

    return ivValues.length > 0
      ? ivValues.reduce((a, b) => a + b, 0) / ivValues.length
      : 0.25; // Default 25%
  }

  /**
   * Estimate PoP from P&L data by Monte Carlo-like sampling.
   * Uses the lognormal assumption.
   */
  private estimatePoPFromPnL(strategy: StrategyDefinition): number {
    const S = strategy.underlyingPrice;
    const T = this.estimateTimeToExpiry(strategy);
    const iv = this.estimateStrategyIV(strategy);

    if (T <= 0) {
      return this.calculatePnLAtExpiration(strategy, S) >= 0 ? 1 : 0;
    }

    // Sample 1000 lognormal endpoints and count profitable ones
    let profitable = 0;
    const n = 1000;
    const drift = (this.riskFreeRate - 0.5 * iv * iv) * T;
    const diffusion = iv * Math.sqrt(T);

    for (let i = 0; i < n; i++) {
      // Inverse CDF of uniform for standard normal approximation
      const u = (i + 0.5) / n;
      const z = this.inverseNormalCDF(u);
      const futurePrice = S * Math.exp(drift + diffusion * z);
      if (this.calculatePnLAtExpiration(strategy, futurePrice) >= 0) {
        profitable++;
      }
    }

    return profitable / n;
  }

  /**
   * Rational approximation of the inverse normal CDF.
   * Beasley-Springer-Moro algorithm.
   */
  private inverseNormalCDF(p: number): number {
    if (p <= 0) return -8;
    if (p >= 1) return 8;

    // Rational approximation for central region
    if (p > 0.5) return -this.inverseNormalCDF(1 - p);

    const t = Math.sqrt(-2 * Math.log(p));
    const c0 = 2.515517;
    const c1 = 0.802853;
    const c2 = 0.010328;
    const d1 = 1.432788;
    const d2 = 0.189269;
    const d3 = 0.001308;

    return -(t - (c0 + c1 * t + c2 * t * t) / (1 + d1 * t + d2 * t * t + d3 * t * t * t));
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const strategyBuilder = new StrategyBuilder();
