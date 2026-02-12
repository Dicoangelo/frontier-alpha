/**
 * Tax-Efficient Rebalancer — Considers tax implications when rebalancing portfolios
 *
 * Extends the optimizer's target weights with tax-aware trade selection:
 * - Compares tax cost of each potential trade (short-term gain vs long-term gain vs loss)
 * - Prefers selling long-term positions over short-term when gains are similar
 * - Defers selling positions close to the long-term threshold (e.g., 10 months held)
 * - Integrates with HarvestingScanner to combine rebalancing with harvesting
 *
 * Wave B: Tax Optimization — US-027
 */

import type { TaxLotTracker, TaxLot, UnrealizedGain } from './TaxLotTracker.js';
import type { HarvestingScanner, HarvestingScanResult } from './HarvestingScanner.js';

// ============================================================================
// Types
// ============================================================================

export interface TargetAllocation {
  symbol: string;
  targetWeight: number; // 0-1
}

export interface RebalanceTrade {
  symbol: string;
  action: 'buy' | 'sell';
  shares: number;
  estimatedValue: number;
  taxCost: number; // estimated tax on realized gain (0 for buys, positive for taxable sells, negative for harvested losses)
  isShortTerm: boolean;
  holdingDays: number;
  reason: string;
  deferred: boolean; // true if the trade was deferred due to LT threshold proximity
  lotSelections: LotSelection[];
}

export interface LotSelection {
  lotId: string;
  shares: number;
  costBasis: number;
  gain: number;
  isShortTerm: boolean;
  holdingDays: number;
  taxCost: number;
}

export interface RebalanceResult {
  trades: RebalanceTrade[];
  totalTaxCost: number;
  taxSavingsFromHarvesting: number;
  deferredTrades: RebalanceTrade[];
  harvestingOpportunities: HarvestingScanResult | null;
  portfolioDeviation: number; // sum of |current - target| weight deviations after rebalance
}

export interface TaxEfficientRebalancerConfig {
  /** Short-term capital gains tax rate (federal, default 0.37) */
  shortTermTaxRate: number;
  /** Long-term capital gains tax rate (federal, default 0.20) */
  longTermTaxRate: number;
  /** State tax rate added to both (default 0.05) */
  stateTaxRate: number;
  /** Long-term holding threshold in days (default 365) */
  longTermThresholdDays: number;
  /** Days before LT threshold to defer selling (default 60 ≈ 2 months) */
  deferralWindowDays: number;
  /** Minimum trade value to execute (default $50) */
  minimumTradeValue: number;
  /** Maximum deviation from target before forcing a trade despite tax cost (default 0.05 = 5%) */
  maxDeviationThreshold: number;
  /** Whether to integrate tax-loss harvesting into rebalancing (default true) */
  enableHarvesting: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ============================================================================
// TaxEfficientRebalancer
// ============================================================================

export class TaxEfficientRebalancer {
  private config: TaxEfficientRebalancerConfig;

  constructor(config?: Partial<TaxEfficientRebalancerConfig>) {
    this.config = {
      shortTermTaxRate: config?.shortTermTaxRate ?? 0.37,
      longTermTaxRate: config?.longTermTaxRate ?? 0.20,
      stateTaxRate: config?.stateTaxRate ?? 0.05,
      longTermThresholdDays: config?.longTermThresholdDays ?? 365,
      deferralWindowDays: config?.deferralWindowDays ?? 60,
      minimumTradeValue: config?.minimumTradeValue ?? 50,
      maxDeviationThreshold: config?.maxDeviationThreshold ?? 0.05,
      enableHarvesting: config?.enableHarvesting ?? true,
    };
  }

