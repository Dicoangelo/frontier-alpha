import { api } from './client';

/** One node in the decision provenance DAG (IDEA-FF-3). */
export interface ProvenanceNode {
  id: string;
  user_id: string | null;
  node_type:
    | 'market_data'
    | 'factor_compute'
    | 'optimizer_run'
    | 'recommendation'
    | 'insight'
    | 'user_action';
  label: string;
  payload: Record<string, unknown>;
  parents: string[];
  created_at: string;
}

export interface ProvenanceRecentResult {
  nodes: ProvenanceNode[];
  total: number;
  limit: number;
  offset: number;
}

export interface ProvenanceLineageResult {
  nodes: ProvenanceNode[];
  edges: Array<{ from: string; to: string }>;
  truncated: boolean;
}

export const provenanceApi = {
  getRecent: async (
    params: { limit?: number; offset?: number; nodeType?: ProvenanceNode['node_type'] } = {},
  ): Promise<ProvenanceRecentResult> => {
    const response = await api.get('/provenance/recent', { params });
    return response.data;
  },

  getLineage: async (id: string): Promise<ProvenanceLineageResult> => {
    const response = await api.get(`/provenance/${id}/lineage`);
    return response.data;
  },
};
