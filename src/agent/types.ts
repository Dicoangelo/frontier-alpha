export type ResearchToolId = 'portfolio' | 'quotes' | 'price_history' | 'factor_exposures';

export interface ResearchRequest {
  question: string;
  symbols?: string[];
  includePortfolio?: boolean;
}

export interface ResearchSource {
  id: string;
  title: string;
  kind: ResearchToolId;
  symbol?: string;
  observedAt: string;
  asOf: string | null;
  content: string;
  contentHash: string;
}

export interface ResearchClaim {
  text: string;
  sourceIds: string[];
}

export interface ResearchStep {
  tool: ResearchToolId | 'plan' | 'synthesis' | 'verification';
  status: 'completed' | 'unavailable' | 'withheld';
  detail: string;
}

export interface ResearchStatus {
  enabled: boolean;
  provider: 'deepseek' | 'openai' | null;
  model: string | null;
  tools: Array<{ id: ResearchToolId; label: string; description: string }>;
  limits: { maxSymbols: number; maxQuestionLength: number; maxDurationMs: number; maxModelCalls: number };
  persistence: 'none';
}

export interface ResearchResult {
  id: string;
  status: 'completed' | 'partial' | 'abstained';
  answer: string;
  claims: ResearchClaim[];
  sources: ResearchSource[];
  steps: ResearchStep[];
  warnings: string[];
  verification: {
    status: 'passed' | 'withheld';
    policy: string;
    checkedClaims: number;
    method: 'separate_model_judgment';
  };
  receipt: {
    provider: 'deepseek' | 'openai';
    model: string;
    requestHash: string;
    evidenceHash: string;
    answerHash: string;
    generatedAt: string;
    latencyMs: number;
    modelCalls: number;
    usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
    executionAuthorized: false;
    persistence: 'none';
  };
}
