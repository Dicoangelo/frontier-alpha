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

export const factorsApi = {
  getFactors: async (symbols: string[]): Promise<PortfolioFactors> => {
    if (symbols.length === 0) {
      return { factors: [], lastUpdated: new Date().toISOString() };
    }
    const response = await api.get<ApiResponse>(`/portfolio/factors/${symbols.join(',')}`);

    // Transform backend response { data: { AAPL: [...], NVDA: [...] } }
    // into { factors: [...all factors with symbols and categories...] }
    const factorsBySymbol = (response as unknown as ApiResponse).data || {};
    const allFactors: FactorExposureWithCategory[] = [];

    for (const [symbol, factors] of Object.entries(factorsBySymbol)) {
      for (const factor of factors) {
        allFactors.push({
          ...factor,
          symbol,
          category: categorizeFactorName(factor.factor),
        });
      }
    }

    return {
      factors: allFactors,
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
