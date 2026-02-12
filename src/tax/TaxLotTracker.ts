/**
 * Tax Lot Tracker - Tracks cost basis, holding periods, and tax implications
 *
 * Supports multiple cost basis methods:
 * - FIFO (First In, First Out)
 * - LIFO (Last In, First Out)
 * - Specific Identification (user picks which lot to sell)
 *
 * Wave B: Tax Optimization foundation
 */

// ============================================================================
// Types
// ============================================================================

export type CostBasisMethod = 'fifo' | 'lifo' | 'specific';

export type TaxEventType =
  | 'realized_gain'
  | 'realized_loss'
  | 'wash_sale'
  | 'dividend'
  | 'return_of_capital';

export interface TaxLot {
  id: string;
  userId: string;
  symbol: string;
  shares: number;
  costBasis: number; // per-share cost basis
  purchaseDate: Date;
  soldDate: Date | null;
}

export interface TaxEvent {
  id: string;
  userId: string;
  taxYear: number;
  eventType: TaxEventType;
  symbol: string;
  realizedGain: number;
  isWashSale: boolean;
  taxLotId: string | null;
  shares: number;
  salePrice: number;
  costBasis: number; // per-share
  saleDate: Date;
}

export interface SaleResult {
  totalProceeds: number;
  totalCostBasis: number;
  realizedGain: number;
  isShortTerm: boolean;
  events: TaxEvent[];
  remainingLots: TaxLot[];
}

export interface UnrealizedGain {
  symbol: string;
  totalShares: number;
  totalCostBasis: number;
  currentValue: number;
  unrealizedGain: number;
  unrealizedGainPercent: number;
  lots: Array<{
    lotId: string;
    shares: number;
    costBasis: number;
    currentValue: number;
    gain: number;
    gainPercent: number;
    isShortTerm: boolean;
    holdingDays: number;
  }>;
}

export interface TaxSummary {
  taxYear: number;
  shortTermGains: number;
  shortTermLosses: number;
  longTermGains: number;
  longTermLosses: number;
  netShortTerm: number;
  netLongTerm: number;
  totalRealizedGain: number;
  washSaleAdjustment: number;
  eventCount: number;
}

export interface TaxLotTrackerConfig {
  defaultMethod: CostBasisMethod;
  washSaleWindowDays: number; // IRS wash sale rule: 30 days before/after
  longTermThresholdDays: number; // 365 days for long-term classification
}

// ============================================================================
// Constants
// ============================================================================

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_WASH_SALE_WINDOW = 30;
const DEFAULT_LONG_TERM_THRESHOLD = 365;

// ============================================================================
// TaxLotTracker
// ============================================================================

export class TaxLotTracker {
  private lots: Map<string, TaxLot> = new Map();
  private events: TaxEvent[] = [];
  private config: TaxLotTrackerConfig;
  private nextId = 1;

  constructor(config?: Partial<TaxLotTrackerConfig>) {
    this.config = {
      defaultMethod: config?.defaultMethod ?? 'fifo',
      washSaleWindowDays: config?.washSaleWindowDays ?? DEFAULT_WASH_SALE_WINDOW,
      longTermThresholdDays: config?.longTermThresholdDays ?? DEFAULT_LONG_TERM_THRESHOLD,
    };
  }

  // --------------------------------------------------------------------------
  // Lot Management
  // --------------------------------------------------------------------------

  /**
   * Add a new tax lot (buy shares)
   */
  addLot(
    userId: string,
    symbol: string,
    shares: number,
    costBasisPerShare: number,
    purchaseDate: Date
  ): TaxLot {
    if (shares <= 0) throw new Error('Shares must be positive');
    if (costBasisPerShare <= 0) throw new Error('Cost basis must be positive');

    const lot: TaxLot = {
      id: `tl_${this.nextId++}`,
      userId,
      symbol: symbol.toUpperCase(),
      shares,
      costBasis: costBasisPerShare,
      purchaseDate: new Date(purchaseDate),
      soldDate: null,
    };

    this.lots.set(lot.id, lot);
    return lot;
  }

  /**
   * Get all open (unsold) lots for a user+symbol
   */
  getOpenLots(userId: string, symbol?: string): TaxLot[] {
    const lots: TaxLot[] = [];
    for (const lot of this.lots.values()) {
      if (lot.userId !== userId) continue;
      if (lot.soldDate !== null) continue;
      if (symbol && lot.symbol !== symbol.toUpperCase()) continue;
      lots.push(lot);
    }
    return lots;
  }

  /**
   * Get all lots (open and closed)
   */
  getAllLots(userId: string): TaxLot[] {
    const lots: TaxLot[] = [];
    for (const lot of this.lots.values()) {
      if (lot.userId === userId) lots.push(lot);
    }
    return lots;
  }

  // --------------------------------------------------------------------------
  // Sale Processing
  // --------------------------------------------------------------------------

