import { api } from './client';

/** One provenance receipt as returned by the ledger history endpoint. */
export interface InsightLedgerEntry {
  id: string;
  user_id: string;
  generated_at: string;
  prompt_hash: string;
  factors_snapshot: Record<string, unknown>;
  model: string | null;
  substrate: string | null;
  escaped: boolean;
  escape_reason: string | null;
  output: string | null;
  cost_cents: number | null;
  latency_ms: number | null;
  user_rating: number | null;
  created_at: string;
}

export interface InsightHistoryResult {
  entries: InsightLedgerEntry[];
  total: number;
  limit: number;
  offset: number;
}

export const insightsApi = {
  getHistory: async (params: { limit?: number; offset?: number } = {}): Promise<InsightHistoryResult> => {
    const response = await api.get('/insights/history', { params });
    return response.data;
  },

  rate: async (id: string, rating: number): Promise<InsightLedgerEntry> => {
    const response = await api.post(`/insights/${id}/rating`, { rating });
    return response.data;
  },
};
