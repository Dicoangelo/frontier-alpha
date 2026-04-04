/**
 * Auth routes — Supabase-backed login, signup, logout, refresh, me.
 *
 * Ported from the hand-written Vercel functions in `api/v1/auth/*` to unify
 * on the single Fastify surface exposed via `buildApp()`. These handlers do
 * not use the global `authMiddleware` because login/signup/refresh issue
 * tokens (unauthenticated entry points); logout and `me` verify the bearer
 * token inline via `supabase.auth.getUser()` so we can return structured
 * 401s matching the legacy error envelope.
 */

import type { FastifyInstance } from 'fastify';
import { supabaseAdmin } from '../lib/supabase.js';
import { logger } from '../observability/logger.js';
import type { APIResponse } from '../types/index.js';

interface RouteContext {
  server: unknown;
}

interface LoginBody {
  email?: string;
  password?: string;
}

interface SignupBody {
  email?: string;
  password?: string;
  name?: string;
}

interface RefreshBody {
  refreshToken?: string;
}

function extractBearer(header: string | string[] | undefined): string | null {
  if (!header || Array.isArray(header)) return null;
  if (!header.startsWith('Bearer ')) return null;
  return header.substring(7);
}

export async function authRoutes(fastify: FastifyInstance, _opts: RouteContext) {
  // POST /api/v1/auth/login
  fastify.post<{ Body: LoginBody; Reply: APIResponse<unknown> }>(
    '/api/v1/auth/login',
    async (request, reply) => {
      const start = Date.now();
      const { email, password } = request.body || {};

      if (!email || !password) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Email and password are required' },
        });
      }

      const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password });

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          return reply.status(401).send({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' },
          });
        }
        if (error.message.includes('Email not confirmed')) {
          return reply.status(401).send({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Please confirm your email address' },
          });
        }
        return reply.status(401).send({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication failed' },
        });
      }

      if (!data.user || !data.session) {
        return reply.status(401).send({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication failed' },
        });
      }

      return {
        success: true,
        data: {
          user: {
            id: data.user.id,
            email: data.user.email,
            name: (data.user.user_metadata as { name?: string } | null)?.name || data.user.email?.split('@')[0],
            createdAt: data.user.created_at,
            lastSignIn: data.user.last_sign_in_at,
          },
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
          expiresAt: data.session.expires_at,
          expiresIn: data.session.expires_in,
        },
        meta: { timestamp: new Date(), requestId: request.id, latencyMs: Date.now() - start },
      };
    }
  );

  // POST /api/v1/auth/signup
  fastify.post<{ Body: SignupBody; Reply: APIResponse<unknown> }>(
    '/api/v1/auth/signup',
    async (request, reply) => {
      const start = Date.now();
      const { email, password, name } = request.body || {};

      if (!email || !password) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Email and password are required' },
        });
      }
      if (password.length < 8) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Password must be at least 8 characters' },
        });
      }

      const { data, error } = await supabaseAdmin.auth.signUp({
        email,
        password,
        options: { data: { name: name || email.split('@')[0] } },
      });

      if (error) {
        if (error.message.includes('already registered') || error.message.includes('already exists')) {
          return reply.status(400).send({
            success: false,
            error: { code: 'DUPLICATE_EMAIL', message: 'An account with this email already exists' },
          });
        }
        return reply.status(400).send({
          success: false,
          error: { code: 'AUTH_ERROR', message: error.message },
        });
      }

      if (!data.user) {
        return reply.status(400).send({
          success: false,
          error: { code: 'AUTH_ERROR', message: 'Failed to create user' },
        });
      }

      return reply.status(201).send({
        success: true,
        data: {
          user: {
            id: data.user.id,
            email: data.user.email,
            name: (data.user.user_metadata as { name?: string } | null)?.name || email.split('@')[0],
            createdAt: data.user.created_at,
          },
          session: data.session
            ? {
                accessToken: data.session.access_token,
                refreshToken: data.session.refresh_token,
                expiresAt: data.session.expires_at,
              }
            : null,
          confirmationRequired: !data.session,
        },
        meta: { timestamp: new Date(), requestId: request.id, latencyMs: Date.now() - start },
      });
    }
  );

  // POST /api/v1/auth/logout
  fastify.post<{ Reply: APIResponse<unknown> }>(
    '/api/v1/auth/logout',
    async (request, reply) => {
      const start = Date.now();
      const token = extractBearer(request.headers.authorization);

      if (!token) {
        return reply.status(401).send({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Missing authorization header' },
        });
      }

      const { data: { user }, error: verifyError } = await supabaseAdmin.auth.getUser(token);
      if (verifyError || !user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' },
        });
      }

      const { error: signOutError } = await supabaseAdmin.auth.admin.signOut(token);
      if (signOutError) {
        logger.warn({ err: signOutError }, 'Supabase admin signOut warning');
      }

      return {
        success: true,
        data: { message: 'Successfully logged out', userId: user.id },
        meta: { timestamp: new Date(), requestId: request.id, latencyMs: Date.now() - start },
      };
    }
  );

  // GET /api/v1/auth/me
  fastify.get<{ Reply: APIResponse<unknown> }>(
    '/api/v1/auth/me',
    async (request, reply) => {
      const start = Date.now();
      const token = extractBearer(request.headers.authorization);

      if (!token) {
        return reply.status(401).send({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Missing authorization header' },
        });
      }

      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
      if (error || !user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' },
        });
      }

      const { data: settings } = await supabaseAdmin
        .from('frontier_user_settings')
        .select('*')
        .eq('user_id', user.id)
        .single();

      const meta = (user.user_metadata as { name?: string; avatar_url?: string } | null) || {};

      return {
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: meta.name || user.email?.split('@')[0],
            avatarUrl: meta.avatar_url,
            createdAt: user.created_at,
            lastSignIn: user.last_sign_in_at,
            emailConfirmed: !!user.email_confirmed_at,
          },
          settings: settings || {
            notifications: true,
            theme: 'light',
            riskTolerance: 'moderate',
          },
        },
        meta: { timestamp: new Date(), requestId: request.id, latencyMs: Date.now() - start },
      };
    }
  );

  // POST /api/v1/auth/refresh
  fastify.post<{ Body: RefreshBody; Reply: APIResponse<unknown> }>(
    '/api/v1/auth/refresh',
    async (request, reply) => {
      const start = Date.now();
      const { refreshToken } = request.body || {};

      if (!refreshToken) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Refresh token is required' },
        });
      }

      const { data, error } = await supabaseAdmin.auth.refreshSession({
        refresh_token: refreshToken,
      });

      if (error) {
        if (error.message.includes('expired') || error.message.includes('invalid')) {
          return reply.status(401).send({
            success: false,
            error: { code: 'TOKEN_EXPIRED', message: 'Refresh token expired or invalid' },
          });
        }
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_ERROR', message: error.message },
        });
      }

      if (!data.session) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_ERROR', message: 'Failed to refresh session' },
        });
      }

      return {
        success: true,
        data: {
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
          expiresAt: data.session.expires_at,
          expiresIn: data.session.expires_in,
          user: data.user
            ? {
                id: data.user.id,
                email: data.user.email,
                name: (data.user.user_metadata as { name?: string } | null)?.name,
              }
            : undefined,
        },
        meta: { timestamp: new Date(), requestId: request.id, latencyMs: Date.now() - start },
      };
    }
  );
}