  /**
   * Sell shares using the specified cost basis method.
   * Returns sale result with realized gain/loss and tax events.
   */
  sellShares(
    userId: string,
    symbol: string,
    sharesToSell: number,
    salePrice: number,
    saleDate: Date,
    method?: CostBasisMethod,
    specificLotIds?: string[]
  ): SaleResult {
    if (sharesToSell <= 0) throw new Error('Shares to sell must be positive');
    if (salePrice <= 0) throw new Error('Sale price must be positive');

    const costMethod = method ?? this.config.defaultMethod;
    const sym = symbol.toUpperCase();
    const openLots = this.getOpenLots(userId, sym);

    const totalAvailable = openLots.reduce((sum, lot) => sum + lot.shares, 0);
    if (totalAvailable < sharesToSell) {
      throw new Error(
        `Insufficient shares: need ${sharesToSell}, have ${totalAvailable} of ${sym}`
      );
    }

    // Order lots based on method
    const orderedLots = this.orderLots(openLots, costMethod, specificLotIds);

    let remaining = sharesToSell;
    const events: TaxEvent[] = [];
    let totalProceeds = 0;
    let totalCostBasis = 0;
    let hasShortTerm = false;

    for (const lot of orderedLots) {
      if (remaining <= 0) break;

      const sharesToTake = Math.min(remaining, lot.shares);
      const proceeds = sharesToTake * salePrice;
      const cost = sharesToTake * lot.costBasis;
      const gain = proceeds - cost;
      const isShortTerm = this.isShortTermHolding(lot.purchaseDate, saleDate);

      if (isShortTerm) hasShortTerm = true;

      totalProceeds += proceeds;
      totalCostBasis += cost;

      // Check wash sale
      const isWashSale = this.checkWashSale(userId, sym, saleDate, gain);

      // Create tax event
      const event: TaxEvent = {
        id: `te_${this.nextId++}`,
        userId,
        taxYear: saleDate.getFullYear(),
        eventType: isWashSale ? 'wash_sale' : gain >= 0 ? 'realized_gain' : 'realized_loss',
        symbol: sym,
        realizedGain: gain,
        isWashSale,
        taxLotId: lot.id,
        shares: sharesToTake,
        salePrice,
        costBasis: lot.costBasis,
        saleDate: new Date(saleDate),
      };
      events.push(event);
      this.events.push(event);

      // Update lot
      if (sharesToTake >= lot.shares) {
        // Fully consumed
        lot.shares = 0;
        lot.soldDate = new Date(saleDate);
      } else {
        // Partially consumed — split the lot
        const remainingShares = lot.shares - sharesToTake;

        // Create a closed lot for the sold portion
        const closedLot: TaxLot = {
          id: `tl_${this.nextId++}`,
          userId,
          symbol: sym,
          shares: sharesToTake,
          costBasis: lot.costBasis,
          purchaseDate: new Date(lot.purchaseDate),
          soldDate: new Date(saleDate),
        };
        this.lots.set(closedLot.id, closedLot);

        // Update original lot to remaining shares
        lot.shares = remainingShares;
      }

      remaining -= sharesToTake;
    }

    return {
      totalProceeds,
      totalCostBasis,
      realizedGain: totalProceeds - totalCostBasis,
      isShortTerm: hasShortTerm,
      events,
      remainingLots: this.getOpenLots(userId, sym),
    };
  }

  // --------------------------------------------------------------------------
  // Unrealized Gains
  // --------------------------------------------------------------------------

  /**
   * Calculate unrealized gains/losses for current holdings
   */
  calculateUnrealizedGains(
    userId: string,
    currentPrices: Map<string, number>,
    asOfDate?: Date
  ): UnrealizedGain[] {
    const refDate = asOfDate ?? new Date();
    const openLots = this.getOpenLots(userId);

    // Group by symbol
    const bySymbol = new Map<string, TaxLot[]>();
    for (const lot of openLots) {
      const existing = bySymbol.get(lot.symbol) ?? [];
      existing.push(lot);
      bySymbol.set(lot.symbol, existing);
    }

    const results: UnrealizedGain[] = [];

    for (const [symbol, lots] of bySymbol) {
      const price = currentPrices.get(symbol);
      if (price === undefined) continue;

      let totalShares = 0;
      let totalCostBasis = 0;

      const lotDetails = lots.map((lot) => {
        const holdingDays = Math.floor(
          (refDate.getTime() - lot.purchaseDate.getTime()) / MS_PER_DAY
        );
        const isShortTerm = holdingDays < this.config.longTermThresholdDays;
        const currentValue = lot.shares * price;
        const costTotal = lot.shares * lot.costBasis;
        const gain = currentValue - costTotal;
        const gainPercent = costTotal > 0 ? (gain / costTotal) * 100 : 0;

        totalShares += lot.shares;
        totalCostBasis += costTotal;

        return {
          lotId: lot.id,
          shares: lot.shares,
          costBasis: lot.costBasis,
          currentValue,
          gain,
          gainPercent,
          isShortTerm,
          holdingDays,
        };
      });

      const currentValue = totalShares * price;
      const unrealizedGain = currentValue - totalCostBasis;
      const unrealizedGainPercent =
        totalCostBasis > 0 ? (unrealizedGain / totalCostBasis) * 100 : 0;

      results.push({
        symbol,
        totalShares,
        totalCostBasis,
        currentValue,
        unrealizedGain,
        unrealizedGainPercent,
        lots: lotDetails,
      });
    }

    return results;
  }

