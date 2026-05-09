import { api } from './client';

export interface HistoricalPrices {
  symbol: string;
  closes: number[];
  timestamps: string[];
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: { code: string; message: string };
}

export const quotesApi = {
  /**
   * Fetch the last N daily closes for a symbol.
   * Used by the holdings table sparkline + 7-day change cell.
   * Returns `null` on failure so callers can render a graceful em-dash fallback.
   */
  getHistoricalPrices: async (
    symbol: string,
    days: number = 7
  ): Promise<HistoricalPrices | null> => {
    try {
      const response = await api.get<ApiResponse<HistoricalPrices>>(
        `/quotes/${encodeURIComponent(symbol)}/history`,
        { params: { days } }
      );
      // axios interceptor unwraps `response.data`, so `response` is already the JSON body
      const body = response as unknown as ApiResponse<HistoricalPrices>;
      if (!body || !body.success || !body.data) return null;
      return body.data;
    } catch {
      return null;
    }
  },
};
