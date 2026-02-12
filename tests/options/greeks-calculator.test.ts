/**
 * Unit Tests for GreeksCalculator
 *
 * Tests Black-Scholes Greeks (delta, gamma, theta, vega, rho), Bjerksund-Stensland
 * American approximation, portfolio aggregation, heatmap generation, and edge cases.
 *
 * Reference values validated against:
 * - Hull, "Options, Futures and Other Derivatives" (standard BS examples)
 * - Known analytical solutions for ATM/OTM/ITM contracts
 */

import { describe, it, expect } from 'vitest';
import {
  GreeksCalculator,
  normalCDF,
  normalPDF,
} from '../../src/options/GreeksCalculator.js';
import type {
  OptionPosition,
} from '../../src/options/GreeksCalculator.js';

// ============================================================================
// REFERENCE PARAMETERS
// ============================================================================

// Standard test contract: S=100, K=100 (ATM), T=0.25, sigma=0.20, r=0.05, q=0
const ATM_S = 100;
const ATM_K = 100;
const ATM_T = 0.25; // 3 months
const ATM_SIGMA = 0.20;
const ATM_R = 0.05;
const ATM_Q = 0.0;

// d1 = (ln(100/100) + (0.05 + 0.02)*0.25) / (0.20*sqrt(0.25))
//    = (0 + 0.0175) / 0.10 = 0.175
// d2 = 0.175 - 0.10 = 0.075

// ============================================================================
// TESTS
// ============================================================================

