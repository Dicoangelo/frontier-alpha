/**
 * CVRF React Hooks
 *
 * React Query hooks for the Conceptual Verbal Reinforcement Framework
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cvrfApi } from '@/api/cvrf';
import type { CVRFDecision } from '@/types/cvrf';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const cvrfKeys = {
  all: ['cvrf'] as const,
  beliefs: () => [...cvrfKeys.all, 'beliefs'] as const,
  constraints: () => [...cvrfKeys.all, 'constraints'] as const,
  episodes: () => [...cvrfKeys.all, 'episodes'] as const,
  history: () => [...cvrfKeys.all, 'history'] as const,
  stats: () => [...cvrfKeys.all, 'stats'] as const,
};

// ============================================================================
// BELIEF HOOKS
// ============================================================================

/**
 * Get current CVRF belief state
 */
export function useCVRFBeliefs() {
  return useQuery({
    queryKey: cvrfKeys.beliefs(),
    queryFn: cvrfApi.getBeliefs,
    staleTime: 30 * 1000, // 30 seconds
    refetchOnWindowFocus: true,
  });
}

/**
 * Get CVRF optimization constraints
 */
export function useCVRFConstraints() {
  return useQuery({
    queryKey: cvrfKeys.constraints(),
    queryFn: cvrfApi.getConstraints,
    staleTime: 30 * 1000,
  });
}

// ============================================================================
// EPISODE HOOKS
// ============================================================================

/**
 * Get all CVRF episodes (active + completed)
 */
export function useCVRFEpisodes() {
  return useQuery({
    queryKey: cvrfKeys.episodes(),
    queryFn: cvrfApi.getEpisodes,
    staleTime: 10 * 1000, // 10 seconds
    refetchOnWindowFocus: true,
  });
}

/**
 * Start a new CVRF episode
 */
export function useStartEpisode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cvrfApi.startEpisode,
    onSuccess: () => {
      // Invalidate episodes to refetch with new active episode
      queryClient.invalidateQueries({ queryKey: cvrfKeys.episodes() });
    },
  });
}

/**
 * Close the current CVRF episode
 */
export function useCloseEpisode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cvrfApi.closeEpisode,
    onSuccess: (data) => {
      // Invalidate all CVRF queries since beliefs may have updated
      queryClient.invalidateQueries({ queryKey: cvrfKeys.all });
    },
  });
}

// ============================================================================
// DECISION HOOKS
// ============================================================================

/**
 * Record a trading decision
 */
export function useRecordDecision() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cvrfApi.recordDecision,
    onSuccess: () => {
      // Invalidate episodes to update decision count
      queryClient.invalidateQueries({ queryKey: cvrfKeys.episodes() });
    },
  });
}

// ============================================================================
// HISTORY & STATS HOOKS
// ============================================================================

/**
 * Get CVRF cycle history
 */
export function useCVRFHistory() {
  return useQuery({
    queryKey: cvrfKeys.history(),
    queryFn: cvrfApi.getCycleHistory,
    staleTime: 30 * 1000,
  });
}

/**
 * Get CVRF system statistics
 */
export function useCVRFStats() {
  return useQuery({
    queryKey: cvrfKeys.stats(),
    queryFn: cvrfApi.getStats,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });
}

// ============================================================================
// RISK HOOKS
// ============================================================================

/**
 * Get CVRF risk assessment for current portfolio
 */
export function useCVRFRiskAssessment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cvrfApi.getRiskAssessment,
  });
}

// ============================================================================
// COMBINED HOOKS
// ============================================================================

/**
 * Combined hook for CVRF dashboard data
 */
export function useCVRFDashboard() {
  const beliefs = useCVRFBeliefs();
  const episodes = useCVRFEpisodes();
  const stats = useCVRFStats();
  const history = useCVRFHistory();

  const isLoading = beliefs.isLoading || episodes.isLoading || stats.isLoading || history.isLoading;
  const isError = beliefs.isError || episodes.isError || stats.isError || history.isError;

  return {
    beliefs: beliefs.data,
    episodes: episodes.data,
    stats: stats.data,
    history: history.data,
    isLoading,
    isError,
    refetch: () => {
      beliefs.refetch();
      episodes.refetch();
      stats.refetch();
      history.refetch();
    },
  };
}

/**
 * Hook for managing an active trading episode
 */
export function useCVRFEpisodeManager() {
  const episodes = useCVRFEpisodes();
  const startEpisode = useStartEpisode();
  const closeEpisode = useCloseEpisode();
  const recordDecision = useRecordDecision();

  const hasActiveEpisode = !!episodes.data?.current;
  const activeEpisode = episodes.data?.current;
  const completedEpisodes = episodes.data?.completed || [];

  return {
    // State
    hasActiveEpisode,
    activeEpisode,
    completedEpisodes,
    totalEpisodes: episodes.data?.totalEpisodes || 0,
    isLoading: episodes.isLoading,

    // Actions
    startEpisode: startEpisode.mutateAsync,
    closeEpisode: closeEpisode.mutateAsync,
    recordDecision: recordDecision.mutateAsync,

    // Mutation states
    isStarting: startEpisode.isPending,
    isClosing: closeEpisode.isPending,
    isRecording: recordDecision.isPending,
  };
}

// ============================================================================
// UTILITY HOOKS
// ============================================================================

/**
 * Format CVRF regime for display
 */
export function useRegimeDisplay(regime?: string, confidence?: number) {
  const regimeColors: Record<string, string> = {
    bull: 'text-green-500',
    bear: 'text-red-500',
    sideways: 'text-yellow-500',
    volatile: 'text-orange-500',
    recovery: 'text-blue-500',
  };

  const regimeIcons: Record<string, string> = {
    bull: '📈',
    bear: '📉',
    sideways: '➡️',
    volatile: '🌊',
    recovery: '🔄',
  };

  return {
    color: regime ? regimeColors[regime] || 'text-gray-500' : 'text-gray-500',
    icon: regime ? regimeIcons[regime] || '❓' : '❓',
    label: regime ? regime.charAt(0).toUpperCase() + regime.slice(1) : 'Unknown',
    confidence: confidence ? `${(confidence * 100).toFixed(0)}%` : 'N/A',
  };
}
