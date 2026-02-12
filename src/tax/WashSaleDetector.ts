/**
 * Wash Sale Detector — Detects and warns about IRS wash sale violations
 *
 * A wash sale occurs when you sell a security at a loss and buy a
 * "substantially identical" security within 30 days before or after
 * the sale. The disallowed loss is added to the cost basis of the
 * replacement shares.
 *
 * Detects:
 * - Same ticker repurchased within the 61-day window (30 before + sale day + 30 after)
 * - Substantially identical securities (same company, different share class)
 *
 * Wave B: Tax Optimization — Critical compliance feature (US-026)
 */

import type { TaxLotTracker, TaxLot, TaxEvent } from './TaxLotTracker.js';

// ============================================================================
// Types
// ============================================================================

export interface WashSaleViolation {
  /** The loss sale that triggered the violation */
  saleLotId: string;
  saleSymbol: string;
  saleDate: Date;
  saleShares: number;
  saleLoss: number; // negative value

  /** The replacement purchase that caused the wash sale */
  replacementLotId: string;
  replacementSymbol: string;
  replacementDate: Date;
  replacementShares: number;
  replacementCostBasis: number;

  /** Disallowed loss (absolute value, added to replacement cost basis) */
  disallowedLoss: number;
  /** Adjusted cost basis for replacement shares (per share) */
  adjustedCostBasis: number;
  /** Number of shares affected by the wash sale */
  affectedShares: number;
  /** Whether the match is via identical ticker or substantially identical security */
  matchType: 'same_ticker' | 'substantially_identical';
}

export interface WashSaleScanResult {
  violations: WashSaleViolation[];
  totalDisallowedLosses: number;
  totalAdjustedCostBasis: number;
  scannedEvents: number;
  violationCount: number;
}

export interface TradeWashSaleWarning {
  wouldCreateWashSale: boolean;
  symbol: string;
  matchingLossSales: Array<{
    saleDate: Date;
    saleSymbol: string;
    saleLoss: number;
    matchType: 'same_ticker' | 'substantially_identical';
  }>;
  message: string;
}

export interface AdjustedCostBasisResult {
  lotId: string;
  originalCostBasis: number;
  disallowedLoss: number;
  adjustedCostBasis: number;
  affectedShares: number;
}

export interface WashSaleDetectorConfig {
  /** Wash sale window in calendar days (default: 30 — covers 30 before and 30 after) */
  windowDays: number;
}

// ============================================================================
// Substantially Identical Securities Map
// ============================================================================

/**
 * Maps tickers to their "identity group" — tickers in the same group
 * are considered substantially identical by the IRS (same company,
 * different share classes, tracking stocks, etc.).
 */
const IDENTITY_GROUPS: string[][] = [
  // Alphabet Inc. — Class A (GOOGL) vs Class C (GOOG)
  ['GOOGL', 'GOOG'],
  // Berkshire Hathaway — Class A vs Class B
  ['BRK.A', 'BRK.B'],
  // Fox Corporation — Class A vs Class B
  ['FOXA', 'FOX'],
  // News Corp — Class A vs Class B
  ['NWSA', 'NWS'],
  // Zillow Group — Class A vs Class C
  ['ZG', 'Z'],
  // Discovery (now Warner Bros Discovery) — Class A vs Class C
  ['DISCA', 'DISCK'],
  // Under Armour — Class A vs Class C
  ['UAA', 'UA'],
  // Liberty Broadband — Class A vs Class C
  ['LBRDA', 'LBRDK'],
  // Liberty Media — various tracking stocks
  ['LSXMA', 'LSXMK'],
];

/** Quick lookup: ticker → set of substantially identical tickers */
const IDENTICAL_LOOKUP: Map<string, Set<string>> = new Map();

for (const group of IDENTITY_GROUPS) {
  for (const ticker of group) {
    const upper = ticker.toUpperCase();
    const existing = IDENTICAL_LOOKUP.get(upper) ?? new Set<string>();
    for (const other of group) {
      if (other.toUpperCase() !== upper) {
        existing.add(other.toUpperCase());
      }
    }
    IDENTICAL_LOOKUP.set(upper, existing);
  }
}

// ============================================================================
// Constants
// ============================================================================

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_WINDOW_DAYS = 30;

// ============================================================================
// WashSaleDetector
// ============================================================================

export class WashSaleDetector {
  private config: WashSaleDetectorConfig;

  constructor(config?: Partial<WashSaleDetectorConfig>) {
    this.config = {
      windowDays: config?.windowDays ?? DEFAULT_WINDOW_DAYS,
    };
  }

