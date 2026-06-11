/**
 * Multi-Method Factor Explainability (IDEA-FF-2, v1)
 *
 * FriendlyFace runs LIME + SHAP + SDD per prediction and shows whether the
 * methods AGREE — disagreement catches hallucination. The factor-analysis
 * analog: three independent ways of ranking "which factors matter for this
 * symbol right now", each reading the same exposures from a different angle:
 *
 *   1. exposure_magnitude       — what the snapshot says is big
 *   2. temporal_delta           — what is MOVING (5d anchor deltas, CIN-3)
 *   3. statistical_significance — what the regression actually trusts (|t|)
 *
 * Agreement is quantified (top-K overlap + Spearman rank correlation) and
 * verdicted. Methods agreeing is a much stronger trust signal than one
 * paragraph of LLM; methods disagreeing is surfaced, not hidden.
 */

import type { FactorExposure } from '../types/index.js';
import type { TemporalFactorContext } from '../services/factorAnchors.js';

export type ConsensusMethod =
  | 'exposure_magnitude'
  | 'temporal_delta'
  | 'statistical_significance';

export interface RankedFactor {
  factor: string;
  /** Method-specific score the ranking sorted on (absolute value). */
  score: number;
  /** 1-based rank within this method. */
  rank: number;
}

export interface MethodRanking {
  method: ConsensusMethod;
  description: string;
  ranking: RankedFactor[];
}

export interface PairwiseAgreement {
  a: ConsensusMethod;
  b: ConsensusMethod;
  /** Jaccard overlap of the two methods' top-K sets, 0-1. */
  topKOverlap: number;
  /** Spearman rank correlation over the factor union, -1..1. */
  rankCorrelation: number;
}

export interface ConsensusFactor {
  factor: string;
  /** Mean rank across methods (lower = more important everywhere). */
  avgRank: number;
  /** How many methods put it in their top-K. */
  methodsInTopK: number;
}

export interface MethodConsensusResult {
  symbol: string;
  topK: number;
  methods: MethodRanking[];
  agreement: {
    pairwise: PairwiseAgreement[];
    /** Mean of pairwise top-K overlaps, 0-1. */
    overallScore: number;
    verdict: 'strong_agreement' | 'partial_agreement' | 'disagreement';
  };
  /** Factors ranked by cross-method consensus. */
  consensusFactors: ConsensusFactor[];
}

const DEFAULT_TOP_K = 5;
const STRONG_THRESHOLD = 0.6;
const PARTIAL_THRESHOLD = 0.3;

function rankByScore(scores: Map<string, number>): RankedFactor[] {
  return [...scores.entries()]
    .map(([factor, score]) => ({ factor, score: Math.abs(score) }))
    .sort((a, b) => b.score - a.score)
    .map((entry, i) => ({ ...entry, rank: i + 1 }));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

/**
 * Spearman rank correlation over the union of factors. A factor missing from
 * a method's ranking is treated as ranked last (union size + 1) — absence IS
 * information about disagreement.
 */
function spearman(a: RankedFactor[], b: RankedFactor[]): number {
  const union = new Set([...a.map((x) => x.factor), ...b.map((x) => x.factor)]);
  const n = union.size;
  if (n < 2) return 1;

  const rankOf = (ranking: RankedFactor[]) => {
    const m = new Map(ranking.map((r) => [r.factor, r.rank]));
    return (factor: string) => m.get(factor) ?? n + 1;
  };
  const ra = rankOf(a);
  const rb = rankOf(b);

  let sumD2 = 0;
  for (const factor of union) {
    const d = ra(factor) - rb(factor);
    sumD2 += d * d;
  }
  return 1 - (6 * sumD2) / (n * (n * n - 1));
}

/**
 * Compute the three method rankings + agreement from a temporal factor
 * context. Pure and synchronous: the caller supplies the same context the
 * CIN-3 anchors path already assembles (no new data calls).
 *
 * When no 5d anchor exists, the temporal_delta method is omitted and the
 * consensus runs on the remaining two methods.
 */
export function computeMethodConsensus(
  symbol: string,
  ctx: TemporalFactorContext,
  topK: number = DEFAULT_TOP_K,
): MethodConsensusResult {
  const methods: MethodRanking[] = [];

  // Method 1 — exposure magnitude.
  methods.push({
    method: 'exposure_magnitude',
    description: 'Largest absolute factor exposures in the current snapshot',
    ranking: rankByScore(new Map(ctx.current.map((f) => [f.factor, f.exposure]))),
  });

  // Method 2 — temporal delta vs the nearest anchor (5d preferred).
  const anchor = ctx.anchors.find((a) => a.window === '5d') ?? ctx.anchors[0];
  if (anchor) {
    const prior = new Map(anchor.factors.map((f) => [f.factor, f.exposure]));
    const deltas = new Map<string, number>();
    for (const f of ctx.current) {
      const before = prior.get(f.factor);
      if (before !== undefined) deltas.set(f.factor, f.exposure - before);
    }
    methods.push({
      method: 'temporal_delta',
      description: `Largest exposure moves vs the ${anchor.window}-prior snapshot`,
      ranking: rankByScore(deltas),
    });
  }

  // Method 3 — statistical significance.
  methods.push({
    method: 'statistical_significance',
    description: 'Factors the regression trusts most (absolute t-statistic)',
    ranking: rankByScore(new Map(ctx.current.map((f) => [f.factor, f.tStat]))),
  });

  // Pairwise agreement.
  const pairwise: PairwiseAgreement[] = [];
  for (let i = 0; i < methods.length; i++) {
    for (let j = i + 1; j < methods.length; j++) {
      const topA = new Set(methods[i].ranking.slice(0, topK).map((r) => r.factor));
      const topB = new Set(methods[j].ranking.slice(0, topK).map((r) => r.factor));
      pairwise.push({
        a: methods[i].method,
        b: methods[j].method,
        topKOverlap: round3(jaccard(topA, topB)),
        rankCorrelation: round3(spearman(methods[i].ranking, methods[j].ranking)),
      });
    }
  }
  const overallScore = round3(
    pairwise.length > 0 ? pairwise.reduce((s, p) => s + p.topKOverlap, 0) / pairwise.length : 1,
  );
  const verdict =
    overallScore >= STRONG_THRESHOLD
      ? 'strong_agreement'
      : overallScore >= PARTIAL_THRESHOLD
        ? 'partial_agreement'
        : 'disagreement';

  // Cross-method consensus factors.
  const allFactors = new Set(methods.flatMap((m) => m.ranking.map((r) => r.factor)));
  const consensusFactors: ConsensusFactor[] = [...allFactors]
    .map((factor) => {
      const ranks = methods.map((m) => {
        const found = m.ranking.find((r) => r.factor === factor);
        return found ? found.rank : m.ranking.length + 1;
      });
      const methodsInTopK = methods.filter((m) =>
        m.ranking.slice(0, topK).some((r) => r.factor === factor),
      ).length;
      return {
        factor,
        avgRank: round3(ranks.reduce((s, r) => s + r, 0) / ranks.length),
        methodsInTopK,
      };
    })
    .sort((a, b) => b.methodsInTopK - a.methodsInTopK || a.avgRank - b.avgRank)
    .slice(0, topK * 2);

  return {
    symbol,
    topK,
    methods,
    agreement: { pairwise, overallScore, verdict },
    consensusFactors,
  };
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

/** Compact exposure subset used in tests and the route layer. */
export function toExposure(factor: string, exposure: number, tStat: number): FactorExposure {
  return { factor, exposure, tStat, confidence: 0.9, contribution: 0 };
}
