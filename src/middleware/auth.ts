import { FastifyRequest, FastifyReply } from 'fastify';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in environment variables');
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export interface AuthenticatedUser {
  id: string;
  email: string;
  aud: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
    apiKeyId?: string;
    apiKeyRateLimit?: number;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Hash an API key for comparison against stored hashes.
 * Uses SHA-256 to match what we store at key creation time.
 */
function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Extract API key from request headers.
 * Supports both `Authorization: Bearer <key>` (when key starts with `fa_`)
 * and `X-API-Key: <key>` headers.
 */
function extractApiKey(request: FastifyRequest): string | null {
  // Check X-API-Key header first (explicit API key header)
  const xApiKey = request.headers['x-api-key'];
  if (xApiKey) {
    return Array.isArray(xApiKey) ? xApiKey[0] : xApiKey;
  }

  // Check Authorization: Bearer <key> where key starts with fa_ prefix
  const authHeader = request.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    // API keys use a distinctive prefix to distinguish from JWTs
    if (token.startsWith('fa_')) {
      return token;
    }
  }

  return null;
}

/**
 * Validate an API key against the database.
 * Returns the key record if valid, null otherwise.
 */
async function validateApiKey(apiKey: string): Promise<{
  id: string;
  user_id: string;
  rate_limit: number;
  permissions: Record<string, boolean>;
} | null> {
  const keyHash = hashApiKey(apiKey);

  const { data, error } = await supabase
    .from('frontier_api_keys')
    .select('id, user_id, rate_limit, permissions')
    .eq('key_hash', keyHash)
    .is('revoked_at', null)
    .single();

  if (error || !data) {
    return null;
  }

  // Update last_used_at (fire and forget -- don't block the request)
  Promise.resolve(
    supabase
      .from('frontier_api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', data.id)
  ).catch(() => { /* ignore update failures */ });

  return data;
}

// ============================================================================
// MIDDLEWARE: JWT Auth (Original)
// ============================================================================

/**
 * Authenticate via Supabase JWT Bearer token.
 * Returns 401 if token is missing or invalid.
 */
async function authenticateWithJWT(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<boolean> {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }

  const token = authHeader.substring(7);

  // Skip JWT validation if it looks like an API key
  if (token.startsWith('fa_')) {
    return false;
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return false;
    }

    request.user = {
      id: user.id,
      email: user.email || '',
      aud: user.aud,
    };
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// MIDDLEWARE: API Key Auth
// ============================================================================

/**
 * Authenticate via API key (X-API-Key header or Bearer fa_* token).
 * Sets request.user, request.apiKeyId, and request.apiKeyRateLimit.
 */
async function authenticateWithApiKey(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<boolean> {
  const apiKey = extractApiKey(request);
  if (!apiKey) {
    return false;
  }

  const keyRecord = await validateApiKey(apiKey);
  if (!keyRecord) {
    return false;
  }

  // Fetch the user associated with this API key
  const { data: { user }, error } = await supabase.auth.admin.getUserById(keyRecord.user_id);

  if (error || !user) {
    // If we can't look up the user, still set basic info from key record
    request.user = {
      id: keyRecord.user_id,
      email: '',
      aud: 'authenticated',
    };
  } else {
    request.user = {
      id: user.id,
      email: user.email || '',
      aud: user.aud || 'authenticated',
    };
  }

  // Tag request with API key metadata for rate limiter
  request.apiKeyId = keyRecord.id;
  request.apiKeyRateLimit = keyRecord.rate_limit;

  return true;
}

// ============================================================================
// EXPORTED MIDDLEWARE
// ============================================================================

/**
 * Required authentication middleware.
 * Tries JWT first, then API key. Returns 401 if neither succeeds.
 */
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Try JWT auth first
  if (await authenticateWithJWT(request, reply)) {
    return;
  }

  // Try API key auth
  if (await authenticateWithApiKey(request, reply)) {
    return;
  }

  // Neither worked
  return reply.status(401).send({
    success: false,
    error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
  });
}

/**
 * Optional authentication middleware.
 * Tries JWT then API key, but does not reject unauthenticated requests.
 */
export async function optionalAuthMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  // Try JWT auth
  if (await authenticateWithJWT(request, _reply)) {
    return;
  }

  // Try API key auth
  await authenticateWithApiKey(request, _reply);

  // No auth? That's fine -- it's optional.
}

/**
 * API-key-only authentication middleware.
 * Specifically requires an API key (not a JWT).
 * Useful for machine-to-machine endpoints.
 */
export async function apiKeyAuthMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (await authenticateWithApiKey(request, reply)) {
    return;
  }

  return reply.status(401).send({
    success: false,
    error: { code: 'UNAUTHORIZED', message: 'Valid API key required' },
  });
}

/**
 * Utility: hash an API key (for use when creating keys server-side).
 */
export { hashApiKey };