  /**
   * Generate tax-efficient rebalancing trades.
   *
   * Given target weights, current positions (via TaxLotTracker), and current prices,
   * produces a set of trades that move toward the target allocation while minimizing
   * tax drag.
   */
  rebalance(
    tracker: TaxLotTracker,
    userId: string,
    targetAllocations: TargetAllocation[],
    currentPrices: Map<string, number>,
    totalPortfolioValue: number,
    harvestingScanner?: HarvestingScanner,
    asOfDate?: Date
  ): RebalanceResult {
    const refDate = asOfDate ?? new Date();
    const unrealizedGains = tracker.calculateUnrealizedGains(userId, currentPrices, refDate);
    const positionMap = new Map<string, UnrealizedGain>();
    for (const pos of unrealizedGains) {
      positionMap.set(pos.symbol, pos);
    }

    // Step 1: Compute required trades (deltas)
    const deltas = this.computeDeltas(targetAllocations, positionMap, currentPrices, totalPortfolioValue);

    // Step 2: Run harvesting scan if enabled
    let harvestingResult: HarvestingScanResult | null = null;
    if (this.config.enableHarvesting && harvestingScanner) {
      harvestingResult = harvestingScanner.scan(tracker, userId, currentPrices);
    }

    // Step 3: Generate tax-efficient trades
    const trades: RebalanceTrade[] = [];
    const deferredTrades: RebalanceTrade[] = [];
    let totalTaxCost = 0;
    let taxSavingsFromHarvesting = 0;

    for (const delta of deltas) {
      if (Math.abs(delta.valueChange) < this.config.minimumTradeValue) continue;

      if (delta.valueChange < 0) {
        // Selling — need tax-aware lot selection
        const sharesToSell = Math.abs(delta.valueChange) / (currentPrices.get(delta.symbol) ?? 1);
        const openLots = tracker.getOpenLots(userId, delta.symbol);
        const price = currentPrices.get(delta.symbol) ?? 0;

        const { selections, deferred } = this.selectLotsForSale(
          openLots, sharesToSell, price, refDate, delta.deviation
        );

        if (selections.length === 0 && !deferred) continue;

        const totalShares = selections.reduce((s, l) => s + l.shares, 0);
        const tradeTaxCost = selections.reduce((s, l) => s + l.taxCost, 0);
        const isShortTerm = selections.some((l) => l.isShortTerm);
        const avgHoldingDays = selections.length > 0
          ? Math.round(selections.reduce((s, l) => s + l.holdingDays * l.shares, 0) / Math.max(totalShares, 1))
          : 0;

        // Check if this is also a harvesting opportunity
        const isHarvest =
          harvestingResult?.opportunities.some((o) => o.symbol === delta.symbol) ?? false;
        if (isHarvest && tradeTaxCost < 0) {
          taxSavingsFromHarvesting += Math.abs(tradeTaxCost);
        }

        const trade: RebalanceTrade = {
          symbol: delta.symbol,
          action: 'sell',
          shares: totalShares,
          estimatedValue: totalShares * price,
          taxCost: tradeTaxCost,
          isShortTerm,
          holdingDays: avgHoldingDays,
          reason: this.generateSellReason(selections, deferred, isHarvest),
          deferred,
          lotSelections: selections,
        };

        if (deferred) {
          deferredTrades.push(trade);
        } else {
          trades.push(trade);
          totalTaxCost += tradeTaxCost;
        }
      } else {
        // Buying — no tax implications
        const price = currentPrices.get(delta.symbol) ?? 1;
        const sharesToBuy = delta.valueChange / price;

        trades.push({
          symbol: delta.symbol,
          action: 'buy',
          shares: sharesToBuy,
          estimatedValue: delta.valueChange,
          taxCost: 0,
          isShortTerm: false,
          holdingDays: 0,
          reason: 'Rebalance: increase weight toward target allocation',
          deferred: false,
          lotSelections: [],
        });
      }
    }

    // Calculate remaining portfolio deviation after proposed trades
    const portfolioDeviation = this.calculateResidualDeviation(
      targetAllocations, positionMap, trades, deferredTrades, currentPrices, totalPortfolioValue
    );

    return {
      trades,
      totalTaxCost,
      taxSavingsFromHarvesting,
      deferredTrades,
      harvestingOpportunities: harvestingResult,
      portfolioDeviation,
    };
  }

