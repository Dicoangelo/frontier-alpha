/**
 * Email template barrel.
 *
 * v1.2.1 ships the full transactional set: alert-fired, subscription-confirmed,
 * weekly-digest, welcome. All four render functions return the canonical
 * EmailPayload shape ({ subject, html, text }).
 *
 * Re-exports are alphabetized.
 */
export type { EmailPayload } from './types.js';
export { renderAlertFired, type AlertFiredData } from './alert-fired.js';
export {
  renderSubscriptionConfirmed,
  type SubscriptionConfirmedData,
} from './subscription-confirmed.js';
export { renderWeeklyDigest, type WeeklyDigestData } from './weekly-digest.js';
export { renderWelcome, type WelcomeData } from './welcome.js';
