/**
 * Env-hygiene tests for AlertDelivery provider selection.
 *
 * Production regression: 17 Vercel production env vars were stored with a
 * trailing newline (the documented `echo` vs `printf` corruption class).
 * EMAIL_PROVIDER is matched BY VALUE in the constructor's switch, so
 * "resend\n" fell through to `default:` and every transactional email —
 * welcome, alert-fired, subscription-confirmed, weekly digest — was handed to
 * ConsoleProvider and logged instead of sent.
 *
 * It was invisible because health.ts DOES `.trim()` its EMAIL_PROVIDER read,
 * so /api/v1/health/integrations reported emailDelivery "live" the whole time.
 * Same shape as the Polygon outage: the probe and the feature disagreed.
 *
 * These assert the constructor is robust to whitespace regardless of how the
 * env var was stored.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.hoisted(() => {
  process.env.SUPABASE_URL ??= 'http://localhost:54321';
  process.env.SUPABASE_SERVICE_KEY ??= 'test-service-key';
});

import { AlertDelivery } from '../../src/notifications/AlertDelivery.js';

/** The concrete provider is private; its constructor name identifies it. */
function providerNameOf(delivery: AlertDelivery): string {
  return (delivery as unknown as { provider: object }).provider.constructor.name;
}

const ORIGINAL = { ...process.env };

describe('AlertDelivery — provider selection is whitespace-safe', () => {
  beforeEach(() => {
    delete process.env.EMAIL_PROVIDER;
    delete process.env.EMAIL_API_KEY;
    delete process.env.EMAIL_FROM;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  it.each([
    ['clean', 'resend'],
    ['trailing newline (the production value)', 'resend\n'],
    ['CRLF', 'resend\r\n'],
    ['surrounding spaces', '  resend  '],
  ])('selects ResendProvider from EMAIL_PROVIDER with %s', (_label, value) => {
    process.env.EMAIL_PROVIDER = value;
    process.env.EMAIL_API_KEY = 're_testkey';

    expect(providerNameOf(new AlertDelivery())).toBe('ResendProvider');
  });

  it('selects ResendProvider when a corrupted value arrives via explicit config', () => {
    // routes/alerts.ts and getAlertDelivery() both pass the raw env value in as
    // `config.provider`, which takes precedence over the env read.
    const delivery = new AlertDelivery({
      provider: 'resend\n' as 'resend',
      apiKey: 're_testkey',
    });

    expect(providerNameOf(delivery)).toBe('ResendProvider');
  });

  it('still falls back to ConsoleProvider when genuinely unset', () => {
    expect(providerNameOf(new AlertDelivery())).toBe('ConsoleProvider');
  });

  it('strips whitespace from the API key and from-address', () => {
    process.env.EMAIL_PROVIDER = 'resend';
    process.env.EMAIL_API_KEY = 're_testkey\n';
    process.env.EMAIL_FROM = 'alerts@metaventionsai.com\n';

    const delivery = new AlertDelivery();
    // A trailing newline in an Authorization header is rejected by undici.
    expect((delivery as unknown as { fromEmail: string }).fromEmail).toBe(
      'alerts@metaventionsai.com',
    );
    const provider = (delivery as unknown as { provider: { apiKey?: string } }).provider;
    if (provider.apiKey !== undefined) expect(provider.apiKey).toBe('re_testkey');
  });
});
