import type { VercelRequest, VercelResponse } from '@vercel/node';
import { methodNotAllowed, validationError, unauthorized, internalError } from '../../lib/errorHandler.js';
// Dynamic import to avoid potential side effects
// import { createClient } from '@supabase/supabase-js';

// Get Supabase config - only use if properly configured
async function getSupabaseClient(): Promise<{ client: any | null; error?: string }> {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return { client: null, error: 'Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables' };
  }

  // Validate URL looks like a Supabase URL
  if (!url.includes('supabase.co') && !url.includes('supabase.in')) {
    return { client: null, error: `Invalid SUPABASE_URL format: ${url.substring(0, 30)}...` };
  }

  // Validate key looks like a JWT (starts with eyJ)
  if (!key.startsWith('eyJ')) {
    return { client: null, error: 'Invalid SUPABASE_ANON_KEY format (should be a JWT)' };
  }

  const { createClient } = await import('@supabase/supabase-js');
  return { client: createClient(url, key) };
}

interface LoginRequest {
  email: string;
  password: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return methodNotAllowed(res);
  }

  const requestId = `req-${Math.random().toString(36).slice(2, 8)}`;

  try {
    const { email, password } = req.body as LoginRequest;

    // Validate input
    if (!email || !password) {
      return validationError(res, 'Email and password are required');
    }

    // Get Supabase client (lazy initialization)
    const { client: supabase, error: configError } = await getSupabaseClient();

    // Check if Supabase is configured
    if (!supabase) {
      return res.status(503).json({
        success: false,
        error: { code: 'SERVICE_UNAVAILABLE', message: configError || 'Authentication service not configured.' },
        meta: { requestId },
      });
    }

    // Sign in with Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // Invalid credentials
      if (error.message.includes('Invalid login credentials')) {
        return unauthorized(res, 'Invalid email or password');
      }

      // Email not confirmed
      if (error.message.includes('Email not confirmed')) {
        return unauthorized(res, 'Please confirm your email address');
      }

      return unauthorized(res, 'Authentication failed');
    }

    if (!data.user || !data.session) {
      return unauthorized(res, 'Authentication failed');
    }

    // Return success response
    return res.status(200).json({
      success: true,
      data: {
        user: {
          id: data.user.id,
          email: data.user.email,
          name: data.user.user_metadata?.name || data.user.email?.split('@')[0],
          createdAt: data.user.created_at,
          lastSignIn: data.user.last_sign_in_at,
        },
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at,
        expiresIn: data.session.expires_in,
      },
      meta: { requestId },
    });
  } catch (error) {
    console.error('[Auth] Login error:', error);
    return internalError(res);
  }
}
