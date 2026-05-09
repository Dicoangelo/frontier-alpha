/**
 * Request tracing middleware (US-008).
 *
 * Threads a request id from the server back to the client so that:
 *   1. Server logs (pino) and client console.error reference the same id
 *   2. Sentry events on either side can be cross-correlated by tag
 *   3. The weekly digest can quote the id in incident summaries
 *
 * Implementation:
 *   - Fastify already generates `request.id` per request (uuid v4 by default
 *     when `genReqId` is not overridden). We don't replace it; we only
 *     promote it onto the response header so the client sees it.
 *   - The header name is `X-Request-Id`. If a client supplied one on the
 *     way in (rare today, but useful for retries), we honor it by setting
 *     the header back to whatever Fastify decided to use.
 *   - `installRequestTracing(app)` attaches an `onSend` hook (not `onRequest`
 *     or `onResponse`) so we can mutate headers right before they ship.
 *
 * The client side (`client/src/api/client.ts`) reads this header in the
 * `axios.interceptors.response` chain and logs it on console.error, so an
 * operator chasing a 500 has the id in front of them.
 */

import type { FastifyInstance } from 'fastify';

export const REQUEST_ID_HEADER = 'x-request-id';

export function installRequestTracing(app: FastifyInstance): void {
  app.addHook('onSend', async (request, reply, payload) => {
    // Fastify always populates `request.id` (default genReqId is uuid v4).
    // The header is case-insensitive on the wire; we set lowercase to match
    // pino + the Fastify response API conventions.
    if (!reply.getHeader(REQUEST_ID_HEADER)) {
      reply.header(REQUEST_ID_HEADER, request.id);
    }
    return payload;
  });
}
