/**
 * Unit Tests for WashSaleDetector
 *
 * Tests wash sale violation detection for same-ticker repurchases,
 * substantially identical securities, pre-trade warnings, adjusted
 * cost basis calculation, and transaction history scanning.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TaxLotTracker } from '../../src/tax/TaxLotTracker.js';
import { WashSaleDetector } from '../../src/tax/WashSaleDetector.js';
import type {
  WashSaleScanResult,
  WashSaleViolation,
  TradeWashSaleWarning,
  AdjustedCostBasisResult,
} from '../../src/tax/WashSaleDetector.js';

// ============================================================================
// HELPERS
// ============================================================================

const USER = 'user-1';

function date(iso: string): Date {
  return new Date(iso);
}

/**
 * Set up a tracker with a classic wash sale scenario:
 * Buy AAPL, sell at a loss, buy again within 30 days.
 */
function setupWashSaleScenario(): TaxLotTracker {
  const tracker = new TaxLotTracker();

  // Buy AAPL at $200 on Jan 1
  tracker.addLot(USER, 'AAPL', 10, 200, date('2025-06-01'));

  // Buy replacement AAPL at $155 on Jun 20 (within 30 days BEFORE the sale)
  tracker.addLot(USER, 'AAPL', 10, 155, date('2025-06-20'));

  // Sell original AAPL at $150 on Jun 25 (loss of $50/share)
  tracker.sellShares(USER, 'AAPL', 10, 150, date('2025-06-25'), 'specific', ['tl_1']);

  return tracker;
}

/**
 * Set up a tracker with a substantially identical securities wash sale:
 * Sell GOOGL at a loss, buy GOOG within 30 days.
 */
function setupSubstantiallyIdenticalScenario(): TaxLotTracker {
  const tracker = new TaxLotTracker();

  // Buy GOOGL at $180 on Jan 1
  tracker.addLot(USER, 'GOOGL', 20, 180, date('2025-03-01'));

  // Sell GOOGL at $160 on Jun 15 (loss of $20/share × 20 = $400)
  tracker.sellShares(USER, 'GOOGL', 20, 160, date('2025-06-15'));

  // Buy GOOG (same company, Class C) at $162 on Jun 25 — within 30 days
  tracker.addLot(USER, 'GOOG', 15, 162, date('2025-06-25'));

  return tracker;
}

// ============================================================================
// TESTS
// ============================================================================

