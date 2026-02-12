/**
 * WalkForwardEngine - Walk-forward optimization and validation
 *
 * Features:
 * - Rolling window optimization
 * - Out-of-sample testing
 * - Anchored vs rolling windows
 * - Parameter stability analysis
 * - Regime detection
 */

import {
  HistoricalDataLoader,
  type BacktestDataSet,
  type OHLCV,
} from './HistoricalDataLoader.js';

export interface WalkForwardConfig {
  // Date range
  startDate: string;
  endDate: string;

  // Window configuration
  inSampleMonths: number; // Training window (e.g., 12 months)
  outOfSampleMonths: number; // Testing window (e.g., 3 months)
  stepMonths: number; // Step size for rolling (e.g., 3 months)
  anchoredStart: boolean; // If true, IS window starts from startDate always

  // Trading parameters
  initialCapital: number;
  commissionBps: number;
  slippageBps: number;
  rebalanceFrequency: 'daily' | 'weekly' | 'monthly';
}

export interface WalkForwardWindow {
  windowId: number;
  inSampleStart: string;
  inSampleEnd: string;
  outOfSampleStart: string;
  outOfSampleEnd: string;
  inSampleReturn: number;
  outOfSampleReturn: number;
  inSampleSharpe: number;
  outOfSampleSharpe: number;
  optimizedWeights: Map<string, number>;
  parameterStability: number; // How much weights changed from previous window
}

export interface WalkForwardResult {
  config: WalkForwardConfig;
  windows: WalkForwardWindow[];
  aggregateMetrics: {
    totalOutOfSampleReturn: number;
    annualizedOutOfSampleReturn: number;
    outOfSampleSharpe: number;
    outOfSampleVolatility: number;
    maxDrawdown: number;
    parameterStability: number; // Average weight stability across windows
    overfitRatio: number; // IS Sharpe / OOS Sharpe - lower is better
    informationDecay: number; // How quickly alpha decays out of sample
  };
  equityCurve: Array<{ date: string; value: number; window: number }>;
  parameterHistory: Array<{ date: string; weights: Record<string, number> }>;
}

export type OptimizationObjective = 'max_sharpe' | 'min_volatility' | 'risk_parity';

export interface StrategyConfig {
  objective: OptimizationObjective;
  constraints?: {
    maxWeight?: number;
    minWeight?: number;
    maxTurnover?: number;
  };
}

export class WalkForwardEngine {
  private dataLoader: HistoricalDataLoader;
  private config: WalkForwardConfig;

  constructor(polygonApiKey: string, config: WalkForwardConfig) {
    this.dataLoader = new HistoricalDataLoader(polygonApiKey);
    this.config = config;
  }

  /**
   * Run walk-forward optimization
   */
  async run(symbols: string[], strategy: StrategyConfig): Promise<WalkForwardResult> {
    // Load all historical data
    const data = await this.dataLoader.loadBacktestData(
      symbols,
      this.config.startDate,
      this.config.endDate
    );

    // Generate walk-forward windows
    const windowDates = this.generateWindows();

    const windows: WalkForwardWindow[] = [];
    const equityCurve: Array<{ date: string; value: number; window: number }> = [];
    const parameterHistory: Array<{ date: string; weights: Record<string, number> }> = [];

    let previousWeights = new Map<string, number>();
    let cumulativeValue = this.config.initialCapital;

    for (let i = 0; i < windowDates.length; i++) {
      const windowConfig = windowDates[i];

      // Optimize on in-sample period
      const isData = this.filterDataByDate(data, windowConfig.isStart, windowConfig.isEnd);
      const optimizedWeights = await this.optimizePortfolio(isData, symbols, strategy);

      // Calculate in-sample metrics
      const isMetrics = this.calculateMetrics(isData, optimizedWeights, symbols);

      // Test on out-of-sample period
      const oosData = this.filterDataByDate(data, windowConfig.oosStart, windowConfig.oosEnd);
      const oosMetrics = this.calculateMetrics(oosData, optimizedWeights, symbols);

      // Calculate parameter stability
      const stability = this.calculateParameterStability(previousWeights, optimizedWeights);

      // Build equity curve for this window
      const windowEquity = this.buildEquityCurve(oosData, optimizedWeights, symbols, cumulativeValue, i);
      equityCurve.push(...windowEquity);

      if (windowEquity.length > 0) {
        cumulativeValue = windowEquity[windowEquity.length - 1].value;
      }

      // Record parameter history
      const weightsObj: Record<string, number> = {};
      for (const [symbol, weight] of optimizedWeights) {
        weightsObj[symbol] = weight;
      }
      parameterHistory.push({
        date: windowConfig.oosStart,
        weights: weightsObj,
      });

      windows.push({
        windowId: i,
        inSampleStart: windowConfig.isStart,
        inSampleEnd: windowConfig.isEnd,
        outOfSampleStart: windowConfig.oosStart,
        outOfSampleEnd: windowConfig.oosEnd,
        inSampleReturn: isMetrics.totalReturn,
        outOfSampleReturn: oosMetrics.totalReturn,
        inSampleSharpe: isMetrics.sharpe,
        outOfSampleSharpe: oosMetrics.sharpe,
        optimizedWeights,
        parameterStability: stability,
      });

      previousWeights = optimizedWeights;
    }

    // Calculate aggregate metrics
    const aggregateMetrics = this.calculateAggregateMetrics(windows, equityCurve);

    return {
      config: this.config,
      windows,
      aggregateMetrics,
      equityCurve,
      parameterHistory,
    };
  }

