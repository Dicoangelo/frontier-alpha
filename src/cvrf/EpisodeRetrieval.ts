/**
 * Two-Phase Episode Retrieval (CVRF v2-A — MemRL pattern, arXiv:2601.03192)
 *
 * MemRL's insight: decouple STABLE reasoning from PLASTIC memory, and
 * retrieve from memory in two phases — first by relevance, then filtered by
 * environmental feedback (utility) — so the agent learns from episodes that
 * were both SIMILAR and actually WORKED (or instructively failed).
 *
 * CVRF mapping: factor model = stable reasoning; episode store = plastic
 * memory. Before each belief-update cycle we retrieve the top-K precedent
 * episodes and inject them as `precedent` ConceptualInsights, so the
 * BeliefUpdater learns from the FULL episode history instead of only the
 * last two episodes.
 *
 * Phase 1 (relevance): cosine-style similarity over decision symbols,
 *   action mix, and factor-exposure profile.
 * Phase 2 (utility): episodes weighted by realized outcome quality
 *   (return + Sharpe), keeping strong winners AND instructive losers —
 *   |utility| matters, sign shapes the lesson.
 */

import type { Episode, ConceptualInsight } from './types.js';

export interface RetrievedEpisode {
  episode: Episode;
  /** Phase 1: 0-1 relevance to the current episode. */
  similarity: number;
  /** Phase 2: signed outcome quality, roughly -1..1. */
  utility: number;
  /** Final ranking score: similarity x |utility|. */
  score: number;
}

export interface RetrievalConfig {
  topK: number;
  /** Phase 1 floor — episodes less similar than this never surface. */
  minSimilarity: number;
  /** Phase 2 floor — near-zero-outcome episodes teach nothing. */
  minAbsUtility: number;
}

export const DEFAULT_RETRIEVAL_CONFIG: RetrievalConfig = {
  topK: 3,
  minSimilarity: 0.15,
  minAbsUtility: 0.05,
};

// ── Phase 1: relevance ───────────────────────────────────────────

function symbolSet(episode: Episode): Set<string> {
  return new Set(episode.decisions.map((d) => d.symbol));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

function actionMix(episode: Episode): [number, number, number, number] {
  const mix: [number, number, number, number] = [0, 0, 0, 0];
  const idx = { buy: 0, sell: 1, hold: 2, rebalance: 3 } as const;
  for (const d of episode.decisions) mix[idx[d.action]]++;
  const total = episode.decisions.length || 1;
  return mix.map((c) => c / total) as [number, number, number, number];
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function exposureVector(episode: Episode, factorOrder: string[]): number[] {
  const byName = new Map(episode.factorExposures.map((f) => [f.factor, f.exposure]));
  return factorOrder.map((f) => byName.get(f) ?? 0);
}

/**
 * Phase 1 similarity between the current and a candidate episode:
 * 50% symbol overlap, 25% action-mix cosine, 25% factor-profile cosine.
 * Components that are unavailable on both sides drop out of the blend.
 */
export function episodeSimilarity(current: Episode, candidate: Episode): number {
  const parts: Array<{ weight: number; value: number }> = [];

  if (current.decisions.length > 0 && candidate.decisions.length > 0) {
    parts.push({ weight: 0.5, value: jaccard(symbolSet(current), symbolSet(candidate)) });
    parts.push({ weight: 0.25, value: cosine(actionMix(current), actionMix(candidate)) });
  }

  if (current.factorExposures.length > 0 && candidate.factorExposures.length > 0) {
    const order = [...new Set([
      ...current.factorExposures.map((f) => f.factor),
      ...candidate.factorExposures.map((f) => f.factor),
    ])];
    const cos = cosine(exposureVector(current, order), exposureVector(candidate, order));
    // Cosine is -1..1; map to 0..1 so opposed profiles read as dissimilar.
    parts.push({ weight: 0.25, value: (cos + 1) / 2 });
  }

  if (parts.length === 0) return 0;
  const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
  return parts.reduce((s, p) => s + p.weight * p.value, 0) / totalWeight;
}

// ── Phase 2: utility ─────────────────────────────────────────────

/**
 * Signed outcome quality. Blends return (squashed via tanh at a 10% scale)
 * with Sharpe (squashed at 2.0). Episodes without outcomes score 0 and are
 * filtered — an unclosed episode has no environmental feedback yet.
 */
export function episodeUtility(episode: Episode): number {
  const hasReturn = typeof episode.portfolioReturn === 'number';
  const hasSharpe = typeof episode.sharpeRatio === 'number';
  if (!hasReturn && !hasSharpe) return 0;

  let value = 0;
  let weight = 0;
  if (hasReturn) {
    value += 0.6 * Math.tanh((episode.portfolioReturn as number) / 0.1);
    weight += 0.6;
  }
  if (hasSharpe) {
    value += 0.4 * Math.tanh((episode.sharpeRatio as number) / 2.0);
    weight += 0.4;
  }
  return value / weight;
}

// ── Retrieval ────────────────────────────────────────────────────

/**
 * Two-phase retrieval: relevance-rank the candidate pool, filter by utility
 * magnitude, score by similarity x |utility|, return top-K.
 */
export function retrieveRelevantEpisodes(
  current: Episode,
  candidates: Episode[],
  config: RetrievalConfig = DEFAULT_RETRIEVAL_CONFIG,
): RetrievedEpisode[] {
  return candidates
    .filter((c) => c.id !== current.id)
    .map((episode) => {
      const similarity = episodeSimilarity(current, episode);
      const utility = episodeUtility(episode);
      return { episode, similarity, utility, score: similarity * Math.abs(utility) };
    })
    .filter((r) => r.similarity >= config.minSimilarity && Math.abs(r.utility) >= config.minAbsUtility)
    .sort((a, b) => b.score - a.score)
    .slice(0, config.topK);
}

/**
 * Convert retrieved precedents into ConceptualInsights the existing
 * BeliefUpdater/meta-prompt machinery consumes unchanged. Winners teach
 * "repeat this"; losers teach "avoid this" — both are positive-confidence
 * lessons with opposite impact directions.
 */
export function precedentInsights(retrieved: RetrievedEpisode[]): ConceptualInsight[] {
  return retrieved.map((r, i) => {
    const ep = r.episode;
    const won = r.utility >= 0;
    const ret = typeof ep.portfolioReturn === 'number' ? `${(ep.portfolioReturn * 100).toFixed(1)}%` : 'n/a';
    const symbols = [...symbolSet(ep)].slice(0, 5).join(', ') || 'no decisions';
    return {
      id: `precedent_${ep.id}_${i}`,
      type: 'regime',
      concept: won
        ? `Precedent: a similar episode (${Math.round(r.similarity * 100)}% match) returned ${ret} — the decision pattern around ${symbols} worked before.`
        : `Precedent: a similar episode (${Math.round(r.similarity * 100)}% match) lost ${ret} — the decision pattern around ${symbols} failed before; adjust rather than repeat.`,
      evidence: [
        `episode=${ep.id}`,
        `similarity=${r.similarity.toFixed(3)}`,
        `utility=${r.utility.toFixed(3)}`,
        `decisions=${ep.decisions.length}`,
      ],
      confidence: Math.min(0.95, 0.5 + r.score),
      sourceEpisode: ep.id,
      impactDirection: won ? 'positive' : 'negative',
    };
  });
}