  // --------------------------------------------------------------------------
  // Scan for Existing Wash Sales
  // --------------------------------------------------------------------------

  /**
   * Scan a user's transaction history for existing wash sale violations.
   * Examines all loss sale events and checks if a substantially identical
   * security was purchased within the wash sale window.
   */
  scanTransactionHistory(
    tracker: TaxLotTracker,
    userId: string
  ): WashSaleScanResult {
    const events = tracker.getEvents(userId);
    const allLots = tracker.getAllLots(userId);
    const violations: WashSaleViolation[] = [];

    // Find all loss events
    const lossEvents = events.filter(
      (e) => e.realizedGain < 0 && (e.eventType === 'realized_loss' || e.eventType === 'wash_sale')
    );

    for (const lossEvent of lossEvents) {
      const matchingLots = this.findReplacementPurchases(
        allLots,
        lossEvent.symbol,
        lossEvent.saleDate,
        lossEvent.taxLotId
      );

      for (const replacementLot of matchingLots) {
        const violation = this.buildViolation(lossEvent, replacementLot);
        violations.push(violation);
      }
    }

    const totalDisallowedLosses = violations.reduce(
      (sum, v) => sum + v.disallowedLoss,
      0
    );
    const totalAdjustedCostBasis = violations.reduce(
      (sum, v) => sum + v.adjustedCostBasis * v.affectedShares,
      0
    );

    return {
      violations,
      totalDisallowedLosses,
      totalAdjustedCostBasis,
      scannedEvents: events.length,
      violationCount: violations.length,
    };
  }

  // --------------------------------------------------------------------------
  // Pre-Trade Warning
  // --------------------------------------------------------------------------

  /**
   * Check if buying a security would trigger a wash sale based on
   * recent loss sales. Call this BEFORE executing a trade.
   */
  checkTradeWarning(
    tracker: TaxLotTracker,
    userId: string,
    buySymbol: string,
    buyDate: Date
  ): TradeWashSaleWarning {
    const sym = buySymbol.toUpperCase();
    const events = tracker.getEvents(userId);
    const windowMs = this.config.windowDays * MS_PER_DAY;

    // Get all symbols that are substantially identical to the buy symbol
    const identicalSymbols = this.getIdenticalSymbols(sym);

    const matchingLossSales: TradeWashSaleWarning['matchingLossSales'] = [];

    for (const event of events) {
      if (event.realizedGain >= 0) continue;
      if (event.eventType !== 'realized_loss' && event.eventType !== 'wash_sale') continue;

      const eventSym = event.symbol.toUpperCase();
      const saleTime = event.saleDate.getTime();
      const buyTime = buyDate.getTime();

      // Check if buy is within window of the loss sale
      if (Math.abs(buyTime - saleTime) > windowMs) continue;

      let matchType: 'same_ticker' | 'substantially_identical' | null = null;

      if (eventSym === sym) {
        matchType = 'same_ticker';
      } else if (identicalSymbols.has(eventSym)) {
        matchType = 'substantially_identical';
      }

      if (matchType) {
        matchingLossSales.push({
          saleDate: event.saleDate,
          saleSymbol: event.symbol,
          saleLoss: event.realizedGain,
          matchType,
        });
      }
    }

    const wouldCreateWashSale = matchingLossSales.length > 0;
    let message: string;

    if (!wouldCreateWashSale) {
      message = `No wash sale risk for ${sym} on ${buyDate.toISOString().split('T')[0]}`;
    } else {
      const totalLoss = matchingLossSales.reduce((s, m) => s + m.saleLoss, 0);
      message =
        `WARNING: Buying ${sym} would create ${matchingLossSales.length} wash sale(s). ` +
        `Total disallowed loss: $${Math.abs(totalLoss).toFixed(2)}. ` +
        `Wait until ${this.getWashSaleEndDate(matchingLossSales).toISOString().split('T')[0]} to avoid.`;
    }

    return {
      wouldCreateWashSale,
      symbol: sym,
      matchingLossSales,
      message,
    };
  }

  // --------------------------------------------------------------------------
  // Adjusted Cost Basis
  // --------------------------------------------------------------------------

