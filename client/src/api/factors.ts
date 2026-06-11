import { api } from './client';
import type { FactorExposure } from '@/types';

export interface FactorExposureWithCategory extends FactorExposure {
  category: 'style' | 'macro' | 'sector' | 'volatility' | 'sentiment';
  symbol?: string;
}

export interface PortfolioFactors {
  factors: FactorExposureWithCategory[];
  lastUpdated: string;
  insight?: string;
}

interface ApiResponse {
  success: boolean;
  data: Record<string, FactorExposure[]>;
  meta?: { timestamp: string; requestId: string; latencyMs: number };
}

export type FactorHistoryWindow = '1d' | '5d';

/** Temporal saliency (IDEAS Topic D): window attribution for one symbol. */
export interface SaliencyWindow {
  key: 'recent' | 'mid' | 'far';
  label: string;
  days: number;
  sharePct: number;
  contribution: number;
}

export interface FactorSaliency {
  factor: 'momentum' | 'volatility';
  windows: SaliencyWindow[];
  dominantWindow: SaliencyWindow;
  copy: string;
}

export interface SaliencyResult {
  symbol: string;
  lookbackDays: number;
  factors: FactorSaliency[];
}

export interface PortfolioFactorsHistory {
  current: FactorExposureWithCategory[];
  prior: FactorExposureWithCategory[];
  window: FactorHistoryWindow;
  asOfDate: string;
  priorDate: string;
}

interface ApiHistoryResponse {
  success: boolean;
  data: {
    current: Record<string, FactorExposure[]>;
    prior: Record<string, FactorExposure[]>;
    window: FactorHistoryWindow;
    asOfDate: string;
    priorDate: string;
  };
  meta?: { timestamp: string; requestId: string; latencyMs: number };
}

function flattenWithCategory(
  bySymbol: Record<string, FactorExposure[]>,
): FactorExposureWithCategory[] {
  const out: FactorExposureWithCategory[] = [];
  for (const [symbol, factors] of Object.entries(bySymbol)) {
    for (const factor of factors) {
      out.push({
        ...factor,
        symbol,
        category: categorizeFactorName(factor.factor),
      });
    }
  }
  return out;
}

export const factorsApi = {
  getFactors: async (symbols: string[]): Promise<PortfolioFactors> => {
    if (symbols.length === 0) {
      return { factors: [], lastUpdated: new Date().toISOString() };
    }
    const response = await api.get<ApiResponse>(`/portfolio/factors/${symbols.join(',')}`);

    // Transform backend response { data: { AAPL: [...], NVDA: [...] } }
    // into { factors: [...all factors with symbols and categories...] }
    const factorsBySymbol = (response as unknown as ApiResponse).data || {};

    return {
      factors: flattenWithCategory(factorsBySymbol),
      lastUpdated: (response as unknown as ApiResponse).meta?.timestamp || new Date().toISOString(),
    };
  },

  getFactorsByCategory: async (symbols: string[]): Promise<Record<string, FactorExposureWithCategory[]>> => {
    const { factors } = await factorsApi.getFactors(symbols);
    return groupByCategory(factors);
  },

  refreshFactors: async (symbols: string[]): Promise<PortfolioFactors> => {
    // Use the same endpoint - no separate refresh endpoint on backend
    return factorsApi.getFactors(symbols);
  },

  /**
   * Temporal saliency for one symbol — which trading-day windows drove the
   * momentum and volatility signals (true additive attribution).
   */
  getSaliency: async (symbol: string): Promise<SaliencyResult> => {
    const response = await api.get(`/portfolio/factors/saliency/${symbol}`);
    return (response as unknown as { data: SaliencyResult }).data;
  },

  /**
   * Server-derived companion to getFactors — returns the current snapshot
   * AND a `window`-prior snapshot in one call. Used by useFactorDeltas to
   * skip the localStorage-baseline accumulation gap (DASH3-005 follow-up).
   *
   * Backend computes the prior snapshot by truncating the same Price[]
   * series the current snapshot uses (see src/factors/historySlice.ts).
   */
  getFactorsHistory: async (
    symbols: string[],
    window: FactorHistoryWindow = '1d',
  ): Promise<PortfolioFactorsHistory> => {
    if (symbols.length === 0) {
      return {
        current: [],
        prior: [],
        window,
        asOfDate: '',
        priorDate: '',
      };
    }
    const response = await api.get<ApiHistoryResponse>(
      `/portfolio/factors/history/${symbols.join(',')}?window=${window}`,
    );
    const payload = (response as unknown as ApiHistoryResponse).data;
    return {
      current: flattenWithCategory(payload?.current ?? {}),
      prior: flattenWithCategory(payload?.prior ?? {}),
      window: payload?.window ?? window,
      asOfDate: payload?.asOfDate ?? '',
      priorDate: payload?.priorDate ?? '',
    };
  },
};

export function groupByCategory(factors: FactorExposureWithCategory[]): Record<string, FactorExposureWithCategory[]> {
  const groups: Record<string, FactorExposureWithCategory[]> = {
    style: [],
    macro: [],
    sector: [],
    volatility: [],
    sentiment: [],
  };

  for (const factor of factors) {
    const category = factor.category || categorizeFactorName(factor.factor);
    if (groups[category]) {
      groups[category].push({ ...factor, category });
    }
  }

  return groups;
}

function categorizeFactorName(factorName: string): FactorExposureWithCategory['category'] {
  const name = factorName.toLowerCase();

  if (['momentum', 'value', 'quality', 'size', 'growth'].some(f => name.includes(f))) {
    return 'style';
  }
  if (['rate', 'inflation', 'credit', 'gdp', 'yield'].some(f => name.includes(f))) {
    return 'macro';
  }
  if (['tech', 'health', 'finance', 'energy', 'consumer', 'industrial'].some(f => name.includes(f))) {
    return 'sector';
  }
  if (['vol', 'volatility', 'vix', 'variance'].some(f => name.includes(f))) {
    return 'volatility';
  }
  if (['sentiment', 'news', 'social', 'analyst'].some(f => name.includes(f))) {
    return 'sentiment';
  }

  return 'style'; // default
}
