import { supabaseAdmin } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';

// ============================================================================
// Types
// ============================================================================

export type LeaderboardMetric = 'sharpe' | 'total_return' | 'risk_adjusted_return' | 'consistency';
export type LeaderboardPeriod = '1w' | '1m' | '3m' | 'ytd' | 'all';

export interface LeaderboardEntry {
  user_id: string;
  display_name: string | null;
  rank: number;
  percentile: number;
  metric_value: number;
  sharpe_ratio: number;
  total_return: number;
  risk_adjusted_return: number;
  max_drawdown: number;
  consistency_score: number;
}

export interface LeaderboardResult {
  entries: LeaderboardEntry[];
  metric: LeaderboardMetric;
  period: LeaderboardPeriod;
  total_participants: number;
  updated_at: string;
}

export interface PerformanceSnapshot {
  user_id: string;
  returns: number[];
  total_return: number;
}

export interface LeaderboardServiceConfig {
  riskFreeRate: number;
  annualizationFactor: number;
  maxEntries: number;
}

const DEFAULT_CONFIG: LeaderboardServiceConfig = {
  riskFreeRate: 0.05,
  annualizationFactor: 252,
  maxEntries: 100,
};

// ============================================================================
// Leaderboard Service
// ============================================================================

export class LeaderboardService {
  private config: LeaderboardServiceConfig;

  constructor(config: Partial<LeaderboardServiceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get the leaderboard ranked by the given metric and period.
   * Only includes users who opted into the public leaderboard (is_public = true).
   */
  async getLeaderboard(
    metric: LeaderboardMetric = 'sharpe',
    period: LeaderboardPeriod = '1m',
  ): Promise<LeaderboardResult> {
    const snapshots = await this.fetchPerformanceSnapshots(period);

    if (snapshots.length === 0) {
      return {
        entries: [],
        metric,
        period,
        total_participants: 0,
        updated_at: new Date().toISOString(),
      };
    }

    const entries = this.rankSnapshots(snapshots, metric);

    return {
      entries: entries.slice(0, this.config.maxEntries),
      metric,
      period,
      total_participants: entries.length,
      updated_at: new Date().toISOString(),
    };
  }

  /**
   * Get a specific user's rank and percentile for a given metric/period.
   */
  async getUserRank(
    userId: string,
    metric: LeaderboardMetric = 'sharpe',
    period: LeaderboardPeriod = '1m',
  ): Promise<LeaderboardEntry | null> {
    const result = await this.getLeaderboard(metric, period);
    return result.entries.find(e => e.user_id === userId) ?? null;
  }

  /**
   * Fetch performance snapshots for all public-leaderboard users.
   * Uses frontier_profiles (is_public) + frontier_shared_portfolios (portfolio_data).
   */
  async fetchPerformanceSnapshots(period: LeaderboardPeriod): Promise<PerformanceSnapshot[]> {
    // Get all public profiles
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('frontier_profiles')
      .select('user_id, display_name')
      .eq('is_public', true);

    if (profilesError || !profiles || profiles.length === 0) {
      if (profilesError) {
        logger.error({ err: profilesError }, 'Error fetching public profiles for leaderboard');
      }
      return [];
    }

    const userIds = profiles.map((p: { user_id: string }) => p.user_id);

    // Get shared portfolios with performance data for these users
    const { data: portfolios, error: portfoliosError } = await supabaseAdmin
      .from('frontier_shared_portfolios')
      .select('user_id, portfolio_data')
      .in('user_id', userIds)
      .eq('visibility', 'public');

    if (portfoliosError || !portfolios) {
      if (portfoliosError) {
        logger.error({ err: portfoliosError }, 'Error fetching portfolios for leaderboard');
      }
      return [];
    }

    const periodDays = this.getPeriodDays(period);

    const snapshots: PerformanceSnapshot[] = [];
    for (const portfolio of portfolios as Array<{ user_id: string; portfolio_data: Record<string, unknown> }>) {
      const data = portfolio.portfolio_data;
      const returns = this.extractReturns(data, periodDays);
      if (returns.length === 0) continue;

      const totalReturn = returns.reduce((acc, r) => acc * (1 + r), 1) - 1;

      snapshots.push({
        user_id: portfolio.user_id,
        returns,
        total_return: totalReturn,
      });
    }

    return snapshots;
  }

  /**
   * Rank performance snapshots by the given metric.
   * Returns entries with rank and percentile.
   */
  rankSnapshots(snapshots: PerformanceSnapshot[], metric: LeaderboardMetric): LeaderboardEntry[] {
    // Compute all metrics for each snapshot
    const scored = snapshots.map(snap => {
      const sharpe = this.computeSharpeRatio(snap.returns);
      const maxDrawdown = this.computeMaxDrawdown(snap.returns);
      const riskAdjusted = this.computeRiskAdjustedReturn(snap.total_return, maxDrawdown);
      const consistency = this.computeConsistencyScore(maxDrawdown, snap.returns);

      return {
        user_id: snap.user_id,
        sharpe_ratio: sharpe,
        total_return: snap.total_return,
        risk_adjusted_return: riskAdjusted,
        max_drawdown: maxDrawdown,
        consistency_score: consistency,
      };
    });

    // Sort by selected metric (descending = best first)
    scored.sort((a, b) => {
      const aVal = this.getMetricValue(a, metric);
      const bVal = this.getMetricValue(b, metric);
      return bVal - aVal;
    });

    const total = scored.length;

    return scored.map((entry, index) => ({
      ...entry,
      display_name: null, // Populated separately if needed
      rank: index + 1,
      percentile: this.computePercentile(index + 1, total),
      metric_value: this.getMetricValue(entry, metric),
    }));
  }

  /**
   * Compute the Sharpe ratio for a series of returns.
   * Sharpe = (annualized mean excess return) / (annualized std dev)
   */
  computeSharpeRatio(returns: number[]): number {
    if (returns.length < 2) return 0;

    const dailyRf = this.config.riskFreeRate / this.config.annualizationFactor;
    const excessReturns = returns.map(r => r - dailyRf);

    const mean = excessReturns.reduce((a, b) => a + b, 0) / excessReturns.length;
    const variance = excessReturns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (excessReturns.length - 1);
    const std = Math.sqrt(variance);

    if (std === 0) return 0;

    const annualizedMean = mean * this.config.annualizationFactor;
    const annualizedStd = std * Math.sqrt(this.config.annualizationFactor);

    return annualizedMean / annualizedStd;
  }

  /**
   * Compute maximum drawdown from a return series.
   * Returns a positive number (e.g. 0.15 means 15% drawdown).
   */
  computeMaxDrawdown(returns: number[]): number {
    if (returns.length === 0) return 0;

    let peak = 1;
    let maxDD = 0;
    let equity = 1;

    for (const r of returns) {
      equity *= (1 + r);
      if (equity > peak) peak = equity;
      const dd = (peak - equity) / peak;
      if (dd > maxDD) maxDD = dd;
    }

    return maxDD;
  }

  /**
   * Risk-adjusted return = total return / (1 + max drawdown).
   * Penalizes high-drawdown strategies.
   */
  computeRiskAdjustedReturn(totalReturn: number, maxDrawdown: number): number {
    return totalReturn / (1 + maxDrawdown);
  }

  /**
   * Consistency score: lower drawdown and lower volatility = more consistent.
   * Score = 1 / (1 + maxDrawdown + volatility)
   * Range: (0, 1] — higher is better.
   */
  computeConsistencyScore(maxDrawdown: number, returns: number[]): number {
    const volatility = this.computeVolatility(returns);
    return 1 / (1 + maxDrawdown + volatility);
  }

  /**
   * Compute annualized volatility from daily returns.
   */
  computeVolatility(returns: number[]): number {
    if (returns.length < 2) return 0;

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1);

    return Math.sqrt(variance * this.config.annualizationFactor);
  }