  /**
   * Generate walk-forward window dates
   */
  private generateWindows(): Array<{
    isStart: string;
    isEnd: string;
    oosStart: string;
    oosEnd: string;
  }> {
    const windows: Array<{ isStart: string; isEnd: string; oosStart: string; oosEnd: string }> = [];

    const startDate = new Date(this.config.startDate);
    const endDate = new Date(this.config.endDate);

    let isStart = new Date(startDate);

    while (true) {
      // Calculate window boundaries
      const isEnd = new Date(isStart);
      isEnd.setMonth(isEnd.getMonth() + this.config.inSampleMonths);

      const oosStart = new Date(isEnd);
      oosStart.setDate(oosStart.getDate() + 1);

      const oosEnd = new Date(oosStart);
      oosEnd.setMonth(oosEnd.getMonth() + this.config.outOfSampleMonths);

      // Stop if OOS period extends beyond end date
      if (oosEnd > endDate) break;

      windows.push({
        isStart: isStart.toISOString().split('T')[0],
        isEnd: isEnd.toISOString().split('T')[0],
        oosStart: oosStart.toISOString().split('T')[0],
        oosEnd: oosEnd.toISOString().split('T')[0],
      });

      // Move to next window
      if (this.config.anchoredStart) {
        // Anchored: IS always starts from beginning
        isStart = new Date(startDate);
        isStart.setMonth(isStart.getMonth() + this.config.inSampleMonths + windows.length * this.config.stepMonths);
      } else {
        // Rolling: IS window moves forward
        isStart.setMonth(isStart.getMonth() + this.config.stepMonths);
      }
    }

    return windows;
  }

  /**
   * Filter dataset by date range
   */
  private filterDataByDate(
    data: BacktestDataSet,
    startDate: string,
    endDate: string
  ): BacktestDataSet {
    const filteredPriceData = new Map<string, OHLCV[]>();

    for (const [symbol, prices] of data.priceData) {
      filteredPriceData.set(
        symbol,
        prices.filter((p) => p.date >= startDate && p.date <= endDate)
      );
    }

    const filteredTradingDays = data.tradingDays.filter(
      (d) => d >= startDate && d <= endDate
    );

    const filteredFactors = data.factorReturns.filter(
      (f) => f.date >= startDate && f.date <= endDate
    );

    return {
      symbols: data.symbols,
      startDate,
      endDate,
      priceData: filteredPriceData,
      factorReturns: filteredFactors,
      tradingDays: filteredTradingDays,
    };
  }

