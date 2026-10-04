import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

const { rpc, run, admission } = vi.hoisted(() => ({ rpc: vi.fn(), run: vi.fn(), admission: vi.fn() }));
vi.mock('../../src/lib/supabase.js', () => ({ supabaseAdmin: { rpc } }));
vi.mock('../../src/middleware/auth.js', () => ({ authMiddleware: async (request, reply) => {
  if (!request.headers.authorization) return reply.code(401).send({ success: false });
  request.user = { id: request.headers.authorization, email: '', aud: 'authenticated' };
  if (request.headers['x-key']) {
    request.apiKeyId = 'key-1'; request.apiKeyPermissions = { read: request.headers['x-read'] === 'yes' };
    request.apiKeyOwnerVerified = request.headers['x-owner'] === 'yes';
  }
} }));
vi.mock('../../src/agent/ResearchService.js', async importOriginal => {
  const original = await importOriginal<typeof import('../../src/agent/ResearchService.js')>();
  return { ...original, ResearchService: class { research = run; } };
});
import { agentRoutes } from '../../src/routes/agent.js';

let app: FastifyInstance;
beforeEach(async () => {
  vi.stubEnv('DEEPSEEK_API_KEY', 'synthetic-provider-key'); vi.clearAllMocks();
  rpc.mockImplementation(() => ({ abortSignal: admission }));
  admission.mockResolvedValue({ data: [{ allowed: true }], error: null });
  run.mockResolvedValue({ status: 'completed', sources: [] });
  app = Fastify();
  await app.register(agentRoutes, { server: { dataProvider: {} as never, factorEngine: {} as never } });
});
afterEach(async () => { await app.close(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
const valid = { question: 'Describe AAPL price', symbols: ['AAPL'] };

describe('authenticated research routes', () => {
  it('denies anonymous access to both surfaces before any service call', async () => {
    expect((await app.inject({ url: '/api/v1/agent/status' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/v1/agent/research', payload: valid })).statusCode).toBe(401);
    expect(rpc).not.toHaveBeenCalled(); expect(run).not.toHaveBeenCalled();
  });
  it('serves secret-free capability descriptors without starting research', async () => {
    const res = await app.inject({ url: '/api/v1/agent/status', headers: { authorization: 'actor' } });
    expect(res.statusCode).toBe(200); expect(res.headers['cache-control']).toBe('no-store');
    expect(res.json().data.tools[0]).toMatchObject({ id: 'portfolio', label: expect.any(String), description: expect.any(String) });
    expect(res.body).not.toContain('synthetic-provider-key'); expect(rpc).not.toHaveBeenCalled();
  });
  it('rejects an API key without read permission or a currently verified owner', async () => {
    const denied = await app.inject({ method: 'POST', url: '/api/v1/agent/research', payload: valid,
      headers: { authorization: 'actor', 'x-key': 'yes', 'x-owner': 'yes', 'x-read': 'no' } });
    expect(denied.statusCode).toBe(403);
    const deleted = await app.inject({ url: '/api/v1/agent/status', headers: { authorization: 'actor', 'x-key': 'yes', 'x-owner': 'no', 'x-read': 'yes' } });
    expect(deleted.statusCode).toBe(401); expect(run).not.toHaveBeenCalled();
  });
  it('uses only the authenticated actor for both shared admission and portfolio scope', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/agent/research', payload: { ...valid, includePortfolio: true }, headers: { authorization: 'actor-one' } });
    expect(res.statusCode).toBe(200);
    expect(rpc).toHaveBeenCalledWith('rate_limit_check', { p_identifier: 'research:actor-one', p_limit: 4, p_window_ms: 60_000 });
    expect(run).toHaveBeenCalledWith('actor-one', { ...valid, includePortfolio: true });
    const forged = await app.inject({ method: 'POST', url: '/api/v1/agent/research', payload: { ...valid, userId: 'actor-two' }, headers: { authorization: 'actor-one' } });
    expect(forged.statusCode).toBe(400); expect(run).toHaveBeenCalledTimes(1);
  });
  it.each([{ data: [{ allowed: false }], error: null }, { data: null, error: { message: 'private db detail' } }])('does not start AI on denied/unavailable admission', async value => {
    admission.mockResolvedValue(value);
    const res = await app.inject({ method: 'POST', url: '/api/v1/agent/research', payload: valid, headers: { authorization: 'actor' } });
    expect(res.statusCode).toBe(value.error ? 503 : 429); expect(res.body).not.toContain('private db detail'); expect(run).not.toHaveBeenCalled();
  });
  it('does not admit overlapping requests for the same actor and releases the slot after completion', async () => {
    let finish: (value: unknown) => void;
    run.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const first = app.inject({ method: 'POST', url: '/api/v1/agent/research', payload: valid, headers: { authorization: 'actor' } });
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    const second = await app.inject({ method: 'POST', url: '/api/v1/agent/research', payload: valid, headers: { authorization: 'actor' } });
    expect(second.statusCode).toBe(429); expect(rpc).toHaveBeenCalledTimes(1);
    finish({ status: 'completed' }); expect((await first).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/v1/agent/research', payload: valid, headers: { authorization: 'actor' } })).statusCode).toBe(200);
  });
  it('bounds a hung admission RPC and releases the actor slot without starting AI', async () => {
    const controller = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValueOnce(controller.signal);
    admission.mockImplementationOnce(() => new Promise(() => {}));
    const first = app.inject({ method: 'POST', url: '/api/v1/agent/research', payload: valid, headers: { authorization: 'actor' } });
    await vi.waitFor(() => expect(admission).toHaveBeenCalledOnce());
    controller.abort();
    const result = await first;
    expect(result.statusCode).toBe(503); expect(run).not.toHaveBeenCalled();
    const next = await app.inject({ method: 'POST', url: '/api/v1/agent/research', payload: valid, headers: { authorization: 'actor' } });
    expect(next.statusCode).toBe(200); expect(run).toHaveBeenCalledOnce();
  });
});
