/**
 * FRONTIER ALPHA - CVRF Persistence Layer
 *
 * Handles Supabase storage for CVRF state to enable persistence
 * across serverless function invocations.
 */

import { supabaseAdmin } from '../lib/supabase.js';
import type {
  Episode,
  TradingDecision,
  BeliefState,
  CVRFCycleResult,
} from './types.js';

// ============================================================================
// DATABASE TYPES
// ============================================================================

interface DBEpisode {
  id: string;
  user_id: string | null;
  episode_number: number;
  start_date: string;
  end_date: string | null;
  portfolio_return: number | null;
  sharpe_ratio: number | null;
  max_drawdown: number | null;
  volatility: number | null;
  status: 'active' | 'completed' | 'archived';
  metadata: Record<string, unknown>;
  created_at: string;
}

interface DBDecision {
  id: string;
  episode_id: string;
  user_id: string | null;
  timestamp: string;
  symbol: string;
  action: 'buy' | 'sell' | 'hold' | 'rebalance';
  weight_before: number;
  weight_after: number;
  reason: string | null;
  confidence: number | null;
  factors: unknown[];
  outcome_return: number | null;
  outcome_attribution: Record<string, unknown> | null;
  created_at: string;
}

interface DBBelief {
  id: string;
  user_id: string | null;
  version: number;
  factor_weights: Record<string, number>;
  factor_confidences: Record<string, number>;
  risk_tolerance: number;
  max_drawdown_threshold: number;
  volatility_target: number;
  momentum_horizon: number;
  mean_reversion_threshold: number;
  concentration_limit: number;
  min_position_size: number;
  rebalance_threshold: number;
  current_regime: string;
  regime_confidence: number;
  conceptual_priors: unknown[];
  updated_at: string;
  created_at: string;
}

// ============================================================================
// EPISODE PERSISTENCE
// ============================================================================

export async function getActiveEpisode(userId: string | null = null): Promise<Episode | null> {
  const query = supabaseAdmin
    .from('cvrf_episodes')
    .select('*')
    .eq('status', 'active')
    .order('start_date', { ascending: false })
    .limit(1);

  if (userId) {
    query.eq('user_id', userId);
  } else {
    query.is('user_id', null);
  }

  const { data, error } = await query.single();

  if (error || !data) {
    return null;
  }

  // Load decisions for this episode
  const { data: decisions } = await supabaseAdmin
    .from('cvrf_decisions')
    .select('*')
    .eq('episode_id', data.id)
    .order('timestamp', { ascending: true });

  return dbToEpisode(data, decisions || []);
}

export async function getRecentEpisodes(
  userId: string | null = null,
  limit: number = 10,
  offset: number = 0,
  expandDecisions: boolean = true
): Promise<Episode[]> {
  const query = supabaseAdmin
    .from('cvrf_episodes')
    .select('*')
    .eq('status', 'completed')
    .order('end_date', { ascending: false })
    .range(offset, offset + limit - 1);

  if (userId) {
    query.eq('user_id', userId);
  } else {
    query.is('user_id', null);
  }

  const { data, error } = await query;

  if (error || !data) {
    return [];
  }

  if (!expandDecisions) {
    // Return episodes without loading decisions (count only)
    return data.map(ep => dbToEpisode(ep, []));
  }

  // Load decisions for each episode
  const episodes: Episode[] = [];
  for (const ep of data) {
    const { data: decisions } = await supabaseAdmin
      .from('cvrf_decisions')
      .select('*')
      .eq('episode_id', ep.id)
      .order('timestamp', { ascending: true });

    episodes.push(dbToEpisode(ep, decisions || []));
  }

  return episodes;
}

export async function getCompletedEpisodesCount(
  userId: string | null = null
): Promise<number> {
  const query = supabaseAdmin
    .from('cvrf_episodes')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'completed');

  if (userId) {
    query.eq('user_id', userId);
  } else {
    query.is('user_id', null);
  }

  const { count, error } = await query;

  if (error || count === null) {
    return 0;
  }

  return count;
}