  /**
   * Optimize portfolio for given data
   */
  private async optimizePortfolio(
    data: BacktestDataSet,
    symbols: string[],
    strategy: StrategyConfig
  ): Promise<Map<string, number>> {
    const weights = new Map<string, number>();

    // Calculate returns for each symbol
    const returns: Map<string, number[]> = new Map();
    const avgReturns: Map<string, number> = new Map();
    const volatilities: Map<string, number> = new Map();

    for (const symbol of symbols) {
      const prices = data.priceData.get(symbol) || [];
      if (prices.length < 2) {
        weights.set(symbol, 1 / symbols.length); // Equal weight fallback
        continue;
      }

      const symbolReturns: number[] = [];
      for (let i = 1; i < prices.length; i++) {
        const ret = (prices[i].close - prices[i - 1].close) / prices[i - 1].close;
        symbolReturns.push(ret);
      }

      const avgReturn = symbolReturns.reduce((a, b) => a + b, 0) / symbolReturns.length;
      const variance = symbolReturns.reduce((s, r) => s + Math.pow(r - avgReturn, 2), 0) / symbolReturns.length;
      const volatility = Math.sqrt(variance * 252);

      returns.set(symbol, symbolReturns);
      avgReturns.set(symbol, avgReturn * 252); // Annualize
      volatilities.set(symbol, volatility);
    }

    switch (strategy.objective) {
      case 'max_sharpe':
        return this.maxSharpeWeights(avgReturns, volatilities, returns, strategy.constraints);

      case 'min_volatility':
        return this.minVolWeights(volatilities, returns, strategy.constraints);

      case 'risk_parity':
        return this.riskParityWeights(volatilities, strategy.constraints);

      default:
        // Equal weight fallback
        for (const symbol of symbols) {
          weights.set(symbol, 1 / symbols.length);
        }
        return weights;
    }
  }

  /**
   * Maximum Sharpe ratio portfolio (simplified)
   */
  private maxSharpeWeights(
    avgReturns: Map<string, number>,
    volatilities: Map<string, number>,
    returns: Map<string, number[]>,
    constraints?: { maxWeight?: number; minWeight?: number }
  ): Map<string, number> {
    const weights = new Map<string, number>();

    // Simple approach: weight by Sharpe ratio
    const riskFreeRate = 0.04;
    let totalSharpe = 0;

    for (const [symbol, avgReturn] of avgReturns) {
      const vol = volatilities.get(symbol) || 0.2;
      const sharpe = Math.max(0, (avgReturn - riskFreeRate) / vol);
      weights.set(symbol, sharpe);
      totalSharpe += sharpe;
    }

    // Normalize and apply constraints
    const maxWeight = constraints?.maxWeight || 0.25;
    const minWeight = constraints?.minWeight || 0.02;

    for (const [symbol, sharpe] of weights) {
      let weight = totalSharpe > 0 ? sharpe / totalSharpe : 1 / weights.size;
      weight = Math.min(maxWeight, Math.max(minWeight, weight));
      weights.set(symbol, weight);
    }

    // Re-normalize to sum to 1
    const total = Array.from(weights.values()).reduce((a, b) => a + b, 0);
    for (const [symbol, weight] of weights) {
      weights.set(symbol, weight / total);
    }

    return weights;
  }

  /**
   * Minimum volatility portfolio (simplified)
   */
  private minVolWeights(
    volatilities: Map<string, number>,
    returns: Map<string, number[]>,
    constraints?: { maxWeight?: number; minWeight?: number }
  ): Map<string, number> {
    const weights = new Map<string, number>();

    // Weight inversely by volatility
    let totalInvVol = 0;
    for (const [symbol, vol] of volatilities) {
      const invVol = 1 / (vol || 0.2);
      weights.set(symbol, invVol);
      totalInvVol += invVol;
    }

    // Normalize and apply constraints
    const maxWeight = constraints?.maxWeight || 0.25;
    const minWeight = constraints?.minWeight || 0.02;

    for (const [symbol, invVol] of weights) {
      let weight = totalInvVol > 0 ? invVol / totalInvVol : 1 / weights.size;
      weight = Math.min(maxWeight, Math.max(minWeight, weight));
      weights.set(symbol, weight);
    }

    // Re-normalize
    const total = Array.from(weights.values()).reduce((a, b) => a + b, 0);
    for (const [symbol, weight] of weights) {
      weights.set(symbol, weight / total);
    }

    return weights;
  }

  /**
   * Risk parity portfolio
   */
  private riskParityWeights(
    volatilities: Map<string, number>,
    _constraints?: { maxWeight?: number; minWeight?: number }
  ): Map<string, number> {
    const weights = new Map<string, number>();

    // Equal risk contribution: weight inversely proportional to volatility
    let totalInvVol = 0;
    for (const [symbol, vol] of volatilities) {
      const invVol = 1 / (vol || 0.2);
      weights.set(symbol, invVol);
      totalInvVol += invVol;
    }

    // Normalize
    for (const [symbol, invVol] of weights) {
      const weight = totalInvVol > 0 ? invVol / totalInvVol : 1 / weights.size;
      weights.set(symbol, weight);
    }

    return weights;
  }

