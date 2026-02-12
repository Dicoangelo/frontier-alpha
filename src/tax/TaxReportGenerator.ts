/**
 * Tax Report Generator — Generates annual tax reports compatible with
 * IRS Schedule D and Form 8949 formats.
 *
 * Produces:
 * - Annual tax summary (short/long-term gains/losses, net gain/loss)
 * - Wash sale disallowed losses (separate line item)
 * - Harvesting savings estimate (from HarvestingScanner)
 * - Form 8949 transaction rows (per-lot detail for each sale)
 * - Export as JSON or CSV
 *
 * Wave B: Tax Optimization — Reporting layer (US-028)
 */

import type { TaxLotTracker, TaxEvent, TaxSummary, TaxLot } from './TaxLotTracker.js';
import type { HarvestingScanner } from './HarvestingScanner.js';
import type { WashSaleDetector, WashSaleViolation } from './WashSaleDetector.js';

// ============================================================================
// Types
// ============================================================================

/** A single row in Form 8949 — one per sold lot */
export interface Form8949Row {
  description: string; // e.g. "10 shares AAPL"
  dateAcquired: string; // ISO date YYYY-MM-DD
  dateSold: string; // ISO date YYYY-MM-DD
  proceeds: number;
  costBasis: number;
  adjustmentCode: string; // 'W' for wash sale, '' for none
  adjustmentAmount: number; // wash sale disallowed loss (positive for adjustment)
  gainOrLoss: number; // proceeds - costBasis + adjustmentAmount
  isShortTerm: boolean;
  symbol: string;
  shares: number;
}

/** Complete annual tax report */
export interface AnnualTaxReport {
  taxYear: number;
  userId: string;
  generatedAt: string; // ISO datetime

  // Summary (from TaxLotTracker.getTaxSummary)
  summary: TaxSummary;

  // Wash sale detail
  washSaleDisallowedLosses: number;
  washSaleViolations: WashSaleViolation[];

  // Harvesting estimate
  harvestingSavingsEstimate: number;
  harvestingOpportunitiesCount: number;

  // Form 8949 rows (Schedule D detail)
  shortTermTransactions: Form8949Row[];
  longTermTransactions: Form8949Row[];

  // Totals matching Schedule D
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

export interface TaxReportGeneratorConfig {
  /** Default tax rates for harvesting savings estimate */
  shortTermTaxRate: number;
  longTermTaxRate: number;
  stateTaxRate: number;
}

// ============================================================================
// TaxReportGenerator
// ============================================================================

export class TaxReportGenerator {
  private config: TaxReportGeneratorConfig;

  constructor(config?: Partial<TaxReportGeneratorConfig>) {
    this.config = {
      shortTermTaxRate: config?.shortTermTaxRate ?? 0.37,
      longTermTaxRate: config?.longTermTaxRate ?? 0.20,
      stateTaxRate: config?.stateTaxRate ?? 0.05,
    };
  }

  // --------------------------------------------------------------------------
  // Report Generation
  // --------------------------------------------------------------------------

  /**
   * Generate a complete annual tax report for a user.
   *
   * @param tracker - TaxLotTracker with the user's lots and events
   * @param userId - User to generate the report for
   * @param taxYear - Tax year to report on
   * @param washSaleDetector - Optional WashSaleDetector for wash sale detail
   * @param harvestingScanner - Optional HarvestingScanner for savings estimate
   * @param currentPrices - Required if harvestingScanner is provided (for unrealized scan)
   */
  generateReport(
    tracker: TaxLotTracker,
    userId: string,
    taxYear: number,
    washSaleDetector?: WashSaleDetector,
    harvestingScanner?: HarvestingScanner,
    currentPrices?: Map<string, number>
  ): AnnualTaxReport {
    // 1. Get the summary from the tracker
    const summary = tracker.getTaxSummary(userId, taxYear);

    // 2. Build Form 8949 rows from tax events
    const events = tracker.getEvents(userId, taxYear);
    const allLots = tracker.getAllLots(userId);
    const lotMap = new Map<string, TaxLot>(allLots.map((l) => [l.id, l]));

    const { shortTermRows, longTermRows } = this.buildForm8949Rows(
      events,
      lotMap,
      tracker
    );

    // 3. Wash sale detail
    let washSaleViolations: WashSaleViolation[] = [];
    if (washSaleDetector) {
      const scanResult = washSaleDetector.scanTransactionHistory(tracker, userId);
      // Filter violations to the report tax year
      washSaleViolations = scanResult.violations.filter(
        (v) => v.saleDate.getFullYear() === taxYear
      );
    }

    // 4. Harvesting savings estimate
    let harvestingSavingsEstimate = 0;
    let harvestingOpportunitiesCount = 0;
    if (harvestingScanner && currentPrices) {
      const harvestResult = harvestingScanner.scan(tracker, userId, currentPrices);
      harvestingSavingsEstimate = harvestResult.totalEstimatedTaxSavings;
      harvestingOpportunitiesCount = harvestResult.qualifyingPositions;
    }

    // 5. Compute Schedule D totals from Form 8949 rows
    const scheduleD = this.computeScheduleD(shortTermRows, longTermRows);

    return {
      taxYear,
      userId,
      generatedAt: new Date().toISOString(),
      summary,
      washSaleDisallowedLosses: summary.washSaleAdjustment,
      washSaleViolations,
      harvestingSavingsEstimate,
      harvestingOpportunitiesCount,
      shortTermTransactions: shortTermRows,
      longTermTransactions: longTermRows,
      scheduleD,
    };
  }

