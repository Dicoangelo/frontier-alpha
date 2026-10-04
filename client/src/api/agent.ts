import { api } from './client';
import type { ResearchRequest, ResearchResult, ResearchStatus } from '@/types/agent';

export const agentApi = {
  async status(): Promise<ResearchStatus> {
    const response = await api.get<never, { data: ResearchStatus }>(new URL('/api/v1/agent/status', window.location.origin).href);
    return response.data;
  },
  async research(request: ResearchRequest): Promise<ResearchResult> {
    const response = await api.post<never, { data: ResearchResult }>(new URL('/api/v1/agent/research', window.location.origin).href, request, { timeout: 95_000 });
    return response.data;
  },
};
