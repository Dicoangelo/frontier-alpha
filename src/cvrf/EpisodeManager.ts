/**
 * FRONTIER ALPHA - CVRF Episode Manager
 *
 * Manages trading episodes for CVRF episodic comparison.
 * Tracks decision sequences, calculates performance metrics,
 * and enables episode-to-episode comparison.
 */

import type {
  Episode,
  TradingDecision,
  EpisodeComparison,
  CVRFConfig,
} from './types.js';
import type { FactorExposure, OptimizationResult } from '../types/index.js';
import { DEFAULT_CVRF_CONFIG } from './types.js';

// ============================================================================
// EPISODE MANAGER
// ============================================================================

export class EpisodeManager {
  private episodes: Map<string, Episode> = new Map();
  private currentEpisode: Episode | null = null;
  private config: CVRFConfig;
  private episodeCounter = 0;

  constructor(config: Partial<CVRFConfig> = {}) {
    this.config = { ...DEFAULT_CVRF_CONFIG, ...config };
  }

  // ============================================================================
  // EPISODE LIFECYCLE
  // ============================================================================

  /**
   * Start a new trading episode
   */
  startEpisode(startDate: Date = new Date()): Episode {
    // Close current episode if exists
    if (this.currentEpisode) {
      this.closeEpisode();
    }

    const episode: Episode = {
      id: `episode_${++this.episodeCounter}_${Date.now()}`,
      startDate,
      endDate: new Date(startDate.getTime() + this.config.episodeLengthDays * 24 * 60 * 60 * 1000),
      decisions: [],
      portfolioReturn: 0,
      sharpeRatio: 0,
      maxDrawdown: 0,
      factorExposures: [],
    };

    this.currentEpisode = episode;
    return episode;
  }

  /**
   * Record a trading decision in the current episode
   */
  recordDecision(decision: Omit<TradingDecision, 'id'>): TradingDecision {
    if (!this.currentEpisode) {
      this.startEpisode();
    }

    const fullDecision: TradingDecision = {
      ...decision,
      id: `decision_${this.currentEpisode!.decisions.length}_${Date.now()}`,
    };

    this.currentEpisode!.decisions.push(fullDecision);
    return fullDecision;
  }

  /**
   * Update episode performance metrics
   */
  updateEpisodeMetrics(metrics: {
    portfolioReturn: number;
    sharpeRatio: number;
    maxDrawdown: number;
    factorExposures: FactorExposure[];
    optimizationResult?: OptimizationResult;
  }): void {
    if (!this.currentEpisode) return;

    this.currentEpisode.portfolioReturn = metrics.portfolioReturn;
    this.currentEpisode.sharpeRatio = metrics.sharpeRatio;
    this.currentEpisode.maxDrawdown = metrics.maxDrawdown;
    this.currentEpisode.factorExposures = metrics.factorExposures;
    this.currentEpisode.optimizationResult = metrics.optimizationResult;
  }

  /**
   * Close the current episode and archive it
   */
  closeEpisode(endDate: Date = new Date()): Episode | null {
    if (!this.currentEpisode) return null;

    this.currentEpisode.endDate = endDate;
    this.episodes.set(this.currentEpisode.id, this.currentEpisode);

    const closedEpisode = this.currentEpisode;
    this.currentEpisode = null;

    return closedEpisode;
  }

  // ============================================================================
  // EPISODE COMPARISON (Core CVRF)
  // ============================================================================

  /**
   * Compare two consecutive episodes for CVRF
   * Returns the comparison with calculated decision overlap (τ)
   */
  compareEpisodes(episodeA: Episode, episodeB: Episode): EpisodeComparison {
    // Determine which episode performed better
    const aIsBetter = episodeA.sharpeRatio > episodeB.sharpeRatio ||
      (episodeA.sharpeRatio === episodeB.sharpeRatio && episodeA.portfolioReturn > episodeB.portfolioReturn);

    const betterEpisode = aIsBetter ? episodeA : episodeB;
    const worseEpisode = aIsBetter ? episodeB : episodeA;

    // Calculate performance delta
    const performanceDelta = betterEpisode.sharpeRatio - worseEpisode.sharpeRatio;

    // Calculate decision sequence overlap (τ - the learning rate)
    const decisionOverlap = this.calculateDecisionOverlap(
      betterEpisode.decisions,
      worseEpisode.decisions
    );

    // Identify profitable and losing trades
    const { profitableTrades, losingTrades } = this.categorizeTrades(
      betterEpisode.decisions,
      worseEpisode.decisions
    );

    return {
      betterEpisode,
      worseEpisode,
      performanceDelta,
      decisionOverlap,
      profitableTrades,
      losingTrades,
    };
  }

  /**
   * Get the most recent N episodes for comparison
   */
  getRecentEpisodes(count: number = 2): Episode[] {
    const allEpisodes = Array.from(this.episodes.values())
      .sort((a, b) => b.startDate.getTime() - a.startDate.getTime());

    return allEpisodes.slice(0, count);
  }

  /**
   * Get comparison between the two most recent episodes
   */
  getLatestComparison(): EpisodeComparison | null {
    const recent = this.getRecentEpisodes(2);
    if (recent.length < 2) return null;

    return this.compareEpisodes(recent[0], recent[1]);
  }

  // ============================================================================
  // DECISION OVERLAP CALCULATION (Learning Rate τ)
  // ============================================================================