  /**
   * Estimate the tax cost of selling a specific lot at the current price.
   */
  estimateLotTaxCost(lot: TaxLot, currentPrice: number, asOfDate?: Date): number {
    const refDate = asOfDate ?? new Date();
    const holdingDays = Math.floor(
      (refDate.getTime() - lot.purchaseDate.getTime()) / MS_PER_DAY
    );
    const isShortTerm = holdingDays < this.config.longTermThresholdDays;
    const gain = (currentPrice - lot.costBasis) * lot.shares;

    if (gain <= 0) {
      // Loss — negative tax cost (tax benefit)
      const rate = isShortTerm ? this.effectiveShortTermRate() : this.effectiveLongTermRate();
      return gain * rate; // negative value = tax savings
    }

    const rate = isShortTerm ? this.effectiveShortTermRate() : this.effectiveLongTermRate();
    return gain * rate;
  }

  /**
   * Check if a lot is near the long-term threshold and should be deferred.
   */
  isNearLongTermThreshold(lot: TaxLot, asOfDate?: Date): boolean {
    const refDate = asOfDate ?? new Date();
    const holdingDays = Math.floor(
      (refDate.getTime() - lot.purchaseDate.getTime()) / MS_PER_DAY
    );
    const daysUntilLongTerm = this.config.longTermThresholdDays - holdingDays;
    return daysUntilLongTerm > 0 && daysUntilLongTerm <= this.config.deferralWindowDays;
  }

  /**
   * Get effective short-term tax rate (federal + state).
   */
  effectiveShortTermRate(): number {
    return this.config.shortTermTaxRate + this.config.stateTaxRate;
  }

