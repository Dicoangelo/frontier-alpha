import { api } from './client';
import type { EarningsEvent, EarningsImpactForecast } from '@/types';

export interface EarningsCalendarItem extends EarningsEvent {
  id: string;
  fiscalQuarter: string;
  estimatedEps?: number;
  actualEps?: number;
  status: 'upcoming' | 'confirmed' | 'reported';
  reportTime?: 'pre_market' | 'post_market' | 'during_market' | 'unknown';
  daysUntil: number;
}

export interface EarningsHistory {
  symbol: string;
  reportDate: Date;
  fiscalQuarter: string;
  priceChangePost: number;
  volumeRatio: number;
  actualMove: number;
}

export const earningsApi = {
  getUpcoming: async (symbols: string[], daysAhead: number = 30): Promise<EarningsCalendarItem[]> => {
    if (symbols.length === 0) {
      return [];
    }
    const response = await api.get('/earnings/upcoming', {
      params: { symbols: symbols.join(','), daysAhead },
    });
    return response.data.map((item: EarningsCalendarItem) => ({
      ...item,
      reportDate: new Date(item.reportDate),
      daysUntil: Math.ceil((new Date(item.reportDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
    }));
  },

  getForecast: async (symbol: string): Promise<EarningsImpactForecast> => {
    const response = await api.get(`/earnings/forecast/${symbol}`);
    return {
      ...response.data,
      reportDate: new Date(response.data.reportDate),
    };
  },

  getHistory: async (symbol: string, limit: number = 8): Promise<EarningsHistory[]> => {
    const response = await api.get(`/earnings/history/${symbol}`, {
      params: { limit },
    });
    return response.data.map((item: EarningsHistory) => ({
      ...item,
      reportDate: new Date(item.reportDate),
    }));
  },

  refreshForecast: async (symbol: string): Promise<EarningsImpactForecast> => {
    const response = await api.post(`/earnings/forecast/${symbol}/refresh`);
    return {
      ...response.data,
      reportDate: new Date(response.data.reportDate),
    };
  },
};
