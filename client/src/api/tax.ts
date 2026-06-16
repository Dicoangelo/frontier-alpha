import { api } from './client';

/**
 * Tax API client — talks to the Pro-gated `/api/v1/tax/*` routes.
 *
 * The server reconstructs an in-memory tax tracker from the user's persisted
 * `frontier_tax_lots` / `frontier_tax_events` rows on every request (see
 * `src/tax/loadTrackerFromDb.ts`), so these responses reflect real realized
 * activity rather than the fixture the Tax page used to ship.
 */

// ── Report (Form 8949 / Schedule D) ──────────────────────────────

export interface Form8949Row {
  description: string;
  dateAcquired: string;
  dateSold: string;
  proceeds: number;
  costBasis: number;
  adjustmentCode: string;
  adjustmentAmount: number;
  gainOrLoss: number;
  isShortTerm: boolean;
  symbol: string;
  shares: number;
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

export interface AnnualTaxReport {
  taxYear: number;
  userId: string;
  generatedAt: string;
  summary: TaxSummary;
  washSaleDisallowedLosses: number;
  washSaleViolations: WashSaleViolation[];
  harvestingSavingsEstimate: number;
  harvestingOpportunitiesCount: number;
  shortTermTransactions: Form8949Row[];
  longTermTransactions: Form8949Row[];
  scheduleD: {
    shortTermProceeds: number;
    shortTermCostBasis: number;
    shortTermAdjustments: number;
    shortTermGainOrLoss: number;
    longTermProceeds: number;
    longTermCostBasis: number;
    longTermAdjustments: number;
    longTermGainOrLoss: number;
    netGainOrLoss: number;
  };
}

// ── Harvest ──────────────────────────────────────────────────────

export interface ReplacementSecurity {
  symbol: string;
  sector: string;
  reason: string;
}

export interface HarvestingOpportunity {
  symbol: string;
  unrealizedLoss: number;
  currentPrice: number;
  costBasis: number;
  totalShares: number;
  estimatedTaxSavings: number;
  shortTermLoss: number;
  longTermLoss: number;
  shortTermTaxSavings: number;
  longTermTaxSavings: number;
  replacements: ReplacementSecurity[];
  lots: Array<{
    lotId: string;
    shares: number;
    costBasis: number;
    purchaseDate: string;
    unrealizedLoss: number;
    isShortTerm: boolean;
    holdingDays: number;
  }>;
}

export interface HarvestResult {
  opportunities: HarvestingOpportunity[];
  totalUnrealizedLosses: number;
  totalEstimatedTaxSavings: number;
  scannedPositions: number;
  qualifyingPositions: number;
}

// ── Wash sales ───────────────────────────────────────────────────

export interface WashSaleViolation {
  saleLotId: string;
  saleSymbol: string;
  saleDate: string;
  saleShares: number;
  saleLoss: number;
  replacementLotId: string;
  replacementSymbol: string;
  replacementDate: string;
  replacementShares: number;
  replacementCostBasis: number;
  disallowedLoss: number;
  adjustedCostBasis: number;
  affectedShares: number;
  matchType: 'same_ticker' | 'substantially_identical';
}

export interface WashSaleResult {
  violations: WashSaleViolation[];
  totalDisallowedLosses: number;
  totalAdjustedCostBasis: number;
  scannedEvents: number;
  violationCount: number;
}

export const taxApi = {
  getReport: async (year?: number): Promise<AnnualTaxReport> => {
    const response = await api.get('/tax/report', {
      params: year ? { year } : undefined,
    });
    return response.data;
  },

  getHarvest: async (symbols?: string[]): Promise<HarvestResult> => {
    const response = await api.get('/tax/harvest', {
      params: symbols && symbols.length > 0 ? { symbols: symbols.join(',') } : undefined,
    });
    return response.data;
  },

  getWashSales: async (): Promise<WashSaleResult> => {
    const response = await api.get('/tax/wash-sales');
    return response.data;
  },

  /**
   * Download the annual report as a Form 8949 CSV. Streams the server's
   * `?format=csv` branch as a blob and triggers a browser download.
   */
  downloadReportCsv: async (year: number): Promise<void> => {
    const blob: Blob = await api.get('/tax/report', {
      params: { year, format: 'csv' },
      responseType: 'blob',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tax-report-${year}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },
};
