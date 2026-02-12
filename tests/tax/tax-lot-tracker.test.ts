/**
 * Unit Tests for TaxLotTracker
 *
 * Tests FIFO/LIFO/specific identification cost basis methods,
 * short-term vs long-term holding periods, unrealized gains,
 * wash sale detection, and tax summary generation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TaxLotTracker } from '../../src/tax/TaxLotTracker.js';
import type {
  TaxLot,
  SaleResult,
  UnrealizedGain,
  TaxSummary,
} from '../../src/tax/TaxLotTracker.js';

// ============================================================================
// HELPERS
// ============================================================================

const USER = 'user-1';

/** Create a Date offset from a base date by N days */
function daysAgo(days: number, from?: Date): Date {
  const base = from ?? new Date('2026-01-15T12:00:00Z');
  return new Date(base.getTime() - days * 24 * 60 * 60 * 1000);
}

function date(iso: string): Date {
  return new Date(iso);
}

// ============================================================================
// TESTS
// ============================================================================

describe('TaxLotTracker', () => {
  let tracker: TaxLotTracker;

  beforeEach(() => {
    tracker = new TaxLotTracker();
  });

  // --------------------------------------------------------------------------
  // Constructor & Configuration
  // --------------------------------------------------------------------------

  describe('constructor', () => {
    it('uses default config when none provided', () => {
      const t = new TaxLotTracker();
      // Default method is fifo — verify by selling and checking order
      t.addLot(USER, 'AAPL', 10, 100, date('2025-01-01'));
      t.addLot(USER, 'AAPL', 10, 200, date('2025-06-01'));
      const result = t.sellShares(USER, 'AAPL', 5, 150, date('2026-01-15'));
      // FIFO: sells from first lot (cost 100)
      expect(result.events[0].costBasis).toBe(100);
    });

    it('accepts custom configuration', () => {
      const t = new TaxLotTracker({
        defaultMethod: 'lifo',
        washSaleWindowDays: 60,
        longTermThresholdDays: 730,
      });
      t.addLot(USER, 'AAPL', 10, 100, date('2025-01-01'));
      t.addLot(USER, 'AAPL', 10, 200, date('2025-06-01'));
      const result = t.sellShares(USER, 'AAPL', 5, 150, date('2026-01-15'));
      // LIFO: sells from last lot (cost 200)
      expect(result.events[0].costBasis).toBe(200);
    });
  });

  // --------------------------------------------------------------------------
  // Lot Management
  // --------------------------------------------------------------------------

  describe('addLot', () => {
    it('creates a lot with correct fields', () => {
      const lot = tracker.addLot(USER, 'AAPL', 100, 150.5, date('2025-06-15'));
      expect(lot.userId).toBe(USER);
      expect(lot.symbol).toBe('AAPL');
      expect(lot.shares).toBe(100);
      expect(lot.costBasis).toBe(150.5);
      expect(lot.purchaseDate).toEqual(date('2025-06-15'));
      expect(lot.soldDate).toBeNull();
    });

    it('uppercases the symbol', () => {
      const lot = tracker.addLot(USER, 'aapl', 10, 100, date('2025-01-01'));
      expect(lot.symbol).toBe('AAPL');
    });

    it('assigns unique IDs', () => {
      const lot1 = tracker.addLot(USER, 'AAPL', 10, 100, date('2025-01-01'));
      const lot2 = tracker.addLot(USER, 'AAPL', 10, 200, date('2025-06-01'));
      expect(lot1.id).not.toBe(lot2.id);
    });

    it('rejects zero or negative shares', () => {
      expect(() => tracker.addLot(USER, 'AAPL', 0, 100, date('2025-01-01'))).toThrow(
        'Shares must be positive'
      );
      expect(() => tracker.addLot(USER, 'AAPL', -5, 100, date('2025-01-01'))).toThrow(
        'Shares must be positive'
      );
    });

    it('rejects zero or negative cost basis', () => {
      expect(() => tracker.addLot(USER, 'AAPL', 10, 0, date('2025-01-01'))).toThrow(
        'Cost basis must be positive'
      );
    });
  });

  describe('getOpenLots', () => {
    it('returns only unsold lots', () => {
      tracker.addLot(USER, 'AAPL', 10, 100, date('2025-01-01'));
      tracker.addLot(USER, 'AAPL', 10, 200, date('2025-06-01'));

      const lots = tracker.getOpenLots(USER, 'AAPL');
      expect(lots).toHaveLength(2);

      // Sell all of the first lot
      tracker.sellShares(USER, 'AAPL', 10, 150, date('2026-01-15'));
      const remaining = tracker.getOpenLots(USER, 'AAPL');
      expect(remaining).toHaveLength(1);
      expect(remaining[0].costBasis).toBe(200);
    });

    it('filters by symbol', () => {
      tracker.addLot(USER, 'AAPL', 10, 100, date('2025-01-01'));
      tracker.addLot(USER, 'GOOG', 5, 150, date('2025-01-01'));

      expect(tracker.getOpenLots(USER, 'AAPL')).toHaveLength(1);
      expect(tracker.getOpenLots(USER, 'GOOG')).toHaveLength(1);
      expect(tracker.getOpenLots(USER)).toHaveLength(2);
    });

    it('filters by user', () => {
      tracker.addLot('user-1', 'AAPL', 10, 100, date('2025-01-01'));
      tracker.addLot('user-2', 'AAPL', 5, 200, date('2025-01-01'));

      expect(tracker.getOpenLots('user-1')).toHaveLength(1);
      expect(tracker.getOpenLots('user-2')).toHaveLength(1);
    });
  });

  // --------------------------------------------------------------------------
  // FIFO Method
  // --------------------------------------------------------------------------

  describe('FIFO selling', () => {
    it('sells oldest lots first', () => {
      tracker.addLot(USER, 'AAPL', 10, 100, date('2025-01-01')); // lot 1: $100
      tracker.addLot(USER, 'AAPL', 10, 150, date('2025-03-01')); // lot 2: $150
      tracker.addLot(USER, 'AAPL', 10, 200, date('2025-06-01')); // lot 3: $200

      const result = tracker.sellShares(USER, 'AAPL', 15, 180, date('2026-01-15'), 'fifo');

      // Should sell 10 from lot 1 ($100) + 5 from lot 2 ($150)
      expect(result.events).toHaveLength(2);
      expect(result.events[0].costBasis).toBe(100);
      expect(result.events[0].shares).toBe(10);
      expect(result.events[1].costBasis).toBe(150);
      expect(result.events[1].shares).toBe(5);

      // Remaining: 5 shares at $150 + 10 shares at $200
      const remaining = tracker.getOpenLots(USER, 'AAPL');
      expect(remaining).toHaveLength(2);
    });

    it('calculates correct realized gain', () => {
      tracker.addLot(USER, 'AAPL', 10, 100, date('2025-01-01'));
      const result = tracker.sellShares(USER, 'AAPL', 10, 150, date('2026-01-15'), 'fifo');

      expect(result.totalProceeds).toBe(1500); // 10 * 150
      expect(result.totalCostBasis).toBe(1000); // 10 * 100
      expect(result.realizedGain).toBe(500);
    });

    it('handles realized losses', () => {
      tracker.addLot(USER, 'AAPL', 10, 200, date('2025-01-01'));
      const result = tracker.sellShares(USER, 'AAPL', 10, 150, date('2026-01-15'), 'fifo');

      expect(result.realizedGain).toBe(-500);
      expect(result.events[0].eventType).toBe('realized_loss');
    });
  });

  // --------------------------------------------------------------------------
  // LIFO Method
  // --------------------------------------------------------------------------

  describe('LIFO selling', () => {
    it('sells newest lots first', () => {
      tracker.addLot(USER, 'AAPL', 10, 100, date('2025-01-01')); // oldest
      tracker.addLot(USER, 'AAPL', 10, 150, date('2025-03-01'));
      tracker.addLot(USER, 'AAPL', 10, 200, date('2025-06-01')); // newest

      const result = tracker.sellShares(USER, 'AAPL', 15, 180, date('2026-01-15'), 'lifo');

      // Should sell 10 from lot 3 ($200) + 5 from lot 2 ($150)
      expect(result.events).toHaveLength(2);
      expect(result.events[0].costBasis).toBe(200);
      expect(result.events[0].shares).toBe(10);
      expect(result.events[1].costBasis).toBe(150);
      expect(result.events[1].shares).toBe(5);
    });

    it('LIFO produces different gain than FIFO for same shares', () => {
      // Two trackers with identical lots
      const fifoTracker = new TaxLotTracker({ defaultMethod: 'fifo' });
      const lifoTracker = new TaxLotTracker({ defaultMethod: 'lifo' });

      for (const t of [fifoTracker, lifoTracker]) {
        t.addLot(USER, 'AAPL', 10, 100, date('2025-01-01'));
        t.addLot(USER, 'AAPL', 10, 200, date('2025-06-01'));
      }

      const fifoResult = fifoTracker.sellShares(USER, 'AAPL', 10, 150, date('2026-01-15'));
      const lifoResult = lifoTracker.sellShares(USER, 'AAPL', 10, 150, date('2026-01-15'));

      // FIFO sells $100 lots: gain = (150-100)*10 = 500
      expect(fifoResult.realizedGain).toBe(500);
      // LIFO sells $200 lots: gain = (150-200)*10 = -500
      expect(lifoResult.realizedGain).toBe(-500);
    });
  });

  // --------------------------------------------------------------------------
  // Specific Identification
  // --------------------------------------------------------------------------

  describe('specific identification', () => {
    it('sells the specified lots', () => {
      const lot1 = tracker.addLot(USER, 'AAPL', 10, 100, date('2025-01-01'));
      tracker.addLot(USER, 'AAPL', 10, 150, date('2025-03-01'));
      const lot3 = tracker.addLot(USER, 'AAPL', 10, 200, date('2025-06-01'));

      // Sell from lot3 first, then lot1
      const result = tracker.sellShares(
        USER,
        'AAPL',
        15,
        180,
        date('2026-01-15'),
        'specific',
        [lot3.id, lot1.id]
      );

      expect(result.events).toHaveLength(2);
      expect(result.events[0].costBasis).toBe(200); // lot3
      expect(result.events[0].shares).toBe(10);
      expect(result.events[1].costBasis).toBe(100); // lot1
      expect(result.events[1].shares).toBe(5);
    });

    it('throws when lot IDs not provided', () => {
      tracker.addLot(USER, 'AAPL', 10, 100, date('2025-01-01'));
      expect(() =>
        tracker.sellShares(USER, 'AAPL', 5, 150, date('2026-01-15'), 'specific')
      ).toThrow('Specific lot IDs required');
    });

    it('throws when lot ID not found', () => {
      tracker.addLot(USER, 'AAPL', 10, 100, date('2025-01-01'));
      expect(() =>
        tracker.sellShares(USER, 'AAPL', 5, 150, date('2026-01-15'), 'specific', [
          'nonexistent',
        ])
      ).toThrow('Lot nonexistent not found');
    });
  });

  // --------------------------------------------------------------------------
  // Holding Period
  // --------------------------------------------------------------------------

  describe('short-term vs long-term', () => {
    it('classifies holdings under 365 days as short-term', () => {
      const purchase = date('2025-07-01');
      const sale = date('2026-01-15'); // ~198 days
      expect(tracker.isShortTermHolding(purchase, sale)).toBe(true);
    });

    it('classifies holdings at 365+ days as long-term', () => {
      const purchase = date('2025-01-01');
      const sale = date('2026-01-02'); // 366 days
      expect(tracker.isShortTermHolding(purchase, sale)).toBe(false);
    });

    it('sale result reflects holding period classification', () => {
      // Short-term lot
      tracker.addLot(USER, 'AAPL', 10, 100, date('2025-07-01'));
      const result = tracker.sellShares(USER, 'AAPL', 10, 150, date('2026-01-15'));
      expect(result.isShortTerm).toBe(true);
    });

    it('correctly handles mixed short-term and long-term lots', () => {
      tracker.addLot(USER, 'AAPL', 10, 100, date('2024-06-01')); // long-term (>1yr)
      tracker.addLot(USER, 'AAPL', 10, 200, date('2025-10-01')); // short-term

      const result = tracker.sellShares(USER, 'AAPL', 20, 180, date('2026-01-15'), 'fifo');
      // Has short-term because second lot is short-term
      expect(result.isShortTerm).toBe(true);
      expect(result.events).toHaveLength(2);
    });

    it('getHoldingPeriodDays calculates correctly', () => {
      const lot = tracker.addLot(USER, 'AAPL', 10, 100, date('2025-01-01'));
      const days = tracker.getHoldingPeriodDays(lot, date('2026-01-01'));
      expect(days).toBe(365);
    });

    it('custom longTermThresholdDays is respected', () => {
      const t = new TaxLotTracker({ longTermThresholdDays: 180 });
      // 200 days: short-term with 365-day threshold, long-term with 180-day
      const purchase = date('2025-06-01');
      const sale = date('2025-12-18'); // ~200 days
      expect(t.isShortTermHolding(purchase, sale)).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Unrealized Gains
  // --------------------------------------------------------------------------

  describe('unrealized gains', () => {
    it('calculates unrealized gains for open positions', () => {
      tracker.addLot(USER, 'AAPL', 10, 100, date('2025-01-01'));
      tracker.addLot(USER, 'AAPL', 5, 150, date('2025-06-01'));
      tracker.addLot(USER, 'GOOG', 20, 50, date('2025-03-01'));

      const prices = new Map([
        ['AAPL', 180],
        ['GOOG', 60],
      ]);

      const gains = tracker.calculateUnrealizedGains(USER, prices, date('2026-01-15'));

      expect(gains).toHaveLength(2);

      const aapl = gains.find((g) => g.symbol === 'AAPL')!;
      expect(aapl.totalShares).toBe(15);
      expect(aapl.totalCostBasis).toBe(10 * 100 + 5 * 150); // 1750
      expect(aapl.currentValue).toBe(15 * 180); // 2700
      expect(aapl.unrealizedGain).toBe(2700 - 1750); // 950
      expect(aapl.lots).toHaveLength(2);

      const goog = gains.find((g) => g.symbol === 'GOOG')!;
      expect(goog.totalShares).toBe(20);
      expect(goog.unrealizedGain).toBe(20 * 60 - 20 * 50); // 200
    });

    it('includes per-lot holding period classification', () => {
      tracker.addLot(USER, 'AAPL', 10, 100, date('2024-06-01')); // long-term
      tracker.addLot(USER, 'AAPL', 10, 200, date('2025-10-01')); // short-term

      const prices = new Map([['AAPL', 180]]);
      const gains = tracker.calculateUnrealizedGains(USER, prices, date('2026-01-15'));
      const aapl = gains[0];

      // First lot (2024-06-01) is long-term
      const longLot = aapl.lots.find((l) => !l.isShortTerm)!;
      expect(longLot.shares).toBe(10);
      expect(longLot.holdingDays).toBeGreaterThan(365);

      // Second lot (2025-10-01) is short-term
      const shortLot = aapl.lots.find((l) => l.isShortTerm)!;
      expect(shortLot.shares).toBe(10);
      expect(shortLot.holdingDays).toBeLessThan(365);
    });

    it('skips symbols without current price', () => {
      tracker.addLot(USER, 'AAPL', 10, 100, date('2025-01-01'));
      tracker.addLot(USER, 'GOOG', 5, 200, date('2025-01-01'));

      const prices = new Map([['AAPL', 150]]); // No GOOG price
      const gains = tracker.calculateUnrealizedGains(USER, prices);

      expect(gains).toHaveLength(1);
      expect(gains[0].symbol).toBe('AAPL');
    });

    it('excludes sold lots from unrealized gains', () => {
      tracker.addLot(USER, 'AAPL', 10, 100, date('2025-01-01'));
      tracker.addLot(USER, 'AAPL', 10, 200, date('2025-06-01'));

      // Sell first lot
      tracker.sellShares(USER, 'AAPL', 10, 150, date('2025-12-01'), 'fifo');

      const prices = new Map([['AAPL', 180]]);
      const gains = tracker.calculateUnrealizedGains(USER, prices, date('2026-01-15'));

      expect(gains).toHaveLength(1);
      expect(gains[0].totalShares).toBe(10); // Only the second lot
      expect(gains[0].lots[0].costBasis).toBe(200);
    });
  });

  // --------------------------------------------------------------------------
  // Wash Sale Detection
  // --------------------------------------------------------------------------

  describe('wash sale detection', () => {
    it('detects wash sale when buying within 30 days of loss', () => {
      // Buy lot 1
      tracker.addLot(USER, 'AAPL', 10, 200, date('2025-01-01'));
      // Buy lot 2 (within 30 days of upcoming sale)
      tracker.addLot(USER, 'AAPL', 10, 180, date('2025-12-20'));

      // Sell lot 1 at a loss on 2026-01-05 (lot 2 purchased 16 days before — within window)
      const result = tracker.sellShares(
        USER,
        'AAPL',
        10,
        150,
        date('2026-01-05'),
        'fifo'
      );

      expect(result.events[0].isWashSale).toBe(true);
      expect(result.events[0].eventType).toBe('wash_sale');
    });

    it('does not flag gains as wash sales', () => {
      tracker.addLot(USER, 'AAPL', 10, 100, date('2025-01-01'));
      tracker.addLot(USER, 'AAPL', 10, 90, date('2025-12-20'));

      // Sell lot 1 at a gain
      const result = tracker.sellShares(
        USER,
        'AAPL',
        10,
        150,
        date('2026-01-05'),
        'fifo'
      );

      expect(result.events[0].isWashSale).toBe(false);
      expect(result.events[0].eventType).toBe('realized_gain');
    });

    it('does not flag when no purchase within window', () => {
      tracker.addLot(USER, 'AAPL', 10, 200, date('2025-01-01'));

      // No other purchase within 30 days of sale
      const result = tracker.sellShares(
        USER,
        'AAPL',
        10,
        150,
        date('2026-01-15'),
        'fifo'
      );

      expect(result.events[0].isWashSale).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Tax Summary
  // --------------------------------------------------------------------------

  describe('tax summary', () => {
    it('generates correct yearly summary', () => {
      // Long-term gain
      tracker.addLot(USER, 'AAPL', 10, 100, date('2024-06-01'));
      tracker.sellShares(USER, 'AAPL', 10, 200, date('2026-01-10'), 'fifo');

      // Short-term loss
      tracker.addLot(USER, 'GOOG', 5, 300, date('2025-10-01'));
      tracker.sellShares(USER, 'GOOG', 5, 250, date('2026-01-12'), 'fifo');

      const summary = tracker.getTaxSummary(USER, 2026);

      expect(summary.taxYear).toBe(2026);
      expect(summary.longTermGains).toBe(1000); // (200-100)*10
      expect(summary.shortTermLosses).toBe(-250); // (250-300)*5
      expect(summary.netLongTerm).toBe(1000);
      expect(summary.netShortTerm).toBe(-250);
      expect(summary.totalRealizedGain).toBe(750);
      expect(summary.eventCount).toBe(2);
    });

    it('tracks wash sale adjustments', () => {
      tracker.addLot(USER, 'AAPL', 10, 200, date('2025-01-01'));
      tracker.addLot(USER, 'AAPL', 10, 180, date('2025-12-20')); // within 30 days of sale

      // Sell at a loss — triggers wash sale
      tracker.sellShares(USER, 'AAPL', 10, 150, date('2026-01-05'), 'fifo');

      const summary = tracker.getTaxSummary(USER, 2026);
      expect(summary.washSaleAdjustment).toBeGreaterThan(0);
    });

    it('returns zero summary for year with no events', () => {
      const summary = tracker.getTaxSummary(USER, 2026);
      expect(summary.totalRealizedGain).toBe(0);
      expect(summary.eventCount).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Partial Lot Sales
  // --------------------------------------------------------------------------

  describe('partial lot sales', () => {
    it('splits lots when partially sold', () => {
      tracker.addLot(USER, 'AAPL', 100, 150, date('2025-01-01'));

      // Sell 30 of 100 shares
      const result = tracker.sellShares(USER, 'AAPL', 30, 200, date('2026-01-15'), 'fifo');

      expect(result.events).toHaveLength(1);
      expect(result.events[0].shares).toBe(30);
      expect(result.realizedGain).toBe(30 * (200 - 150)); // 1500

      // 70 shares remain open
      const remaining = tracker.getOpenLots(USER, 'AAPL');
      expect(remaining).toHaveLength(1);
      expect(remaining[0].shares).toBe(70);
      expect(remaining[0].costBasis).toBe(150);
    });

    it('handles selling across multiple partial lots', () => {
      tracker.addLot(USER, 'AAPL', 20, 100, date('2025-01-01'));
      tracker.addLot(USER, 'AAPL', 20, 200, date('2025-06-01'));

      // Sell 25 shares — consumes all of lot 1 (20) + 5 from lot 2
      const result = tracker.sellShares(USER, 'AAPL', 25, 180, date('2026-01-15'), 'fifo');

      expect(result.events).toHaveLength(2);
      expect(result.events[0].shares).toBe(20); // full lot 1
      expect(result.events[1].shares).toBe(5); // partial lot 2

      const remaining = tracker.getOpenLots(USER, 'AAPL');
      expect(remaining).toHaveLength(1);
      expect(remaining[0].shares).toBe(15);
      expect(remaining[0].costBasis).toBe(200);
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('edge cases', () => {
    it('throws when selling more shares than available', () => {
      tracker.addLot(USER, 'AAPL', 10, 100, date('2025-01-01'));
      expect(() =>
        tracker.sellShares(USER, 'AAPL', 20, 150, date('2026-01-15'))
      ).toThrow('Insufficient shares');
    });

    it('throws when selling zero shares', () => {
      tracker.addLot(USER, 'AAPL', 10, 100, date('2025-01-01'));
      expect(() =>
        tracker.sellShares(USER, 'AAPL', 0, 150, date('2026-01-15'))
      ).toThrow('Shares to sell must be positive');
    });

    it('throws when sale price is zero', () => {
      tracker.addLot(USER, 'AAPL', 10, 100, date('2025-01-01'));
      expect(() =>
        tracker.sellShares(USER, 'AAPL', 5, 0, date('2026-01-15'))
      ).toThrow('Sale price must be positive');
    });

    it('handles selling all shares of a symbol', () => {
      tracker.addLot(USER, 'AAPL', 10, 100, date('2025-01-01'));
      tracker.addLot(USER, 'AAPL', 10, 200, date('2025-06-01'));

      tracker.sellShares(USER, 'AAPL', 20, 150, date('2026-01-15'));
      expect(tracker.getOpenLots(USER, 'AAPL')).toHaveLength(0);
    });

    it('handles fractional shares', () => {
      tracker.addLot(USER, 'AAPL', 0.5, 100, date('2025-01-01'));
      const result = tracker.sellShares(
        USER,
        'AAPL',
        0.5,
        200,
        date('2026-01-15'),
        'fifo'
      );
      expect(result.totalProceeds).toBe(100); // 0.5 * 200
      expect(result.totalCostBasis).toBe(50); // 0.5 * 100
      expect(result.realizedGain).toBe(50);
    });

    it('getEvents filters by user and year', () => {
      tracker.addLot(USER, 'AAPL', 10, 100, date('2025-01-01'));
      tracker.sellShares(USER, 'AAPL', 10, 150, date('2026-01-15'));

      tracker.addLot('user-2', 'GOOG', 5, 200, date('2025-01-01'));
      tracker.sellShares('user-2', 'GOOG', 5, 250, date('2026-02-01'));

      expect(tracker.getEvents(USER)).toHaveLength(1);
      expect(tracker.getEvents(USER, 2026)).toHaveLength(1);
      expect(tracker.getEvents(USER, 2025)).toHaveLength(0);
      expect(tracker.getEvents('user-2', 2026)).toHaveLength(1);
    });

    it('getAllLots returns both open and closed lots', () => {
      tracker.addLot(USER, 'AAPL', 10, 100, date('2025-01-01'));
      tracker.addLot(USER, 'AAPL', 10, 200, date('2025-06-01'));
      tracker.sellShares(USER, 'AAPL', 10, 150, date('2026-01-15'), 'fifo');

      const allLots = tracker.getAllLots(USER);
      // Original 2 lots + 1 closed split lot = at least 2
      expect(allLots.length).toBeGreaterThanOrEqual(2);

      const openLots = tracker.getOpenLots(USER);
      expect(openLots).toHaveLength(1);
    });
  });
});
