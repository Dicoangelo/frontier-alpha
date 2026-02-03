import { api } from './client';
import type { Portfolio, OptimizationConfig, OptimizationResult, FactorExposure } from '@/types';

export const portfolioApi = {
  getPortfolio: async (): Promise<Portfolio> => {
    const response = await api.get('/portfolio');
    return response.data;
  },

  optimize: async (
    symbols: string[],
    config: OptimizationConfig
  ): Promise<OptimizationResult> => {
    const response = await api.post('/portfolio/optimize', { symbols, config });
    return response.data;
  },

  getFactors: async (symbols: string[]): Promise<Record<string, FactorExposure[]>> => {
    const response = await api.get(`/portfolio/factors/${symbols.join(',')}`);
    return response.data;
  },

  explain: async (
    symbol: string,
    oldWeight: number,
    newWeight: number
  ): Promise<{ narrative: string }> => {
    const response = await api.post('/portfolio/explain', {
      symbol,
      oldWeight,
      newWeight,
    });
    return response.data;
  },
};
