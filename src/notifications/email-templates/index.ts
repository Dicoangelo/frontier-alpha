/**
 * Email template barrel.
 *
 * v1.2.0 ships alert-fired only. welcome / subscription-confirmed / weekly-digest
 * stubs are tracked for v1.2.1 — agent that started them rate-limited mid-write,
 * so the alert path is the only one fully built. Other senders fall through to
 * the existing inline-HTML AlertDelivery path until those templates land.
 */
export type { EmailPayload } from './types.js';
export { renderAlertFired, type AlertFiredData } from './alert-fired.js';
