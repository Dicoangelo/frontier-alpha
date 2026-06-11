import type { FastifyInstance } from 'fastify';
import { forensicSeal, type SealedReceipt } from '../forensics/ForensicSeal.js';
import type { APIResponse } from '../types/index.js';

/**
 * ForensicSeal routes (IDEA-FF-4).
 *
 * PUBLIC by design — the whole point of a seal is that a third party can
 * verify it without an account or any trust in our database.
 *
 * GET  /api/v1/seal/public-key — this server's current verification key
 * POST /api/v1/seal/verify     — verify a receipt (+ optionally its subject)
 */
export async function sealRoutes(fastify: FastifyInstance) {
  fastify.get<{ Reply: APIResponse<unknown> }>('/api/v1/seal/public-key', async () => {
    return {
      success: true,
      data: {
        algorithm: 'Ed25519',
        format: 'spki-der-base64',
        publicKey: forensicSeal.publicKey,
        keyMode: forensicSeal.keyMode,
      },
    };
  });

  fastify.post<{
    Body: { receipt?: SealedReceipt; subject?: unknown };
    Reply: APIResponse<unknown>;
  }>('/api/v1/seal/verify', async (request, reply) => {
    const { receipt, subject } = request.body ?? {};

    if (
      !receipt ||
      typeof receipt.sealId !== 'string' ||
      typeof receipt.subjectHash !== 'string' ||
      typeof receipt.publicKey !== 'string' ||
      typeof receipt.signature !== 'string'
    ) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'A complete receipt object is required' },
      });
    }

    const result = forensicSeal.verify(receipt, subject);
    return { success: true, data: result };
  });
}