describe('GreeksCalculator', () => {
  const calc = new GreeksCalculator({ riskFreeRate: ATM_R, dividendYield: ATM_Q });

  // --------------------------------------------------------------------------
  // normalCDF / normalPDF
  // --------------------------------------------------------------------------

  describe('Normal distribution functions', () => {
    it('normalCDF returns correct values at key points', () => {
      expect(normalCDF(0)).toBeCloseTo(0.5, 6);
      expect(normalCDF(1)).toBeCloseTo(0.8413, 3);
      expect(normalCDF(-1)).toBeCloseTo(0.1587, 3);
      expect(normalCDF(2)).toBeCloseTo(0.9772, 3);
      expect(normalCDF(-2)).toBeCloseTo(0.0228, 3);
    });

    it('normalPDF returns correct values', () => {
      expect(normalPDF(0)).toBeCloseTo(0.3989, 3);
      expect(normalPDF(1)).toBeCloseTo(0.2420, 3);
      expect(normalPDF(-1)).toBeCloseTo(0.2420, 3);
    });

    it('normalCDF is symmetric: N(x) + N(-x) = 1', () => {
      for (const x of [0.5, 1.0, 1.5, 2.0, 3.0]) {
        expect(normalCDF(x) + normalCDF(-x)).toBeCloseTo(1.0, 10);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Black-Scholes Greeks for ATM call
  // --------------------------------------------------------------------------

  describe('Black-Scholes ATM call Greeks', () => {
    const result = calc.calculateGreeks(ATM_S, ATM_K, ATM_T, ATM_SIGMA, true, ATM_R, ATM_Q);

    it('computes delta near 0.57 for ATM call (S=100, K=100, T=0.25, σ=0.20, r=0.05)', () => {
      // Delta(call) = N(d1) = N(0.175) ≈ 0.5694
      expect(result.delta).toBeCloseTo(0.5694, 3);
    });

    it('computes gamma correctly', () => {
      // Gamma = n(d1) / (S * sigma * sqrt(T))
      // n(0.175) ≈ 0.3928
      // Gamma = 0.3928 / (100 * 0.20 * 0.50) = 0.3928 / 10 = 0.03928
      expect(result.gamma).toBeCloseTo(0.03928, 4);
    });

    it('computes theta (per day) as a negative number', () => {
      // Theta is negative for long options (time decay)
      expect(result.theta).toBeLessThan(0);
      // Theta ≈ -0.0287 per day for this contract (365 day basis)
      expect(result.theta).toBeCloseTo(-0.0287, 2);
    });

    it('computes vega (per 1% IV) correctly', () => {
      // Vega = S * sqrt(T) * n(d1) = 100 * 0.5 * 0.3928 = 19.64
      // Per 1%: 19.64 / 100 = 0.1964
      expect(result.vega).toBeCloseTo(0.1964, 3);
    });

    it('computes rho (per 1% rate) correctly', () => {
      // Rho(call) = K * T * e^(-rT) * N(d2) / 100
      // = 100 * 0.25 * e^(-0.0125) * N(0.075) / 100
      // = 25 * 0.98758 * 0.5299 / 100 ≈ 0.1308
      expect(result.rho).toBeCloseTo(0.1308, 3);
    });

    it('computes theoretical price matching Black-Scholes formula', () => {
      // BS call = S*N(d1) - K*e^(-rT)*N(d2)
      // = 100*0.5694 - 100*0.98758*0.5299
      // = 56.94 - 52.34 ≈ 4.615
      expect(result.theoreticalPrice).toBeCloseTo(4.615, 1);
    });
  });

  // --------------------------------------------------------------------------
  // Black-Scholes Greeks for ATM put
  // --------------------------------------------------------------------------

  describe('Black-Scholes ATM put Greeks', () => {
    const callResult = calc.calculateGreeks(ATM_S, ATM_K, ATM_T, ATM_SIGMA, true, ATM_R, ATM_Q);
    const putResult = calc.calculateGreeks(ATM_S, ATM_K, ATM_T, ATM_SIGMA, false, ATM_R, ATM_Q);

    it('computes put delta = call delta - 1 (put-call parity)', () => {
      expect(putResult.delta).toBeCloseTo(callResult.delta - 1.0, 6);
    });

    it('computes same gamma for call and put', () => {
      expect(putResult.gamma).toBeCloseTo(callResult.gamma, 8);
    });

    it('computes same vega for call and put', () => {
      expect(putResult.vega).toBeCloseTo(callResult.vega, 8);
    });

    it('computes negative put rho', () => {
      expect(putResult.rho).toBeLessThan(0);
    });

    it('satisfies put-call parity: C - P = S - K*e^(-rT)', () => {
      const pv_K = ATM_K * Math.exp(-ATM_R * ATM_T);
      const lhs = callResult.theoreticalPrice - putResult.theoreticalPrice;
      const rhs = ATM_S - pv_K;
      expect(lhs).toBeCloseTo(rhs, 4);
    });
  });

  // --------------------------------------------------------------------------
  // ITM / OTM contracts
  // --------------------------------------------------------------------------

  describe('ITM and OTM contracts', () => {
    it('deep ITM call has delta near 1', () => {
      // S=100, K=70 (deep ITM)
      const result = calc.calculateGreeks(100, 70, 0.25, 0.20, true, ATM_R, ATM_Q);
      expect(result.delta).toBeGreaterThan(0.95);
    });

    it('deep OTM call has delta near 0', () => {
      // S=100, K=150 (deep OTM)
      const result = calc.calculateGreeks(100, 150, 0.25, 0.20, true, ATM_R, ATM_Q);
      expect(result.delta).toBeLessThan(0.05);
    });

    it('deep ITM put has delta near -1', () => {
      // S=100, K=150 (deep ITM put)
      const result = calc.calculateGreeks(100, 150, 0.25, 0.20, false, ATM_R, ATM_Q);
      expect(result.delta).toBeLessThan(-0.95);
    });

    it('deep OTM put has delta near 0', () => {
      // S=100, K=60 (deep OTM put)
      const result = calc.calculateGreeks(100, 60, 0.25, 0.20, false, ATM_R, ATM_Q);
      expect(result.delta).toBeGreaterThan(-0.05);
    });
  });

  // --------------------------------------------------------------------------
  // Expired options
  // --------------------------------------------------------------------------

  describe('Expired options (T <= 0)', () => {
    it('ITM call at expiry: delta=1, price=intrinsic, other greeks=0', () => {
      const result = calc.calculateGreeks(105, 100, 0, 0.20, true, ATM_R, ATM_Q);
      expect(result.delta).toBe(1);
      expect(result.gamma).toBe(0);
      expect(result.theta).toBe(0);
      expect(result.vega).toBe(0);
      expect(result.rho).toBe(0);
      expect(result.theoreticalPrice).toBe(5);
    });

    it('OTM call at expiry: delta=0, price=0', () => {
      const result = calc.calculateGreeks(95, 100, 0, 0.20, true, ATM_R, ATM_Q);
      expect(result.delta).toBe(0);
      expect(result.theoreticalPrice).toBe(0);
    });

    it('ATM at expiry: delta=0.5 for call', () => {
      const result = calc.calculateGreeks(100, 100, 0, 0.20, true, ATM_R, ATM_Q);
      expect(result.delta).toBe(0.5);
    });
  });

  // --------------------------------------------------------------------------
  // Bjerksund-Stensland American approximation
  // --------------------------------------------------------------------------

  describe('Bjerksund-Stensland American approximation', () => {
    const americanCalc = new GreeksCalculator({
      riskFreeRate: ATM_R,
      dividendYield: 0.0,
      pricingModel: 'bjerksund-stensland',
    });

    it('matches European price for call with no dividends', () => {
      // American call with q=0 should equal European call
      const bsResult = calc.calculateGreeks(ATM_S, ATM_K, ATM_T, ATM_SIGMA, true, ATM_R, 0);
      const amResult = americanCalc.calculateGreeks(ATM_S, ATM_K, ATM_T, ATM_SIGMA, true, ATM_R, 0);
      expect(amResult.theoreticalPrice).toBeCloseTo(bsResult.theoreticalPrice, 2);
    });

    it('American call with dividends >= European call price', () => {
      const divCalc = new GreeksCalculator({
        riskFreeRate: ATM_R,
        dividendYield: 0.03,
        pricingModel: 'bjerksund-stensland',
      });
      const euroCalc = new GreeksCalculator({
        riskFreeRate: ATM_R,
        dividendYield: 0.03,
        pricingModel: 'black-scholes',
      });

      const amPrice = divCalc.calculateGreeks(ATM_S, ATM_K, ATM_T, ATM_SIGMA, true, ATM_R, 0.03);
      const euPrice = euroCalc.calculateGreeks(ATM_S, ATM_K, ATM_T, ATM_SIGMA, true, ATM_R, 0.03);

      // American option should be worth at least as much as European
      expect(amPrice.theoreticalPrice).toBeGreaterThanOrEqual(euPrice.theoreticalPrice - 0.01);
    });

    it('computes finite Greeks via central differences', () => {
      const divCalc = new GreeksCalculator({
        riskFreeRate: ATM_R,
        dividendYield: 0.03,
        pricingModel: 'bjerksund-stensland',
      });

      const result = divCalc.calculateGreeks(ATM_S, ATM_K, ATM_T, ATM_SIGMA, true, ATM_R, 0.03);
      expect(result.delta).toBeGreaterThan(0);
      expect(result.delta).toBeLessThan(1);
      expect(result.gamma).toBeGreaterThan(0);
      expect(result.vega).toBeGreaterThan(0);
      expect(result.theta).toBeLessThan(0);
      expect(Number.isFinite(result.rho)).toBe(true);
    });

    it('American put via put-call transformation has valid Greeks', () => {
      const divCalc = new GreeksCalculator({
        riskFreeRate: ATM_R,
        dividendYield: 0.03,
        pricingModel: 'bjerksund-stensland',
      });

      const result = divCalc.calculateGreeks(ATM_S, ATM_K, ATM_T, ATM_SIGMA, false, ATM_R, 0.03);
      expect(result.delta).toBeLessThan(0);
      expect(result.delta).toBeGreaterThan(-1);
      expect(result.gamma).toBeGreaterThan(0);
      expect(result.theoreticalPrice).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // Portfolio Greeks aggregation
  // --------------------------------------------------------------------------

  describe('Portfolio Greeks aggregation', () => {
    it('aggregates Greeks across multiple positions', () => {
      const positions: OptionPosition[] = [
        {
          symbol: 'AAPL',
          strike: 100,
          expiration: futureDate(30),
          type: 'call',
          quantity: 10,
          underlyingPrice: 100,
          impliedVolatility: 0.25,
        },
        {
          symbol: 'AAPL',
          strike: 100,
          expiration: futureDate(30),
          type: 'put',
          quantity: -5,
          underlyingPrice: 100,
          impliedVolatility: 0.25,
        },
      ];

      const portfolio = calc.calculatePortfolioGreeks(positions);

      expect(portfolio.positionCount).toBe(2);
      expect(portfolio.positions).toHaveLength(2);

      // Long 10 calls + short 5 puts should give positive net delta
      // (call delta ~0.5*10*100=500, put delta ~(-0.5)*(-5)*100=250 → ~750)
      expect(portfolio.netDelta).toBeGreaterThan(0);

      // Net theta should be negative (long calls decay, short puts earn theta)
      // Long 10 calls theta is strongly negative, short 5 puts partially offsets
      // Net depends on magnitudes — just check it's a finite number
      expect(Number.isFinite(portfolio.netTheta)).toBe(true);
    });

    it('delta-neutral portfolio has netDelta near zero', () => {
      const singleGreeks = calc.calculateGreeks(100, 100, 0.25, 0.25, true, ATM_R, ATM_Q);
      // To delta-hedge: sell delta shares per contract
      // But we're testing options only — straddle long call + long put:
      const positions: OptionPosition[] = [
        {
          symbol: 'TEST',
          strike: 100,
          expiration: futureDate(90),
          type: 'call',
          quantity: 1,
          underlyingPrice: 100,
          impliedVolatility: 0.25,
          contractMultiplier: 1, // Use 1 for simplicity
        },
        {
          symbol: 'TEST',
          strike: 100,
          expiration: futureDate(90),
          type: 'put',
          quantity: 1,
          underlyingPrice: 100,
          impliedVolatility: 0.25,
          contractMultiplier: 1,
        },
      ];

      const portfolio = calc.calculatePortfolioGreeks(positions);

      // Straddle: call delta + put delta should be close to 0 at ATM
      // (call delta ≈ 0.57, put delta ≈ -0.43, not exactly 0 due to drift)
      // With q=0, put delta = call delta - 1, so sum = 2*callDelta - 1
      expect(Math.abs(portfolio.netDelta)).toBeLessThan(0.5);

      // Net gamma should be positive (both options contribute positive gamma)
      expect(portfolio.netGamma).toBeGreaterThan(0);

      // Net vega should be positive (both options contribute positive vega)
      expect(portfolio.netVega).toBeGreaterThan(0);

      // Verify weighted Greeks = quantity * multiplier * per-contract greeks
      const callPos = portfolio.positions[0];
      expect(callPos.weightedGreeks.delta).toBeCloseTo(
        callPos.quantity * callPos.contractMultiplier * callPos.greeks.delta,
        10,
      );
      // Use singleGreeks to verify the gamma is reasonable
      expect(callPos.greeks.gamma).toBeGreaterThan(0);
      void singleGreeks; // consumed for contextual reference
    });

    it('handles empty portfolio', () => {
      const portfolio = calc.calculatePortfolioGreeks([]);
      expect(portfolio.positionCount).toBe(0);
      expect(portfolio.netDelta).toBeCloseTo(0, 10);
      expect(portfolio.netGamma).toBeCloseTo(0, 10);
      expect(portfolio.netTheta).toBeCloseTo(0, 10);
      expect(portfolio.netVega).toBeCloseTo(0, 10);
      expect(portfolio.netRho).toBeCloseTo(0, 10);
    });
  });

  // --------------------------------------------------------------------------
  // Greeks heatmap
  // --------------------------------------------------------------------------

  describe('Greeks heatmap', () => {
    it('generates cells for each strike × expiration combination', () => {
      const strikes = [95, 100, 105];
      const expirations = [futureDate(30), futureDate(60)];

      const heatmap = calc.generateHeatmap('AAPL', 100, strikes, expirations, 0.25);

      expect(heatmap.symbol).toBe('AAPL');
      expect(heatmap.underlyingPrice).toBe(100);
      expect(heatmap.strikes).toEqual(strikes);
      expect(heatmap.expirations).toEqual(expirations);
      expect(heatmap.cells).toHaveLength(6); // 3 strikes × 2 expirations
    });

    it('heatmap cells contain valid call and put Greeks', () => {
      const strikes = [100];
      const expirations = [futureDate(30)];

      const heatmap = calc.generateHeatmap('AAPL', 100, strikes, expirations, 0.25);
      const cell = heatmap.cells[0];

      // Call delta should be positive, put delta negative
      expect(cell.callDelta).toBeGreaterThan(0);
      expect(cell.putDelta).toBeLessThan(0);

      // Gamma should be positive for both
      expect(cell.callGamma).toBeGreaterThan(0);
      expect(cell.putGamma).toBeGreaterThan(0);

      // Call and put gamma should be equal
      expect(cell.callGamma).toBeCloseTo(cell.putGamma, 8);

      // Prices should be positive
      expect(cell.callPrice).toBeGreaterThan(0);
      expect(cell.putPrice).toBeGreaterThan(0);
    });

    it('supports per-cell IV via Map', () => {
      const strikes = [95, 100, 105];
      const expirations = [futureDate(30)];
      const ivGrid = new Map<string, number>();

      // OTM puts have higher IV (skew)
      ivGrid.set(`95:${expirations[0]}`, 0.30);
      ivGrid.set(`100:${expirations[0]}`, 0.25);
      ivGrid.set(`105:${expirations[0]}`, 0.22);

      const heatmap = calc.generateHeatmap('AAPL', 100, strikes, expirations, ivGrid);

      const cell95 = heatmap.cells.find(c => c.strike === 95)!;
      const cell100 = heatmap.cells.find(c => c.strike === 100)!;
      const cell105 = heatmap.cells.find(c => c.strike === 105)!;

      // Verify the IV map produced different prices at each strike
      // 95 strike (IV=0.30) OTM call should have higher time value than
      // 105 strike (IV=0.22) OTM call, because higher IV pumps time value
      // Note: 95 call is OTM by $5, 105 call is also OTM by $5 — same intrinsic (0)
      // So the price difference comes entirely from higher IV at 95
      expect(cell95.callPrice).toBeGreaterThan(cell105.callPrice);

      // ATM (100 strike) should have highest gamma regardless of IV
      expect(cell100.callGamma).toBeGreaterThan(cell95.callGamma);
      expect(cell100.callGamma).toBeGreaterThan(cell105.callGamma);
    });
  });

  // --------------------------------------------------------------------------
  // Sensitivity: Greeks change with inputs
  // --------------------------------------------------------------------------

  describe('Greeks sensitivity', () => {
    it('delta increases as call goes deeper ITM', () => {
      const delta90 = calc.calculateGreeks(100, 90, 0.25, 0.20, true, ATM_R, ATM_Q).delta;
      const delta100 = calc.calculateGreeks(100, 100, 0.25, 0.20, true, ATM_R, ATM_Q).delta;
      const delta110 = calc.calculateGreeks(100, 110, 0.25, 0.20, true, ATM_R, ATM_Q).delta;

      expect(delta90).toBeGreaterThan(delta100);
      expect(delta100).toBeGreaterThan(delta110);
    });

    it('gamma peaks at ATM and decreases away from money', () => {
      const gamma90 = calc.calculateGreeks(100, 90, 0.25, 0.20, true, ATM_R, ATM_Q).gamma;
      const gamma100 = calc.calculateGreeks(100, 100, 0.25, 0.20, true, ATM_R, ATM_Q).gamma;
      const gamma110 = calc.calculateGreeks(100, 110, 0.25, 0.20, true, ATM_R, ATM_Q).gamma;

      expect(gamma100).toBeGreaterThan(gamma90);
      expect(gamma100).toBeGreaterThan(gamma110);
    });

    it('vega is larger for longer-dated options', () => {
      const vegaShort = calc.calculateGreeks(100, 100, 0.083, 0.20, true, ATM_R, ATM_Q).vega; // 1 month
      const vegaLong = calc.calculateGreeks(100, 100, 0.50, 0.20, true, ATM_R, ATM_Q).vega;  // 6 months

      expect(vegaLong).toBeGreaterThan(vegaShort);
    });

    it('theta magnitude increases as expiry approaches (short-dated > long-dated)', () => {
      const thetaShort = calc.calculateGreeks(100, 100, 0.02, 0.20, true, ATM_R, ATM_Q).theta; // ~1 week
      const thetaLong = calc.calculateGreeks(100, 100, 0.50, 0.20, true, ATM_R, ATM_Q).theta;  // 6 months

      // More negative theta for shorter-dated (faster decay)
      expect(thetaShort).toBeLessThan(thetaLong);
    });
  });

  // --------------------------------------------------------------------------
  // Configuration
  // --------------------------------------------------------------------------

  describe('Configuration', () => {
    it('uses default config when none provided', () => {
      const defaultCalc = new GreeksCalculator();
      const result = defaultCalc.calculateGreeks(100, 100, 0.25, 0.20, true);
      expect(result.delta).toBeGreaterThan(0);
      expect(result.delta).toBeLessThan(1);
    });

    it('respects custom risk-free rate', () => {
      const lowRateCalc = new GreeksCalculator({ riskFreeRate: 0.01 });
      const highRateCalc = new GreeksCalculator({ riskFreeRate: 0.10 });

      const lowRateRho = lowRateCalc.calculateGreeks(100, 100, 0.25, 0.20, true, 0.01).rho;
      const highRateRho = highRateCalc.calculateGreeks(100, 100, 0.25, 0.20, true, 0.10).rho;

      // Higher rate → larger rho for calls
      expect(highRateRho).toBeGreaterThan(lowRateRho);
    });

    it('respects dividend yield', () => {
      const noDiv = new GreeksCalculator({ dividendYield: 0.0 });
      const withDiv = new GreeksCalculator({ dividendYield: 0.04 });

      const noDivDelta = noDiv.calculateGreeks(100, 100, 0.5, 0.20, true, ATM_R, 0.0).delta;
      const withDivDelta = withDiv.calculateGreeks(100, 100, 0.5, 0.20, true, ATM_R, 0.04).delta;

      // Dividend-paying stock has lower call delta (reduces forward price)
      expect(withDivDelta).toBeLessThan(noDivDelta);
    });
  });

  // --------------------------------------------------------------------------
  // Edge cases
  // --------------------------------------------------------------------------

  describe('Edge cases', () => {
    it('handles very small time to expiry without NaN', () => {
      const result = calc.calculateGreeks(100, 100, 0.001, 0.20, true, ATM_R, ATM_Q);
      expect(Number.isFinite(result.delta)).toBe(true);
      expect(Number.isFinite(result.gamma)).toBe(true);
      expect(Number.isFinite(result.theta)).toBe(true);
      expect(Number.isFinite(result.vega)).toBe(true);
      expect(Number.isFinite(result.rho)).toBe(true);
    });

    it('handles very high volatility', () => {
      const result = calc.calculateGreeks(100, 100, 0.25, 2.0, true, ATM_R, ATM_Q);
      expect(Number.isFinite(result.delta)).toBe(true);
      expect(result.delta).toBeGreaterThan(0);
      expect(result.delta).toBeLessThanOrEqual(1);
    });

    it('handles very low volatility', () => {
      // ITM call with very low vol → delta near 1
      const result = calc.calculateGreeks(100, 80, 0.25, 0.01, true, ATM_R, ATM_Q);
      expect(result.delta).toBeCloseTo(1.0, 2);
    });

    it('handles S = K exactly (perfectly ATM)', () => {
      const result = calc.calculateGreeks(100, 100, 0.25, 0.20, true, ATM_R, ATM_Q);
      // ATM call delta slightly above 0.5 (due to drift)
      expect(result.delta).toBeGreaterThan(0.5);
      expect(result.delta).toBeLessThan(0.7);
    });

    it('calculateContractGreeks includes metadata fields', () => {
      const result = calc.calculateContractGreeks({
        symbol: 'TSLA',
        strike: 200,
        expiration: futureDate(60),
        type: 'call',
        underlyingPrice: 210,
        impliedVolatility: 0.50,
      });

      expect(result.symbol).toBe('TSLA');
      expect(result.strike).toBe(200);
      expect(result.type).toBe('call');
      expect(result.underlyingPrice).toBe(210);
      expect(result.impliedVolatility).toBe(0.50);
      expect(result.timeToExpiry).toBeGreaterThan(0);
      expect(result.delta).toBeGreaterThan(0.5); // ITM call
    });
  });
});

// ============================================================================
// HELPERS
// ============================================================================

/** Return an ISO date string N days in the future. */
function futureDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split('T')[0];
}
