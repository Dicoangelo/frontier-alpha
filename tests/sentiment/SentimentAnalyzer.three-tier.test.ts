/**
 * Unit tests for SentimentAnalyzer's 3-tier fallback chain:
 *  Tier 1: ML_SENTIMENT_ENDPOINT (FinBERT)  -> if 200 OK, returns parsed score
 *  Tier 2: DEEPSEEK_API_KEY / OPENAI_API_KEY -> calls /v1/chat/completions, parses JSON
 *  Tier 3: keyword analysis (always succeeds, deterministic from keyword bag)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Hoisted env so the supabase module's import-time guard never trips even
// though SentimentAnalyzer doesn't import supabase. Belt-and-suspenders.
vi.hoisted(() => {
  process.env.SUPABASE_URL ??= 'http://localhost:54321';
  process.env.SUPABASE_SERVICE_KEY ??= 'test-service-key';
});

// Silence logger output
vi.mock('../../src/lib/logger.js', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { SentimentAnalyzer } from '../../src/sentiment/SentimentAnalyzer.js';

// ---------------------------------------------------------------------------
// fetch helpers
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function llmChatResponse(content: string, status = 200): Response {
  return jsonResponse(
    { choices: [{ message: { content } }] },
    status,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SentimentAnalyzer.analyze() — three-tier fallback', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Wipe env BEFORE each test — constructor reads ML_SENTIMENT_ENDPOINT.
    vi.unstubAllEnvs();
    vi.stubEnv('ML_SENTIMENT_ENDPOINT', '');
    vi.stubEnv('DEEPSEEK_API_KEY', '');
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('DEEPSEEK_MODEL', '');
    vi.stubEnv('OPENAI_MODEL', '');
    fetchSpy = vi.spyOn(global, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  // -------------------------------------------------------------------------
  // Tier 1 — FinBERT
  // -------------------------------------------------------------------------

  it('Tier 1: FinBERT endpoint returns valid JSON -> uses ML result', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse([
        {
          label: 'positive',
          confidence: 0.91,
          scores: { positive: 0.91, neutral: 0.05, negative: 0.04 },
        },
      ]),
    );

    const analyzer = new SentimentAnalyzer('http://ml.local');
    const result = await analyzer.analyze('blockbuster quarter, earnings beat');

    expect(result.label).toBe('positive');
    expect(result.confidence).toBeCloseTo(0.91, 5);
    expect(result.scores.positive).toBeCloseTo(0.91, 5);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe('http://ml.local/sentiment');
  });

  it('Tier 1 -> Tier 3: ML endpoint returns 500, falls through to keyword (no LLM key)', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ error: 'boom' }, 500));

    const analyzer = new SentimentAnalyzer('http://ml.local');
    const result = await analyzer.analyze('beat beat strong rally');

    // 1 call to ML, then keyword fallback (no LLM key set)
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.label).toBe('positive');
    expect(result.scores.positive).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Tier 2 — LLM
  // -------------------------------------------------------------------------

  it('Tier 2: ML unset, DEEPSEEK_API_KEY set -> LLM tier runs and returns parsed score', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'deep-key');

    fetchSpy.mockResolvedValueOnce(
      llmChatResponse(
        JSON.stringify({
          label: 'negative',
          confidence: 0.74,
          scores: { positive: 0.1, neutral: 0.16, negative: 0.74 },
        }),
      ),
    );

    const analyzer = new SentimentAnalyzer();
    const result = await analyzer.analyze('layoffs and lawsuit');

    expect(result.label).toBe('negative');
    expect(result.confidence).toBeCloseTo(0.74, 5);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain('api.deepseek.com');
  });

  it('Tier 2: LLM returns markdown-fenced JSON ```json {...} ``` -> strips fences and parses', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'oai-key');

    const fenced =
      '```json\n' +
      JSON.stringify({
        label: 'positive',
        confidence: 0.8,
        scores: { positive: 0.8, neutral: 0.15, negative: 0.05 },
      }) +
      '\n```';

    fetchSpy.mockResolvedValueOnce(llmChatResponse(fenced));

    const analyzer = new SentimentAnalyzer();
    const result = await analyzer.analyze('upgrade, momentum');

    expect(result.label).toBe('positive');
    expect(result.confidence).toBeCloseTo(0.8, 5);
  });

  it('Tier 2: invalid label "BULL" -> clamped to neutral, confidence preserved', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'oai-key');

    fetchSpy.mockResolvedValueOnce(
      llmChatResponse(
        JSON.stringify({
          label: 'BULL',
          confidence: 0.6,
          scores: { positive: 0.6, neutral: 0.3, negative: 0.1 },
        }),
      ),
    );

    const analyzer = new SentimentAnalyzer();
    const result = await analyzer.analyze('text');

    expect(result.label).toBe('neutral');
    expect(result.confidence).toBeCloseTo(0.6, 5);
  });

  it('Tier 2: confidence > 1 from LLM -> clamped to 1', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'oai-key');

    fetchSpy.mockResolvedValueOnce(
      llmChatResponse(
        JSON.stringify({
          label: 'positive',
          confidence: 7.5,
          scores: { positive: 0.99, neutral: 0.005, negative: 0.005 },
        }),
      ),
    );

    const analyzer = new SentimentAnalyzer();
    const result = await analyzer.analyze('text');
    expect(result.confidence).toBe(1);
  });

  it('Tier 2: confidence < 0 from LLM -> clamped to 0', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'oai-key');

    fetchSpy.mockResolvedValueOnce(
      llmChatResponse(
        JSON.stringify({
          label: 'neutral',
          confidence: -0.4,
          scores: { positive: 0.2, neutral: 0.6, negative: 0.2 },
        }),
      ),
    );

    const analyzer = new SentimentAnalyzer();
    const result = await analyzer.analyze('text');
    expect(result.confidence).toBe(0);
  });

  it('Tier 2 -> Tier 3: LLM fetch throws (network error) -> falls through to keyword', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'deep-key');
    fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const analyzer = new SentimentAnalyzer();
    const result = await analyzer.analyze('miss disappointing weak loss');

    // Keyword tier always returns a valid SentimentScore
    expect(result.label).toBe('negative');
    expect(['positive', 'neutral', 'negative']).toContain(result.label);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // Tier 3 — keyword
  // -------------------------------------------------------------------------

  it('Tier 3: all 3 tiers unset -> keyword analysis returns valid SentimentScore', async () => {
    const analyzer = new SentimentAnalyzer();
    const result = await analyzer.analyze('robust growth, beat estimates, strong buyback');

    expect(['positive', 'neutral', 'negative']).toContain(result.label);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.scores).toHaveProperty('positive');
    expect(result.scores).toHaveProperty('neutral');
    expect(result.scores).toHaveProperty('negative');
    // No fetch calls — no ML, no LLM
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