  /**
   * Calculate the overlap between two decision sequences
   * This is τ in the CVRF paper - used as the learning rate
   *
   * Higher overlap = lower learning rate (beliefs already aligned)
   * Lower overlap = higher learning rate (need to adapt more)
   */
  private calculateDecisionOverlap(
    decisionsA: TradingDecision[],
    decisionsB: TradingDecision[]
  ): number {
    if (decisionsA.length === 0 || decisionsB.length === 0) {
      return 0.5; // Default to middle ground
    }

    // Build decision signature maps
    const signaturesA = this.buildDecisionSignatures(decisionsA);
    const signaturesB = this.buildDecisionSignatures(decisionsB);

    // Count matching decisions
    let matches = 0;
    let total = 0;

    for (const [symbol, sigA] of signaturesA) {
      const sigB = signaturesB.get(symbol);
      if (sigB) {
        // Compare actions and weight changes
        if (sigA.action === sigB.action) {
          matches += 0.5;
        }
        // Compare weight directions
        const weightDirA = Math.sign(sigA.weightChange);
        const weightDirB = Math.sign(sigB.weightChange);
        if (weightDirA === weightDirB) {
          matches += 0.5;
        }
      }
      total++;
    }

    // Include symbols only in B
    for (const [symbol] of signaturesB) {
      if (!signaturesA.has(symbol)) {
        total++;
      }
    }

    return total > 0 ? matches / total : 0.5;
  }

  /**
   * Build decision signatures for overlap calculation
   */
  private buildDecisionSignatures(
    decisions: TradingDecision[]
  ): Map<string, { action: string; weightChange: number }> {
    const signatures = new Map<string, { action: string; weightChange: number }>();

    for (const d of decisions) {
      // Aggregate decisions per symbol
      const existing = signatures.get(d.symbol);
      if (existing) {
        // Use the most recent action
        existing.action = d.action;
        existing.weightChange += (d.weightAfter - d.weightBefore);
      } else {
        signatures.set(d.symbol, {
          action: d.action,
          weightChange: d.weightAfter - d.weightBefore,
        });
      }
    }

    return signatures;
  }

  // ============================================================================
  // TRADE CATEGORIZATION
  // ============================================================================

  /**
   * Categorize trades into profitable and losing
   * Based on whether they appeared in the better or worse episode
   */
  private categorizeTrades(
    betterDecisions: TradingDecision[],
    worseDecisions: TradingDecision[]
  ): { profitableTrades: TradingDecision[]; losingTrades: TradingDecision[] } {
    // Trades unique to better episode are "profitable patterns"
    const betterSymbols = new Set(betterDecisions.map(d => d.symbol));
    const worseSymbols = new Set(worseDecisions.map(d => d.symbol));

    // Profitable: Decisions in better episode that contributed to outperformance
    const profitableTrades = betterDecisions.filter(d => {
      // Higher confidence decisions in better episode
      return d.confidence > 0.6 && (d.action === 'buy' || d.action === 'sell');
    });

    // Losing: Decisions in worse episode that hurt performance
    const losingTrades = worseDecisions.filter(d => {
      // Decisions that went against the eventual trend
      const betterDecision = betterDecisions.find(bd => bd.symbol === d.symbol);
      if (betterDecision) {
        // Opposite actions suggest this was a losing trade
        return (d.action === 'buy' && betterDecision.action === 'sell') ||
               (d.action === 'sell' && betterDecision.action === 'buy');
      }
      return false;
    });

    return { profitableTrades, losingTrades };
  }

  // ============================================================================
  // EPISODE ANALYTICS
  // ============================================================================

  /**
   * Get episode performance summary
   */
  getEpisodeSummary(episodeId: string): string | null {
    const episode = this.episodes.get(episodeId);
    if (!episode) return null;

    return `Episode ${episode.id}:
    Period: ${episode.startDate.toISOString().split('T')[0]} to ${episode.endDate.toISOString().split('T')[0]}
    Return: ${(episode.portfolioReturn * 100).toFixed(2)}%
    Sharpe: ${episode.sharpeRatio.toFixed(2)}
    Max Drawdown: ${(episode.maxDrawdown * 100).toFixed(2)}%
    Decisions: ${episode.decisions.length}
    Top Factors: ${episode.factorExposures.slice(0, 3).map(f => `${f.factor}(${f.exposure.toFixed(2)})`).join(', ')}`;
  }

  /**
   * Get all episodes
   */
  getAllEpisodes(): Episode[] {
    return Array.from(this.episodes.values());
  }

  /**
   * Get current episode
   */
  getCurrentEpisode(): Episode | null {
    return this.currentEpisode;
  }

  /**
   * Check if we have enough episodes for CVRF comparison
   */
  hasEnoughEpisodesForCVRF(): boolean {
    return this.episodes.size >= this.config.minEpisodesForComparison;
  }

  /**
   * Export episode history for persistence
   */
  exportEpisodeHistory(): {
    episodes: Episode[];
    currentEpisode: Episode | null;
  } {
    return {
      episodes: Array.from(this.episodes.values()),
      currentEpisode: this.currentEpisode,
    };
  }

  /**
   * Import episode history from persistence
   */
  importEpisodeHistory(history: {
    episodes: Episode[];
    currentEpisode: Episode | null;
  }): void {
    this.episodes.clear();
    for (const episode of history.episodes) {
      this.episodes.set(episode.id, episode);
    }
    this.currentEpisode = history.currentEpisode;
    this.episodeCounter = this.episodes.size;
  }
}

export const episodeManager = new EpisodeManager();
