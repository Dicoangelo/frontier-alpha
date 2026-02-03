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

export const factorsApi = {
  getFactors: async (symbols: string[]): Promise<PortfolioFactors> => {
    if (symbols.length === 0) {
      return { factors: [], lastUpdated: new Date().toISOString() };
    }
    const response = await api.get(`/portfolio/factors/${symbols.join(',')}`);
    return response.data;
  },

  getFactorsByCategory: async (symbols: string[]): Promise<Record<string, FactorExposureWithCategory[]>> => {
    const { factors } = await factorsApi.getFactors(symbols);
    return groupByCategory(factors);
  },

  refreshFactors: async (symbols: string[]): Promise<PortfolioFactors> => {
    const response = await api.post('/portfolio/factors/refresh', { symbols });
    return response.data;
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
