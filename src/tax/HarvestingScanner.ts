/**
 * Tax-Loss Harvesting Scanner
 *
 * Scans portfolio positions for unrealized losses that can be harvested
 * to offset realized gains. Suggests replacement securities with similar
 * sector/factor exposure (different ticker) to maintain market exposure
 * while avoiding wash sale violations.
 *
 * Wave B: Tax Optimization — Core harvesting algorithm (US-025)
 */

import { SECTOR_MAP } from '../factors/FactorEngine.js';
import type { TaxLotTracker, UnrealizedGain } from './TaxLotTracker.js';

// ============================================================================
// Types
// ============================================================================

export interface HarvestingOpportunity {
  symbol: string;
  unrealizedLoss: number; // negative value
  currentPrice: number;
  costBasis: number; // weighted average per-share cost basis
  totalShares: number;
  estimatedTaxSavings: number;
  shortTermLoss: number;
  longTermLoss: number;
  shortTermTaxSavings: number;
  longTermTaxSavings: number;
  replacements: ReplacementSecurity[];
  lots: HarvestingLot[];
}

export interface ReplacementSecurity {
  symbol: string;
  sector: string;
  reason: string;
}

export interface HarvestingLot {
  lotId: string;
  shares: number;
  costBasis: number;
  purchaseDate: Date;
  unrealizedLoss: number;
  isShortTerm: boolean;
  holdingDays: number;
}

export interface HarvestingScanResult {
  opportunities: HarvestingOpportunity[];
  totalUnrealizedLosses: number;
  totalEstimatedTaxSavings: number;
  scannedPositions: number;
  qualifyingPositions: number;
}

export interface HarvestingScannerConfig {
  minimumLossThreshold: number; // minimum unrealized loss to qualify ($100 default)
  shortTermTaxRate: number; // federal short-term rate (ordinary income)
  longTermTaxRate: number; // federal long-term rate
  stateTaxRate: number; // state tax rate (added to both)
}

// ============================================================================
// Sector Peer Map — replacement securities by sector
// ============================================================================

const SECTOR_PEERS: Record<string, string[]> = {
  Technology: [
    'AAPL', 'MSFT', 'NVDA', 'AMD', 'INTC', 'CSCO', 'ADBE', 'CRM',
    'ORCL', 'IBM', 'AVGO', 'TXN', 'QCOM', 'NOW', 'AMAT', 'MU',
    'LRCX', 'KLAC', 'SNPS', 'CDNS',
  ],
  'Communication Services': [
    'GOOGL', 'GOOG', 'META', 'NFLX', 'DIS', 'CMCSA', 'VZ', 'T',
    'TMUS', 'ATVI',
  ],
  'Consumer Discretionary': [
    'AMZN', 'TSLA', 'HD', 'NKE', 'MCD', 'SBUX', 'LOW', 'TJX',
    'BKNG', 'MAR',
  ],
  Financials: [
    'JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'AXP', 'BLK',
    'SCHW', 'SPGI', 'V', 'MA', 'PYPL', 'COF', 'USB', 'PNC',
  ],
  Healthcare: [
    'UNH', 'JNJ', 'PFE', 'MRK', 'ABBV', 'LLY', 'TMO', 'ABT',
    'DHR', 'BMY', 'AMGN', 'GILD', 'CVS', 'CI', 'ISRG', 'VRTX',
  ],
  'Consumer Staples': [
    'PG', 'KO', 'PEP', 'WMT', 'COST', 'PM', 'MO', 'CL',
    'KMB', 'GIS', 'K', 'MDLZ',
  ],
  Energy: [
    'XOM', 'CVX', 'COP', 'EOG', 'SLB', 'OXY', 'PSX', 'VLO',
    'MPC', 'PXD', 'HES', 'DVN',
  ],
  Industrials: [
    'HON', 'UNP', 'RTX', 'BA', 'CAT', 'GE', 'DE', 'LMT',
    'MMM', 'UPS', 'FDX', 'WM',
  ],
  Materials: [
    'LIN', 'APD', 'SHW', 'ECL', 'FCX', 'NEM', 'NUE', 'DOW',
  ],
  Utilities: [
    'NEE', 'DUK', 'SO', 'D', 'AEP', 'EXC', 'SRE', 'XEL',
  ],
  'Real Estate': [
    'AMT', 'PLD', 'CCI', 'EQIX', 'PSA', 'O', 'WELL', 'SPG',
  ],
};

// ============================================================================
// HarvestingScanner
// ============================================================================

export class HarvestingScanner {
  private config: HarvestingScannerConfig;

  constructor(config?: Partial<HarvestingScannerConfig>) {
    this.config = {
      minimumLossThreshold: config?.minimumLossThreshold ?? 100,
      shortTermTaxRate: config?.shortTermTaxRate ?? 0.37,
      longTermTaxRate: config?.longTermTaxRate ?? 0.20,
      stateTaxRate: config?.stateTaxRate ?? 0.05,
    };
  }