  // --------------------------------------------------------------------------
  // Tax Summary
  // --------------------------------------------------------------------------

  /**
   * Generate tax summary for a specific year
   */
  getTaxSummary(userId: string, taxYear: number): TaxSummary {
    const yearEvents = this.events.filter(
      (e) => e.userId === userId && e.taxYear === taxYear
    );

    let shortTermGains = 0;
    let shortTermLosses = 0;
    let longTermGains = 0;
    let longTermLosses = 0;
    let washSaleAdjustment = 0;

    for (const event of yearEvents) {
      if (event.eventType === 'dividend' || event.eventType === 'return_of_capital') {
        continue;
      }

      const lot = event.taxLotId ? this.lots.get(event.taxLotId) : null;
      const isShortTerm = lot
        ? this.isShortTermHolding(lot.purchaseDate, event.saleDate)
        : true; // Default to short-term if lot not found

      if (event.isWashSale) {
        washSaleAdjustment += Math.abs(event.realizedGain);
      }

      if (event.realizedGain >= 0) {
        if (isShortTerm) shortTermGains += event.realizedGain;
        else longTermGains += event.realizedGain;
      } else {
        if (isShortTerm) shortTermLosses += event.realizedGain;
        else longTermLosses += event.realizedGain;
      }
    }

    return {
      taxYear,
      shortTermGains,
      shortTermLosses,
      longTermGains,
      longTermLosses,
      netShortTerm: shortTermGains + shortTermLosses,
      netLongTerm: longTermGains + longTermLosses,
      totalRealizedGain: shortTermGains + shortTermLosses + longTermGains + longTermLosses,
      washSaleAdjustment,
      eventCount: yearEvents.length,
    };
  }

  /**
   * Get all events for a user (optionally filtered by year)
   */
  getEvents(userId: string, taxYear?: number): TaxEvent[] {
    return this.events.filter((e) => {
      if (e.userId !== userId) return false;
      if (taxYear !== undefined && e.taxYear !== taxYear) return false;
      return true;
    });
  }

  // --------------------------------------------------------------------------
  // Holding Period
  // --------------------------------------------------------------------------

  /**
   * Check if a holding is short-term (< 1 year threshold)
   */
  isShortTermHolding(purchaseDate: Date, saleDate: Date): boolean {
    const holdingDays = Math.floor(
      (saleDate.getTime() - purchaseDate.getTime()) / MS_PER_DAY
    );
    return holdingDays < this.config.longTermThresholdDays;
  }

  /**
   * Get holding period in days for a lot
   */
  getHoldingPeriodDays(lot: TaxLot, asOfDate?: Date): number {
    const endDate = lot.soldDate ?? asOfDate ?? new Date();
    return Math.floor((endDate.getTime() - lot.purchaseDate.getTime()) / MS_PER_DAY);
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  /**
   * Order lots based on cost basis method
   */
  private orderLots(
    lots: TaxLot[],
    method: CostBasisMethod,
    specificLotIds?: string[]
  ): TaxLot[] {
    switch (method) {
      case 'fifo':
        return [...lots].sort(
          (a, b) => a.purchaseDate.getTime() - b.purchaseDate.getTime()
        );

      case 'lifo':
        return [...lots].sort(
          (a, b) => b.purchaseDate.getTime() - a.purchaseDate.getTime()
        );

      case 'specific': {
        if (!specificLotIds || specificLotIds.length === 0) {
          throw new Error('Specific lot IDs required for specific identification method');
        }
        const lotMap = new Map(lots.map((l) => [l.id, l]));
        const ordered: TaxLot[] = [];
        for (const id of specificLotIds) {
          const lot = lotMap.get(id);
          if (!lot) throw new Error(`Lot ${id} not found or already sold`);
          ordered.push(lot);
        }
        return ordered;
      }

      default:
        throw new Error(`Unknown cost basis method: ${method}`);
    }
  }

  /**
   * Check if a sale triggers wash sale rule.
   * Wash sale: selling at a loss and buying substantially identical securities
   * within 30 days before or after the sale.
   */
  private checkWashSale(
    userId: string,
    symbol: string,
    saleDate: Date,
    gain: number
  ): boolean {
    // Only losses can trigger wash sales
    if (gain >= 0) return false;

    const windowMs = this.config.washSaleWindowDays * MS_PER_DAY;
    const windowStart = saleDate.getTime() - windowMs;
    const windowEnd = saleDate.getTime() + windowMs;

    // Check if any lot was purchased within the wash sale window
    for (const lot of this.lots.values()) {
      if (lot.userId !== userId) continue;
      if (lot.symbol !== symbol) continue;
      if (lot.soldDate !== null) continue; // Only check open lots

      const purchaseTime = lot.purchaseDate.getTime();
      if (purchaseTime >= windowStart && purchaseTime <= windowEnd) {
        // Found a purchase within the wash sale window
        // Exclude the lot being sold itself (purchase date would match)
        if (purchaseTime !== saleDate.getTime()) {
          return true;
        }
      }
    }

    return false;
  }
}