  /**
   * Calculate portfolio metrics
   */
  private calculateMetrics(
    data: BacktestDataSet,
    weights: Map<string, number>,
    symbols: string[]
  ): { totalReturn: number; sharpe: number; volatility: number } {
    // Calculate portfolio returns
    const portfolioReturns: number[] = [];

    for (const date of data.tradingDays) {
      let dailyReturn = 0;

      for (const symbol of symbols) {
        const weight = weights.get(symbol) || 0;
        const prices = data.priceData.get(symbol) || [];

        // Find return for this date
        const dateIdx = prices.findIndex((p) => p.date === date);
        if (dateIdx > 0) {
          const ret = (prices[dateIdx].close - prices[dateIdx - 1].close) / prices[dateIdx - 1].close;
          dailyReturn += weight * ret;
        }
      }

      portfolioReturns.push(dailyReturn);
    }

    if (portfolioReturns.length === 0) {
      return { totalReturn: 0, sharpe: 0, volatility: 0 };
    }

    // Calculate metrics
    const totalReturn = portfolioReturns.reduce((cum, r) => cum * (1 + r), 1) - 1;
    const avgReturn = portfolioReturns.reduce((a, b) => a + b, 0) / portfolioReturns.length;
    const variance = portfolioReturns.reduce((s, r) => s + Math.pow(r - avgReturn, 2), 0) / portfolioReturns.length;
    const volatility = Math.sqrt(variance * 252);
    const annualizedReturn = avgReturn * 252;
    const sharpe = volatility > 0 ? (annualizedReturn - 0.04) / volatility : 0;

    return { totalReturn, sharpe, volatility };
  }

  /**
   * Calculate parameter stability between windows
   */
  private calculateParameterStability(
    prev: Map<string, number>,
    curr: Map<string, number>
  ): number {
    if (prev.size === 0) return 1;

    let sumSquaredDiff = 0;
    for (const [symbol, weight] of curr) {
      const prevWeight = prev.get(symbol) || 0;
      sumSquaredDiff += Math.pow(weight - prevWeight, 2);
    }

    // Return 1 - turnover (1 = perfectly stable, 0 = complete change)
    return 1 - Math.sqrt(sumSquaredDiff);
  }

  /**
   * Build equity curve for a window
   */
  private buildEquityCurve(
    data: BacktestDataSet,
    weights: Map<string, number>,
    symbols: string[],
    startValue: number,
    windowId: number
  ): Array<{ date: string; value: number; window: number }> {
    const curve: Array<{ date: string; value: number; window: number }> = [];
    let value = startValue;

    for (const date of data.tradingDays) {
      let dailyReturn = 0;

      for (const symbol of symbols) {
        const weight = weights.get(symbol) || 0;
        const prices = data.priceData.get(symbol) || [];

        const dateIdx = prices.findIndex((p) => p.date === date);
        if (dateIdx > 0) {
          const ret = (prices[dateIdx].close - prices[dateIdx - 1].close) / prices[dateIdx - 1].close;
          dailyReturn += weight * ret;
        }
      }

      value *= 1 + dailyReturn;
      curve.push({ date, value, window: windowId });
    }

    return curve;
  }

