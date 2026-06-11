import { api } from './client';
import type { Portfolio, OptimizationConfig, OptimizationResult, FactorExposure } from '@/types';

export const portfolioApi = {
  getPortfolio: async (): Promise<Portfolio> => {
    const response = await api.get('/portfolio');
    return response.data;
  },

  addPosition: async (symbol: string, shares: number, avgCost: number) => {
    const response = await api.post('/portfolio/positions', { symbol, shares, avgCost });
    return response.data;
  },

  updatePosition: async (id: string, shares: number, avgCost: number) => {
    const response = await api.put(`/portfolio/positions/${id}`, { shares, avgCost });
    return response.data;
  },

  deletePosition: async (id: string) => {
    const response = await api.delete(`/portfolio/positions/${id}`);
    return response.data;
  },

  optimize: async (
    symbols: string[],
    config: OptimizationConfig
  ): Promise<OptimizationResult> => {
    // 90s override of the global 30s timeout: a cold serverless run fetching
    // 300d × N symbols under the Polygon free-tier rate window can
    // legitimately take 30-60s. Aborting early surfaced as a fake
    // "check your internet connection" toast in the 2026-06-11 walkthrough.
    const response = await api.post('/portfolio/optimize', { symbols, config }, { timeout: 90000 });
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