  /**
   * Compute percentile rank.
   * percentile = ((total - rank) / total) * 100
   * Rank 1 = highest percentile, rank N = lowest.
   */
  computePercentile(rank: number, total: number): number {
    if (total <= 1) return 100;
    return Math.round(((total - rank) / (total - 1)) * 100);
  }

  /**
   * Get the number of trading days for a period.
   */
  getPeriodDays(period: LeaderboardPeriod): number {
    switch (period) {
      case '1w': return 5;
      case '1m': return 21;
      case '3m': return 63;
      case 'ytd': return this.getYTDDays();
      case 'all': return 0; // 0 means use all available
    }
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  private getYTDDays(): number {
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const diffMs = now.getTime() - startOfYear.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    // Approximate trading days: ~252/365 ratio
    return Math.round(diffDays * (252 / 365));
  }

  private extractReturns(portfolioData: Record<string, unknown>, periodDays: number): number[] {
    const returns = portfolioData.daily_returns as number[] | undefined;
    if (!returns || !Array.isArray(returns) || returns.length === 0) return [];

    if (periodDays === 0 || periodDays >= returns.length) return returns;
    return returns.slice(-periodDays);
  }

  private getMetricValue(
    entry: {
      sharpe_ratio: number;
      total_return: number;
      risk_adjusted_return: number;
      consistency_score: number;
    },
    metric: LeaderboardMetric,
  ): number {
    switch (metric) {
      case 'sharpe': return entry.sharpe_ratio;
      case 'total_return': return entry.total_return;
      case 'risk_adjusted_return': return entry.risk_adjusted_return;
      case 'consistency': return entry.consistency_score;
    }
  }
}

export const leaderboardService = new LeaderboardService();