  /**
   * Get effective long-term tax rate (federal + state).
   */
  effectiveLongTermRate(): number {
    return this.config.longTermTaxRate + this.config.stateTaxRate;
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  /**
   * Compute the value change needed for each symbol to reach target allocation.
   */
  private computeDeltas(
    targets: TargetAllocation[],
    positions: Map<string, UnrealizedGain>,
    currentPrices: Map<string, number>,
    totalValue: number
  ): Array<{ symbol: string; valueChange: number; deviation: number }> {
    const deltas: Array<{ symbol: string; valueChange: number; deviation: number }> = [];

    for (const target of targets) {
      const sym = target.symbol.toUpperCase();
      const position = positions.get(sym);
      const currentValue = position?.currentValue ?? 0;
      const targetValue = target.targetWeight * totalValue;
      const valueChange = targetValue - currentValue;
      const currentWeight = currentValue / totalValue;
      const deviation = Math.abs(currentWeight - target.targetWeight);

      deltas.push({ symbol: sym, valueChange, deviation });
    }

    return deltas;
  }

  /**
   * Select lots to sell in a tax-efficient order.
   *
   * Priority:
   * 1. Lots with losses (tax benefit, regardless of holding period)
   * 2. Long-term gain lots (lower tax rate)
   * 3. Short-term gain lots (highest tax rate, least preferred)
   *
   * Lots near the LT threshold are deferred unless the deviation exceeds maxDeviationThreshold.
   */
  private selectLotsForSale(
    openLots: TaxLot[],
    sharesToSell: number,
    currentPrice: number,
    refDate: Date,
    deviation: number
  ): { selections: LotSelection[]; deferred: boolean } {
    const forceExecution = deviation >= this.config.maxDeviationThreshold;

    // Annotate lots with tax info
    const annotated = openLots.map((lot) => {
      const holdingDays = Math.floor(
        (refDate.getTime() - lot.purchaseDate.getTime()) / MS_PER_DAY
      );
      const isShortTerm = holdingDays < this.config.longTermThresholdDays;
      const gainPerShare = currentPrice - lot.costBasis;
      const isLoss = gainPerShare < 0;
      const nearThreshold = this.isNearLongTermThreshold(lot, refDate);
      const rate = isShortTerm ? this.effectiveShortTermRate() : this.effectiveLongTermRate();
      const taxCostPerShare = gainPerShare * rate;

      return {
        lot,
        holdingDays,
        isShortTerm,
        gainPerShare,
        isLoss,
        nearThreshold,
        taxCostPerShare,
      };
    });

    // Separate deferrable lots (near LT threshold with gains) from sellable lots
    const deferrable: typeof annotated = [];
    const sellable: typeof annotated = [];

    for (const entry of annotated) {
      if (entry.nearThreshold && !entry.isLoss && !forceExecution) {
        deferrable.push(entry);
      } else {
        sellable.push(entry);
      }
    }

    // Sort sellable lots by tax efficiency (lowest tax cost first):
    // 1. Losses first (negative tax cost = benefit)
    // 2. Long-term gains (lower rate)
    // 3. Short-term gains (highest rate)
    sellable.sort((a, b) => a.taxCostPerShare - b.taxCostPerShare);

    // Fill the sell order from the sorted sellable lots
    let remaining = sharesToSell;
    const selections: LotSelection[] = [];

    for (const entry of sellable) {
      if (remaining <= 0) break;

      const sharesToTake = Math.min(remaining, entry.lot.shares);
      const gain = entry.gainPerShare * sharesToTake;
      const taxCost = entry.taxCostPerShare * sharesToTake;

      selections.push({
        lotId: entry.lot.id,
        shares: sharesToTake,
        costBasis: entry.lot.costBasis,
        gain,
        isShortTerm: entry.isShortTerm,
        holdingDays: entry.holdingDays,
        taxCost,
      });

      remaining -= sharesToTake;
    }

    // If we couldn't fill the order and there are deferred lots, indicate deferral
    const deferred = remaining > 0 && deferrable.length > 0;

    return { selections, deferred };
  }

  /**
   * Generate a human-readable reason for a sell trade.
   */
  private generateSellReason(
    selections: LotSelection[],
    deferred: boolean,
    isHarvest: boolean
  ): string {
    const parts: string[] = [];

    if (isHarvest) {
      parts.push('Tax-loss harvest opportunity');
    } else {
      parts.push('Rebalance: reduce weight toward target allocation');
    }

    const hasLosses = selections.some((s) => s.gain < 0);
    const hasLTGains = selections.some((s) => s.gain >= 0 && !s.isShortTerm);
    const hasSTGains = selections.some((s) => s.gain >= 0 && s.isShortTerm);

    if (hasLosses) parts.push('selling loss lots first for tax benefit');
    if (hasLTGains && !hasSTGains) parts.push('selling long-term lots at lower tax rate');
    if (hasSTGains) parts.push('includes short-term lots (higher tax rate)');
    if (deferred) parts.push('some lots deferred — approaching long-term threshold');

    return parts.join('; ');
  }

  /**
   * Calculate the residual portfolio deviation after applying proposed trades.
   */
  private calculateResidualDeviation(
    targets: TargetAllocation[],
    positions: Map<string, UnrealizedGain>,
    executedTrades: RebalanceTrade[],
    deferredTrades: RebalanceTrade[],
    currentPrices: Map<string, number>,
    totalValue: number
  ): number {
    // Build a map of post-trade values
    const postValues = new Map<string, number>();
    for (const [sym, pos] of positions) {
      postValues.set(sym, pos.currentValue);
    }

    // Apply executed trades
    for (const trade of executedTrades) {
      const current = postValues.get(trade.symbol) ?? 0;
      if (trade.action === 'buy') {
        postValues.set(trade.symbol, current + trade.estimatedValue);
      } else {
        postValues.set(trade.symbol, current - trade.estimatedValue);
      }
    }

    // Deferred trades are NOT applied — that's the point of deferral

    let totalDeviation = 0;
    for (const target of targets) {
      const sym = target.symbol.toUpperCase();
      const postValue = postValues.get(sym) ?? 0;
      const postWeight = postValue / totalValue;
      totalDeviation += Math.abs(postWeight - target.targetWeight);
    }

    return totalDeviation;
  }
}