  /**
   * Calculate the adjusted cost basis for a replacement lot that is part
   * of a wash sale. The disallowed loss from the original sale is added
   * to the cost basis of the replacement shares.
   *
   * IRS Rule: If a wash sale occurs, the disallowed loss is added to
   * the cost basis of the replacement stock.
   */
  calculateAdjustedCostBasis(
    originalCostBasis: number,
    disallowedLossPerShare: number,
    shares: number,
    lotId: string
  ): AdjustedCostBasisResult {
    const adjustedCostBasis = originalCostBasis + Math.abs(disallowedLossPerShare);

    return {
      lotId,
      originalCostBasis,
      disallowedLoss: Math.abs(disallowedLossPerShare) * shares,
      adjustedCostBasis,
      affectedShares: shares,
    };
  }

  // --------------------------------------------------------------------------
  // Substantially Identical Securities
  // --------------------------------------------------------------------------

  /**
   * Get all symbols considered substantially identical to the given symbol.
   * Includes same-company share classes (e.g., GOOGL ↔ GOOG).
   */
  getIdenticalSymbols(symbol: string): Set<string> {
    return IDENTICAL_LOOKUP.get(symbol.toUpperCase()) ?? new Set();
  }

  /**
   * Check if two symbols are substantially identical.
   */
  areSubstantiallyIdentical(symbolA: string, symbolB: string): boolean {
    const a = symbolA.toUpperCase();
    const b = symbolB.toUpperCase();
    if (a === b) return true;
    const identicals = IDENTICAL_LOOKUP.get(a);
    return identicals ? identicals.has(b) : false;
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  /**
   * Find lots purchased within the wash sale window of a loss sale.
   */
  private findReplacementPurchases(
    allLots: TaxLot[],
    saleSymbol: string,
    saleDate: Date,
    excludeLotId: string | null
  ): Array<TaxLot & { matchType: 'same_ticker' | 'substantially_identical' }> {
    const sym = saleSymbol.toUpperCase();
    const identicalSymbols = this.getIdenticalSymbols(sym);
    const windowMs = this.config.windowDays * MS_PER_DAY;
    const saleTime = saleDate.getTime();
    const windowStart = saleTime - windowMs;
    const windowEnd = saleTime + windowMs;

    const matches: Array<TaxLot & { matchType: 'same_ticker' | 'substantially_identical' }> = [];

    for (const lot of allLots) {
      // Skip the lot that was sold (prevent self-match)
      if (lot.id === excludeLotId) continue;

      const purchaseTime = lot.purchaseDate.getTime();
      if (purchaseTime < windowStart || purchaseTime > windowEnd) continue;

      const lotSym = lot.symbol.toUpperCase();

      if (lotSym === sym) {
        matches.push({ ...lot, matchType: 'same_ticker' });
      } else if (identicalSymbols.has(lotSym)) {
        matches.push({ ...lot, matchType: 'substantially_identical' });
      }
    }

    return matches;
  }

  /**
   * Build a WashSaleViolation from a loss event and a replacement lot.
   */
  private buildViolation(
    lossEvent: TaxEvent,
    replacementLot: TaxLot & { matchType: 'same_ticker' | 'substantially_identical' }
  ): WashSaleViolation {
    // The affected shares are the lesser of shares sold at a loss and replacement shares
    const affectedShares = Math.min(lossEvent.shares, replacementLot.shares);

    // Disallowed loss per share = |loss per share| for the affected quantity
    const lossPerShare = Math.abs(lossEvent.realizedGain / lossEvent.shares);
    const disallowedLoss = lossPerShare * affectedShares;

    // Adjusted cost basis = original replacement cost basis + disallowed loss per share
    const adjustedCostBasis = replacementLot.costBasis + lossPerShare;

    return {
      saleLotId: lossEvent.taxLotId ?? lossEvent.id,
      saleSymbol: lossEvent.symbol,
      saleDate: lossEvent.saleDate,
      saleShares: lossEvent.shares,
      saleLoss: lossEvent.realizedGain,

      replacementLotId: replacementLot.id,
      replacementSymbol: replacementLot.symbol,
      replacementDate: replacementLot.purchaseDate,
      replacementShares: replacementLot.shares,
      replacementCostBasis: replacementLot.costBasis,

      disallowedLoss,
      adjustedCostBasis,
      affectedShares,
      matchType: replacementLot.matchType,
    };
  }

  /**
   * Get the earliest date when it's safe to buy (after all wash sale windows expire).
   */
  private getWashSaleEndDate(
    matchingLossSales: TradeWashSaleWarning['matchingLossSales']
  ): Date {
    const windowMs = this.config.windowDays * MS_PER_DAY;
    let latest = 0;

    for (const sale of matchingLossSales) {
      const endTime = sale.saleDate.getTime() + windowMs + MS_PER_DAY; // +1 day for safety
      if (endTime > latest) latest = endTime;
    }

    return new Date(latest);
  }
}