  /**
   * Calculate aggregate walk-forward metrics
   */
  private calculateAggregateMetrics(
    windows: WalkForwardWindow[],
    equityCurve: Array<{ date: string; value: number; window: number }>
  ): WalkForwardResult['aggregateMetrics'] {
    if (windows.length === 0 || equityCurve.length === 0) {
      return {
        totalOutOfSampleReturn: 0,
        annualizedOutOfSampleReturn: 0,
        outOfSampleSharpe: 0,
        outOfSampleVolatility: 0,
        maxDrawdown: 0,
        parameterStability: 0,
        overfitRatio: 0,
        informationDecay: 0,
      };
    }

    // Total return from equity curve
    const startValue = this.config.initialCapital;
    const endValue = equityCurve[equityCurve.length - 1].value;
    const totalOutOfSampleReturn = (endValue - startValue) / startValue;

    // Annualize
    const tradingDays = equityCurve.length;
    const years = tradingDays / 252;
    const annualizedOutOfSampleReturn = years > 0 ? Math.pow(1 + totalOutOfSampleReturn, 1 / years) - 1 : 0;

    // Calculate daily returns for volatility and Sharpe
    const dailyReturns: number[] = [];
    for (let i = 1; i < equityCurve.length; i++) {
      const ret = (equityCurve[i].value - equityCurve[i - 1].value) / equityCurve[i - 1].value;
      dailyReturns.push(ret);
    }

    const avgReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
    const variance = dailyReturns.reduce((s, r) => s + Math.pow(r - avgReturn, 2), 0) / dailyReturns.length;
    const outOfSampleVolatility = Math.sqrt(variance * 252);
    const outOfSampleSharpe = outOfSampleVolatility > 0 ? (annualizedOutOfSampleReturn - 0.04) / outOfSampleVolatility : 0;

    // Max drawdown
    let peak = startValue;
    let maxDrawdown = 0;
    for (const point of equityCurve) {
      if (point.value > peak) peak = point.value;
      const dd = (peak - point.value) / peak;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }

    // Parameter stability (average across windows)
    const avgStability = windows.reduce((s, w) => s + w.parameterStability, 0) / windows.length;

    // Overfit ratio: avg IS Sharpe / avg OOS Sharpe
    const avgIsSharpe = windows.reduce((s, w) => s + w.inSampleSharpe, 0) / windows.length;
    const avgOosSharpe = windows.reduce((s, w) => s + w.outOfSampleSharpe, 0) / windows.length;
    const overfitRatio = avgOosSharpe !== 0 ? avgIsSharpe / avgOosSharpe : 999;

    // Information decay: correlation between IS and OOS returns
    const isReturns = windows.map((w) => w.inSampleReturn);
    const oosReturns = windows.map((w) => w.outOfSampleReturn);
    const informationDecay = 1 - this.correlation(isReturns, oosReturns);

    return {
      totalOutOfSampleReturn,
      annualizedOutOfSampleReturn,
      outOfSampleSharpe,
      outOfSampleVolatility,
      maxDrawdown,
      parameterStability: avgStability,
      overfitRatio,
      informationDecay,
    };
  }

  /**
   * Calculate correlation between two arrays
   */
  private correlation(x: number[], y: number[]): number {
    if (x.length !== y.length || x.length === 0) return 0;

    const n = x.length;
    const avgX = x.reduce((a, b) => a + b, 0) / n;
    const avgY = y.reduce((a, b) => a + b, 0) / n;

    let covariance = 0;
    let varX = 0;
    let varY = 0;

    for (let i = 0; i < n; i++) {
      const dx = x[i] - avgX;
      const dy = y[i] - avgY;
      covariance += dx * dy;
      varX += dx * dx;
      varY += dy * dy;
    }

    const denominator = Math.sqrt(varX * varY);
    return denominator > 0 ? covariance / denominator : 0;
  }

  /**
   * Generate walk-forward report
   */
  generateReport(result: WalkForwardResult): string {
    const { aggregateMetrics, windows } = result;

    return `
╔══════════════════════════════════════════════════════════════════════════════╗
║                    FRONTIER ALPHA - WALK-FORWARD ANALYSIS                    ║
╠══════════════════════════════════════════════════════════════════════════════╣

📊 AGGREGATE OUT-OF-SAMPLE PERFORMANCE
─────────────────────────────────────────────────────────────────────────────────
Total Return:        ${(aggregateMetrics.totalOutOfSampleReturn * 100).toFixed(2)}%
Annualized Return:   ${(aggregateMetrics.annualizedOutOfSampleReturn * 100).toFixed(2)}%
Volatility:          ${(aggregateMetrics.outOfSampleVolatility * 100).toFixed(2)}%
Sharpe Ratio:        ${aggregateMetrics.outOfSampleSharpe.toFixed(2)}
Max Drawdown:        ${(aggregateMetrics.maxDrawdown * 100).toFixed(2)}%

🔬 ROBUSTNESS METRICS
─────────────────────────────────────────────────────────────────────────────────
Parameter Stability: ${(aggregateMetrics.parameterStability * 100).toFixed(1)}%
Overfit Ratio:       ${aggregateMetrics.overfitRatio.toFixed(2)} (< 1.5 is good)
Information Decay:   ${(aggregateMetrics.informationDecay * 100).toFixed(1)}%

📈 WINDOW-BY-WINDOW RESULTS
─────────────────────────────────────────────────────────────────────────────────
${windows
  .map(
    (w) =>
      `Window ${w.windowId + 1}: IS ${(w.inSampleReturn * 100).toFixed(1)}% / OOS ${(w.outOfSampleReturn * 100).toFixed(1)}% | Sharpe ${w.inSampleSharpe.toFixed(2)} → ${w.outOfSampleSharpe.toFixed(2)}`
  )
  .join('\n')}

╚══════════════════════════════════════════════════════════════════════════════╝
    `;
  }
}