export async function createEpisode(
  episodeNumber: number,
  userId: string | null = null
): Promise<Episode> {
  const id = `episode_${episodeNumber}_${Date.now()}`;
  const now = new Date();

  const { data, error } = await supabaseAdmin
    .from('cvrf_episodes')
    .insert({
      id,
      user_id: userId,
      episode_number: episodeNumber,
      start_date: now.toISOString(),
      status: 'active',
      metadata: {},
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create episode: ${error.message}`);
  }

  return dbToEpisode(data, []);
}

export async function updateEpisode(episode: Episode): Promise<void> {
  const { error } = await supabaseAdmin
    .from('cvrf_episodes')
    .update({
      end_date: episode.endDate?.toISOString() || null,
      portfolio_return: episode.portfolioReturn,
      sharpe_ratio: episode.sharpeRatio,
      max_drawdown: episode.maxDrawdown,
      volatility: episode.volatility,
      status: episode.endDate ? 'completed' : 'active',
    })
    .eq('id', episode.id);

  if (error) {
    throw new Error(`Failed to update episode: ${error.message}`);
  }
}

// ============================================================================
// DECISION PERSISTENCE
// ============================================================================

export async function saveDecision(
  decision: TradingDecision,
  episodeId: string,
  userId: string | null = null
): Promise<TradingDecision> {
  const id = `decision_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const { data, error } = await supabaseAdmin
    .from('cvrf_decisions')
    .insert({
      id,
      episode_id: episodeId,
      user_id: userId,
      timestamp: decision.timestamp.toISOString(),
      symbol: decision.symbol,
      action: decision.action,
      weight_before: decision.weightBefore,
      weight_after: decision.weightAfter,
      reason: decision.reason,
      confidence: decision.confidence,
      factors: decision.factors,
      outcome_return: decision.outcomeReturn || null,
      outcome_attribution: decision.outcomeAttribution || null,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to save decision: ${error.message}`);
  }

  return {
    ...decision,
    id,
  };
}

// ============================================================================
// BELIEF PERSISTENCE
// ============================================================================

export async function getBeliefs(userId: string | null = null): Promise<BeliefState | null> {
  const query = supabaseAdmin
    .from('cvrf_beliefs')
    .select('*')
    .limit(1);

  if (userId) {
    query.eq('user_id', userId);
  } else {
    query.is('user_id', null);
  }

  const { data, error } = await query.single();

  if (error || !data) {
    return null;
  }

  return dbToBelief(data);
}

export async function saveBeliefs(
  beliefs: BeliefState,
  userId: string | null = null
): Promise<void> {
  const beliefId = userId ? `beliefs_${userId}` : 'beliefs_global';

  const { error } = await supabaseAdmin
    .from('cvrf_beliefs')
    .upsert({
      id: beliefId,
      user_id: userId,
      version: beliefs.version,
      factor_weights: Object.fromEntries(beliefs.factorWeights),
      factor_confidences: Object.fromEntries(beliefs.factorConfidences),
      risk_tolerance: beliefs.riskTolerance,
      max_drawdown_threshold: beliefs.maxDrawdownThreshold,
      volatility_target: beliefs.volatilityTarget,
      momentum_horizon: beliefs.momentumHorizon,
      mean_reversion_threshold: beliefs.meanReversionThreshold,
      concentration_limit: beliefs.concentrationLimit,
      min_position_size: beliefs.minPositionSize,
      rebalance_threshold: beliefs.rebalanceThreshold,
      current_regime: beliefs.currentRegime,
      regime_confidence: beliefs.regimeConfidence,
      conceptual_priors: beliefs.conceptualPriors,
      updated_at: beliefs.updatedAt.toISOString(),
    });

  if (error) {
    throw new Error(`Failed to save beliefs: ${error.message}`);
  }
}

// ============================================================================
// CYCLE HISTORY PERSISTENCE
// ============================================================================

export async function saveCycleResult(
  result: CVRFCycleResult,
  cycleNumber: number,
  userId: string | null = null
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('cvrf_cycle_history')
    .insert({
      user_id: userId,
      cycle_number: cycleNumber,
      timestamp: result.timestamp.toISOString(),
      previous_episode_id: result.episodeComparison.worseEpisode.id,
      current_episode_id: result.episodeComparison.betterEpisode.id,
      previous_episode_return: result.episodeComparison.worseEpisode.portfolioReturn ?? 0,
      current_episode_return: result.episodeComparison.betterEpisode.portfolioReturn ?? 0,
      performance_delta: result.episodeComparison.performanceDelta,
      decision_overlap: result.episodeComparison.decisionOverlap,
      extracted_insights: result.extractedInsights,
      meta_prompt: result.metaPrompt,
      belief_updates: result.beliefUpdates,
      new_belief_state: {
        ...result.newBeliefState,
        factorWeights: Object.fromEntries(result.newBeliefState.factorWeights),
        factorConfidences: Object.fromEntries(result.newBeliefState.factorConfidences),
      },
      explanation: result.explanation,
    });

  if (error) {
    throw new Error(`Failed to save cycle result: ${error.message}`);
  }
}

export async function getCycleHistory(
  userId: string | null = null,
  limit: number = 20
): Promise<CVRFCycleResult[]> {
  const query = supabaseAdmin
    .from('cvrf_cycle_history')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(limit);

  if (userId) {
    query.eq('user_id', userId);
  } else {
    query.is('user_id', null);
  }

  const { data, error } = await query;

  if (error || !data) {
    return [];
  }

  return data.map(dbToCycleResult);
}

// ============================================================================
// CONVERTERS
// ============================================================================

function dbToEpisode(db: DBEpisode, decisions: DBDecision[]): Episode {
  return {
    id: db.id,
    episodeNumber: db.episode_number,
    startDate: new Date(db.start_date),
    endDate: db.end_date ? new Date(db.end_date) : undefined,
    decisions: decisions.map(dbToDecision),
    portfolioReturn: db.portfolio_return || undefined,
    sharpeRatio: db.sharpe_ratio || undefined,
    maxDrawdown: db.max_drawdown || undefined,
    volatility: db.volatility || undefined,
    factorExposures: [],
  };
}

function dbToDecision(db: DBDecision): TradingDecision {
  return {
    id: db.id,
    timestamp: new Date(db.timestamp),
    symbol: db.symbol,
    action: db.action,
    weightBefore: db.weight_before,
    weightAfter: db.weight_after,
    reason: db.reason || '',
    confidence: db.confidence || 0,
    factors: (db.factors || []) as TradingDecision['factors'],
    outcomeReturn: db.outcome_return || undefined,
    outcomeAttribution: db.outcome_attribution || undefined,
  };
}

function dbToBelief(db: DBBelief): BeliefState {
  return {
    id: db.id,
    version: db.version,
    updatedAt: new Date(db.updated_at),
    factorWeights: new Map(Object.entries(db.factor_weights)),
    factorConfidences: new Map(Object.entries(db.factor_confidences)),
    riskTolerance: db.risk_tolerance,
    maxDrawdownThreshold: db.max_drawdown_threshold,
    volatilityTarget: db.volatility_target,
    momentumHorizon: db.momentum_horizon,
    meanReversionThreshold: db.mean_reversion_threshold,
    concentrationLimit: db.concentration_limit,
    minPositionSize: db.min_position_size,
    rebalanceThreshold: db.rebalance_threshold,
    currentRegime: db.current_regime as BeliefState['currentRegime'],
    regimeConfidence: db.regime_confidence,
    conceptualPriors: (db.conceptual_priors || []) as BeliefState['conceptualPriors'],
  };
}

function dbToCycleResult(db: any): CVRFCycleResult {
  const newBeliefState = db.new_belief_state || {};
  return {
    cycleId: db.id || `cycle_${db.cycle_number || 0}`,
    timestamp: new Date(db.timestamp),
    episodeComparison: {
      betterEpisode: {
        id: db.current_episode_id,
        startDate: new Date(),
        decisions: [],
        factorExposures: [],
        portfolioReturn: db.current_episode_return,
      },
      worseEpisode: {
        id: db.previous_episode_id,
        startDate: new Date(),
        decisions: [],
        factorExposures: [],
        portfolioReturn: db.previous_episode_return,
      },
      performanceDelta: db.performance_delta,
      decisionOverlap: db.decision_overlap,
      profitableTrades: [],
      losingTrades: [],
    },
    extractedInsights: db.extracted_insights || [],
    metaPrompt: db.meta_prompt || {
      optimizationDirection: '',
      keyLearnings: [],
      factorAdjustments: {},
      riskGuidance: '',
      timingInsights: '',
      generatedAt: new Date(db.timestamp),
    },
    beliefUpdates: db.belief_updates || [],
    newBeliefState: {
      ...newBeliefState,
      id: newBeliefState.id || '',
      version: newBeliefState.version || 1,
      updatedAt: new Date(newBeliefState.updatedAt || db.timestamp),
      factorWeights: new Map(Object.entries(newBeliefState.factorWeights || {})),
      factorConfidences: new Map(Object.entries(newBeliefState.factorConfidences || {})),
    },
    explanation: db.explanation || '',
  };
}
