import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { ResearchService, researchRequestSchema, researchStatus, type ResearchDependencies } from '../agent/ResearchService.js';
import { readResearchPortfolio } from '../agent/portfolio.js';
import { ResearchError } from '../agent/provider.js';

interface RouteContext {
  server: Pick<ResearchDependencies, 'dataProvider' | 'factorEngine'>;
}

/** The existing atomic shared limiter is the admission budget; unavailable storage fails closed. */
async function admit(actorId: string): Promise<boolean> {
  const signal = AbortSignal.timeout(3000);
  const query = supabaseAdmin.rpc('rate_limit_check', {
    p_identifier: `research:${actorId}`, p_limit: 4, p_window_ms: 60_000,
  }).abortSignal(signal);
  let onAbort: () => void;
  const timeout = new Promise<never>((_, reject) => {
    onAbort = () => reject(new ResearchError('ADMISSION_UNAVAILABLE', 'Research admission timed out. No AI request was started.'));
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  });
  let outcome: Awaited<typeof query>;
  try { outcome = await Promise.race([query, timeout]); }
  finally { signal.removeEventListener('abort', onAbort); }
  const { data, error } = outcome;
  if (error || !data || (Array.isArray(data) && !data.length)) {
    throw new ResearchError('ADMISSION_UNAVAILABLE', 'Research admission is temporarily unavailable. No AI request was started.');
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (typeof row.allowed !== 'boolean') throw new ResearchError('ADMISSION_UNAVAILABLE', 'Research admission is temporarily unavailable.');
  return row.allowed;
}

export async function agentRoutes(app: FastifyInstance, opts: RouteContext) {
  const service = new ResearchService({ ...opts.server, readPortfolio: readResearchPortfolio });
  const active = new Set<string>();
  app.addHook('preHandler', authMiddleware);
  app.addHook('preHandler', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (!request.user?.id || (request.apiKeyId && !request.apiKeyOwnerVerified)) {
      return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'A verified account is required.' } });
    }
    if (request.apiKeyId && request.apiKeyPermissions?.read !== true) {
      return reply.code(403).send({ success: false, error: { code: 'READ_PERMISSION_REQUIRED', message: 'This API key does not have read permission.' } });
    }
  });

  app.get('/api/v1/agent/status', async () => ({ success: true, data: researchStatus() }));

  app.post('/api/v1/agent/research', { bodyLimit: 8192 }, async (request, reply) => {
    const parsed = researchRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ success: false, error: {
      code: 'VALIDATION_ERROR', message: 'Enter a question of 3–1200 characters and up to four valid ticker symbols. Only question, symbols, and includePortfolio are accepted.',
    } });
    if (!researchStatus().enabled) return reply.code(503).send({ success: false, error: {
      code: 'AGENT_NOT_CONFIGURED', message: 'Research is unavailable until a server-side AI provider is configured.',
    } });
    const actorId = request.user.id;
    // This is an extra per-process concurrency guard, not a durable job queue.
    if (active.has(actorId) || active.size >= 4) {
      return reply.header('Retry-After', 15).code(429).send({ success: false, error: {
        code: 'RESEARCH_BUSY', message: 'Research is already running or capacity is full. No additional AI request was started.',
      } });
    }
    active.add(actorId);
    try {
      if (!await admit(actorId)) return reply.header('Retry-After', 60).code(429).send({ success: false, error: {
        code: 'RATE_LIMITED', message: 'Research is limited to four requests per account per minute. No additional AI request was started.',
      } });
      const data = await service.research(actorId, { ...parsed.data, question: parsed.data.question });
      return { success: true, data };
    } catch (error) {
      const known = error instanceof ResearchError;
      return reply.code(known ? error.statusCode : 503).send({ success: false, error: {
        code: known ? error.code : 'RESEARCH_UNAVAILABLE',
        message: known ? error.message : 'Research could not complete. This request was not automatically retried.',
      } });
    } finally { active.delete(actorId); }
  });
}
