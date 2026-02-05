/**
 * FRONTIER ALPHA - CVRF (Conceptual Verbal Reinforcement Framework)
 *
 * A complete implementation of episodic verbal reinforcement for
 * investment belief optimization, based on:
 *
 * - FinCon (arXiv:2407.06567): Manager-analyst hierarchy + CVRF
 * - TextGrad (Nature 2025): Textual gradient descent
 * - FLAG-Trader (arXiv:2502.11433): LLM + RL fusion
 *
 * Core Components:
 * - EpisodeManager: Track trading episodes and decision sequences
 * - ConceptExtractor: Extract conceptual insights from episode comparison
 * - BeliefUpdater: Apply textual gradient descent to beliefs
 * - CVRFManager: Orchestrate the full CVRF optimization cycle
 *
 * Dual-Level Risk Control:
 * - Within-episode: CVaR-based real-time adjustments
 * - Over-episode: CVRF belief updates
 */

// Types
export * from './types.js';

// Core Components
export { EpisodeManager, episodeManager } from './EpisodeManager.js';
export { ConceptExtractor, conceptExtractor } from './ConceptExtractor.js';
export { BeliefUpdater, beliefUpdater } from './BeliefUpdater.js';
export { CVRFManager, cvrfManager } from './CVRFManager.js';

// Persistent Manager (Supabase-backed for serverless)
export {
  PersistentCVRFManager,
  getPersistentCVRFManager,
  createPersistentCVRFManager,
} from './PersistentCVRFManager.js';

// Persistence Layer
export * as persistence from './persistence.js';

// Re-export default config
export { DEFAULT_CVRF_CONFIG } from './types.js';
