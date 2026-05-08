/**
 * Unit tests for ExplanationService LLM provider resolution.
 *
 * `resolveLLMProvider()` is private — we exercise it indirectly through the
 * public `generate()` entry point (which calls `generateWithLLM` -> `fetch`)
 * and assert on the `fetch` mock.
 *
 * Provider priority per resolveLLMProvider():
 *   1. DEEPSEEK_API_KEY  -> https://api.deepseek.com/v1, model 'deepseek-chat'
 *   2. OPENAI_API_KEY    -> https://api.openai.com/v1,   model 'gpt-4o-mini'
 *   3. neither           -> null (template fallback path)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Hoisted env so anything that loads supabase indirectly does not blow up.
vi.hoisted(() => {
  process.env.SUPABASE_URL ??= 'http://localhost:54321';
  process.env.SUPABASE_SERVICE_KEY ??= 'test-service-key';
});

vi.mock('../../src/lib/logger.js', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { ExplanationService } from '../../src/services/ExplanationService.js';
import type { ExplanationRequest } from '../../src/services/ExplanationService.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function chatResponse(content: string | null, status = 200): Response {
  const body =
    content === null
      ? { choices: [{ message: {} }] }
      : { choices: [{ message: { content } }] };
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function badJsonResponse(status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ choices: 'not-an-array' }), // malformed
    text: async () => 'malformed',
  } as unknown as Response;
}

const baseRequest: ExplanationRequest = {
  type: 'portfolio_move',
  symbol: 'AAPL',
  context: {
    factors: [
      // Triggers significantFactors path so the prompt has substance.
      // Shape from src/types: factor, exposure, tStat, confidence
      { factor: 'momentum', exposure: 0.7, tStat: 2.4, confidence: 0.85 } as never,
    ],
  },
};

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe('ExplanationService.generate() — LLM provider resolution', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let service: ExplanationService;

  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('DEEPSEEK_API_KEY', '');
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('DEEPSEEK_MODEL', '');
    vi.stubEnv('OPENAI_MODEL', '');
    fetchSpy = vi.spyOn(global, 'fetch');
    service = new ExplanationService();
    service.clearCache(); // The module-level cache is shared across tests.
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  // -------------------------------------------------------------------------

  it('DEEPSEEK_API_KEY set, OPENAI not -> fetch hits deepseek.com with model=deepseek-chat', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'deep-key');
    fetchSpy.mockResolvedValueOnce(chatResponse('LLM-narrative'));

    const result = await service.generate(baseRequest);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.deepseek.com/v1/chat/completions');
    const body = JSON.parse(init.body as string) as { model: string };
    expect(body.model).toBe('deepseek-chat');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer deep-key');
    expect(result.text).toBe('LLM-narrative');
    expect(result.sources).toContain('ai_model');
  });

  it('OPENAI_API_KEY set, DEEPSEEK not -> fetch hits openai.com with model=gpt-4o-mini', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'oai-key');
    fetchSpy.mockResolvedValueOnce(chatResponse('OAI-narrative'));

    const result = await service.generate(baseRequest);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    const body = JSON.parse(init.body as string) as { model: string };
    expect(body.model).toBe('gpt-4o-mini');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer oai-key');
    expect(result.text).toBe('OAI-narrative');
  });

  it('Both keys set -> DeepSeek wins (priority order)', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'deep-key');
    vi.stubEnv('OPENAI_API_KEY', 'oai-key');
    fetchSpy.mockResolvedValueOnce(chatResponse('priority-deepseek'));

    await service.generate(baseRequest);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('api.deepseek.com');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer deep-key');
  });

  it('Neither key set -> no fetch, returns template-based result', async () => {
    const result = await service.generate(baseRequest);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.text).toBeTruthy();
    expect(result.sources).not.toContain('ai_model');
    expect(result.sources).toContain('factor_engine');
  });

  it('DEEPSEEK_MODEL=deepseek-coder env override -> fetch body uses overridden model', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'deep-key');
    vi.stubEnv('DEEPSEEK_MODEL', 'deepseek-coder');
    fetchSpy.mockResolvedValueOnce(chatResponse('coder-narrative'));

    await service.generate(baseRequest);

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string) as { model: string };
    expect(body.model).toBe('deepseek-coder');
  });

  it('HTTP 500 from LLM -> graceful fallback to template (no throw)', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'deep-key');
    fetchSpy.mockResolvedValueOnce(chatResponse('ignored', 500));

    const result = await service.generate(baseRequest);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // Falls back to template — sources should NOT include ai_model
    expect(result.sources).not.toContain('ai_model');
    expect(result.text).toBeTruthy();
  });

  it('Malformed JSON in choices array -> returns null, falls back to template', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'deep-key');
    fetchSpy.mockResolvedValueOnce(badJsonResponse(200));

    const result = await service.generate(baseRequest);

    // The .choices?.[0]?.message?.content?.trim() chain returns undefined on
    // malformed shapes. generateWithLLM returns null -> template path.
    expect(result.sources).not.toContain('ai_model');
    expect(result.text).toBeTruthy();
  });

  it('Empty choices.message.content -> returns null, falls back to template', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'deep-key');
    fetchSpy.mockResolvedValueOnce(chatResponse('   ')); // whitespace -> trim() -> empty

    const result = await service.generate(baseRequest);

    expect(result.sources).not.toContain('ai_model');
    expect(result.text).toBeTruthy();
  });
});
