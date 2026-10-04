import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { callResearchModel, resolveResearchProvider } from '../../src/agent/provider.js';

const config = { name: 'deepseek' as const, apiKey: 'synthetic-private-key', model: 'deepseek-v4-pro', baseUrl: 'https://api.deepseek.com/v1' };
const signal = () => new AbortController().signal;
beforeEach(() => { vi.stubEnv('DEEPSEEK_API_KEY', 'synthetic-private-key'); vi.stubEnv('DEEPSEEK_MODEL', ''); vi.stubEnv('DEEPSEEK_AGENT_MODEL', ''); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('research provider contract', () => {
  it('uses the dedicated override, then current existing model, replacing retired aliases', () => {
    expect(resolveResearchProvider()?.model).toBe('deepseek-v4-pro');
    vi.stubEnv('DEEPSEEK_MODEL', 'deepseek-flash'); expect(resolveResearchProvider()?.model).toBe('deepseek-flash');
    vi.stubEnv('DEEPSEEK_AGENT_MODEL', 'deepseek-v4-pro'); expect(resolveResearchProvider()?.model).toBe('deepseek-v4-pro');
    vi.stubEnv('DEEPSEEK_AGENT_MODEL', 'deepseek-reasoner'); expect(resolveResearchProvider()?.model).toBe('deepseek-v4-pro');
  });
  it('requests bounded JSON with thinking disabled, captures actual usage and drops hidden reasoning', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '{"tools":["quotes"]}', reasoning_content: 'private hidden reasoning' } }], usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 } })));
    vi.stubGlobal('fetch', fetcher);
    const result = await callResearchModel(config, 'Return JSON.', {}, signal());
    expect(result).toEqual({ value: { tools: ['quotes'] }, usage: { promptTokens: 2, completionTokens: 3, totalTokens: 5 } });
    const payload = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(payload).toMatchObject({ model: 'deepseek-v4-pro', max_tokens: 1600, thinking: { type: 'disabled' }, response_format: { type: 'json_object' } });
    expect(JSON.stringify(result)).not.toContain('reasoning');
  });
  it.each(['length', 'content_filter', 'tool_calls'])('rejects incomplete finish reason %s with no retry', async finishReason => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ finish_reason: finishReason, message: { content: '{}' } }] })));
    vi.stubGlobal('fetch', fetcher);
    await expect(callResearchModel(config, 'JSON', {}, signal())).rejects.toMatchObject({ code: 'PROVIDER_INVALID_RESPONSE' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('returns unknown usage instead of fabricated zeros', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '{}' } }] }))));
    expect((await callResearchModel(config, 'JSON', {}, signal())).usage).toBeNull();
  });
  it('bounds provider response size and strips vendor errors', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('x'.repeat(65_000)))
      .mockResolvedValueOnce(new Response('synthetic-private-key vendor detail', { status: 429 }));
    vi.stubGlobal('fetch', fetcher);
    await expect(callResearchModel(config, 'JSON', {}, signal())).rejects.toMatchObject({ code: 'PROVIDER_INVALID_RESPONSE' });
    await expect(callResearchModel(config, 'JSON', {}, signal())).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
  });
  it('classifies timeout as uncertain and never retries', async () => {
    const controller = new AbortController(); controller.abort();
    const fetcher = vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')); vi.stubGlobal('fetch', fetcher);
    await expect(callResearchModel(config, 'JSON', {}, controller.signal)).rejects.toMatchObject({ code: 'RESEARCH_TIMEOUT', statusCode: 504 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
