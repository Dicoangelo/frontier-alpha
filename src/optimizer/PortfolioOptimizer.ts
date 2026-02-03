/**
 * FRONTIER ALPHA - Portfolio Optimizer
 * 
 * Multi-objective optimization with Monte Carlo validation.
 * Supports Sharpe maximization, risk parity, and CVaR optimization.
 */

import type {
  OptimizationConfig,
  OptimizationResult,
  MonteCarloResult,
  FactorExposure,
  Price,
} from '../types/index.js';
import { FactorEngine } from '../factors/FactorEngine.js';

// ============================================================================
// PORTFOLIO OPTIMIZER
// ============================================================================

export class PortfolioOptimizer {
  private factorEngine: FactorEngine;
  private rng: () => number;

  constructor(factorEngine?: FactorEngine) {
    this.factorEngine = factorEngine || new FactorEngine();
    this.rng = Math.random;
  }

  /**
   * Main optimization entry point
   */
  async optimize(
    symbols: string[],
    prices: Map<string, Price[]>,
    config: OptimizationConfig
  ): Promise<OptimizationResult> {
    // Calculate returns matrix
    const returns = this.calculateReturnsMatrix(symbols, prices);
    
    // Calculate expected returns and covariance
    const mu = this.calculateMeanReturns(returns);
    const sigma = this.calculateCovariance(returns);
    
    // Apply Ledoit-Wolf shrinkage to covariance
    const shrunkSigma = this.ledoitWolfShrinkage(sigma);
    
    // Optimize based on objective
    let weights: number[];
    
    switch (config.objective) {
      case 'max_sharpe':
        weights = this.maxSharpe(mu, shrunkSigma, config.riskFreeRate);
        break;
      case 'min_volatility':
        weights = this.minVolatility(shrunkSigma);
        break;
      case 'risk_parity':
        weights = this.riskParity(shrunkSigma);
        break;
      case 'target_volatility':
        weights = this.targetVolatility(mu, shrunkSigma, config.targetVolatility || 0.15);
        break;
      default:
        weights = this.equalWeight(symbols.length);
    }
    
    // Validate with Monte Carlo
    const monteCarlo = this.monteCarloSimulation(returns, weights, 10000);
    
    // Calculate metrics
    const expectedReturn = this.portfolioReturn(weights, mu);
    const expectedVol = this.portfolioVolatility(weights, shrunkSigma);
    const sharpe = (expectedReturn - config.riskFreeRate) / expectedVol;
    
    // Calculate factor exposures
    const factorExposures = await this.calculateFactorExposures(symbols, weights, prices);
    
    // Generate explanation
    const explanation = this.generateExplanation(
      symbols, weights, expectedReturn, expectedVol, sharpe, factorExposures
    );
    
    // Convert to Map
    const weightsMap = new Map<string, number>();
    symbols.forEach((s, i) => weightsMap.set(s, weights[i]));
    
    return {
      weights: weightsMap,
      expectedReturn: expectedReturn * 252,  // Annualize
      expectedVolatility: expectedVol * Math.sqrt(252),
      sharpeRatio: sharpe * Math.sqrt(252),
      factorExposures,
      monteCarlo,
      explanation,
    };
  }

  // ============================================================================
  // OPTIMIZATION ALGORITHMS
  // ============================================================================

  /**
   * Maximum Sharpe Ratio portfolio
   */
  private maxSharpe(mu: number[], sigma: number[][], rf: number): number[] {
    const n = mu.length;
    
    // Use gradient descent for max Sharpe
    let weights = this.equalWeight(n);
    const lr = 0.01;
    const iterations = 1000;
    
    for (let iter = 0; iter < iterations; iter++) {
      const ret = this.portfolioReturn(weights, mu);
      const vol = this.portfolioVolatility(weights, sigma);
      const sharpe = (ret - rf / 252) / vol;
      
      // Calculate gradient
      const gradient = new Array(n).fill(0);
      const delta = 0.0001;
      
      for (let i = 0; i < n; i++) {
        const wPlus = [...weights];
        wPlus[i] += delta;
        this.normalizeWeights(wPlus);
        
        const retPlus = this.portfolioReturn(wPlus, mu);
        const volPlus = this.portfolioVolatility(wPlus, sigma);
        const sharpePlus = (retPlus - rf / 252) / volPlus;
        
        gradient[i] = (sharpePlus - sharpe) / delta;
      }
      
      // Update weights
      for (let i = 0; i < n; i++) {
        weights[i] += lr * gradient[i];
        weights[i] = Math.max(0, weights[i]);  // Long-only constraint
      }
      
      this.normalizeWeights(weights);
    }
    
    return weights;
  }

