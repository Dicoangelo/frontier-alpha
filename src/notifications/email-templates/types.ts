/**
 * Shared types for email templates.
 * Each render function returns this payload — Resend / SendGrid / SMTP all accept the same shape.
 */
export interface EmailPayload {
  subject: string;
  html: string;
  text: string;
}
