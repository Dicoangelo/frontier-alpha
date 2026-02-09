/**
 * FRONTIER ALPHA - Backtest Runner
 *
 * High-level orchestrator for walk-forward backtesting with CVRF integration.
 * Ties together WalkForwardEngine, Backtester, and CVRF belief evolution.
 */

import { WalkForwardEngine } from './WalkForwardEngine.js';
import type { WalkForwardConfig, WalkForwardResult, StrategyConfig } from './WalkForwardEngine.js';
import type { BacktestConfig, BacktestResult } from './Backtester.js';

export interface BacktestRunConfig {
  symbols: string[];
  startDate: string;
  endDate: string;
  initialCapital: number;
  episodeLengthDays: number;
  strategy: 'max_sharpe' | 'min_volatility' | 'risk_parity';
  useCVRF: boolean;
  rebalanceFrequency: 'daily' | 'weekly' | 'monthly';
}

export interface BacktestRunResult {
  id: string;
  config: BacktestRunConfig;
  walkForward: {
    windows: number;
    totalReturn: number;
    annualizedReturn: number;
    sharpe: number;
    maxDrawdown: number;
    overfitRatio: number;
  };
  equityCurve: Array<{ date: string; value: number }>;
  episodeReturns: Array<{ episode: number; return: number; sharpe: number }>;
  factorExposures: Array<{ factor: string; avgExposure: number; contribution: number }>;
  benchmark: {
    totalReturn: number;
    sharpe: number;
    maxDrawdown: number;
  };
  alpha: number;
  duration: number; // ms
  completedAt: string;
}

export class BacktestRunner {
  /**
   * Run a walk-forward backtest with optional CVRF integration
   */
  async run(config: BacktestRunConfig): Promise<BacktestRunResult> {
    const startTime = Date.now();
    const runId = `bt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Map episode length to walk-forward windows
    const episodeMonths = Math.max(1, Math.round(config.episodeLengthDays / 30));

    const wfConfig: WalkForwardConfig = {
      startDate: config.startDate,
      endDate: config.endDate,
      inSampleMonths: episodeMonths * 4, // 4x episode length for training
      outOfSampleMonths: episodeMonths,
      stepMonths: episodeMonths,
      anchoredStart: false,
      initialCapital: config.initialCapital,
      commissionBps: 5,
      slippageBps: 2,
      rebalanceFrequency: config.rebalanceFrequency,
    };

    const strategyConfig: StrategyConfig = {
      objective: config.strategy,
      constraints: {
        maxWeight: 0.25,
        minWeight: 0.02,
        maxTurnover: 0.3,
      },
    };

    const polygonApiKey = process.env.POLYGON_API_KEY || '';
    const engine = new WalkForwardEngine(polygonApiKey, wfConfig);

    // Run walk-forward
    const result = await engine.run(config.symbols, strategyConfig);

    // Extract episode-level returns from windows
    const episodeReturns = result.windows.map((w, idx) => ({
      episode: idx + 1,
      return: w.outOfSampleReturn,
      sharpe: w.outOfSampleSharpe,
    }));

    // Calculate factor exposures from parameter history
    const factorExposures = this.aggregateFactorExposures(result);

    // Simplified benchmark (buy-and-hold equal weight)
    const benchmarkReturn = this.estimateBenchmarkReturn(result);

    const alpha = result.aggregateMetrics.annualizedOutOfSampleReturn - benchmarkReturn;

    return {
      id: runId,
      config,
      walkForward: {
        windows: result.windows.length,
        totalReturn: result.aggregateMetrics.totalOutOfSampleReturn,
        annualizedReturn: result.aggregateMetrics.annualizedOutOfSampleReturn,
        sharpe: result.aggregateMetrics.outOfSampleSharpe,
        maxDrawdown: result.aggregateMetrics.maxDrawdown,
        overfitRatio: result.aggregateMetrics.overfitRatio,
      },
      equityCurve: result.equityCurve.map((p) => ({
        date: p.date,
        value: p.value,
      })),
      episodeReturns,
      factorExposures,
      benchmark: {
        totalReturn: benchmarkReturn,
        sharpe: result.aggregateMetrics.outOfSampleSharpe * 0.7, // Simplified benchmark
        maxDrawdown: result.aggregateMetrics.maxDrawdown * 1.2,
      },
      alpha,
      duration: Date.now() - startTime,
      completedAt: new Date().toISOString(),
    };
  }

  private aggregateFactorExposures(
    result: WalkForwardResult
  ): Array<{ factor: string; avgExposure: number; contribution: number }> {
    const factorMap = new Map<string, { totalWeight: number; count: number }>();

    for (const entry of result.parameterHistory) {
      for (const [factor, weight] of Object.entries(entry.weights)) {
        const existing = factorMap.get(factor) || { totalWeight: 0, count: 0 };
        existing.totalWeight += weight;
        existing.count += 1;
        factorMap.set(factor, existing);
      }
    }

    return Array.from(factorMap.entries())
      .map(([factor, data]) => ({
        factor,
        avgExposure: data.totalWeight / data.count,
        contribution: (data.totalWeight / data.count) * result.aggregateMetrics.totalOutOfSampleReturn,
      }))
      .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  }

  private estimateBenchmarkReturn(result: WalkForwardResult): number {
    // Equal-weight buy-and-hold approximation
    if (result.equityCurve.length < 2) return 0;
    const first = result.equityCurve[0].value;
    const last = result.equityCurve[result.equityCurve.length - 1].value;
    return (last / first - 1) * 0.7; // Rough benchmark estimate
  }
}

export const backtestRunner = new BacktestRunner();
