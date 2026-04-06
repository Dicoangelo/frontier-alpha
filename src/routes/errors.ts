import type { FastifyInstance } from 'fastify';
import { logger } from '../observability/logger.js';

interface RouteContext { server: unknown; }

const errorLog: Array<{ eventId: string; error: { name: string; message: string; stack?: string }; componentStack?: string; url: string; userAgent: string; timestamp: string }> = [];
const MAX_ERRORS = 1000;

export async function errorsRoutes(fastify: FastifyInstance, _opts: RouteContext) {
  // POST /api/v1/errors/report
  fastify.post<{ Body: { eventId: string; error: { name: string; message: string; stack?: string }; componentStack?: string; url: string; userAgent: string; timestamp: string } }>(
    '/api/v1/errors/report',
    async (request, reply) => {
      const report = request.body;
      if (!report?.eventId || !report?.error?.message) {
        return reply.status(400).send({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid error report' } });
      }
      logger.error({ eventId: report.eventId, error: report.error.name + ': ' + report.error.message, url: report.url, timestamp: report.timestamp }, 'Client error report');
      errorLog.push(report);
      if (errorLog.length > MAX_ERRORS) errorLog.splice(0, errorLog.length - MAX_ERRORS);
      return { success: true, data: { eventId: report.eventId, received: true } };
    }
  );
}
