/**
 * Visual-regression auth helper.
 *
 * Mints a real Supabase JWT for the seeded golden-state user
 * (`dicoangelo+test@metaventionsai.com`) so protected pages can be snapshotted
 * against fixture data, not mock data. This is a slimmed-down copy of
 * `tests/integration/auth-helper.ts::mintTestSession()`.
 *
 * Why a copy and not a re-export: the integration helper lives at
 * `tests/integration/auth-helper.ts` which inherits `type: module` from the
 * repo root. The visual suite is forced to CommonJS (see
 * `tests/visual/package.json`) so Playwright's CJS-to-ESM bridge for
 * `@playwright/test` exposes its named exports under Node 22. Mixing the two
 * module systems across a relative import fails at load time. Both helpers
 * mint the same JWT against the same seeded user so behavior is identical;
 * if `mintTestSession()` ever needs to change, change both.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const TEST_USER_EMAIL = 'dicoangelo+test@metaventionsai.com';
export const TEST_USER_PASSWORD = 'frontier-alpha-test-2026!';

export interface TestSession {
  userId: string;
  email: string;
  accessToken: string;
  refreshToken: string;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) {
    throw new Error(
      `[visual auth-helper] Missing required env var: ${name}. ` +
        `Visual regression requires SUPABASE_URL + SUPABASE_SERVICE_KEY + SUPABASE_ANON_KEY ` +
        `(or VITE_SUPABASE_ANON_KEY). Run \`vercel env pull\` or set them inline.`,
    );
  }
  return v;
}

/**
 * Supabase URL, trimmed and shape-checked.
 *
 * A malformed project URL does not fail as "bad URL" — supabase-js concatenates
 * it into every request path, so the gateway rejects the resulting request and
 * the SDK surfaces a flat "Invalid API key". That is indistinguishable from a
 * genuinely revoked key, and it cost this repo days of red CI: the GitHub
 * Actions SUPABASE_URL secret carried a trailing `/n` while the Vercel copy was
 * clean, so every env audit passed while every CI run failed.
 *
 * WHATWG URL parsing strips real tab/newline characters, so a true newline is
 * invisible on the wire — only mangled forms like `/n` survive to break routing.
 * Both are rejected here, against the same regex `schemas/env-schema.json` uses.
 */
const SUPABASE_URL_SHAPE = /^https:\/\/[a-z0-9-]+\.supabase\.co$/;

function requireSupabaseUrl(): string {
  const raw = requireEnv('SUPABASE_URL');
  const url = raw.trim().replace(/\/+$/, '');
  if (!SUPABASE_URL_SHAPE.test(url)) {
    const seen = JSON.stringify(raw.length > 60 ? `${raw.slice(0, 60)}…` : raw);
    throw new Error(
      `[visual auth-helper] SUPABASE_URL is malformed: ${seen}. ` +
        `Expected https://<project-ref>.supabase.co — no trailing slash, path, or whitespace. ` +
        `A stray newline pasted into the secret store shows up here, and if it reaches ` +
        `supabase-js it surfaces as the misleading error "Invalid API key". ` +
        `Re-set the secret with printf "%s" (never echo).`,
    );
  }
  return url;
}

function getAdmin(): SupabaseClient {
  const url = requireSupabaseUrl();
  const key = requireEnv('SUPABASE_SERVICE_KEY');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function mintTestSession(): Promise<TestSession> {
  const admin = getAdmin();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
    email_confirm: true,
    user_metadata: {
      full_name: 'Visual Regression Test User',
      role: 'visual_test',
    },
  });

  let userId: string;
  if (createErr) {
    if (!/already registered|already been registered|email_exists/i.test(createErr.message)) {
      throw new Error(`[visual auth-helper] createUser failed: ${createErr.message}`);
    }
    const list = await admin.auth.admin.listUsers();
    const existing = list.data.users.find((u) => u.email === TEST_USER_EMAIL);
    if (!existing) {
      throw new Error(
        `[visual auth-helper] User ${TEST_USER_EMAIL} reported as existing but not found in listUsers`,
      );
    }
    userId = existing.id;
    await admin.auth.admin.updateUserById(userId, {
      password: TEST_USER_PASSWORD,
      email_confirm: true,
    });
  } else {
    userId = created.user.id;
  }

  const url = requireSupabaseUrl();
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!anonKey) {
    throw new Error(
      '[visual auth-helper] SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY) is required to mint a user JWT',
    );
  }
  const userClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: signIn, error: signInErr } = await userClient.auth.signInWithPassword({
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
  });
  if (signInErr || !signIn.session) {
    throw new Error(
      `[visual auth-helper] signInWithPassword failed: ${signInErr?.message ?? 'no session returned'}`,
    );
  }

  return {
    userId,
    email: TEST_USER_EMAIL,
    accessToken: signIn.session.access_token,
    refreshToken: signIn.session.refresh_token,
  };
}
