/**
 * CVRF API Client
 *
 * Conceptual Verbal Reinforcement Framework API endpoints.
 *
 * NOTE: The server (src/routes/cvrf.ts) historically returned a slightly
 * different field shape than the client `types/cvrf.ts` declared. This module
 * normalizes server responses to the client-visible shape so components can
 * rely on stable field names. Any new field aliases should be added here, not
 * sprinkled across components.
 */

import { api } from './client';
import type {
  CVRFBeliefState,
  CVRFEpisode,
  CVRFDecision,
  CVRFCycleResult,
  CVRFConstraints,
  CVRFRiskAssessment,
  CVRFStats,
  CVRFEpisodesResponse,
  CVRFApiResponse,
} from '@/types/cvrf';

// ============================================================================
// NORMALIZERS — server → client shape adapters
// ============================================================================

interface RawBeliefs {
  factorWeights?: Record<string, number>;
  factorConfidences?: Record<string, number>;
  conceptualPriors?: CVRFBeliefState['conceptualPriors'];
  [key: string]: unknown;
}

function normalizeBeliefs(raw: RawBeliefs | null | undefined): CVRFBeliefState {
  const safe = raw ?? ({} as RawBeliefs);
  return {
    id: (safe.id as string) || 'beliefs_unknown',
    version: (safe.version as number) ?? 1,
    updatedAt: (safe.updatedAt as string) || new Date().toISOString(),
    factorWeights: safe.factorWeights ?? {},
    factorConfidences: safe.factorConfidences ?? {},
    riskTolerance: (safe.riskTolerance as number) ?? 0.15,
    maxDrawdownThreshold: (safe.maxDrawdownThreshold as number) ?? 0.1,
    volatilityTarget: (safe.volatilityTarget as number) ?? 0.15,
    momentumHorizon: (safe.momentumHorizon as number) ?? 21,
    meanReversionThreshold: (safe.meanReversionThreshold as number) ?? 2.0,
    concentrationLimit: (safe.concentrationLimit as number) ?? 0.2,
    minPositionSize: (safe.minPositionSize as number) ?? 0.02,
    rebalanceThreshold: (safe.rebalanceThreshold as number) ?? 0.05,
    currentRegime: (safe.currentRegime as CVRFBeliefState['currentRegime']) || 'sideways',
    regimeConfidence: (safe.regimeConfidence as number) ?? 0.5,
    conceptualPriors: safe.conceptualPriors ?? [],
  };
}

interface RawEpisodesResponse {
  current?: CVRFEpisode | null;
  currentEpisode?: CVRFEpisode | null;
  completed?: CVRFEpisode[];
  completedEpisodes?: CVRFEpisode[];
  totalEpisodes?: number;
  pagination?: { total?: number; limit?: number; offset?: number; hasMore?: boolean };
}

function normalizeEpisodesResponse(raw: RawEpisodesResponse | null | undefined): CVRFEpisodesResponse {
  const safe = raw ?? ({} as RawEpisodesResponse);
  const current = safe.current ?? safe.currentEpisode ?? null;
  const completed = safe.completed ?? safe.completedEpisodes ?? [];
  const pagination = safe.pagination ?? {
    total: completed.length,
    limit: completed.length,
    offset: 0,
    hasMore: false,
  };
  const totalEpisodes = safe.totalEpisodes ?? pagination.total ?? completed.length;
  return {
    current,
    completed,
    totalEpisodes,
    pagination: {
      total: pagination.total ?? totalEpisodes,
      limit: pagination.limit ?? completed.length,
      offset: pagination.offset ?? 0,
      hasMore: pagination.hasMore ?? false,
    },
  };
}

interface RawStatsFactors {
  weights?: Record<string, number | string>;
  confidences?: Record<string, number | string>;
  factorWeights?: Record<string, number>;
  factorConfidences?: Record<string, number>;
}

interface RawStatsBeliefs {
  version?: number;
  regime?: string;
  currentRegime?: string;
  regimeConfidence?: number | string;
  riskTolerance?: number | string;
  volatilityTarget?: number | string;
}

interface RawStats {
  episodes?: CVRFStats['episodes'];
  cvrf?: CVRFStats['cvrf'];
  beliefs?: RawStatsBeliefs;
  factors?: RawStatsFactors;
}

function fmtMap(input: Record<string, number | string> | undefined): Record<string, string> {
  if (!input) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input)) {
    out[k] = typeof v === 'number' ? v.toFixed(3) : String(v);
  }
  return out;
}

