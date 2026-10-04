/** Server-only OpenAI-compatible provider, following the existing explainer's routing. */
export interface ResearchProvider {
  name: 'deepseek' | 'openai';
  model: string;
  apiKey: string;
  baseUrl: string;
}

export function resolveResearchProvider(): ResearchProvider | null {
  if (process.env.DEEPSEEK_API_KEY?.trim()) {
    const configured = process.env.DEEPSEEK_AGENT_MODEL?.trim() || process.env.DEEPSEEK_MODEL?.trim();
    return {
      name: 'deepseek', apiKey: process.env.DEEPSEEK_API_KEY.trim(), baseUrl: 'https://api.deepseek.com/v1',
      model: configured && !['deepseek-chat', 'deepseek-reasoner'].includes(configured) ? configured : 'deepseek-v4-pro',
    };
  }
  if (process.env.OPENAI_API_KEY?.trim()) {
    return {
      name: 'openai', apiKey: process.env.OPENAI_API_KEY.trim(), baseUrl: 'https://api.openai.com/v1',
      model: process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini',
    };
  }
  return null;
}

export class ResearchError extends Error {
  constructor(public code: string, message: string, public statusCode = 503) { super(message); }
}

export interface ModelUsage { promptTokens: number; completionTokens: number; totalTokens: number }
export interface ModelResponse { value: unknown; usage: ModelUsage | null }
export type ModelCall = (provider: ResearchProvider, system: string, input: unknown, signal: AbortSignal) => Promise<ModelResponse>;

export const callResearchModel: ModelCall = async (provider, system, input, signal) => {
  const payload = JSON.stringify(input);
  if (payload.length > 60_000) throw new ResearchError('EVIDENCE_LIMIT', 'Research evidence exceeds the request limit.');
  try {
    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` },
      body: JSON.stringify({
        model: provider.model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: payload }],
        response_format: { type: 'json_object' }, max_tokens: 1600, temperature: 0,
        ...(provider.name === 'deepseek' ? { thinking: { type: 'disabled' } } : {}),
      }),
    });
    // Never return vendor errors: they can contain request text or credentials.
    if (!response.ok) throw new ResearchError('PROVIDER_UNAVAILABLE', 'The research provider could not complete this request.');
    const reader = response.body?.getReader();
    if (!reader) throw new ResearchError('PROVIDER_INVALID_RESPONSE', 'The research provider returned an empty response.');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 64_000) {
          await reader.cancel();
          throw new ResearchError('PROVIDER_INVALID_RESPONSE', 'The research provider exceeded the response limit.');
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const choice = body.choices?.[0];
    if (choice?.finish_reason !== 'stop' || typeof choice?.message?.content !== 'string') {
      throw new ResearchError('PROVIDER_INVALID_RESPONSE', 'The research provider returned an incomplete response.');
    }
    const usage = body.usage;
    const completeUsage = usage && [usage.prompt_tokens, usage.completion_tokens, usage.total_tokens]
      .every(value => Number.isSafeInteger(value) && value >= 0);
    return {
      value: JSON.parse(choice.message.content),
      usage: completeUsage ? {
        promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens, totalTokens: usage.total_tokens,
      } : null,
    };
  } catch (error) {
    if (error instanceof ResearchError) throw error;
    if (signal.aborted) throw new ResearchError('RESEARCH_TIMEOUT', 'Research timed out. The provider outcome may be unknown; this request was not retried.', 504);
    throw new ResearchError('PROVIDER_INVALID_RESPONSE', 'The research provider could not return a valid result. This request was not retried.');
  }
};