  // --------------------------------------------------------------------------
  // Export Formats
  // --------------------------------------------------------------------------

  /**
   * Export report as JSON string.
   */
  exportJSON(report: AnnualTaxReport): string {
    return JSON.stringify(report, null, 2);
  }

  /**
   * Export report as CSV string (Form 8949 format).
   * Produces one CSV with all transactions, labeled by term.
   */
  exportCSV(report: AnnualTaxReport): string {
    const header = [
      'Term',
      'Description',
      'Symbol',
      'Shares',
      'Date Acquired',
      'Date Sold',
      'Proceeds',
      'Cost Basis',
      'Adjustment Code',
      'Adjustment Amount',
      'Gain or Loss',
    ].join(',');

    const rows: string[] = [header];

    for (const row of report.shortTermTransactions) {
      rows.push(this.form8949RowToCSV(row, 'Short-Term'));
    }

    for (const row of report.longTermTransactions) {
      rows.push(this.form8949RowToCSV(row, 'Long-Term'));
    }

    // Summary footer
    rows.push('');
    rows.push(`# Tax Year ${report.taxYear} Summary`);
    rows.push(`# Short-Term Net: ${report.scheduleD.shortTermGainOrLoss.toFixed(2)}`);
    rows.push(`# Long-Term Net: ${report.scheduleD.longTermGainOrLoss.toFixed(2)}`);
    rows.push(`# Net Gain/Loss: ${report.scheduleD.netGainOrLoss.toFixed(2)}`);
    rows.push(`# Wash Sale Disallowed: ${report.washSaleDisallowedLosses.toFixed(2)}`);
    rows.push(`# Harvesting Savings Estimate: ${report.harvestingSavingsEstimate.toFixed(2)}`);

    return rows.join('\n');
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  /**
   * Build Form 8949 rows from tax events, splitting into short-term and long-term.
   */
  private buildForm8949Rows(
    events: TaxEvent[],
    lotMap: Map<string, TaxLot>,
    tracker: TaxLotTracker
  ): { shortTermRows: Form8949Row[]; longTermRows: Form8949Row[] } {
    const shortTermRows: Form8949Row[] = [];
    const longTermRows: Form8949Row[] = [];

    for (const event of events) {
      // Skip non-sale events
      if (event.eventType === 'dividend' || event.eventType === 'return_of_capital') {
        continue;
      }

      const lot = event.taxLotId ? lotMap.get(event.taxLotId) : null;
      const isShortTerm = lot
        ? tracker.isShortTermHolding(lot.purchaseDate, event.saleDate)
        : true;

      const proceeds = event.shares * event.salePrice;
      const costBasis = event.shares * event.costBasis;
      const isWashSale = event.isWashSale;
      const adjustmentAmount = isWashSale ? Math.abs(event.realizedGain) : 0;
      const gainOrLoss = proceeds - costBasis + (isWashSale ? adjustmentAmount : 0);

      const row: Form8949Row = {
        description: `${event.shares} shares ${event.symbol}`,
        dateAcquired: lot
          ? lot.purchaseDate.toISOString().split('T')[0]
          : 'Various',
        dateSold: event.saleDate.toISOString().split('T')[0],
        proceeds,
        costBasis,
        adjustmentCode: isWashSale ? 'W' : '',
        adjustmentAmount,
        gainOrLoss,
        isShortTerm,
        symbol: event.symbol,
        shares: event.shares,
      };

      if (isShortTerm) {
        shortTermRows.push(row);
      } else {
        longTermRows.push(row);
      }
    }

    // Sort by sale date within each category
    shortTermRows.sort((a, b) => a.dateSold.localeCompare(b.dateSold));
    longTermRows.sort((a, b) => a.dateSold.localeCompare(b.dateSold));

    return { shortTermRows, longTermRows };
  }

  /**
   * Compute Schedule D totals from Form 8949 rows.
   */
  private computeScheduleD(
    shortTermRows: Form8949Row[],
    longTermRows: Form8949Row[]
  ): AnnualTaxReport['scheduleD'] {
    const sumRows = (rows: Form8949Row[]) => {
      let proceeds = 0;
      let costBasis = 0;
      let adjustments = 0;
      let gainOrLoss = 0;

      for (const row of rows) {
        proceeds += row.proceeds;
        costBasis += row.costBasis;
        adjustments += row.adjustmentAmount;
        gainOrLoss += row.gainOrLoss;
      }

      return { proceeds, costBasis, adjustments, gainOrLoss };
    };

    const st = sumRows(shortTermRows);
    const lt = sumRows(longTermRows);

    return {
      shortTermProceeds: st.proceeds,
      shortTermCostBasis: st.costBasis,
      shortTermAdjustments: st.adjustments,
      shortTermGainOrLoss: st.gainOrLoss,
      longTermProceeds: lt.proceeds,
      longTermCostBasis: lt.costBasis,
      longTermAdjustments: lt.adjustments,
      longTermGainOrLoss: lt.gainOrLoss,
      netGainOrLoss: st.gainOrLoss + lt.gainOrLoss,
    };
  }

  /**
   * Convert a Form 8949 row to a CSV line.
   */
  private form8949RowToCSV(row: Form8949Row, term: string): string {
    return [
      term,
      `"${row.description}"`,
      row.symbol,
      row.shares,
      row.dateAcquired,
      row.dateSold,
      row.proceeds.toFixed(2),
      row.costBasis.toFixed(2),
      row.adjustmentCode || '',
      row.adjustmentAmount.toFixed(2),
      row.gainOrLoss.toFixed(2),
    ].join(',');
  }
}