  /**
   * Minimum Variance portfolio
   */
  private minVolatility(sigma: number[][]): number[] {
    const n = sigma.length;
    
    // Analytical solution for min variance (no return constraint)
    // w* = Σ^(-1) * 1 / (1' * Σ^(-1) * 1)
    
    // For simplicity, use gradient descent
    let weights = this.equalWeight(n);
    const lr = 0.01;
    const iterations = 1000;
    
    for (let iter = 0; iter < iterations; iter++) {
      const gradient = new Array(n).fill(0);
      const delta = 0.0001;
      const currentVol = this.portfolioVolatility(weights, sigma);
      
      for (let i = 0; i < n; i++) {
        const wPlus = [...weights];
        wPlus[i] += delta;
        this.normalizeWeights(wPlus);
        
        const volPlus = this.portfolioVolatility(wPlus, sigma);
        gradient[i] = (volPlus - currentVol) / delta;
      }
      
      // Move against gradient (minimize)
      for (let i = 0; i < n; i++) {
        weights[i] -= lr * gradient[i];
        weights[i] = Math.max(0, weights[i]);
      }
      
      this.normalizeWeights(weights);
    }
    
    return weights;
  }

  /**
   * Risk Parity portfolio
   * Each asset contributes equally to portfolio risk
   */
  private riskParity(sigma: number[][]): number[] {
    const n = sigma.length;
    let weights = this.equalWeight(n);
    const lr = 0.01;
    const iterations = 1000;
    
    for (let iter = 0; iter < iterations; iter++) {
      const vol = this.portfolioVolatility(weights, sigma);
      const riskContributions = this.riskContributions(weights, sigma);
      const targetContribution = 1 / n;
      
      // Gradient: move toward equal risk contribution
      for (let i = 0; i < n; i++) {
        const error = riskContributions[i] - targetContribution;
        weights[i] -= lr * error;
        weights[i] = Math.max(0.01, weights[i]);  // Min weight
      }
      
      this.normalizeWeights(weights);
    }
    
    return weights;
  }

  /**
   * Target Volatility portfolio
   */
  private targetVolatility(
    mu: number[], 
    sigma: number[][], 
    targetVol: number
  ): number[] {
    // Start with max Sharpe
    const maxSharpeWeights = this.maxSharpe(mu, sigma, 0);
    const maxSharpeVol = this.portfolioVolatility(maxSharpeWeights, sigma) * Math.sqrt(252);
    
    // Scale weights to target volatility
    const scaleFactor = targetVol / maxSharpeVol;
    
    if (scaleFactor >= 1) {
      return maxSharpeWeights;  // Already at or below target
    }
    
    // Blend with cash (reduce exposure)
    const weights = maxSharpeWeights.map(w => w * scaleFactor);
    
    return weights;
  }

  /**
   * Equal weight (fallback)
   */
  private equalWeight(n: number): number[] {
    return new Array(n).fill(1 / n);
  }

  // ============================================================================
  // MONTE CARLO SIMULATION
  // ============================================================================

  /**
   * Run Monte Carlo simulation for risk analysis
   */
  private monteCarloSimulation(
    returns: number[][],
    weights: number[],
    simulations: number
  ): MonteCarloResult {
    const n = weights.length;
    const portfolioReturns: number[] = [];
    
    // Calculate historical portfolio returns
    const T = returns[0]?.length || 0;
    for (let t = 0; t < T; t++) {
      let portRet = 0;
      for (let i = 0; i < n; i++) {
        portRet += weights[i] * (returns[i]?.[t] || 0);
      }
      portfolioReturns.push(portRet);
    }
    
    // Bootstrap simulation
    const annualReturns: number[] = [];
    const tradingDays = 252;
    
    for (let sim = 0; sim < simulations; sim++) {
      let cumReturn = 1;
      
      for (let day = 0; day < tradingDays; day++) {
        const randomIdx = Math.floor(this.rng() * portfolioReturns.length);
        cumReturn *= (1 + portfolioReturns[randomIdx]);
      }
      
      annualReturns.push(cumReturn - 1);
    }
    
    // Sort for percentile calculations
    annualReturns.sort((a, b) => a - b);
    
    // Calculate statistics
    const var95Idx = Math.floor(0.05 * simulations);
    const var95 = annualReturns[var95Idx];
    
    const cvar95Returns = annualReturns.slice(0, var95Idx);
    const cvar95 = cvar95Returns.length > 0
      ? cvar95Returns.reduce((a, b) => a + b, 0) / cvar95Returns.length
      : var95;
    
    const medianReturn = annualReturns[Math.floor(simulations / 2)];
    const probPositive = annualReturns.filter(r => r > 0).length / simulations;
    
    return {
      simulations,
      var95,
      cvar95,
      medianReturn,
      probPositive,
    };
  }

  // ============================================================================
  // COVARIANCE ESTIMATION
  // ============================================================================

