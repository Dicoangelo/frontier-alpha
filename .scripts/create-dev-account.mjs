/**
 * One-off: provision an all-access dev account.
 * - Creates auth user (email-confirmed)
 * - Seeds Enterprise comp subscription so subscription gates pass everywhere
 *
 * Usage:
 *   node .scripts/create-dev-account.mjs <email> <password>
 *
 * Reads env from .env.dev-credential (pulled via `vercel env pull`).
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';

const ENV_FILES = ['.env.dev-credential', '.env.production.local', '.env.local'];
let loaded = false;
for (const f of ENV_FILES) {
  if (!existsSync(f)) continue;
  const txt = readFileSync(f, 'utf8');
  for (const line of txt.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].replace(/^["']|["']$/g, '').replace(/\\n$/, '').trim();
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
  loaded = true;
  break;
}
if (!loaded) {
  console.error('No env file found; tried:', ENV_FILES.join(', '));
  process.exit(1);
}

const [, , email, password] = process.argv;
if (!email || !password) {
  console.error('Usage: node .scripts/create-dev-account.mjs <email> <password>');
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// 1. Create the user (email-confirmed so first sign-in works without verify link)
const { data: created, error: createErr } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: 'Dev Account', role: 'all_access_dev' },
});
if (createErr) {
  if (!/already registered/i.test(createErr.message)) {
    console.error('createUser error:', createErr);
    process.exit(1);
  }
  // User exists — fetch them so we can still seed/refresh the subscription.
  console.log('User already exists, looking up...');
  const { data: list } = await admin.auth.admin.listUsers();
  const existing = list.users.find((u) => u.email === email);
  if (!existing) {
    console.error('User reported existing but not found in list');
    process.exit(1);
  }
  // Reset password so the caller can sign in immediately.
  await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
  console.log('Reset password and confirmed email for', existing.id);
  await seedSubscription(existing.id);
  print(email, password, existing.id);
} else {
  console.log('Created user:', created.user.id);
  await seedSubscription(created.user.id);
  print(email, password, created.user.id);
}

async function seedSubscription(userId) {
  // Enterprise tier so every Pro+ and Enterprise gate passes. comp_* sentinel
  // protects the row from billing webhook clobber per src/routes/billing.ts.
  const { error } = await admin.from('frontier_subscriptions').upsert(
    {
      user_id: userId,
      plan: 'enterprise',
      status: 'active',
      stripe_customer_id: 'comp_dev',
      stripe_subscription_id: `comp_dev_${userId.slice(0, 8)}`,
      current_period_end: '2099-12-31T23:59:59Z',
    },
    { onConflict: 'user_id' },
  );
  if (error) {
    console.error('subscription upsert error:', error);
    process.exit(1);
  }
  console.log('Seeded enterprise comp subscription');
}

function print(email, password, userId) {
  console.log('\n=== Dev account ready ===');
  console.log('Email:    ', email);
  console.log('Password: ', password);
  console.log('User ID:  ', userId);
  console.log('Plan:     enterprise (comp)');
  console.log('Sign in:  https://frontier-alpha.metaventionsai.com/login');
}
