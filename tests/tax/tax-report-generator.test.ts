/**
 * Unit Tests for TaxReportGenerator
 *
 * Tests annual tax report generation, Form 8949 row construction,
 * Schedule D totals, wash sale integration, harvesting savings,
 * JSON/CSV export, and edge cases.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TaxLotTracker } from '../../src/tax/TaxLotTracker.js';
import { TaxReportGenerator } from '../../src/tax/TaxReportGenerator.js';
import { HarvestingScanner } from '../../src/tax/HarvestingScanner.js';
import { WashSaleDetector } from '../../src/tax/WashSaleDetector.js';
import type { AnnualTaxReport, Form8949Row } from '../../src/tax/TaxReportGenerator.js';

// ============================================================================
// HELPERS
// ============================================================================

const USER = 'user-1';
const TAX_YEAR = 2025;

function date(iso: string): Date {
  return new Date(iso);
}

/**
 * Set up a tracker with mixed short-term and long-term sales,
 * including gains, losses, and a wash sale.
 */
function setupTrackerWithSales(): TaxLotTracker {
  const tracker = new TaxLotTracker();

  // --- Short-term gain: AAPL bought 2025-06-01 @ $150, sold 2025-09-01 @ $180 (gain $30/share × 10 = $300) ---
  tracker.addLot(USER, 'AAPL', 10, 150, date('2025-06-01'));
  tracker.sellShares(USER, 'AAPL', 10, 180, date('2025-09-01'));

  // --- Long-term loss: MSFT bought 2024-01-15 @ $400, sold 2025-06-01 @ $350 (loss -$50/share × 5 = -$250) ---
  tracker.addLot(USER, 'MSFT', 5, 400, date('2024-01-15'));
  tracker.sellShares(USER, 'MSFT', 5, 350, date('2025-06-01'));

  // --- Long-term gain: GOOGL bought 2024-03-01 @ $140, sold 2025-08-01 @ $175 (gain $35/share × 20 = $700) ---
  tracker.addLot(USER, 'GOOGL', 20, 140, date('2024-03-01'));
  tracker.sellShares(USER, 'GOOGL', 20, 175, date('2025-08-01'));

  return tracker;
}

/**
 * Set up a tracker with a wash sale scenario.
 */
function setupTrackerWithWashSale(): TaxLotTracker {
  const tracker = new TaxLotTracker();

  // Buy AAPL, sell at a loss, then buy back within 30 days → wash sale
  tracker.addLot(USER, 'AAPL', 10, 200, date('2025-03-01'));
  // Repurchase AAPL within 30 days of the upcoming sale
  tracker.addLot(USER, 'AAPL', 10, 160, date('2025-06-20'));
  // Sell original lot at a loss
  tracker.sellShares(USER, 'AAPL', 10, 160, date('2025-06-15'));

  return tracker;
}

// ============================================================================
// TESTS
// ============================================================================