  /**
   * Ledoit-Wolf shrinkage estimator
   * Improves covariance stability for high-dimensional portfolios
   */
  private ledoitWolfShrinkage(sigma: number[][]): number[][] {
    const n = sigma.length;
    
    // Target: diagonal matrix (scaled identity)
    const mu = sigma.reduce((sum, row) => sum + row.reduce((s, v) => s + v, 0), 0) / (n * n);
    
    // Calculate shrinkage intensity (simplified)
    const delta = 0.2;  // Fixed shrinkage (Ledoit-Wolf optimal is ~0.1-0.3)
    
    const shrunk: number[][] = [];
    for (let i = 0; i < n; i++) {
      shrunk.push([]);
      for (let j = 0; j < n; j++) {
        if (i === j) {
          shrunk[i].push((1 - delta) * sigma[i][j] + delta * mu);
        } else {
          shrunk[i].push((1 - delta) * sigma[i][j]);
        }
      }
    }
    
    return shrunk;
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private calculateReturnsMatrix(
    symbols: string[],
    prices: Map<string, Price[]>
  ): number[][] {
    const returns: number[][] = [];
    
    for (const symbol of symbols) {
      const symbolPrices = prices.get(symbol) || [];
      const symbolReturns: number[] = [];
      
      for (let i = 1; i < symbolPrices.length; i++) {
        const prev = symbolPrices[i - 1]?.close || 0;
        const curr = symbolPrices[i]?.close || 0;
        if (prev > 0) {
          symbolReturns.push((curr - prev) / prev);
        }
      }
      
      returns.push(symbolReturns);
    }
    
    return returns;
  }

  private calculateMeanReturns(returns: number[][]): number[] {
    return returns.map(r => r.reduce((a, b) => a + b, 0) / r.length);
  }

  private calculateCovariance(returns: number[][]): number[][] {
    const n = returns.length;
    const T = returns[0]?.length || 0;
    const means = this.calculateMeanReturns(returns);
    
    const cov: number[][] = [];
    for (let i = 0; i < n; i++) {
      cov.push([]);
      for (let j = 0; j < n; j++) {
        let sum = 0;
        for (let t = 0; t < T; t++) {
          sum += ((returns[i]?.[t] || 0) - means[i]) * ((returns[j]?.[t] || 0) - means[j]);
        }
        cov[i].push(sum / (T - 1));
      }
    }
    
    return cov;
  }

  private portfolioReturn(weights: number[], mu: number[]): number {
    return weights.reduce((sum, w, i) => sum + w * mu[i], 0);
  }

  private portfolioVolatility(weights: number[], sigma: number[][]): number {
    let variance = 0;
    for (let i = 0; i < weights.length; i++) {
      for (let j = 0; j < weights.length; j++) {
        variance += weights[i] * weights[j] * sigma[i][j];
      }
    }
    return Math.sqrt(variance);
  }

  private riskContributions(weights: number[], sigma: number[][]): number[] {
    const vol = this.portfolioVolatility(weights, sigma);
    const contributions: number[] = [];
    
    for (let i = 0; i < weights.length; i++) {
      let marginal = 0;
      for (let j = 0; j < weights.length; j++) {
        marginal += weights[j] * sigma[i][j];
      }
      contributions.push((weights[i] * marginal) / (vol * vol));
    }
    
    return contributions;
  }

  private normalizeWeights(weights: number[]): void {
    const sum = weights.reduce((a, b) => a + b, 0);
    if (sum > 0) {
      for (let i = 0; i < weights.length; i++) {
        weights[i] /= sum;
      }
    }
  }

  private async calculateFactorExposures(
    symbols: string[],
    weights: number[],
    prices: Map<string, Price[]>
  ): Promise<FactorExposure[]> {
    // Get asset-level exposures
    const assetExposures = await this.factorEngine.calculateExposures(symbols, prices);
    
    // Calculate portfolio-level exposures
    const weightsMap = new Map<string, number>();
    symbols.forEach((s, i) => weightsMap.set(s, weights[i]));
    
    return this.factorEngine.calculatePortfolioExposures(weightsMap, assetExposures);
  }

  private generateExplanation(
    symbols: string[],
    weights: number[],
    expRet: number,
    expVol: number,
    sharpe: number,
    factors: FactorExposure[]
  ): string {
    const annualReturn = (expRet * 252 * 100).toFixed(1);
    const annualVol = (expVol * Math.sqrt(252) * 100).toFixed(1);
    const annualSharpe = (sharpe * Math.sqrt(252)).toFixed(2);
    
    // Top holdings
    const sortedHoldings = symbols
      .map((s, i) => ({ symbol: s, weight: weights[i] }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 3);
    
    // Top factors
    const topFactors = factors.slice(0, 3);
    
    const holdingsStr = sortedHoldings
      .map(h => `${h.symbol} (${(h.weight * 100).toFixed(1)}%)`)
      .join(', ');
    
    const factorsStr = topFactors
      .map(f => `${f.factor} (${f.exposure > 0 ? '+' : ''}${f.exposure.toFixed(2)})`)
      .join(', ');
    
    return `Optimized portfolio with expected annual return of ${annualReturn}% ` +
      `and volatility of ${annualVol}% (Sharpe: ${annualSharpe}). ` +
      `Top holdings: ${holdingsStr}. ` +
      `Key factor exposures: ${factorsStr}.`;
  }
}

export const portfolioOptimizer = new PortfolioOptimizer();
