/**
 * Unit tests for ExplanationService substrate-first routing (IDEA-CIN-1).
 *
 * DeepSeek is THE substrate. Every route away from it is a *named escape*
 * recorded on `result.routing`:
 *   - unconfigured              — no DeepSeek key (secondary substrate or template)
 *   - token_overflow           — prompt over the token ceiling, escape pre-call
 *   - latency_budget_exceeded  — substrate call abandoned past the budget
 *   - provider_down            — HTTP non-2xx, fetch threw, malformed/empty
 *
 * These exercise the routing decision through the public `generate()` entry
 * point and assert on the `result.routing` shape coordinated with the route
 * layer: { substrate, escaped, escapeReason, latencyMs, model }.
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

const baseRequest: ExplanationRequest = {
  type: 'portfolio_move',
  symbol: 'AAPL',
  context: {
    factors: [
      { factor: 'momentum', exposure: 0.7, tStat: 2.4, confidence: 0.85 } as never,
    ],
  },
};

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe('ExplanationService — substrate-first routing (IDEA-CIN-1)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let service: ExplanationService;

  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('DEEPSEEK_API_KEY', '');
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('DEEPSEEK_MODEL', '');
    vi.stubEnv('OPENAI_MODEL', '');
    vi.stubEnv('EXPLAINER_LATENCY_BUDGET_MS', '');
    vi.stubEnv('EXPLAINER_TOKEN_CEILING', '');
    fetchSpy = vi.spyOn(global, 'fetch');
    service = new ExplanationService();
    service.clearCache(); // module-level cache is shared across tests
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  // ----- happy path: DeepSeek substrate, no escape ------------------------

  it('DeepSeek keyed + healthy -> substrate=deepseek, escaped=false, escapeReason=null', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'deep-key');
    fetchSpy.mockResolvedValueOnce(chatResponse('LLM-narrative'));

    const result = await service.generate(baseRequest);

    expect(result.routing.substrate).toBe('deepseek');
    expect(result.routing.escaped).toBe(false);
    expect(result.routing.escapeReason).toBeNull();
    expect(result.routing.model).toBe('deepseek-chat');
    expect(result.routing.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.text).toBe('LLM-narrative');
  });

  it('DeepSeek model id is env-driven, never hardcoded -> routing.model reflects override', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'deep-key');
    vi.stubEnv('DEEPSEEK_MODEL', 'deepseek-reasoner');
    fetchSpy.mockResolvedValueOnce(chatResponse('reasoner-narrative'));

    const result = await service.generate(baseRequest);

    expect(result.routing.substrate).toBe('deepseek');
    expect(result.routing.model).toBe('deepseek-reasoner');
  });

  // ----- escape: unconfigured ---------------------------------------------

  it('No keys -> escape=unconfigured, substrate=template, no fetch', async () => {
    const result = await service.generate(baseRequest);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.routing.substrate).toBe('template');
    expect(result.routing.escaped).toBe(true);
    expect(result.routing.escapeReason).toBe('unconfigured');
    expect(result.routing.model).toBeNull();
    expect(result.routing.latencyMs).toBe(0);
    expect(result.sources).not.toContain('ai_model');
  });

  it('Only OpenAI keyed -> secondary substrate runs, escape=unconfigured (escaped from DeepSeek)', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'oai-key');
    fetchSpy.mockResolvedValueOnce(chatResponse('OAI-narrative'));

    const result = await service.generate(baseRequest);

    expect(result.routing.substrate).toBe('openai');
    expect(result.routing.escaped).toBe(true);
    expect(result.routing.escapeReason).toBe('unconfigured');
    expect(result.routing.model).toBe('gpt-4o-mini');
    expect(result.text).toBe('OAI-narrative');
  });

  // ----- escape: token_overflow -------------------------------------------

  it('Prompt over token ceiling -> escape=token_overflow, no fetch (escape before the call)', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'deep-key');
    vi.stubEnv('EXPLAINER_TOKEN_CEILING', '5'); // ~20 chars; any real prompt overflows

    const result = await service.generate(baseRequest);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.routing.substrate).toBe('template');
    expect(result.routing.escaped).toBe(true);
    expect(result.routing.escapeReason).toBe('token_overflow');
    expect(result.routing.latencyMs).toBe(0);
    expect(result.sources).not.toContain('ai_model');
  });

  // ----- escape: provider_down --------------------------------------------

  it('HTTP 500 -> escape=provider_down, substrate=template, latency recorded', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'deep-key');
    fetchSpy.mockResolvedValueOnce(chatResponse('ignored', 500));

    const result = await service.generate(baseRequest);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.routing.substrate).toBe('template');
    expect(result.routing.escaped).toBe(true);
    expect(result.routing.escapeReason).toBe('provider_down');
    expect(result.routing.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.sources).not.toContain('ai_model');
  });

  it('fetch throws (transport failure) -> escape=provider_down', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'deep-key');
    fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await service.generate(baseRequest);

    expect(result.routing.substrate).toBe('template');
    expect(result.routing.escapeReason).toBe('provider_down');
  });

  it('Empty content from substrate -> escape=provider_down', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'deep-key');
    fetchSpy.mockResolvedValueOnce(chatResponse('   ')); // whitespace -> trim() -> empty

    const result = await service.generate(baseRequest);

    expect(result.routing.substrate).toBe('template');
    expect(result.routing.escapeReason).toBe('provider_down');
  });

  // ----- escape: latency_budget_exceeded ----------------------------------

  it('Substrate call exceeds latency budget -> escape=latency_budget_exceeded', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'deep-key');
    vi.stubEnv('EXPLAINER_LATENCY_BUDGET_MS', '20'); // tight budget

    // fetch that respects the AbortSignal: rejects with an AbortError when the
    // budget timer fires, mirroring how undici aborts an in-flight request.
    fetchSpy.mockImplementationOnce(
      (_url: unknown, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          const signal = init?.signal;
          if (signal) {
            signal.addEventListener('abort', () => {
              const err = new Error('The operation was aborted');
              err.name = 'AbortError';
              reject(err);
            });
          }
          // never resolves on its own — only the abort path fires
        }) as Promise<Response>,
    );

    const result = await service.generate(baseRequest);

    expect(result.routing.substrate).toBe('template');
    expect(result.routing.escaped).toBe(true);
    expect(result.routing.escapeReason).toBe('latency_budget_exceeded');
    expect(result.routing.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.sources).not.toContain('ai_model');
  });

  // ----- cached results carry routing through -----------------------------

  it('Cached result preserves the routing decision from first generation', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'deep-key');
    fetchSpy.mockResolvedValueOnce(chatResponse('first-call'));

    const first = await service.generate(baseRequest);
    const second = await service.generate(baseRequest); // served from cache

    expect(second.cached).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1); // no second upstream call
    expect(second.routing).toEqual(first.routing);
    expect(second.routing.substrate).toBe('deepseek');
  });
});
