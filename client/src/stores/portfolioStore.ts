import { create } from 'zustand';
import type { Portfolio, FactorExposure, RiskMetrics } from '@/types';

interface PortfolioState {
  portfolio: Portfolio | null;
  factors: Record<string, FactorExposure[]>;
  metrics: RiskMetrics | null;
  isLoading: boolean;
  error: string | null;
  setPortfolio: (portfolio: Portfolio) => void;
  setFactors: (factors: Record<string, FactorExposure[]>) => void;
  setMetrics: (metrics: RiskMetrics) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const usePortfolioStore = create<PortfolioState>((set) => ({
  portfolio: null,
  factors: {},
  metrics: null,
  isLoading: false,
  error: null,
  setPortfolio: (portfolio) => set({ portfolio }),
  setFactors: (factors) => set({ factors }),
  setMetrics: (metrics) => set({ metrics }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));