  /**
   * Scan portfolio for tax-loss harvesting opportunities.
   * Returns opportunities ranked by estimated tax savings (highest first).
   */
  scan(
    tracker: TaxLotTracker,
    userId: string,
    currentPrices: Map<string, number>
  ): HarvestingScanResult {
    const unrealizedGains = tracker.calculateUnrealizedGains(userId, currentPrices);
    const opportunities: HarvestingOpportunity[] = [];

    for (const position of unrealizedGains) {
      // Only interested in positions with unrealized losses
      if (position.unrealizedGain >= 0) continue;

      // Filter to loss lots and check threshold
      const lossLots = this.extractLossLots(position, currentPrices);
      const totalLoss = lossLots.reduce((sum, lot) => sum + lot.unrealizedLoss, 0);

      if (Math.abs(totalLoss) < this.config.minimumLossThreshold) continue;

      const { shortTermLoss, longTermLoss } = this.splitByHoldingPeriod(lossLots);
      const shortTermTaxSavings = Math.abs(shortTermLoss) * this.effectiveShortTermRate();
      const longTermTaxSavings = Math.abs(longTermLoss) * this.effectiveLongTermRate();
      const estimatedTaxSavings = shortTermTaxSavings + longTermTaxSavings;

      const totalShares = lossLots.reduce((sum, lot) => sum + lot.shares, 0);
      const totalCost = lossLots.reduce((sum, lot) => sum + lot.shares * lot.costBasis, 0);
      const weightedCostBasis = totalShares > 0 ? totalCost / totalShares : 0;

      const replacements = this.suggestReplacements(position.symbol);

      opportunities.push({
        symbol: position.symbol,
        unrealizedLoss: totalLoss,
        currentPrice: currentPrices.get(position.symbol) ?? 0,
        costBasis: weightedCostBasis,
        totalShares,
        estimatedTaxSavings,
        shortTermLoss,
        longTermLoss,
        shortTermTaxSavings,
        longTermTaxSavings,
        replacements,
        lots: lossLots,
      });
    }

    // Rank by tax savings potential (highest first)
    opportunities.sort((a, b) => b.estimatedTaxSavings - a.estimatedTaxSavings);

    const totalUnrealizedLosses = opportunities.reduce(
      (sum, opp) => sum + opp.unrealizedLoss,
      0
    );
    const totalEstimatedTaxSavings = opportunities.reduce(
      (sum, opp) => sum + opp.estimatedTaxSavings,
      0
    );

    return {
      opportunities,
      totalUnrealizedLosses,
      totalEstimatedTaxSavings,
      scannedPositions: unrealizedGains.length,
      qualifyingPositions: opportunities.length,
    };
  }

  /**
   * Suggest replacement securities with similar sector exposure but different ticker.
   * Returns up to 3 replacements from the same sector.
   */
  suggestReplacements(symbol: string): ReplacementSecurity[] {
    const sym = symbol.toUpperCase();
    const sector = SECTOR_MAP[sym] ?? 'Unknown';

    if (sector === 'Unknown') return [];

    const peers = SECTOR_PEERS[sector];
    if (!peers) return [];

    // Filter out the original symbol and pick up to 3
    const candidates = peers.filter((p) => p !== sym);
    const selected = candidates.slice(0, 3);

    return selected.map((candidate) => ({
      symbol: candidate,
      sector,
      reason: `Same sector (${sector}), different ticker to avoid wash sale`,
    }));
  }

  /**
   * Get effective short-term tax rate (federal + state)
   */
  effectiveShortTermRate(): number {
    return this.config.shortTermTaxRate + this.config.stateTaxRate;
  }

  /**
   * Get effective long-term tax rate (federal + state)
   */
  effectiveLongTermRate(): number {
    return this.config.longTermTaxRate + this.config.stateTaxRate;
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  /**
   * Extract lots with unrealized losses from a position's lot details.
   */
  private extractLossLots(
    position: UnrealizedGain,
    _currentPrices: Map<string, number>
  ): HarvestingLot[] {
    return position.lots
      .filter((lot) => lot.gain < 0)
      .map((lot) => ({
        lotId: lot.lotId,
        shares: lot.shares,
        costBasis: lot.costBasis,
        purchaseDate: new Date(), // placeholder — overridden below
        unrealizedLoss: lot.gain,
        isShortTerm: lot.isShortTerm,
        holdingDays: lot.holdingDays,
      }));
  }

  /**
   * Split loss lots into short-term and long-term totals.
   */
  private splitByHoldingPeriod(lots: HarvestingLot[]): {
    shortTermLoss: number;
    longTermLoss: number;
  } {
    let shortTermLoss = 0;
    let longTermLoss = 0;

    for (const lot of lots) {
      if (lot.isShortTerm) {
        shortTermLoss += lot.unrealizedLoss;
      } else {
        longTermLoss += lot.unrealizedLoss;
      }
    }

    return { shortTermLoss, longTermLoss };
  }
}