describe('WashSaleDetector', () => {
  let detector: WashSaleDetector;

  beforeEach(() => {
    detector = new WashSaleDetector();
  });

  // --------------------------------------------------------------------------
  // Constructor & Configuration
  // --------------------------------------------------------------------------

  describe('constructor', () => {
    it('uses default 30-day window', () => {
      const d = new WashSaleDetector();
      // Verify by checking that day 31 doesn't trigger but day 29 does
      const tracker = new TaxLotTracker();
      tracker.addLot(USER, 'AAPL', 10, 200, date('2025-01-01'));
      tracker.sellShares(USER, 'AAPL', 10, 150, date('2025-06-01'));

      // Buy 31 days after — no wash sale
      tracker.addLot(USER, 'AAPL', 10, 155, date('2025-07-02'));
      const result = d.scanTransactionHistory(tracker, USER);
      expect(result.violationCount).toBe(0);
    });

    it('accepts custom window configuration', () => {
      const d = new WashSaleDetector({ windowDays: 60 });
      const tracker = new TaxLotTracker();
      tracker.addLot(USER, 'AAPL', 10, 200, date('2025-01-01'));
      tracker.sellShares(USER, 'AAPL', 10, 150, date('2025-06-01'));

      // Buy 45 days after — within 60-day window
      tracker.addLot(USER, 'AAPL', 10, 155, date('2025-07-16'));
      const result = d.scanTransactionHistory(tracker, USER);
      expect(result.violationCount).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // Same Ticker Detection
  // --------------------------------------------------------------------------

  describe('same ticker wash sale detection', () => {
    it('detects repurchase within 30 days AFTER loss sale', () => {
      const tracker = new TaxLotTracker();
      // Buy at $200, sell at $150 (loss), rebuy at $155 within 30 days
      tracker.addLot(USER, 'AAPL', 10, 200, date('2025-01-01'));
      tracker.sellShares(USER, 'AAPL', 10, 150, date('2025-06-01'));
      tracker.addLot(USER, 'AAPL', 10, 155, date('2025-06-15'));

      const result = detector.scanTransactionHistory(tracker, USER);
      expect(result.violationCount).toBe(1);
      expect(result.violations[0].matchType).toBe('same_ticker');
      expect(result.violations[0].saleSymbol).toBe('AAPL');
    });

    it('detects repurchase within 30 days BEFORE loss sale', () => {
      const tracker = setupWashSaleScenario();
      const result = detector.scanTransactionHistory(tracker, USER);

      expect(result.violationCount).toBe(1);
      expect(result.violations[0].matchType).toBe('same_ticker');
      expect(result.violations[0].replacementSymbol).toBe('AAPL');
    });

    it('does not flag repurchase outside 30-day window', () => {
      const tracker = new TaxLotTracker();
      tracker.addLot(USER, 'AAPL', 10, 200, date('2025-01-01'));
      tracker.sellShares(USER, 'AAPL', 10, 150, date('2025-06-01'));

      // Buy 35 days later — outside window
      tracker.addLot(USER, 'AAPL', 10, 155, date('2025-07-06'));
      const result = detector.scanTransactionHistory(tracker, USER);
      expect(result.violationCount).toBe(0);
    });

    it('does not flag gain sales as wash sales', () => {
      const tracker = new TaxLotTracker();
      // Buy at $100, sell at $150 (GAIN), rebuy immediately
      tracker.addLot(USER, 'AAPL', 10, 100, date('2025-01-01'));
      tracker.sellShares(USER, 'AAPL', 10, 150, date('2025-06-01'));
      tracker.addLot(USER, 'AAPL', 10, 155, date('2025-06-05'));

      const result = detector.scanTransactionHistory(tracker, USER);
      expect(result.violationCount).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Substantially Identical Securities
  // --------------------------------------------------------------------------

  describe('substantially identical securities', () => {
    it('detects GOOGL sale followed by GOOG purchase', () => {
      const tracker = setupSubstantiallyIdenticalScenario();
      const result = detector.scanTransactionHistory(tracker, USER);

      expect(result.violationCount).toBe(1);
      expect(result.violations[0].matchType).toBe('substantially_identical');
      expect(result.violations[0].saleSymbol).toBe('GOOGL');
      expect(result.violations[0].replacementSymbol).toBe('GOOG');
    });

    it('detects GOOG sale followed by GOOGL purchase', () => {
      const tracker = new TaxLotTracker();
      tracker.addLot(USER, 'GOOG', 10, 180, date('2025-01-01'));
      tracker.sellShares(USER, 'GOOG', 10, 160, date('2025-06-01'));
      tracker.addLot(USER, 'GOOGL', 10, 162, date('2025-06-15'));

      const result = detector.scanTransactionHistory(tracker, USER);
      expect(result.violationCount).toBe(1);
      expect(result.violations[0].matchType).toBe('substantially_identical');
    });

    it('correctly identifies substantially identical pairs', () => {
      expect(detector.areSubstantiallyIdentical('GOOGL', 'GOOG')).toBe(true);
      expect(detector.areSubstantiallyIdentical('GOOG', 'GOOGL')).toBe(true);
      expect(detector.areSubstantiallyIdentical('BRK.A', 'BRK.B')).toBe(true);
      expect(detector.areSubstantiallyIdentical('UAA', 'UA')).toBe(true);
    });

    it('does not treat unrelated tickers as substantially identical', () => {
      expect(detector.areSubstantiallyIdentical('AAPL', 'MSFT')).toBe(false);
      expect(detector.areSubstantiallyIdentical('GOOGL', 'AAPL')).toBe(false);
    });

    it('treats same ticker as substantially identical', () => {
      expect(detector.areSubstantiallyIdentical('AAPL', 'AAPL')).toBe(true);
    });

    it('is case-insensitive', () => {
      expect(detector.areSubstantiallyIdentical('googl', 'GOOG')).toBe(true);
      expect(detector.areSubstantiallyIdentical('Brk.a', 'brk.b')).toBe(true);
    });

    it('does not flag unrelated sector peers as identical', () => {
      // AAPL and MSFT are in the same sector but NOT the same company
      const tracker = new TaxLotTracker();
      tracker.addLot(USER, 'AAPL', 10, 200, date('2025-01-01'));
      tracker.sellShares(USER, 'AAPL', 10, 150, date('2025-06-01'));
      tracker.addLot(USER, 'MSFT', 10, 400, date('2025-06-15'));

      const result = detector.scanTransactionHistory(tracker, USER);
      expect(result.violationCount).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Pre-Trade Warnings
  // --------------------------------------------------------------------------

  describe('pre-trade warnings', () => {
    it('warns when buying same ticker within window of loss sale', () => {
      const tracker = new TaxLotTracker();
      tracker.addLot(USER, 'AAPL', 10, 200, date('2025-01-01'));
      tracker.sellShares(USER, 'AAPL', 10, 150, date('2025-06-01'));

      const warning = detector.checkTradeWarning(
        tracker,
        USER,
        'AAPL',
        date('2025-06-15')
      );

      expect(warning.wouldCreateWashSale).toBe(true);
      expect(warning.matchingLossSales).toHaveLength(1);
      expect(warning.matchingLossSales[0].matchType).toBe('same_ticker');
      expect(warning.message).toContain('WARNING');
      expect(warning.message).toContain('wash sale');
    });

    it('warns when buying substantially identical security', () => {
      const tracker = new TaxLotTracker();
      tracker.addLot(USER, 'GOOGL', 10, 180, date('2025-01-01'));
      tracker.sellShares(USER, 'GOOGL', 10, 160, date('2025-06-01'));

      const warning = detector.checkTradeWarning(
        tracker,
        USER,
        'GOOG',
        date('2025-06-15')
      );

      expect(warning.wouldCreateWashSale).toBe(true);
      expect(warning.matchingLossSales[0].matchType).toBe('substantially_identical');
    });

    it('does not warn when outside wash sale window', () => {
      const tracker = new TaxLotTracker();
      tracker.addLot(USER, 'AAPL', 10, 200, date('2025-01-01'));
      tracker.sellShares(USER, 'AAPL', 10, 150, date('2025-06-01'));

      const warning = detector.checkTradeWarning(
        tracker,
        USER,
        'AAPL',
        date('2025-08-01') // 61 days after sale — well outside window
      );

      expect(warning.wouldCreateWashSale).toBe(false);
      expect(warning.matchingLossSales).toHaveLength(0);
      expect(warning.message).toContain('No wash sale risk');
    });

    it('does not warn for gain sales', () => {
      const tracker = new TaxLotTracker();
      tracker.addLot(USER, 'AAPL', 10, 100, date('2025-01-01'));
      tracker.sellShares(USER, 'AAPL', 10, 150, date('2025-06-01')); // GAIN

      const warning = detector.checkTradeWarning(
        tracker,
        USER,
        'AAPL',
        date('2025-06-15')
      );

      expect(warning.wouldCreateWashSale).toBe(false);
    });

    it('includes total disallowed loss in warning message', () => {
      const tracker = new TaxLotTracker();
      // Two loss sales
      tracker.addLot(USER, 'AAPL', 10, 200, date('2025-01-01'));
      tracker.sellShares(USER, 'AAPL', 10, 150, date('2025-06-01')); // -$500

      const warning = detector.checkTradeWarning(
        tracker,
        USER,
        'AAPL',
        date('2025-06-15')
      );

      expect(warning.message).toContain('$500.00');
    });
  });

  // --------------------------------------------------------------------------
  // Adjusted Cost Basis
  // --------------------------------------------------------------------------

  describe('adjusted cost basis', () => {
    it('adds disallowed loss to replacement cost basis', () => {
      // Original: bought at $200, sold at $150 → loss of $50/share
      // Replacement: bought at $155
      // Adjusted basis: $155 + $50 = $205
      const result = detector.calculateAdjustedCostBasis(155, 50, 10, 'tl_1');

      expect(result.adjustedCostBasis).toBe(205);
      expect(result.disallowedLoss).toBe(500); // $50 × 10 shares
      expect(result.affectedShares).toBe(10);
      expect(result.originalCostBasis).toBe(155);
    });

    it('handles partial share wash sales', () => {
      // Sold 10 shares at loss of $30/share, but only bought 5 replacement
      const result = detector.calculateAdjustedCostBasis(160, 30, 5, 'tl_2');

      expect(result.adjustedCostBasis).toBe(190); // $160 + $30
      expect(result.disallowedLoss).toBe(150); // $30 × 5 shares
      expect(result.affectedShares).toBe(5);
    });

    it('works with negative disallowed loss input (takes absolute value)', () => {
      const result = detector.calculateAdjustedCostBasis(155, -50, 10, 'tl_3');
      expect(result.adjustedCostBasis).toBe(205);
      expect(result.disallowedLoss).toBe(500);
    });
  });

  // --------------------------------------------------------------------------
  // Transaction History Scanning
  // --------------------------------------------------------------------------

  describe('scanTransactionHistory', () => {
    it('returns correct scan result structure', () => {
      const tracker = setupWashSaleScenario();
      const result: WashSaleScanResult = detector.scanTransactionHistory(tracker, USER);

      expect(result).toHaveProperty('violations');
      expect(result).toHaveProperty('totalDisallowedLosses');
      expect(result).toHaveProperty('totalAdjustedCostBasis');
      expect(result).toHaveProperty('scannedEvents');
      expect(result).toHaveProperty('violationCount');
      expect(result.scannedEvents).toBeGreaterThan(0);
    });

    it('calculates correct disallowed loss amount', () => {
      const tracker = setupWashSaleScenario();
      const result = detector.scanTransactionHistory(tracker, USER);

      // Sold 10 shares at $150, cost $200 → loss = -$500
      // Replacement: 10 shares at $155
      // Affected shares: min(10, 10) = 10
      // Disallowed loss per share: $50
      // Total disallowed: $500
      expect(result.violations[0].disallowedLoss).toBe(500);
      expect(result.violations[0].affectedShares).toBe(10);
    });

    it('handles violation with fewer replacement shares than sold', () => {
      const tracker = new TaxLotTracker();
      // Sell 20 shares at loss
      tracker.addLot(USER, 'AAPL', 20, 200, date('2025-01-01'));
      tracker.sellShares(USER, 'AAPL', 20, 150, date('2025-06-01'));
      // Buy only 5 replacement shares
      tracker.addLot(USER, 'AAPL', 5, 155, date('2025-06-10'));

      const result = detector.scanTransactionHistory(tracker, USER);
      expect(result.violationCount).toBe(1);
      // Only 5 shares affected (min of 20 sold, 5 bought)
      expect(result.violations[0].affectedShares).toBe(5);
    });

    it('returns zero violations for clean transaction history', () => {
      const tracker = new TaxLotTracker();
      // Only gains
      tracker.addLot(USER, 'AAPL', 10, 100, date('2025-01-01'));
      tracker.sellShares(USER, 'AAPL', 10, 150, date('2025-06-01'));

      const result = detector.scanTransactionHistory(tracker, USER);
      expect(result.violationCount).toBe(0);
      expect(result.totalDisallowedLosses).toBe(0);
    });

    it('handles multiple violations across different symbols', () => {
      const tracker = new TaxLotTracker();

      // AAPL wash sale
      tracker.addLot(USER, 'AAPL', 10, 200, date('2025-01-01'));
      tracker.sellShares(USER, 'AAPL', 10, 150, date('2025-06-01'));
      tracker.addLot(USER, 'AAPL', 10, 155, date('2025-06-10'));

      // MSFT wash sale
      tracker.addLot(USER, 'MSFT', 5, 400, date('2025-01-01'));
      tracker.sellShares(USER, 'MSFT', 5, 350, date('2025-06-15'));
      tracker.addLot(USER, 'MSFT', 5, 355, date('2025-06-20'));

      const result = detector.scanTransactionHistory(tracker, USER);
      expect(result.violationCount).toBe(2);

      const symbols = result.violations.map((v) => v.saleSymbol).sort();
      expect(symbols).toEqual(['AAPL', 'MSFT']);

      // Total disallowed: AAPL $500 + MSFT $250
      expect(result.totalDisallowedLosses).toBe(750);
    });

    it('scans only the specified user', () => {
      const tracker = new TaxLotTracker();

      // User 1 has a wash sale
      tracker.addLot(USER, 'AAPL', 10, 200, date('2025-01-01'));
      tracker.sellShares(USER, 'AAPL', 10, 150, date('2025-06-01'));
      tracker.addLot(USER, 'AAPL', 10, 155, date('2025-06-10'));

      // User 2 also has one
      tracker.addLot('user-2', 'AAPL', 5, 200, date('2025-01-01'));
      tracker.sellShares('user-2', 'AAPL', 5, 150, date('2025-06-01'));
      tracker.addLot('user-2', 'AAPL', 5, 155, date('2025-06-10'));

      const result1 = detector.scanTransactionHistory(tracker, USER);
      const result2 = detector.scanTransactionHistory(tracker, 'user-2');

      expect(result1.violationCount).toBe(1);
      expect(result2.violationCount).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // Adjusted Cost Basis in Violations
  // --------------------------------------------------------------------------

  describe('violation adjusted cost basis', () => {
    it('correctly adjusts replacement lot cost basis', () => {
      const tracker = setupWashSaleScenario();
      const result = detector.scanTransactionHistory(tracker, USER);
      const violation: WashSaleViolation = result.violations[0];

      // Original AAPL cost: $200, sold at $150 → loss per share: $50
      // Replacement AAPL cost: $155
      // Adjusted: $155 + $50 = $205
      expect(violation.adjustedCostBasis).toBe(205);
      expect(violation.replacementCostBasis).toBe(155);
    });

    it('correctly computes adjusted basis for substantially identical', () => {
      const tracker = setupSubstantiallyIdenticalScenario();
      const result = detector.scanTransactionHistory(tracker, USER);
      const violation = result.violations[0];

      // GOOGL: cost $180, sold at $160 → loss $20/share
      // GOOG replacement: cost $162
      // Adjusted: $162 + $20 = $182
      expect(violation.adjustedCostBasis).toBe(182);
      expect(violation.replacementCostBasis).toBe(162);
      expect(violation.saleLoss).toBe(-400); // -$20 × 20 shares
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('edge cases', () => {
    it('handles empty transaction history', () => {
      const tracker = new TaxLotTracker();
      const result = detector.scanTransactionHistory(tracker, USER);

      expect(result.violationCount).toBe(0);
      expect(result.violations).toEqual([]);
      expect(result.scannedEvents).toBe(0);
    });

    it('handles user with no loss sales', () => {
      const tracker = new TaxLotTracker();
      tracker.addLot(USER, 'AAPL', 10, 100, date('2025-01-01'));

      const result = detector.scanTransactionHistory(tracker, USER);
      expect(result.violationCount).toBe(0);
    });

    it('handles sale on exact boundary of 30-day window', () => {
      const tracker = new TaxLotTracker();
      tracker.addLot(USER, 'AAPL', 10, 200, date('2025-01-01'));
      tracker.sellShares(USER, 'AAPL', 10, 150, date('2025-06-01'));

      // Buy exactly 30 days later (on the boundary — should be included)
      tracker.addLot(USER, 'AAPL', 10, 155, date('2025-07-01'));
      const result = detector.scanTransactionHistory(tracker, USER);
      expect(result.violationCount).toBe(1);
    });

    it('getIdenticalSymbols returns empty set for unknown ticker', () => {
      const identicals = detector.getIdenticalSymbols('XYZ_UNKNOWN');
      expect(identicals.size).toBe(0);
    });

    it('pre-trade warning works with substantially identical case-insensitive', () => {
      const tracker = new TaxLotTracker();
      tracker.addLot(USER, 'GOOGL', 10, 180, date('2025-01-01'));
      tracker.sellShares(USER, 'GOOGL', 10, 160, date('2025-06-01'));

      const warning = detector.checkTradeWarning(
        tracker,
        USER,
        'goog', // lowercase
        date('2025-06-15')
      );

      expect(warning.wouldCreateWashSale).toBe(true);
    });
  });
});