describe('TaxReportGenerator', () => {
  let generator: TaxReportGenerator;

  beforeEach(() => {
    generator = new TaxReportGenerator();
  });

  // --------------------------------------------------------------------------
  // Constructor
  // --------------------------------------------------------------------------

  describe('constructor', () => {
    it('uses default config when none provided', () => {
      const g = new TaxReportGenerator();
      expect(g).toBeDefined();
    });

    it('accepts custom tax rate configuration', () => {
      const g = new TaxReportGenerator({
        shortTermTaxRate: 0.32,
        longTermTaxRate: 0.15,
        stateTaxRate: 0.10,
      });
      expect(g).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Basic Report Generation
  // --------------------------------------------------------------------------

  describe('generateReport', () => {
    it('generates a complete annual tax report with correct structure', () => {
      const tracker = setupTrackerWithSales();
      const report = generator.generateReport(tracker, USER, TAX_YEAR);

      expect(report.taxYear).toBe(TAX_YEAR);
      expect(report.userId).toBe(USER);
      expect(report.generatedAt).toBeTruthy();
      expect(report.summary).toBeDefined();
      expect(report.shortTermTransactions).toBeInstanceOf(Array);
      expect(report.longTermTransactions).toBeInstanceOf(Array);
      expect(report.scheduleD).toBeDefined();
    });

    it('correctly separates short-term and long-term transactions', () => {
      const tracker = setupTrackerWithSales();
      const report = generator.generateReport(tracker, USER, TAX_YEAR);

      // 1 short-term sale (AAPL held < 365 days)
      expect(report.shortTermTransactions.length).toBe(1);
      expect(report.shortTermTransactions[0].symbol).toBe('AAPL');
      expect(report.shortTermTransactions[0].isShortTerm).toBe(true);

      // 2 long-term sales (MSFT and GOOGL held > 365 days)
      expect(report.longTermTransactions.length).toBe(2);
      expect(report.longTermTransactions.every((r) => !r.isShortTerm)).toBe(true);
    });

    it('computes correct gains and losses in summary', () => {
      const tracker = setupTrackerWithSales();
      const report = generator.generateReport(tracker, USER, TAX_YEAR);

      // AAPL: short-term gain $300
      expect(report.summary.shortTermGains).toBeCloseTo(300, 1);
      expect(report.summary.shortTermLosses).toBeCloseTo(0, 1);

      // MSFT: long-term loss -$250, GOOGL: long-term gain $700
      expect(report.summary.longTermGains).toBeCloseTo(700, 1);
      expect(report.summary.longTermLosses).toBeCloseTo(-250, 1);

      // Net
      expect(report.summary.netShortTerm).toBeCloseTo(300, 1);
      expect(report.summary.netLongTerm).toBeCloseTo(450, 1);
      expect(report.summary.totalRealizedGain).toBeCloseTo(750, 1);
    });
  });

  // --------------------------------------------------------------------------
  // Form 8949 Rows
  // --------------------------------------------------------------------------

  describe('Form 8949 rows', () => {
    it('builds correct Form 8949 row fields for a gain', () => {
      const tracker = setupTrackerWithSales();
      const report = generator.generateReport(tracker, USER, TAX_YEAR);

      const aaplRow = report.shortTermTransactions.find(
        (r) => r.symbol === 'AAPL'
      ) as Form8949Row;

      expect(aaplRow).toBeDefined();
      expect(aaplRow.description).toBe('10 shares AAPL');
      expect(aaplRow.dateAcquired).toBe('2025-06-01');
      expect(aaplRow.dateSold).toBe('2025-09-01');
      expect(aaplRow.proceeds).toBeCloseTo(1800, 1); // 10 × $180
      expect(aaplRow.costBasis).toBeCloseTo(1500, 1); // 10 × $150
      expect(aaplRow.adjustmentCode).toBe('');
      expect(aaplRow.adjustmentAmount).toBeCloseTo(0, 1);
      expect(aaplRow.gainOrLoss).toBeCloseTo(300, 1);
      expect(aaplRow.shares).toBe(10);
    });

    it('builds correct Form 8949 row fields for a loss', () => {
      const tracker = setupTrackerWithSales();
      const report = generator.generateReport(tracker, USER, TAX_YEAR);

      const msftRow = report.longTermTransactions.find(
        (r) => r.symbol === 'MSFT'
      ) as Form8949Row;

      expect(msftRow).toBeDefined();
      expect(msftRow.proceeds).toBeCloseTo(1750, 1); // 5 × $350
      expect(msftRow.costBasis).toBeCloseTo(2000, 1); // 5 × $400
      expect(msftRow.gainOrLoss).toBeCloseTo(-250, 1);
    });

    it('sorts transactions by sale date within each category', () => {
      const tracker = setupTrackerWithSales();
      const report = generator.generateReport(tracker, USER, TAX_YEAR);

      // Long-term: MSFT sold 2025-06-01, GOOGL sold 2025-08-01
      expect(report.longTermTransactions[0].symbol).toBe('MSFT');
      expect(report.longTermTransactions[1].symbol).toBe('GOOGL');
    });
  });

  // --------------------------------------------------------------------------
  // Schedule D Totals
  // --------------------------------------------------------------------------

  describe('Schedule D totals', () => {
    it('computes correct Schedule D aggregates', () => {
      const tracker = setupTrackerWithSales();
      const report = generator.generateReport(tracker, USER, TAX_YEAR);
      const sd = report.scheduleD;

      // Short-term: AAPL only
      expect(sd.shortTermProceeds).toBeCloseTo(1800, 1);
      expect(sd.shortTermCostBasis).toBeCloseTo(1500, 1);
      expect(sd.shortTermAdjustments).toBeCloseTo(0, 1);
      expect(sd.shortTermGainOrLoss).toBeCloseTo(300, 1);

      // Long-term: MSFT + GOOGL
      expect(sd.longTermProceeds).toBeCloseTo(1750 + 3500, 1); // 5250
      expect(sd.longTermCostBasis).toBeCloseTo(2000 + 2800, 1); // 4800
      expect(sd.longTermGainOrLoss).toBeCloseTo(450, 1);

      // Net
      expect(sd.netGainOrLoss).toBeCloseTo(750, 1);
    });
  });

  // --------------------------------------------------------------------------
  // Wash Sale Integration
  // --------------------------------------------------------------------------

  describe('wash sale integration', () => {
    it('includes wash sale disallowed losses in the report', () => {
      const tracker = setupTrackerWithWashSale();
      const washDetector = new WashSaleDetector();
      const report = generator.generateReport(
        tracker,
        USER,
        TAX_YEAR,
        washDetector
      );

      // The tracker's summary already counts wash sale adjustments
      expect(report.washSaleDisallowedLosses).toBeGreaterThanOrEqual(0);
      expect(report.washSaleViolations).toBeInstanceOf(Array);
    });

    it('marks wash sale transactions with adjustment code W', () => {
      const tracker = setupTrackerWithWashSale();
      const report = generator.generateReport(tracker, USER, TAX_YEAR);

      const allRows = [
        ...report.shortTermTransactions,
        ...report.longTermTransactions,
      ];
      const washRows = allRows.filter((r) => r.adjustmentCode === 'W');

      // If events were flagged as wash sale, they should have code W
      const events = tracker.getEvents(USER, TAX_YEAR);
      const washEvents = events.filter((e) => e.isWashSale);

      expect(washRows.length).toBe(washEvents.length);
    });
  });

  // --------------------------------------------------------------------------
  // Harvesting Savings Integration
  // --------------------------------------------------------------------------

  describe('harvesting savings integration', () => {
    it('includes harvesting savings estimate when scanner and prices provided', () => {
      const tracker = new TaxLotTracker();
      // Position with unrealized loss (still open)
      tracker.addLot(USER, 'AAPL', 10, 200, date('2025-06-01'));

      const prices = new Map<string, number>();
      prices.set('AAPL', 150); // $50/share loss × 10 = $500 unrealized loss

      const scanner = new HarvestingScanner();
      const report = generator.generateReport(
        tracker,
        USER,
        TAX_YEAR,
        undefined,
        scanner,
        prices
      );

      // Should have harvesting estimate > 0 (loss × effective rate)
      expect(report.harvestingSavingsEstimate).toBeGreaterThan(0);
      expect(report.harvestingOpportunitiesCount).toBe(1);
    });

    it('returns zero harvesting savings when no scanner provided', () => {
      const tracker = setupTrackerWithSales();
      const report = generator.generateReport(tracker, USER, TAX_YEAR);

      expect(report.harvestingSavingsEstimate).toBe(0);
      expect(report.harvestingOpportunitiesCount).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // JSON Export
  // --------------------------------------------------------------------------

  describe('exportJSON', () => {
    it('exports valid JSON string with all report fields', () => {
      const tracker = setupTrackerWithSales();
      const report = generator.generateReport(tracker, USER, TAX_YEAR);
      const json = generator.exportJSON(report);

      const parsed = JSON.parse(json) as AnnualTaxReport;
      expect(parsed.taxYear).toBe(TAX_YEAR);
      expect(parsed.userId).toBe(USER);
      expect(parsed.scheduleD.netGainOrLoss).toBeCloseTo(750, 1);
      expect(parsed.shortTermTransactions).toBeInstanceOf(Array);
      expect(parsed.longTermTransactions).toBeInstanceOf(Array);
    });
  });

  // --------------------------------------------------------------------------
  // CSV Export
  // --------------------------------------------------------------------------

  describe('exportCSV', () => {
    it('exports CSV with header row and correct columns', () => {
      const tracker = setupTrackerWithSales();
      const report = generator.generateReport(tracker, USER, TAX_YEAR);
      const csv = generator.exportCSV(report);
      const lines = csv.split('\n');

      // Header
      expect(lines[0]).toContain('Term');
      expect(lines[0]).toContain('Description');
      expect(lines[0]).toContain('Proceeds');
      expect(lines[0]).toContain('Cost Basis');
      expect(lines[0]).toContain('Gain or Loss');

      // Data rows: 1 short-term + 2 long-term = 3 data rows
      const dataLines = lines.filter(
        (l) => l.startsWith('Short-Term') || l.startsWith('Long-Term')
      );
      expect(dataLines.length).toBe(3);
    });

    it('includes summary footer lines in CSV', () => {
      const tracker = setupTrackerWithSales();
      const report = generator.generateReport(tracker, USER, TAX_YEAR);
      const csv = generator.exportCSV(report);

      expect(csv).toContain(`# Tax Year ${TAX_YEAR} Summary`);
      expect(csv).toContain('# Short-Term Net:');
      expect(csv).toContain('# Long-Term Net:');
      expect(csv).toContain('# Net Gain/Loss:');
      expect(csv).toContain('# Wash Sale Disallowed:');
      expect(csv).toContain('# Harvesting Savings Estimate:');
    });

    it('formats monetary values with 2 decimal places', () => {
      const tracker = setupTrackerWithSales();
      const report = generator.generateReport(tracker, USER, TAX_YEAR);
      const csv = generator.exportCSV(report);
      const lines = csv.split('\n');

      // Check a data line for formatted values
      const aaplLine = lines.find((l) => l.includes('AAPL'));
      expect(aaplLine).toBeDefined();
      expect(aaplLine).toContain('1800.00'); // proceeds
      expect(aaplLine).toContain('1500.00'); // cost basis
      expect(aaplLine).toContain('300.00'); // gain
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('edge cases', () => {
    it('handles empty year with no events', () => {
      const tracker = new TaxLotTracker();
      const report = generator.generateReport(tracker, USER, 2030);

      expect(report.shortTermTransactions.length).toBe(0);
      expect(report.longTermTransactions.length).toBe(0);
      expect(report.summary.eventCount).toBe(0);
      expect(report.scheduleD.netGainOrLoss).toBeCloseTo(0, 10);
    });

    it('excludes events from other tax years', () => {
      const tracker = setupTrackerWithSales();
      // All sales are in 2025 — requesting 2024 should return nothing
      const report = generator.generateReport(tracker, USER, 2024);

      expect(report.shortTermTransactions.length).toBe(0);
      expect(report.longTermTransactions.length).toBe(0);
      expect(report.summary.totalRealizedGain).toBeCloseTo(0, 10);
    });

    it('handles multiple sales of the same symbol', () => {
      const tracker = new TaxLotTracker();

      // Two separate AAPL lots sold in the same year
      tracker.addLot(USER, 'AAPL', 10, 100, date('2025-01-01'));
      tracker.addLot(USER, 'AAPL', 5, 120, date('2025-02-01'));
      tracker.sellShares(USER, 'AAPL', 10, 150, date('2025-07-01'));
      tracker.sellShares(USER, 'AAPL', 5, 130, date('2025-08-01'));

      const report = generator.generateReport(tracker, USER, TAX_YEAR);

      // Both sales should appear as short-term (held < 365 days)
      expect(report.shortTermTransactions.length).toBe(2);

      // First sale: 10 × ($150 - $100) = $500 gain
      expect(report.shortTermTransactions[0].gainOrLoss).toBeCloseTo(500, 1);

      // Second sale: 5 × ($130 - $120) = $50 gain
      expect(report.shortTermTransactions[1].gainOrLoss).toBeCloseTo(50, 1);

      expect(report.scheduleD.shortTermGainOrLoss).toBeCloseTo(550, 1);
    });
  });
});
