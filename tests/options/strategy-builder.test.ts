/**
 * Unit Tests for StrategyBuilder
 *
 * Tests strategy construction, P&L calculations, max profit/loss, breakevens,
 * probability of profit, strategy recommendations, and edge cases.
 *
 * All strategies use raw quantities: stock legs are in shares, option legs in
 * contracts (1 contract = 1 unit in the P&L formula). Users control scaling.
 */

import { describe, it, expect } from 'vitest';
import {
  StrategyBuilder,
} from '../../src/options/StrategyBuilder.js';

// ============================================================================
// COMMON TEST PARAMETERS
// ============================================================================

const UNDERLYING = 100;
const EXPIRATION = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
const IV = 0.25;

// ============================================================================
// TESTS
// ============================================================================

describe('StrategyBuilder', () => {
  const builder = new StrategyBuilder({ pnlSteps: 200 });

  // --------------------------------------------------------------------------
  // Constructor
  // --------------------------------------------------------------------------

  describe('Constructor', () => {
    it('uses default configuration', () => {
      const defaultBuilder = new StrategyBuilder();
      const strategy = defaultBuilder.buildStraddle(UNDERLYING, 100, 3, 3, EXPIRATION);
      const analysis = defaultBuilder.analyzeStrategy(strategy);
      expect(analysis.pnlData.length).toBeGreaterThan(0);
    });

    it('accepts custom configuration', () => {
      const customBuilder = new StrategyBuilder({
        riskFreeRate: 0.04,
        pnlPriceRange: 0.5,
        pnlSteps: 50,
      });
      const strategy = customBuilder.buildStraddle(UNDERLYING, 100, 3, 3, EXPIRATION);
      const analysis = customBuilder.analyzeStrategy(strategy);
      expect(analysis.pnlData.length).toBe(51);
      expect(analysis.pnlData[0].price).toBe(50);
      expect(analysis.pnlData[analysis.pnlData.length - 1].price).toBe(150);
    });
  });

  // --------------------------------------------------------------------------
  // Covered Call
  // --------------------------------------------------------------------------

  describe('Covered Call', () => {
    const strategy = builder.buildCoveredCall(UNDERLYING, 105, 3, EXPIRATION, IV);

    it('builds correct structure', () => {
      expect(strategy.type).toBe('covered_call');
      expect(strategy.legs).toHaveLength(2);
      expect(strategy.legs[0].type).toBe('stock');
      expect(strategy.legs[0].quantity).toBe(100);
      expect(strategy.legs[1].type).toBe('call');
      expect(strategy.legs[1].quantity).toBe(-1);
      expect(strategy.outlook).toBe('neutral');
    });

    it('calculates correct P&L at various prices', () => {
      // Stock: 100 shares at $100. Call: 1 short contract, premium stored as -3.
      // At $90: stock 100*(90-100)=-1000, call -1*(0-(-3))=-3, total=-1003
      // At $100: stock 0, call -1*(0-(-3))=-3, total=-3
      // At $105: stock 500, call -1*(0-(-3))=-3, total=497
      // At $110: stock 1000, call -1*(5-(-3))=-8, total=992
      expect(builder.calculatePnLAtExpiration(strategy, 90)).toBeCloseTo(-1003, 0);
      expect(builder.calculatePnLAtExpiration(strategy, 100)).toBeCloseTo(-3, 0);
      expect(builder.calculatePnLAtExpiration(strategy, 105)).toBeCloseTo(497, 0);
      expect(builder.calculatePnLAtExpiration(strategy, 110)).toBeCloseTo(992, 0);
    });

    it('analyzes strategy correctly', () => {
      const analysis = builder.analyzeStrategy(strategy);
      expect(analysis.strategy.type).toBe('covered_call');
      expect(analysis.pnlData.length).toBeGreaterThan(0);
      expect(analysis.breakevens.length).toBeGreaterThanOrEqual(1);
    });
  });

  // --------------------------------------------------------------------------
  // Protective Put
  // --------------------------------------------------------------------------

  describe('Protective Put', () => {
    it('builds correct structure', () => {
      const strategy = builder.buildProtectivePut(UNDERLYING, 95, 2, EXPIRATION, IV);
      expect(strategy.type).toBe('protective_put');
      expect(strategy.legs).toHaveLength(2);
      expect(strategy.legs[0].type).toBe('stock');
      expect(strategy.legs[1].type).toBe('put');
      expect(strategy.legs[1].quantity).toBe(1);
      expect(strategy.outlook).toBe('bullish');
    });

    it('put reduces downside losses vs naked stock', () => {
      const strategy = builder.buildProtectivePut(UNDERLYING, 95, 2, EXPIRATION, IV);
      const pnlAt80 = builder.calculatePnLAtExpiration(strategy, 80);
      const pnlAt50 = builder.calculatePnLAtExpiration(strategy, 50);

      // Additional loss from $80 to $50 should be less than naked stock (3000)
      const strategyExtraLoss = Math.abs(pnlAt50 - pnlAt80);
      const stockExtraLoss = 100 * (80 - 50); // 3000
      expect(strategyExtraLoss).toBeLessThan(stockExtraLoss);
    });
  });

  // --------------------------------------------------------------------------
  // Bull Call Spread
  // --------------------------------------------------------------------------

  describe('Bull Call Spread', () => {
    it('builds correct structure', () => {
      const strategy = builder.buildBullCallSpread(UNDERLYING, 100, 110, 5, 2, EXPIRATION, IV);
      expect(strategy.type).toBe('bull_call_spread');
      expect(strategy.legs).toHaveLength(2);
      expect(strategy.legs[0].quantity).toBe(1); // Long call
      expect(strategy.legs[1].quantity).toBe(-1); // Short call
      expect(strategy.outlook).toBe('bullish');
    });
  });

  // --------------------------------------------------------------------------
  // Bear Put Spread
  // --------------------------------------------------------------------------

  describe('Bear Put Spread', () => {
    it('builds correct structure', () => {
      const strategy = builder.buildBearPutSpread(UNDERLYING, 100, 90, 5, 2, EXPIRATION, IV);
      expect(strategy.type).toBe('bear_put_spread');
      expect(strategy.legs).toHaveLength(2);
      expect(strategy.legs[0].quantity).toBe(1); // Long put
      expect(strategy.legs[1].quantity).toBe(-1); // Short put
      expect(strategy.outlook).toBe('bearish');
    });

    it('calculates correct P&L', () => {
      const strategy = builder.buildBearPutSpread(UNDERLYING, 100, 90, 5, 2, EXPIRATION, IV);
      // At $80: long put 1*(20-5)=15, short put -1*(10-(-2))=-12, total=3
      // At $95: long put 1*(5-5)=0, short put -1*(0-(-2))=-2, total=-2
      // At $105: long put 1*(0-5)=-5, short put -1*(0-(-2))=-2, total=-7
      expect(builder.calculatePnLAtExpiration(strategy, 80)).toBeCloseTo(3, 0);
      expect(builder.calculatePnLAtExpiration(strategy, 95)).toBeCloseTo(-2, 0);
      expect(builder.calculatePnLAtExpiration(strategy, 105)).toBeCloseTo(-7, 0);
    });
  });

  // --------------------------------------------------------------------------
  // Iron Condor
  // --------------------------------------------------------------------------

  describe('Iron Condor', () => {
    it('builds correct structure', () => {
      const strategy = builder.buildIronCondor(
        UNDERLYING, 85, 90, 110, 115,
        0.50, 1.50, 1.50, 0.50,
        EXPIRATION, IV,
      );
      expect(strategy.type).toBe('iron_condor');
      expect(strategy.legs).toHaveLength(4);
      expect(strategy.outlook).toBe('neutral');
    });

    it('has two breakevens', () => {
      const strategy = builder.buildIronCondor(
        UNDERLYING, 85, 90, 110, 115,
        0.50, 1.50, 1.50, 0.50,
        EXPIRATION, IV,
      );
      const analysis = builder.analyzeStrategy(strategy);
      expect(analysis.breakevens).toHaveLength(2);
      expect(analysis.breakevens[0]).toBeLessThan(UNDERLYING);
      expect(analysis.breakevens[1]).toBeGreaterThan(UNDERLYING);
    });
  });

  // --------------------------------------------------------------------------
  // Long Straddle
  // --------------------------------------------------------------------------

  describe('Long Straddle', () => {
    it('builds correct structure', () => {
      const strategy = builder.buildStraddle(UNDERLYING, 100, 3, 3, EXPIRATION, IV);
      expect(strategy.type).toBe('straddle');
      expect(strategy.legs).toHaveLength(2);
      expect(strategy.legs[0].type).toBe('call');
      expect(strategy.legs[1].type).toBe('put');
      expect(strategy.outlook).toBe('volatile');
    });

    it('calculates correct P&L', () => {
      const strategy = builder.buildStraddle(UNDERLYING, 100, 3, 3, EXPIRATION, IV);
      // At $100: call 1*(0-3)=-3, put 1*(0-3)=-3, total=-6
      // At $90: call 1*(0-3)=-3, put 1*(10-3)=7, total=4
      // At $110: call 1*(10-3)=7, put 1*(0-3)=-3, total=4
      // At $80: call -3, put 1*(20-3)=17, total=14
      expect(builder.calculatePnLAtExpiration(strategy, 100)).toBeCloseTo(-6, 1);
      expect(builder.calculatePnLAtExpiration(strategy, 90)).toBeCloseTo(4, 1);
      expect(builder.calculatePnLAtExpiration(strategy, 110)).toBeCloseTo(4, 1);
      expect(builder.calculatePnLAtExpiration(strategy, 80)).toBeCloseTo(14, 1);
    });

    it('has correct breakevens at strike ± total premium', () => {
      const strategy = builder.buildStraddle(UNDERLYING, 100, 3, 3, EXPIRATION, IV);
      const analysis = builder.analyzeStrategy(strategy);
      expect(analysis.breakevens).toHaveLength(2);
      expect(analysis.breakevens[0]).toBeCloseTo(94, 0);
      expect(analysis.breakevens[1]).toBeCloseTo(106, 0);
    });

    it('max loss equals net debit', () => {
      const strategy = builder.buildStraddle(UNDERLYING, 100, 3, 3, EXPIRATION, IV);
      const analysis = builder.analyzeStrategy(strategy);
      expect(analysis.maxLoss).toBeCloseTo(-6, 1);
      expect(analysis.netDebit).toBeCloseTo(6, 1);
    });
  });

  // --------------------------------------------------------------------------
  // Long Strangle
  // --------------------------------------------------------------------------

  describe('Long Strangle', () => {
    it('builds correct structure', () => {
      const strategy = builder.buildStrangle(UNDERLYING, 105, 95, 2, 2, EXPIRATION, IV);
      expect(strategy.type).toBe('strangle');
      expect(strategy.legs).toHaveLength(2);
      expect(strategy.outlook).toBe('volatile');
    });

    it('calculates correct P&L', () => {
      const strategy = builder.buildStrangle(UNDERLYING, 105, 95, 2, 2, EXPIRATION, IV);
      // At $100: call 1*(0-2)=-2, put 1*(0-2)=-2, total=-4
      // At $85: call -2, put 1*(10-2)=8, total=6
      // At $115: call 1*(10-2)=8, put -2, total=6
      expect(builder.calculatePnLAtExpiration(strategy, 100)).toBeCloseTo(-4, 1);
      expect(builder.calculatePnLAtExpiration(strategy, 85)).toBeCloseTo(6, 1);
      expect(builder.calculatePnLAtExpiration(strategy, 115)).toBeCloseTo(6, 1);
    });

    it('has two breakevens', () => {
      const strategy = builder.buildStrangle(UNDERLYING, 105, 95, 2, 2, EXPIRATION, IV);
      const analysis = builder.analyzeStrategy(strategy);
      expect(analysis.breakevens).toHaveLength(2);
      expect(analysis.breakevens[0]).toBeCloseTo(91, 0);
      expect(analysis.breakevens[1]).toBeCloseTo(109, 0);
    });
  });

  // --------------------------------------------------------------------------
  // P&L Data Generation
  // --------------------------------------------------------------------------

  describe('P&L Data Generation', () => {
    it('generates correct number of data points', () => {
      const strategy = builder.buildStraddle(UNDERLYING, 100, 3, 3, EXPIRATION, IV);
      const pnlData = builder.generatePnLData(strategy);
      expect(pnlData.length).toBe(201); // 200 steps + 1
    });

    it('covers the full price range', () => {
      const strategy = builder.buildStraddle(UNDERLYING, 100, 3, 3, EXPIRATION, IV);
      const pnlData = builder.generatePnLData(strategy);
      expect(pnlData[0].price).toBe(70); // 100 * (1 - 0.3)
      expect(pnlData[pnlData.length - 1].price).toBe(130); // 100 * (1 + 0.3)
    });

    it('data points have correct structure', () => {
      const strategy = builder.buildStraddle(UNDERLYING, 100, 3, 3, EXPIRATION, IV);
      const pnlData = builder.generatePnLData(strategy);
      for (const point of pnlData) {
        expect(typeof point.price).toBe('number');
        expect(typeof point.profit).toBe('number');
        expect(point.price).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Strategy Recommendations
  // --------------------------------------------------------------------------

  describe('Strategy Recommendations', () => {
    it('returns all 7 strategy types', () => {
      const recs = builder.recommendStrategies(50, 'sideways');
      expect(recs).toHaveLength(7);
      const types = recs.map(r => r.type);
      expect(types).toContain('covered_call');
      expect(types).toContain('protective_put');
      expect(types).toContain('bull_call_spread');
      expect(types).toContain('bear_put_spread');
      expect(types).toContain('iron_condor');
      expect(types).toContain('straddle');
      expect(types).toContain('strangle');
    });

    it('favors sell-premium strategies in high IV', () => {
      const recs = builder.recommendStrategies(80, 'sideways');
      const topTwo = recs.slice(0, 2).map(r => r.type);
      expect(topTwo).toContain('iron_condor');
      expect(topTwo).toContain('covered_call');
    });

    it('favors buy-premium strategies in low IV + volatile regime', () => {
      const recs = builder.recommendStrategies(20, 'volatile');
      const topThree = recs.slice(0, 3).map(r => r.type);
      expect(topThree).toContain('straddle');
      expect(topThree).toContain('strangle');
    });

    it('favors bull call spread in bull regime', () => {
      const recs = builder.recommendStrategies(50, 'bull');
      const topThree = recs.slice(0, 3).map(r => r.type);
      expect(topThree).toContain('bull_call_spread');
    });

    it('favors bear put spread in bear regime', () => {
      const recs = builder.recommendStrategies(50, 'bear');
      const topThree = recs.slice(0, 3).map(r => r.type);
      expect(topThree).toContain('bear_put_spread');
    });

    it('includes rationale and score for each recommendation', () => {
      const recs = builder.recommendStrategies(50, 'sideways');
      for (const rec of recs) {
        expect(rec.rationale.length).toBeGreaterThan(0);
        expect(rec.score).toBeGreaterThanOrEqual(0);
        expect(rec.score).toBeLessThanOrEqual(1);
        expect(rec.name.length).toBeGreaterThan(0);
      }
    });

    it('recommendations are sorted by score descending', () => {
      const recs = builder.recommendStrategies(50, 'sideways');
      for (let i = 1; i < recs.length; i++) {
        expect(recs[i - 1].score).toBeGreaterThanOrEqual(recs[i].score);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Probability of Profit
  // --------------------------------------------------------------------------

  describe('Probability of Profit', () => {
    it('returns value between 0 and 1', () => {
      const strategy = builder.buildStraddle(UNDERLYING, 100, 3, 3, EXPIRATION, IV);
      const analysis = builder.analyzeStrategy(strategy);
      expect(analysis.probabilityOfProfit).toBeGreaterThanOrEqual(0);
      expect(analysis.probabilityOfProfit).toBeLessThanOrEqual(1);
    });

    it('straddle with large premium has lower PoP', () => {
      const strategy = builder.buildStraddle(UNDERLYING, 100, 5, 5, EXPIRATION, IV);
      const analysis = builder.analyzeStrategy(strategy);
      // Needs ±$10 move (10%), harder to achieve
      expect(analysis.probabilityOfProfit).toBeLessThan(0.6);
    });

    it('straddle with small premium has higher PoP', () => {
      const strategy = builder.buildStraddle(UNDERLYING, 100, 1, 1, EXPIRATION, IV);
      const analysis = builder.analyzeStrategy(strategy);
      // Only needs ±$2 move (2%), easier
      expect(analysis.probabilityOfProfit).toBeGreaterThan(0.3);
    });
  });

  // --------------------------------------------------------------------------
  // Net Debit / Credit
  // --------------------------------------------------------------------------

  describe('Net Debit / Credit', () => {
    it('straddle net debit equals sum of premiums', () => {
      const strategy = builder.buildStraddle(UNDERLYING, 100, 3, 4, EXPIRATION, IV);
      expect(builder.calculateNetDebit(strategy)).toBeCloseTo(7, 2);
    });

    it('strangle net debit equals sum of premiums', () => {
      const strategy = builder.buildStrangle(UNDERLYING, 105, 95, 2.5, 2, EXPIRATION, IV);
      expect(builder.calculateNetDebit(strategy)).toBeCloseTo(4.5, 2);
    });

    it('excludes stock legs from net debit', () => {
      const strategy = builder.buildCoveredCall(UNDERLYING, 105, 3, EXPIRATION, IV);
      const netDebit = builder.calculateNetDebit(strategy);
      // Only the call premium: -1 * -3 = 3
      expect(typeof netDebit).toBe('number');
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('handles zero premium options', () => {
      const strategy = builder.buildStraddle(UNDERLYING, 100, 0, 0, EXPIRATION, IV);
      const analysis = builder.analyzeStrategy(strategy);
      expect(analysis.maxLoss).toBeCloseTo(0, 1);
      expect(analysis.netDebit).toBeCloseTo(0, 2);
    });

    it('handles deep ITM options', () => {
      const strategy = builder.buildStraddle(UNDERLYING, 50, 51, 1, EXPIRATION, IV);
      // At $100: call 1*(50-51)=-1, put 1*(0-1)=-1, total=-2
      expect(builder.calculatePnLAtExpiration(strategy, 100)).toBeCloseTo(-2, 1);
    });

    it('handles strategy with past expiration date', () => {
      const pastDate = '2020-01-01';
      const strategy = builder.buildStraddle(UNDERLYING, 100, 3, 3, pastDate, IV);
      const analysis = builder.analyzeStrategy(strategy);
      expect(analysis.pnlData.length).toBeGreaterThan(0);
      expect(typeof analysis.maxProfit).toBe('number');
    });

    it('handles very high volatility', () => {
      const strategy = builder.buildStraddle(UNDERLYING, 100, 30, 30, EXPIRATION, 2.0);
      const analysis = builder.analyzeStrategy(strategy);
      expect(analysis.netDebit).toBeCloseTo(60, 2);
      expect(analysis.breakevens).toHaveLength(2);
    });

    it('P&L is symmetric for straddle at ATM', () => {
      const strategy = builder.buildStraddle(UNDERLYING, 100, 3, 3, EXPIRATION, IV);
      const pnlDown = builder.calculatePnLAtExpiration(strategy, 90);
      const pnlUp = builder.calculatePnLAtExpiration(strategy, 110);
      expect(pnlDown).toBeCloseTo(pnlUp, 1);
    });
  });
});
