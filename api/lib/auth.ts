/**
 * Authentication utilities for Vercel serverless functions
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { unauthorized } from './errorHandler.js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export interface AuthenticatedUser {
  id: string;
  email: string;
  aud: string;
}

/**
 * Verify JWT token and return user info.
 * Returns null if authentication fails.
 */
export async function verifyAuth(req: VercelRequest): Promise<AuthenticatedUser | null> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email || '',
      aud: user.aud,
    };
  } catch {
    return null;
  }
}

/**
 * Middleware to require authentication.
 * Returns 401 response if authentication fails.
 * Returns null if authentication succeeds (caller should continue).
 */
export async function requireAuth(
  req: VercelRequest,
  res: VercelResponse
): Promise<AuthenticatedUser | null> {
  const user = await verifyAuth(req);

  if (!user) {
    unauthorized(res);
    return null;
  }

  return user;
}
