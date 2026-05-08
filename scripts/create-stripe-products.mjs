#!/usr/bin/env node
// Creates the Pro + Enterprise products in Stripe and prints their price IDs.
// Reuses STRIPE_SECRET_KEY from Vercel env (run via `vercel env pull` first
// or pass STRIPE_SECRET_KEY directly in the calling shell).
//
// Idempotent-ish: if a product with the same lookup_key already exists, it
// reuses the existing price.

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_SECRET_KEY) {
  console.error('✗ STRIPE_SECRET_KEY not set in env. Run `vercel env pull` first.');
  process.exit(1);
}

const TIERS = [
  {
    name: 'Frontier Alpha Pro',
    description: 'Cognitive factor intelligence + real-time risk + explainable AI',
    lookup_key: 'fa_pro_monthly',
    unit_amount: 2900, // $29.00
    interval: 'month',
  },
  {
    name: 'Frontier Alpha Enterprise',
    description: 'Pro features + multi-portfolio + API access + priority support',
    lookup_key: 'fa_enterprise_monthly',
    unit_amount: 9900, // $99.00
    interval: 'month',
  },
];

async function stripeApi(path, params, method = 'POST') {
  const body = params
    ? Object.entries(params)
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
    throw new Error(`Stripe ${path} → ${res.status}: ${err}`);
  }
  return res.json();
}

async function ensurePrice(tier) {
  // Try to find by lookup_key first
  const existing = await stripeApi(
    `/prices/search?query=${encodeURIComponent(`lookup_key:'${tier.lookup_key}' AND active:'true'`)}`,
    null,
    'GET',
  );
  if (existing.data && existing.data.length > 0) {
    return { tier, price: existing.data[0], created: false };
  }

  const product = await stripeApi('/products', {
    name: tier.name,
    description: tier.description,
  });

  const price = await stripeApi('/prices', {
    product: product.id,
    unit_amount: String(tier.unit_amount),
    currency: 'usd',
    'recurring[interval]': tier.interval,
    lookup_key: tier.lookup_key,
  });

  return { tier, price, created: true };
}

async function main() {
  console.log('→ Creating / verifying Stripe products...');
  const results = [];
  for (const tier of TIERS) {
    const r = await ensurePrice(tier);
    results.push(r);
    const tag = r.created ? 'CREATED' : 'EXISTS';
    console.log(`  [${tag}] ${tier.name} — ${r.price.id} ($${tier.unit_amount / 100}/${tier.interval})`);
  }
  console.log();
  console.log('→ Set these on Vercel:');
  console.log();
  const proPriceId = results.find(r => r.tier.lookup_key === 'fa_pro_monthly').price.id;
  const entPriceId = results.find(r => r.tier.lookup_key === 'fa_enterprise_monthly').price.id;
  console.log(`  STRIPE_PRO_PRICE_ID=${proPriceId}`);
  console.log(`  STRIPE_ENTERPRISE_PRICE_ID=${entPriceId}`);
  console.log(`  VITE_STRIPE_PRO_PRICE_ID=${proPriceId}`);
  console.log(`  VITE_STRIPE_ENTERPRISE_PRICE_ID=${entPriceId}`);
  console.log();
  console.log('Or pipe through:');
  console.log();
  console.log(`  echo "${proPriceId}" | vercel env add STRIPE_PRO_PRICE_ID production`);
  console.log(`  echo "${proPriceId}" | vercel env add VITE_STRIPE_PRO_PRICE_ID production`);
  console.log(`  echo "${entPriceId}" | vercel env add STRIPE_ENTERPRISE_PRICE_ID production`);
  console.log(`  echo "${entPriceId}" | vercel env add VITE_STRIPE_ENTERPRISE_PRICE_ID production`);
}

main().catch((err) => {
  console.error('✗', err.message);
  process.exit(1);
});
