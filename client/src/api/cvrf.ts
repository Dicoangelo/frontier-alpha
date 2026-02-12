/**
 * CVRF API Client
 *
 * Conceptual Verbal Reinforcement Framework API endpoints
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
// BELIEFS
// ============================================================================

export async function getBeliefs(): Promise<CVRFBeliefState> {
  const response = await api.get<CVRFApiResponse<CVRFBeliefState>>('/cvrf/beliefs');
  return (response as any).data;
}

export async function getConstraints(): Promise<CVRFConstraints> {
  const response = await api.get<CVRFApiResponse<CVRFConstraints>>('/cvrf/constraints');
  return (response as any).data;
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
  return (response as any).data;
}

export async function startEpisode(): Promise<CVRFEpisode> {
  const response = await api.post<CVRFApiResponse<CVRFEpisode>>('/cvrf/episode/start');
  return (response as any).data;
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
  const response = await api.post<CVRFApiResponse<{ episode: CVRFEpisode; cvrfResult: CVRFCycleResult | null }>>(
    '/cvrf/episode/close',
    params
  );
  return (response as any).data;
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
  return (response as any).data;
}

// ============================================================================
// HISTORY & STATS
// ============================================================================

export async function getCycleHistory(): Promise<CVRFCycleResult[]> {
  const response = await api.get<CVRFApiResponse<CVRFCycleResult[]>>('/cvrf/history');
  return (response as any).data;
}

export async function getStats(): Promise<CVRFStats> {
  const response = await api.get<CVRFApiResponse<CVRFStats>>('/cvrf/stats');
  return (response as any).data;
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
  return (response as any).data;
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
