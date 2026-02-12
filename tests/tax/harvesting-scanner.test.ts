/**
 * Unit Tests for HarvestingScanner
 *
 * Tests tax-loss harvesting opportunity detection, tax savings estimation,
 * replacement security suggestions, ranking by savings potential,
 * holding period classification, and edge cases.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TaxLotTracker } from '../../src/tax/TaxLotTracker.js';
import { HarvestingScanner } from '../../src/tax/HarvestingScanner.js';
import type {
  HarvestingScanResult,
  HarvestingOpportunity,
  ReplacementSecurity,
} from '../../src/tax/HarvestingScanner.js';

// ============================================================================
// HELPERS
// ============================================================================

const USER = 'user-1';

function date(iso: string): Date {
  return new Date(iso);
}

function setupTrackerWithLosses(): {
  tracker: TaxLotTracker;
  prices: Map<string, number>;
} {
  const tracker = new TaxLotTracker();

  // AAPL: bought at $200, now $150 => loss of $50/share × 10 = $500
  tracker.addLot(USER, 'AAPL', 10, 200, date('2025-06-01'));

  // MSFT: bought at $400, now $380 => loss of $20/share × 5 = $100
  tracker.addLot(USER, 'MSFT', 5, 400, date('2025-08-01'));

  // GOOGL: bought at $150, now $170 => GAIN (should not appear)
  tracker.addLot(USER, 'GOOGL', 20, 150, date('2025-03-01'));

  const prices = new Map<string, number>();
  prices.set('AAPL', 150);
  prices.set('MSFT', 380);
  prices.set('GOOGL', 170);

  return { tracker, prices };
}

// ============================================================================
// TESTS
// ============================================================================

describe('HarvestingScanner', () => {
  let scanner: HarvestingScanner;

  beforeEach(() => {
    scanner = new HarvestingScanner();
  });

  // --------------------------------------------------------------------------
  // Constructor & Configuration
  // --------------------------------------------------------------------------

  describe('constructor', () => {
    it('uses default config when none provided', () => {
      const s = new HarvestingScanner();
      expect(s.effectiveShortTermRate()).toBeCloseTo(0.42, 10); // 0.37 + 0.05
      expect(s.effectiveLongTermRate()).toBeCloseTo(0.25, 10); // 0.20 + 0.05
    });

    it('accepts custom configuration', () => {
      const s = new HarvestingScanner({
        minimumLossThreshold: 500,
        shortTermTaxRate: 0.32,
        longTermTaxRate: 0.15,
        stateTaxRate: 0.10,
      });
      expect(s.effectiveShortTermRate()).toBeCloseTo(0.42, 10);
      expect(s.effectiveLongTermRate()).toBeCloseTo(0.25, 10);
    });
  });

  // --------------------------------------------------------------------------
  // Basic Scanning
  // --------------------------------------------------------------------------

  describe('scan', () => {
    it('identifies positions with unrealized losses', () => {
      const { tracker, prices } = setupTrackerWithLosses();
      const result = scanner.scan(tracker, USER, prices);

      expect(result.qualifyingPositions).toBe(2); // AAPL and MSFT
      expect(result.scannedPositions).toBe(3); // all 3 positions scanned
      expect(result.opportunities.length).toBe(2);
    });

    it('excludes positions with gains', () => {
      const { tracker, prices } = setupTrackerWithLosses();
      const result = scanner.scan(tracker, USER, prices);

      const symbols = result.opportunities.map((o) => o.symbol);
      expect(symbols).not.toContain('GOOGL');
    });

    it('returns empty when no positions have losses', () => {
      const tracker = new TaxLotTracker();
      tracker.addLot(USER, 'AAPL', 10, 100, date('2025-01-01'));

      const prices = new Map<string, number>();
      prices.set('AAPL', 200); // gain

      const result = scanner.scan(tracker, USER, prices);
      expect(result.qualifyingPositions).toBe(0);
      expect(result.opportunities.length).toBe(0);
      expect(result.totalEstimatedTaxSavings).toBe(0);
    });

    it('returns empty for user with no positions', () => {
      const tracker = new TaxLotTracker();
      const prices = new Map<string, number>();
      const result = scanner.scan(tracker, USER, prices);

      expect(result.scannedPositions).toBe(0);
      expect(result.qualifyingPositions).toBe(0);
      expect(result.opportunities.length).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Minimum Loss Threshold
  // --------------------------------------------------------------------------

  describe('minimum loss threshold', () => {
    it('excludes losses below $100 default threshold', () => {
      const tracker = new TaxLotTracker();
      // Loss of $50 (below threshold)
      tracker.addLot(USER, 'AAPL', 5, 110, date('2025-06-01'));

      const prices = new Map<string, number>();
      prices.set('AAPL', 100); // $10 loss × 5 = $50

      const result = scanner.scan(tracker, USER, prices);
      expect(result.qualifyingPositions).toBe(0);
    });

    it('includes losses at or above threshold', () => {
      const tracker = new TaxLotTracker();
      // Loss of exactly $100 (at threshold)
      tracker.addLot(USER, 'AAPL', 10, 110, date('2025-06-01'));

      const prices = new Map<string, number>();
      prices.set('AAPL', 100); // $10 loss × 10 = $100

      const result = scanner.scan(tracker, USER, prices);
      expect(result.qualifyingPositions).toBe(1);
    });

    it('respects custom threshold', () => {
      const customScanner = new HarvestingScanner({ minimumLossThreshold: 500 });
      const { tracker, prices } = setupTrackerWithLosses();

      const result = customScanner.scan(tracker, USER, prices);
      // AAPL loss = $500 (at threshold), MSFT loss = $100 (below 500)
      expect(result.qualifyingPositions).toBe(1);
      expect(result.opportunities[0].symbol).toBe('AAPL');
    });
  });

  // --------------------------------------------------------------------------
  // Tax Savings Estimation
  // --------------------------------------------------------------------------

  describe('tax savings estimation', () => {
    it('estimates tax savings for short-term losses', () => {
      const tracker = new TaxLotTracker();
      // Short-term lot (< 365 days): bought 2025-08-01, ref date ~2026-01-15
      tracker.addLot(USER, 'AAPL', 10, 200, date('2025-08-01'));

      const prices = new Map<string, number>();
      prices.set('AAPL', 150); // $500 loss

      const result = scanner.scan(tracker, USER, prices);
      expect(result.qualifyingPositions).toBe(1);

      const opp = result.opportunities[0];
      expect(opp.shortTermLoss).toBeCloseTo(-500, 5);
      expect(opp.longTermLoss).toBeCloseTo(0, 10);
      // Short-term savings: $500 × (0.37 + 0.05) = $210
      expect(opp.shortTermTaxSavings).toBeCloseTo(210, 5);
      expect(opp.longTermTaxSavings).toBeCloseTo(0, 10);
      expect(opp.estimatedTaxSavings).toBeCloseTo(210, 5);
    });

    it('estimates tax savings for long-term losses', () => {
      const tracker = new TaxLotTracker();
      // Long-term lot (> 365 days): bought 2024-06-01
      tracker.addLot(USER, 'AAPL', 10, 200, date('2024-06-01'));

      const prices = new Map<string, number>();
      prices.set('AAPL', 150); // $500 loss

      const result = scanner.scan(tracker, USER, prices);
      expect(result.qualifyingPositions).toBe(1);

      const opp = result.opportunities[0];
      expect(opp.longTermLoss).toBeCloseTo(-500, 5);
      expect(opp.shortTermLoss).toBeCloseTo(0, 10);
      // Long-term savings: $500 × (0.20 + 0.05) = $125
      expect(opp.longTermTaxSavings).toBeCloseTo(125, 5);
      expect(opp.shortTermTaxSavings).toBeCloseTo(0, 10);
      expect(opp.estimatedTaxSavings).toBeCloseTo(125, 5);
    });

    it('handles mixed short and long-term lots for same symbol', () => {
      const tracker = new TaxLotTracker();
      // Long-term lot: bought 2024-06-01 => $500 loss
      tracker.addLot(USER, 'AAPL', 10, 200, date('2024-06-01'));
      // Short-term lot: bought 2025-10-01 => $300 loss
      tracker.addLot(USER, 'AAPL', 10, 180, date('2025-10-01'));

      const prices = new Map<string, number>();
      prices.set('AAPL', 150);

      const result = scanner.scan(tracker, USER, prices);
      expect(result.qualifyingPositions).toBe(1);

      const opp = result.opportunities[0];
      expect(opp.shortTermLoss).toBeCloseTo(-300, 5);
      expect(opp.longTermLoss).toBeCloseTo(-500, 5);
      // Mixed: ST $300 × 0.42 = $126; LT $500 × 0.25 = $125; total = $251
      expect(opp.estimatedTaxSavings).toBeCloseTo(251, 5);
      expect(opp.totalShares).toBe(20);
    });

    it('computes correct totals across all opportunities', () => {
      const { tracker, prices } = setupTrackerWithLosses();
      const result = scanner.scan(tracker, USER, prices);

      expect(result.totalUnrealizedLosses).toBeCloseTo(-600, 5); // -500 + -100
      // Both are short-term in the test setup
      expect(result.totalEstimatedTaxSavings).toBeCloseTo(600 * 0.42, 5);
    });
  });

  // --------------------------------------------------------------------------
  // Ranking by Tax Savings
  // --------------------------------------------------------------------------

  describe('ranking', () => {
    it('ranks opportunities by estimated tax savings (highest first)', () => {
      const { tracker, prices } = setupTrackerWithLosses();
      const result = scanner.scan(tracker, USER, prices);

      expect(result.opportunities.length).toBe(2);
      // AAPL ($500 loss) should rank before MSFT ($100 loss)
      expect(result.opportunities[0].symbol).toBe('AAPL');
      expect(result.opportunities[1].symbol).toBe('MSFT');
      expect(result.opportunities[0].estimatedTaxSavings).toBeGreaterThan(
        result.opportunities[1].estimatedTaxSavings
      );
    });
  });

  // --------------------------------------------------------------------------
  // Replacement Securities
  // --------------------------------------------------------------------------

  describe('suggestReplacements', () => {
    it('suggests same-sector replacements for known symbols', () => {
      const replacements = scanner.suggestReplacements('AAPL');

      expect(replacements.length).toBe(3);
      for (const r of replacements) {
        expect(r.sector).toBe('Technology');
        expect(r.symbol).not.toBe('AAPL');
        expect(r.reason).toContain('Same sector');
        expect(r.reason).toContain('wash sale');
      }
    });

    it('excludes the original symbol from replacements', () => {
      const replacements = scanner.suggestReplacements('JPM');

      const symbols = replacements.map((r) => r.symbol);
      expect(symbols).not.toContain('JPM');
      expect(replacements.length).toBe(3);
      for (const r of replacements) {
        expect(r.sector).toBe('Financials');
      }
    });

    it('returns empty for unknown symbols', () => {
      const replacements = scanner.suggestReplacements('UNKNOWN_TICKER');
      expect(replacements.length).toBe(0);
    });

    it('returns up to 3 replacements', () => {
      const replacements = scanner.suggestReplacements('NEE');
      expect(replacements.length).toBeLessThanOrEqual(3);
      expect(replacements.length).toBeGreaterThan(0);
      for (const r of replacements) {
        expect(r.sector).toBe('Utilities');
      }
    });

    it('includes replacements in scan results', () => {
      const { tracker, prices } = setupTrackerWithLosses();
      const result = scanner.scan(tracker, USER, prices);

      for (const opp of result.opportunities) {
        expect(opp.replacements.length).toBeGreaterThan(0);
        for (const r of opp.replacements) {
          expect(r.symbol).not.toBe(opp.symbol);
        }
      }
    });
  });

  // --------------------------------------------------------------------------
  // Opportunity Detail Fields
  // --------------------------------------------------------------------------

  describe('opportunity details', () => {
    it('populates all fields correctly', () => {
      const tracker = new TaxLotTracker();
      tracker.addLot(USER, 'AAPL', 10, 200, date('2025-08-01'));

      const prices = new Map<string, number>();
      prices.set('AAPL', 150);

      const result = scanner.scan(tracker, USER, prices);
      const opp = result.opportunities[0];

      expect(opp.symbol).toBe('AAPL');
      expect(opp.unrealizedLoss).toBeCloseTo(-500, 5);
      expect(opp.currentPrice).toBe(150);
      expect(opp.costBasis).toBeCloseTo(200, 5);
      expect(opp.totalShares).toBe(10);
      expect(opp.lots.length).toBe(1);

      const lot = opp.lots[0];
      expect(lot.shares).toBe(10);
      expect(lot.costBasis).toBe(200);
      expect(lot.unrealizedLoss).toBeCloseTo(-500, 5);
      expect(lot.isShortTerm).toBe(true);
      expect(lot.holdingDays).toBeGreaterThan(0);
    });

    it('computes weighted average cost basis for multi-lot positions', () => {
      const tracker = new TaxLotTracker();
      // Lot 1: 10 shares at $200
      tracker.addLot(USER, 'AAPL', 10, 200, date('2025-08-01'));
      // Lot 2: 10 shares at $180
      tracker.addLot(USER, 'AAPL', 10, 180, date('2025-09-01'));

      const prices = new Map<string, number>();
      prices.set('AAPL', 150); // Both lots have losses

      const result = scanner.scan(tracker, USER, prices);
      const opp = result.opportunities[0];

      // Weighted average: (10×200 + 10×180) / 20 = 190
      expect(opp.costBasis).toBeCloseTo(190, 5);
      expect(opp.totalShares).toBe(20);
      expect(opp.lots.length).toBe(2);
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('edge cases', () => {
    it('handles position with mix of gain and loss lots', () => {
      const tracker = new TaxLotTracker();
      // Lot 1: bought at $100 => gain at $150
      tracker.addLot(USER, 'AAPL', 10, 100, date('2025-06-01'));
      // Lot 2: bought at $200 => loss at $150
      tracker.addLot(USER, 'AAPL', 10, 200, date('2025-08-01'));

      const prices = new Map<string, number>();
      prices.set('AAPL', 150);

      const result = scanner.scan(tracker, USER, prices);

      // Overall position might be break-even, but lot-level losses exist
      // The scanner should still report the loss lots
      // However, UnrealizedGain aggregates to position level:
      // total cost = 10*100 + 10*200 = 3000, value = 20*150 = 3000, gain = 0
      // Since unrealizedGain >= 0, this position is skipped
      expect(result.qualifyingPositions).toBe(0);
    });

    it('handles multiple users independently', () => {
      const tracker = new TaxLotTracker();
      tracker.addLot('user-1', 'AAPL', 10, 200, date('2025-06-01'));
      tracker.addLot('user-2', 'AAPL', 10, 200, date('2025-06-01'));

      const prices = new Map<string, number>();
      prices.set('AAPL', 150);

      const result1 = scanner.scan(tracker, 'user-1', prices);
      const result2 = scanner.scan(tracker, 'user-2', prices);

      expect(result1.qualifyingPositions).toBe(1);
      expect(result2.qualifyingPositions).toBe(1);
    });

    it('handles custom tax rates', () => {
      const customScanner = new HarvestingScanner({
        shortTermTaxRate: 0.32,
        longTermTaxRate: 0.15,
        stateTaxRate: 0.00, // no state tax
      });

      const tracker = new TaxLotTracker();
      tracker.addLot(USER, 'AAPL', 10, 200, date('2025-08-01')); // short-term

      const prices = new Map<string, number>();
      prices.set('AAPL', 100); // $1000 loss

      const result = customScanner.scan(tracker, USER, prices);
      const opp = result.opportunities[0];

      // $1000 × 0.32 = $320 (no state tax)
      expect(opp.estimatedTaxSavings).toBeCloseTo(320, 5);
    });

    it('handles symbol case insensitivity via TaxLotTracker normalization', () => {
      const tracker = new TaxLotTracker();
      tracker.addLot(USER, 'aapl', 10, 200, date('2025-08-01'));

      const prices = new Map<string, number>();
      prices.set('AAPL', 150);

      const result = scanner.scan(tracker, USER, prices);
      expect(result.qualifyingPositions).toBe(1);
      expect(result.opportunities[0].symbol).toBe('AAPL');
    });
  });

  // --------------------------------------------------------------------------
  // Effective Tax Rates
  // --------------------------------------------------------------------------

  describe('effective tax rates', () => {
    it('computes effective short-term rate as federal + state', () => {
      expect(scanner.effectiveShortTermRate()).toBeCloseTo(0.42, 10);
    });

    it('computes effective long-term rate as federal + state', () => {
      expect(scanner.effectiveLongTermRate()).toBeCloseTo(0.25, 10);
    });
  });
});