function normalizeStats(raw: RawStats | null | undefined): CVRFStats {
  const safe = raw ?? ({} as RawStats);
  const factors = safe.factors ?? {};
  const beliefs = safe.beliefs ?? {};
  return {
    episodes: safe.episodes ?? {
      total: 0,
      totalDecisions: 0,
      avgReturn: '0.00%',
      avgSharpe: '0.00',
    },
    cvrf: safe.cvrf ?? {
      totalCycles: 0,
      avgDecisionOverlap: '0.00',
      avgLearningRate: '0.00',
      totalInsights: 0,
      totalBeliefUpdates: 0,
    },
    beliefs: {
      version: beliefs.version ?? 1,
      regime: beliefs.regime ?? beliefs.currentRegime ?? 'sideways',
      regimeConfidence: String(beliefs.regimeConfidence ?? '0.50'),
      riskTolerance: String(beliefs.riskTolerance ?? '0.15'),
      volatilityTarget: String(beliefs.volatilityTarget ?? '0.15'),
    },
    factors: {
      weights: fmtMap(factors.weights ?? factors.factorWeights),
      confidences: fmtMap(factors.confidences ?? factors.factorConfidences),
    },
  };
}

// ============================================================================
// BELIEFS
// ============================================================================

export async function getBeliefs(): Promise<CVRFBeliefState> {
  const response = await api.get<CVRFApiResponse<CVRFBeliefState>>('/cvrf/beliefs');
  return normalizeBeliefs((response as unknown as CVRFApiResponse<RawBeliefs>).data);
}

export async function getConstraints(): Promise<CVRFConstraints> {
  const response = await api.get<CVRFApiResponse<CVRFConstraints>>('/cvrf/constraints');
  return (response as unknown as CVRFApiResponse<CVRFConstraints>).data;
}

// ============================================================================
// EPISODES
// ============================================================================

export async function getEpisodes(params?: {
  limit?: number;
  offset?: number;
  expand?: 'decisions';
}): Promise<CVRFEpisodesResponse> {
  const response = await api.get<CVRFApiResponse<CVRFEpisodesResponse>>('/cvrf/episodes', {
    params: {
      limit: params?.limit,
      offset: params?.offset,
      expand: params?.expand,
    },
  });
  return normalizeEpisodesResponse(
    (response as unknown as CVRFApiResponse<RawEpisodesResponse>).data
  );
}

export async function startEpisode(): Promise<CVRFEpisode> {
  const response = await api.post<CVRFApiResponse<CVRFEpisode>>('/cvrf/episode/start');
  return (response as unknown as CVRFApiResponse<CVRFEpisode>).data;
}

export async function closeEpisode(params: {
  runCvrfCycle?: boolean;
  metrics?: {
    portfolioReturn?: number;
    sharpeRatio?: number;
    maxDrawdown?: number;
    volatility?: number;
  };
}): Promise<{ episode: CVRFEpisode; cvrfResult: CVRFCycleResult | null }> {
  type CloseData = { episode: CVRFEpisode; cvrfResult: CVRFCycleResult | null };
  const response = await api.post<CVRFApiResponse<CloseData>>(
    '/cvrf/episode/close',
    params
  );
  return (response as unknown as CVRFApiResponse<CloseData>).data;
}

// ============================================================================
// DECISIONS
// ============================================================================

export async function recordDecision(decision: {
  symbol: string;
  action: 'buy' | 'sell' | 'hold' | 'rebalance';
  weightBefore: number;
  weightAfter: number;
  reason: string;
  confidence: number;
  factors?: CVRFDecision['factors'];
}): Promise<CVRFDecision> {
  const response = await api.post<CVRFApiResponse<CVRFDecision>>('/cvrf/decision', decision);
  return (response as unknown as CVRFApiResponse<CVRFDecision>).data;
}

// ============================================================================
// HISTORY & STATS
// ============================================================================

export async function getCycleHistory(): Promise<CVRFCycleResult[]> {
  const response = await api.get<CVRFApiResponse<CVRFCycleResult[]>>('/cvrf/history');
  return (response as unknown as CVRFApiResponse<CVRFCycleResult[]>).data;
}

export async function getStats(): Promise<CVRFStats> {
  const response = await api.get<CVRFApiResponse<CVRFStats>>('/cvrf/stats');
  return normalizeStats((response as unknown as CVRFApiResponse<RawStats>).data);
}

// ============================================================================
// RISK ASSESSMENT
// ============================================================================

export async function getRiskAssessment(params: {
  portfolioValue: number;
  portfolioReturns: number[];
  positions: Array<{ symbol: string; weight: number }>;
}): Promise<CVRFRiskAssessment> {
  const response = await api.post<CVRFApiResponse<CVRFRiskAssessment>>('/cvrf/risk', params);
  return (response as unknown as CVRFApiResponse<CVRFRiskAssessment>).data;
}

// ============================================================================
// EXPORT
// ============================================================================

export const cvrfApi = {
  // Beliefs
  getBeliefs,
  getConstraints,

  // Episodes
  getEpisodes,
  startEpisode,
  closeEpisode,

  // Decisions
  recordDecision,

  // History & Stats
  getCycleHistory,
  getStats,

  // Risk
  getRiskAssessment,
};
