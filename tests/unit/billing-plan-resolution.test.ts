/**
 * Plan resolution from Stripe price IDs.
 *
 * Production regression: STRIPE_ENTERPRISE_PRICE_ID was stored in Vercel with
 * a trailing newline (the `echo` vs `printf` corruption class). getPlanFromPriceId
 * compares the incoming Stripe price ID against that env var with `===`, so the
 * enterprise branch was unreachable and EVERY enterprise subscription was
 * written to the database as 'pro'.
 *
 * Nothing errored, because the fallback returns a VALID plan — the failure was
 * a silent downgrade, not an exception. Same family as EMAIL_PROVIDER selecting
 * ConsoleProvider: one stray byte, exact-match comparison, plausible fallback.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.hoisted(() => {
  process.env.SUPABASE_URL ??= 'http://localhost:54321';
  process.env.SUPABASE_SERVICE_KEY ??= 'test-service-key';
  process.env.STRIPE_SECRET_KEY ??= 'sk_test_dummy';
});

import { getPlanFromPriceId } from '../../src/routes/billing.js';

const ENTERPRISE = 'price_1QhEnterpriseAbC123';
const PRO = 'price_1QhProXyZ789';
const ORIGINAL = { ...process.env };

describe('getPlanFromPriceId — whitespace-safe plan resolution', () => {
  beforeEach(() => {
    process.env.STRIPE_ENTERPRISE_PRICE_ID = ENTERPRISE;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  it('resolves enterprise on an exact match', () => {
    expect(getPlanFromPriceId(ENTERPRISE)).toBe('enterprise');
  });

  it.each([
    ['trailing newline (the production value)', `${ENTERPRISE}\n`],
    ['CRLF', `${ENTERPRISE}\r\n`],
    ['surrounding spaces', `  ${ENTERPRISE}  `],
  ])('still resolves enterprise when the env var has %s', (_label, stored) => {
    process.env.STRIPE_ENTERPRISE_PRICE_ID = stored;
    expect(getPlanFromPriceId(ENTERPRISE)).toBe('enterprise');
  });

  it('resolves enterprise when the incoming price ID has stray whitespace', () => {
    expect(getPlanFromPriceId(`${ENTERPRISE}\n`)).toBe('enterprise');
  });

  it('still resolves pro for a genuinely different price ID', () => {
    expect(getPlanFromPriceId(PRO)).toBe('pro');
  });

  it('does not resolve enterprise when the env var is unset', () => {
    delete process.env.STRIPE_ENTERPRISE_PRICE_ID;
    expect(getPlanFromPriceId(ENTERPRISE)).toBe('pro');
  });

  it('does not treat an empty env var as matching an empty price ID', () => {
    process.env.STRIPE_ENTERPRISE_PRICE_ID = '   ';
    expect(getPlanFromPriceId('')).toBe('pro');
  });
});
