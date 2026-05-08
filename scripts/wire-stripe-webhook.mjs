#!/usr/bin/env node
// Registers the Stripe webhook endpoint and pulls the signing secret.
//
// Reads STRIPE_SECRET_KEY from env. Creates a webhook endpoint at
//   https://frontier-alpha.metaventionsai.com/api/v1/billing/webhook
// subscribed to the events the billing route handles.
//
// Prints the resulting signing secret — pipe it through `vercel env add` and
// `railway variables --set` to activate webhook signature verification.

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_SECRET_KEY) {
  console.error('✗ STRIPE_SECRET_KEY not set. Run `vercel env pull` first.');
  process.exit(1);
}

const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://frontier-alpha.metaventionsai.com/api/v1/billing/webhook';
const EVENTS = [
  'checkout.session.completed',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
];

async function stripeApi(path, params, method = 'POST') {
  const body = params
    ? Object.entries(params)
        .flatMap(([k, v]) =>
          Array.isArray(v) ? v.map((vv, i) => [`${k}[${i}]`, vv]) : [[k, v]],
        )
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&')
    : undefined;
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Stripe ${method} ${path} → ${res.status}: ${err}`);
  }
  return res.json();
}

async function findExistingWebhook() {
  const list = await stripeApi('/webhook_endpoints?limit=100', null, 'GET');
  return (list.data || []).find((w) => w.url === WEBHOOK_URL);
}

async function main() {
  console.log(`→ Looking up webhook for ${WEBHOOK_URL}...`);
  let webhook = await findExistingWebhook();

  if (webhook) {
    console.log(`  [EXISTS] ${webhook.id} (status: ${webhook.status})`);
    console.log('');
    console.log('  Note: Stripe only reveals the signing secret at creation time.');
    console.log('  If you need the secret again, delete this endpoint via Stripe dashboard');
    console.log('  and re-run this script to create a fresh one.');
    process.exit(0);
  }

  console.log('  Not found. Creating...');
  const params = {
    url: WEBHOOK_URL,
    enabled_events: EVENTS,
    description: 'Frontier Alpha — billing event sync',
  };
  webhook = await stripeApi('/webhook_endpoints', params);

  console.log(`  [CREATED] ${webhook.id}`);
  console.log('');
  console.log('→ Set this on Vercel + Railway:');
  console.log('');
  console.log(`  STRIPE_WEBHOOK_SECRET=${webhook.secret}`);
  console.log('');
  console.log('Or pipe through:');
  console.log('');
  console.log(`  echo "${webhook.secret}" | vercel env add STRIPE_WEBHOOK_SECRET production`);
  console.log(`  railway variables --set "STRIPE_WEBHOOK_SECRET=${webhook.secret}" --skip-deploys`);
  console.log('');
  console.log('Subscribed events:');
  for (const ev of EVENTS) console.log(`  • ${ev}`);
}

main().catch((err) => {
  console.error('✗', err.message);
  process.exit(1);
});
