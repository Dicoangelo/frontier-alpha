/**
 * Guard: the synthetic monitor must never probe a side-effecting endpoint.
 *
 * The monitor runs every 15 minutes (vercel.json crons). Its `digestRun` probe
 * pointed at /api/v1/digest/run WITHOUT `&probe=true`, so every poll actually
 * sent the weekly digest to every subscribed recipient — ~96 real mailings a
 * day. It went unnoticed for months because EMAIL_PROVIDER was stored with a
 * trailing newline and every send silently fell through to ConsoleProvider.
 * Repairing email delivery turned the dormant bug into a mail flood.
 *
 * `?probe=true` short-circuits after the auth gate and returns zeroed counts,
 * so reachability and CRON_SECRET are still verified with no side effect.
 */

import { describe, it, expect, vi } from 'vitest';

vi.hoisted(() => {
  process.env.SUPABASE_URL ??= 'http://localhost:54321';
  process.env.SUPABASE_SERVICE_KEY ??= 'test-service-key';
  process.env.CRON_SECRET ??= 'test-cron-secret';
});

import { __testHooks } from '../../src/routes/synthetic-monitor.js';

/** Endpoints that mutate state or contact users. Probing these must be opt-in. */
const SIDE_EFFECTING = [/\/digest\/run/, /\/digest\/health-summary/, /\/alerts\/notify/];

describe('synthetic monitor probe list', () => {
  const probes = __testHooks.buildProbes();

  it('sends the digest probe in probe mode so no mail is delivered', () => {
    const digest = probes.find((p) => p.shape === 'digestRun');
    expect(digest).toBeDefined();
    expect(digest!.pathname).toContain('probe=true');
  });

  it('never probes a side-effecting endpoint without probe mode', () => {
    const offenders = probes
      .filter((p) => SIDE_EFFECTING.some((re) => re.test(p.pathname)))
      .filter((p) => !p.pathname.includes('probe=true'))
      .map((p) => `${p.shape} -> ${p.pathname.replace(/key=[^&]*/, 'key=***')}`);

    expect(offenders).toEqual([]);
  });

  it('still probes the cron-gated routes it is meant to cover', () => {
    const shapes = probes.map((p) => p.shape);
    expect(shapes).toContain('digestRun');
    expect(shapes).toContain('warmCache');
  });
});
