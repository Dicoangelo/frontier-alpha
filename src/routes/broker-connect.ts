/**
 * Per-user broker connection management — Connect Alpaca for Pro+ users.
 *
 * Routes:
 *   POST   /api/v1/broker/connect      — store encrypted Alpaca creds
 *   GET    /api/v1/broker/status       — current broker (simulated | alpaca + paper/live)
 *   POST   /api/v1/broker/disconnect   — revoke creds, fall back to SimulatedBroker
 *
 * Encryption: AES-256-GCM via `src/lib/crypto.ts`. Plaintext keys never persist.
 */
import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth.js';
import { logger } from '../observability/logger.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { encrypt, isCryptoReady } from '../lib/crypto.js';
import { resolveBrokerKindForUser } from '../trading/AlpacaAdapter.js';
import type { APIResponse } from '../types/index.js';

interface RouteContext {
  server: unknown;
}

interface ConnectBody {
  apiKey: string;
  apiSecret: string;
  isPaper?: boolean;
}

async function verifyAlpacaCreds(
  apiKey: string,
  apiSecret: string,
  isPaper: boolean,
): Promise<{ ok: true; accountStatus: string } | { ok: false; error: string }> {
  const base = isPaper ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets';
  try {
    const res = await fetch(`${base}/v2/account`, {
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': apiSecret,
      },
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `Alpaca returned ${res.status}: ${body.slice(0, 200)}` };
    }
    const json = (await res.json()) as { status?: string };
    return { ok: true, accountStatus: json.status ?? 'unknown' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'network error' };
  }
}

export async function brokerConnectRoutes(fastify: FastifyInstance, _opts: RouteContext) {
  // POST /connect ----------------------------------------------------------
  fastify.post<{ Body: ConnectBody; Reply: APIResponse<unknown> }>(
    '/api/v1/broker/connect',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user!;
      const { apiKey, apiSecret, isPaper = true } = request.body || ({} as ConnectBody);

      if (!apiKey || !apiSecret) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'apiKey and apiSecret are required' },
        });
      }

      if (!isCryptoReady()) {
        logger.error('BROKER_CRED_ENC_KEY missing or invalid — broker connect blocked');
        return reply.status(503).send({
          success: false,
          error: {
            code: 'CRYPTO_NOT_CONFIGURED',
            message: 'Server not yet configured to store broker credentials. Try again later.',
          },
        });
      }

      const verify = await verifyAlpacaCreds(apiKey, apiSecret, isPaper);
      if (!verify.ok) {
        const reason = (verify as { ok: false; error: string }).error;
        return reply.status(400).send({
          success: false,
          error: { code: 'ALPACA_VERIFICATION_FAILED', message: reason },
        });
      }

      try {
        await supabaseAdmin.from('user_broker_credentials').upsert(
          {
            user_id: user.id,
            broker: 'alpaca',
            api_key_enc: encrypt(apiKey),
            api_secret_enc: encrypt(apiSecret),
            is_paper: isPaper,
            status: 'active',
            last_verified_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        );
      } catch (err) {
        logger.error({ err, userId: user.id }, 'Failed to persist broker creds');
        return reply.status(500).send({
          success: false,
          error: { code: 'PERSIST_FAILED', message: 'Could not save credentials' },
        });
      }

      return reply.send({
        success: true,
        data: {
          broker: 'alpaca',
          isPaper,
          accountStatus: verify.accountStatus,
        },
      });
    },
  );

  // GET /status ------------------------------------------------------------
  fastify.get<{ Reply: APIResponse<unknown> }>(
    '/api/v1/broker/status',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user!;
      const { kind, source } = await resolveBrokerKindForUser(user.id);

      let lastVerifiedAt: string | null = null;
      let isPaper = true;

      if (source === 'user') {
        try {
          const { data } = await supabaseAdmin
            .from('user_broker_credentials')
            .select('is_paper, last_verified_at')
            .eq('user_id', user.id)
            .eq('status', 'active')
            .maybeSingle();
          if (data) {
            lastVerifiedAt = data.last_verified_at;
            isPaper = data.is_paper !== false;
          }
        } catch {
          // pass
        }
      } else if (source === 'env') {
        isPaper = process.env.ALPACA_PAPER_TRADING !== 'false';
      }

      return reply.send({
        success: true,
        data: {
          broker: kind,
          source, // 'user' | 'env' | 'simulated'
          isPaper,
          lastVerifiedAt,
        },
      });
    },
  );

  // POST /disconnect -------------------------------------------------------
  fastify.post<{ Reply: APIResponse<unknown> }>(
    '/api/v1/broker/disconnect',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user!;

      try {
        await supabaseAdmin
          .from('user_broker_credentials')
          .update({
            status: 'revoked',
            // Wipe the ciphertext so a re-decrypt attempt with a stale key
            // can't expose anything. Re-connecting writes a fresh envelope.
            api_key_enc: '',
            api_secret_enc: '',
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', user.id);
      } catch (err) {
        logger.error({ err, userId: user.id }, 'Failed to revoke broker creds');
        return reply.status(500).send({
          success: false,
          error: { code: 'REVOKE_FAILED', message: 'Could not disconnect broker' },
        });
      }

      return reply.send({
        success: true,
        data: { broker: 'simulated' },
      });
    },
  );
}
