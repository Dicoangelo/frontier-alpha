/**
 * Options Greeks Calculator
 *
 * Calculates delta, gamma, theta, vega, and rho for individual contracts
 * and aggregated portfolios using Black-Scholes (European) and
 * Bjerksund-Stensland (American-style approximation) models.
 *
 * Includes heatmap data generation for strike × expiration visualization.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface GreeksResult {
  delta: number;
  gamma: number;
  theta: number; // Per calendar day
  vega: number; // Per 1% IV move
  rho: number; // Per 1% rate move
}

export interface ContractGreeks extends GreeksResult {
  symbol: string;
  strike: number;
  expiration: string;
  type: 'call' | 'put';
  underlyingPrice: number;
  impliedVolatility: number;
  timeToExpiry: number; // Years
  theoreticalPrice: number;
}

export interface PortfolioGreeks extends GreeksResult {
  positionCount: number;
  netDelta: number; // Delta-equivalent shares
  netGamma: number;
  netTheta: number; // Daily portfolio theta
  netVega: number;
  netRho: number;
  positions: PortfolioGreeksPosition[];
}

export interface PortfolioGreeksPosition {
  symbol: string;
  strike: number;
  expiration: string;
  type: 'call' | 'put';
  quantity: number; // Positive = long, negative = short
  contractMultiplier: number;
  greeks: GreeksResult;
  weightedGreeks: GreeksResult; // quantity * multiplier * greeks
}

export interface HeatmapCell {
  strike: number;
  expiration: string;
  callDelta: number;
  callGamma: number;
  callTheta: number;
  callVega: number;
  callRho: number;
  putDelta: number;
  putGamma: number;
  putTheta: number;
  putVega: number;
  putRho: number;
  callPrice: number;
  putPrice: number;
}

export interface GreeksHeatmap {
  symbol: string;
  underlyingPrice: number;
  riskFreeRate: number;
  strikes: number[];
  expirations: string[];
  cells: HeatmapCell[];
}

export interface GreeksCalculatorConfig {
  riskFreeRate?: number;
  dividendYield?: number;
  daysInYear?: number;
  pricingModel?: 'black-scholes' | 'bjerksund-stensland';
}

export interface OptionPosition {
  symbol: string;
  strike: number;
  expiration: string;
  type: 'call' | 'put';
  quantity: number;
  underlyingPrice: number;
  impliedVolatility: number;
  contractMultiplier?: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_RISK_FREE_RATE = 0.0525;
const DEFAULT_DIVIDEND_YIELD = 0.0;
const DAYS_IN_YEAR = 365;
const INV_SQRT_2PI = 1 / Math.sqrt(2 * Math.PI);

// ============================================================================
// GREEKS CALCULATOR
// ============================================================================

export class GreeksCalculator {
  private riskFreeRate: number;
  private dividendYield: number;
  private daysInYear: number;
  private pricingModel: 'black-scholes' | 'bjerksund-stensland';

  constructor(config: GreeksCalculatorConfig = {}) {
    this.riskFreeRate = config.riskFreeRate ?? DEFAULT_RISK_FREE_RATE;
    this.dividendYield = config.dividendYield ?? DEFAULT_DIVIDEND_YIELD;
    this.daysInYear = config.daysInYear ?? DAYS_IN_YEAR;
    this.pricingModel = config.pricingModel ?? 'black-scholes';
  }

  // ==========================================================================
  // PUBLIC API — INDIVIDUAL CONTRACT GREEKS
  // ==========================================================================

  /**
   * Calculate all Greeks for a single options contract.
   */
  calculateGreeks(
    S: number,  // Underlying price
    K: number,  // Strike price
    T: number,  // Time to expiration in years
    sigma: number, // Implied volatility (annualized, e.g. 0.30 = 30%)
    isCall: boolean,
    r?: number,
    q?: number,
  ): ContractGreeks & { model: string } {
    const rate = r ?? this.riskFreeRate;
    const div = q ?? this.dividendYield;

    if (T <= 0) {
      return this.expiredGreeks(S, K, isCall, rate);
    }

    if (this.pricingModel === 'bjerksund-stensland') {
      return this.bjerksundStenslandGreeks(S, K, T, sigma, isCall, rate, div);
    }

    return this.blackScholesGreeks(S, K, T, sigma, isCall, rate, div);
  }

  /**
   * Calculate Greeks for a contract specified by expiration date string.
   */
  calculateContractGreeks(position: {
    symbol: string;
    strike: number;
    expiration: string;
    type: 'call' | 'put';
    underlyingPrice: number;
    impliedVolatility: number;
  }): ContractGreeks {
    const T = this.calculateTimeToExpiry(position.expiration);
    const isCall = position.type === 'call';
    const result = this.calculateGreeks(
      position.underlyingPrice,
      position.strike,
      T,
      position.impliedVolatility,
      isCall,
    );

    return {
      ...result,
      symbol: position.symbol,
      strike: position.strike,
      expiration: position.expiration,
      type: position.type,
      underlyingPrice: position.underlyingPrice,
      impliedVolatility: position.impliedVolatility,
      timeToExpiry: T,
    };
  }

  // ==========================================================================
  // PUBLIC API — PORTFOLIO GREEKS
  // ==========================================================================

  /**
   * Aggregate Greeks across a portfolio of options positions.
   * Quantity > 0 = long, quantity < 0 = short.
   */
  calculatePortfolioGreeks(positions: OptionPosition[]): PortfolioGreeks {
    const posResults: PortfolioGreeksPosition[] = [];
    let netDelta = 0;
    let netGamma = 0;
    let netTheta = 0;
    let netVega = 0;
    let netRho = 0;

    for (const pos of positions) {
      const T = this.calculateTimeToExpiry(pos.expiration);
      const isCall = pos.type === 'call';
      const multiplier = pos.contractMultiplier ?? 100;
      const result = this.calculateGreeks(
        pos.underlyingPrice,
        pos.strike,
        T,
        pos.impliedVolatility,
        isCall,
      );

      const scale = pos.quantity * multiplier;

      const weighted: GreeksResult = {
        delta: result.delta * scale,
        gamma: result.gamma * scale,
        theta: result.theta * scale,
        vega: result.vega * scale,
        rho: result.rho * scale,
      };

      netDelta += weighted.delta;
      netGamma += weighted.gamma;
      netTheta += weighted.theta;
      netVega += weighted.vega;
      netRho += weighted.rho;

      posResults.push({
        symbol: pos.symbol,
        strike: pos.strike,
        expiration: pos.expiration,
        type: pos.type,
        quantity: pos.quantity,
        contractMultiplier: multiplier,
        greeks: {
          delta: result.delta,
          gamma: result.gamma,
          theta: result.theta,
          vega: result.vega,
          rho: result.rho,
        },
        weightedGreeks: weighted,
      });
    }

    return {
      positionCount: positions.length,
      delta: netDelta,
      gamma: netGamma,
      theta: netTheta,
      vega: netVega,
      rho: netRho,
      netDelta,
      netGamma,
      netTheta,
      netVega,
      netRho,
      positions: posResults,
    };
  }

  // ==========================================================================
  // PUBLIC API — HEATMAP
  // ==========================================================================

  /**
   * Generate a Greeks heatmap (strike × expiration grid).
   * Returns call and put Greeks for every (strike, expiration) combination.
   */
  generateHeatmap(
    symbol: string,
    underlyingPrice: number,
    strikes: number[],
    expirations: string[],
    ivGrid: Map<string, number> | number, // Map<"strike:expiration", IV> or flat IV
  ): GreeksHeatmap {
    const cells: HeatmapCell[] = [];

    for (const expiration of expirations) {
      const T = this.calculateTimeToExpiry(expiration);
      for (const strike of strikes) {
        const key = `${strike}:${expiration}`;
        const sigma = typeof ivGrid === 'number' ? ivGrid : (ivGrid.get(key) ?? 0.25);

        const callResult = this.calculateGreeks(underlyingPrice, strike, T, sigma, true);
        const putResult = this.calculateGreeks(underlyingPrice, strike, T, sigma, false);

        cells.push({
          strike,
          expiration,
          callDelta: callResult.delta,
          callGamma: callResult.gamma,
          callTheta: callResult.theta,
          callVega: callResult.vega,
          callRho: callResult.rho,
          putDelta: putResult.delta,
          putGamma: putResult.gamma,
          putTheta: putResult.theta,
          putVega: putResult.vega,
          putRho: putResult.rho,
          callPrice: callResult.theoreticalPrice,
          putPrice: putResult.theoreticalPrice,
        });
      }
    }

    return {
      symbol,
      underlyingPrice,
      riskFreeRate: this.riskFreeRate,
      strikes: [...strikes],
      expirations: [...expirations],
      cells,
    };
  }

  // ==========================================================================
  // EXPIRED OPTIONS
  // ==========================================================================

  private expiredGreeks(
    S: number,
    K: number,
    isCall: boolean,
    _r: number,
  ): ContractGreeks & { model: string } {
    const intrinsic = isCall ? Math.max(0, S - K) : Math.max(0, K - S);
    // At expiry: delta is 0 or ±1, all other Greeks are 0
    let delta: number;
    if (isCall) {
      delta = S > K ? 1 : (S === K ? 0.5 : 0);
    } else {
      delta = S < K ? -1 : (S === K ? -0.5 : 0);
    }

    return {
      delta,
      gamma: 0,
      theta: 0,
      vega: 0,
      rho: 0,
      theoreticalPrice: intrinsic,
      symbol: '',
      strike: K,
      expiration: '',
      type: isCall ? 'call' : 'put',
      underlyingPrice: S,
      impliedVolatility: 0,
      timeToExpiry: 0,
      model: 'expired',
    };
  }

  // ==========================================================================
  // BLACK-SCHOLES GREEKS (European)
  // ==========================================================================

  private blackScholesGreeks(
    S: number,
    K: number,
    T: number,
    sigma: number,
    isCall: boolean,
    r: number,
    q: number,
  ): ContractGreeks & { model: string } {
    const sqrtT = Math.sqrt(T);
    const d1 = (Math.log(S / K) + (r - q + (sigma * sigma) / 2) * T) / (sigma * sqrtT);
    const d2 = d1 - sigma * sqrtT;

    const Nd1 = normalCDF(d1);
    const Nd2 = normalCDF(d2);
    const nd1 = normalPDF(d1);
    const eqT = Math.exp(-q * T);
    const erT = Math.exp(-r * T);

    let delta: number;
    let theta: number;
    let rho: number;
    let theoreticalPrice: number;

    if (isCall) {
      delta = eqT * Nd1;
      theta = (
        (-S * eqT * nd1 * sigma) / (2 * sqrtT)
        - r * K * erT * Nd2
        + q * S * eqT * Nd1
      ) / this.daysInYear;
      rho = (K * T * erT * Nd2) / 100;
      theoreticalPrice = S * eqT * Nd1 - K * erT * Nd2;
    } else {
      const Nmd1 = normalCDF(-d1);
      const Nmd2 = normalCDF(-d2);
      delta = -eqT * Nmd1;
      theta = (
        (-S * eqT * nd1 * sigma) / (2 * sqrtT)
        + r * K * erT * Nmd2
        - q * S * eqT * Nmd1
      ) / this.daysInYear;
      rho = (-K * T * erT * Nmd2) / 100;
      theoreticalPrice = K * erT * Nmd2 - S * eqT * Nmd1;
    }

    // Gamma and vega are the same for calls and puts
    const gamma = (eqT * nd1) / (S * sigma * sqrtT);
    const vega = (S * eqT * nd1 * sqrtT) / 100; // Per 1% IV

    return {
      delta,
      gamma,
      theta,
      vega,
      rho,
      theoreticalPrice: Math.max(0, theoreticalPrice),
      symbol: '',
      strike: K,
      expiration: '',
      type: isCall ? 'call' : 'put',
      underlyingPrice: S,
      impliedVolatility: sigma,
      timeToExpiry: T,
      model: 'black-scholes',
    };
  }

  // ==========================================================================
  // BJERKSUND-STENSLAND (American-style approximation)
  // ==========================================================================

  /**
   * Bjerksund-Stensland 1993 approximation for American options.
   * For calls: direct pricing. For puts: use put-call transformation.
   * Greeks computed via central differences on the pricing function.
   */
  private bjerksundStenslandGreeks(
    S: number,
    K: number,
    T: number,
    sigma: number,
    isCall: boolean,
    r: number,
    q: number,
  ): ContractGreeks & { model: string } {
    const price = isCall
      ? this.bjerksundStenslandCallPrice(S, K, T, sigma, r, q)
      : this.bjerksundStenslandPutPrice(S, K, T, sigma, r, q);

    // Greeks via central finite differences
    const eps_S = S * 1e-4;
    const eps_sigma = 1e-4;
    const eps_T = 1e-5;
    const eps_r = 1e-4;

    const priceFn = (s: number, k: number, t: number, vol: number, rate: number, div: number, call: boolean) =>
      call
        ? this.bjerksundStenslandCallPrice(s, k, t, vol, rate, div)
        : this.bjerksundStenslandPutPrice(s, k, t, vol, rate, div);

    // Delta
    const priceUp = priceFn(S + eps_S, K, T, sigma, r, q, isCall);
    const priceDown = priceFn(S - eps_S, K, T, sigma, r, q, isCall);
    const delta = (priceUp - priceDown) / (2 * eps_S);

    // Gamma
    const gamma = (priceUp - 2 * price + priceDown) / (eps_S * eps_S);

    // Vega (per 1% move)
    const priceVolUp = priceFn(S, K, T, sigma + eps_sigma, r, q, isCall);
    const priceVolDown = priceFn(S, K, T, sigma - eps_sigma, r, q, isCall);
    const vega = (priceVolUp - priceVolDown) / (2 * eps_sigma) / 100;

    // Theta (per calendar day, negative of dPrice/dT)
    const priceTUp = priceFn(S, K, T + eps_T, sigma, r, q, isCall);
    const priceTDown = priceFn(S, K, Math.max(1e-10, T - eps_T), sigma, r, q, isCall);
    const theta = -(priceTUp - priceTDown) / (2 * eps_T) / this.daysInYear;

    // Rho (per 1% rate move)
    const priceRUp = priceFn(S, K, T, sigma, r + eps_r, q, isCall);
    const priceRDown = priceFn(S, K, T, sigma, r - eps_r, q, isCall);
    const rho = (priceRUp - priceRDown) / (2 * eps_r) / 100;

    return {
      delta,
      gamma,
      theta,
      vega,
      rho,
      theoreticalPrice: Math.max(0, price),
      symbol: '',
      strike: K,
      expiration: '',
      type: isCall ? 'call' : 'put',
      underlyingPrice: S,
      impliedVolatility: sigma,
      timeToExpiry: T,
      model: 'bjerksund-stensland',
    };
  }

  /**
   * Bjerksund-Stensland 1993 American call price.
   */
  private bjerksundStenslandCallPrice(
    S: number,
    K: number,
    T: number,
    sigma: number,
    r: number,
    q: number,
  ): number {
    // If no dividends, American call = European call
    if (q <= 0) {
      const bs = this.blackScholesGreeks(S, K, T, sigma, true, r, q);
      return bs.theoreticalPrice;
    }

    const sigmaSquared = sigma * sigma;
    const beta = (0.5 - q / sigmaSquared) + Math.sqrt(
      Math.pow(q / sigmaSquared - 0.5, 2) + 2 * r / sigmaSquared,
    );

    const bInfinity = (beta / (beta - 1)) * K;
    const b0 = Math.max(K, (r / (r - q)) * K);

    const ht = -(r * T + 2 * sigma * Math.sqrt(T)) * (b0 / (bInfinity - b0));
    const I = b0 + (bInfinity - b0) * (1 - Math.exp(ht));

    if (S >= I) {
      return S - K;
    }

    const alpha = (I - K) * Math.pow(I, -beta);

    return (
      alpha * Math.pow(S, beta)
      - alpha * this.phi(S, T, beta, I, I, r, q, sigma)
      + this.phi(S, T, 1, I, I, r, q, sigma)
      - this.phi(S, T, 1, K, I, r, q, sigma)
      - K * this.phi(S, T, 0, I, I, r, q, sigma)
      + K * this.phi(S, T, 0, K, I, r, q, sigma)
    );
  }

  /**
   * Bjerksund-Stensland American put via put-call transformation.
   * P_american(S, K, T, r, q, sigma) = C_american(K, S, T, q, r, sigma)
   */
  private bjerksundStenslandPutPrice(
    S: number,
    K: number,
    T: number,
    sigma: number,
    r: number,
    q: number,
  ): number {
    return this.bjerksundStenslandCallPrice(K, S, T, sigma, q, r);
  }

  /**
   * The phi helper function for Bjerksund-Stensland.
   */
  private phi(
    S: number,
    T: number,
    gamma_param: number,
    H: number,
    I: number,
    r: number,
    q: number,
    sigma: number,
  ): number {
    const sigmaSquared = sigma * sigma;
    const lambda = (-r + gamma_param * (r - q) + 0.5 * gamma_param * (gamma_param - 1) * sigmaSquared) * T;
    const d = -(Math.log(S / H) + (r - q + (gamma_param - 0.5) * sigmaSquared) * T) / (sigma * Math.sqrt(T));
    const kappa = (2 * (r - q)) / sigmaSquared + (2 * gamma_param - 1);

    return (
      Math.exp(lambda)
      * Math.pow(S, gamma_param)
      * (
        normalCDF(d)
        - Math.pow(I / S, kappa) * normalCDF(d - 2 * Math.log(I / S) / (sigma * Math.sqrt(T)))
      )
    );
  }

  // ==========================================================================
  // UTILITIES
  // ==========================================================================

  /**
   * Calculate time to expiry in years from an ISO date string.
   */
  calculateTimeToExpiry(expiration: string): number {
    const expDate = new Date(expiration);
    const now = new Date();
    const msToExpiry = expDate.getTime() - now.getTime();
    return Math.max(0, msToExpiry / (this.daysInYear * 24 * 60 * 60 * 1000));
  }
}

// ============================================================================
// MATH HELPERS (module-level for reuse and testability)
// ============================================================================

/**
 * Standard normal probability density function.
 */
function normalPDF(x: number): number {
  return INV_SQRT_2PI * Math.exp(-0.5 * x * x);
}

/**
 * Cumulative distribution function for the standard normal distribution.
 * Uses Abramowitz & Stegun approximation (same approach as ImpliedVolatility.ts).
 */
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);

  return 0.5 * (1.0 + sign * y);
}

// ============================================================================
// EXPORTS
// ============================================================================

export { normalCDF, normalPDF };

export const greeksCalculator = new GreeksCalculator();
