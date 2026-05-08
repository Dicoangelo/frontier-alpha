/**
 * Subscription-confirmed transactional email.
 *
 * Subject: Frontier Alpha {Plan} · Active
 * Body: ACTIVATED pill, plan + next-billing details, manage-subscription CTA,
 *       secondary text link to the dashboard.
 */

import {
  COLORS,
  FONT_MONO,
  FONT_SANS,
  card,
  cta,
  escapeHtml,
  monoKicker,
  shell,
  spacer,
} from './_layout.js';
import type { EmailPayload } from './types.js';

export interface SubscriptionConfirmedData {
  displayName: string;
  plan: 'pro' | 'enterprise';
  nextBillingDate: string; // ISO date
  portalUrl: string;
}

const PLAN_LABEL: Record<SubscriptionConfirmedData['plan'], string> = {
  pro: 'Pro',
  enterprise: 'Enterprise',
};

function planLabel(plan: SubscriptionConfirmedData['plan']): string {
  return PLAN_LABEL[plan];
}

function formatBillingDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

function deriveDashboardUrl(portalUrl: string): string {
  try {
    const u = new URL(portalUrl);
    return `${u.protocol}//${u.host}/dashboard`;
  } catch {
    return 'https://frontier-alpha.metaventionsai.com/dashboard';
  }
}

function activatedPill(): string {
  // Green mono uppercase pill — Outlook reads `background` as solid fill.
  return `<span style="display:inline-block;background:rgba(16,185,129,0.12);color:#10b981;font-family:${FONT_MONO};font-size:11px;letter-spacing:0.3em;text-transform:uppercase;font-weight:600;padding:6px 12px;border:1px solid rgba(16,185,129,0.35);border-radius:999px;">Activated</span>`;
}

function detailRow(label: string, value: string): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td width="40%" valign="top" style="padding:8px 0;">
          ${monoKicker(label, COLORS.textMuted)}
        </td>
        <td width="60%" valign="top" style="padding:8px 0;">
          <div style="font-family:${FONT_SANS};color:${COLORS.text};font-size:14px;font-weight:500;">${escapeHtml(value)}</div>
        </td>
      </tr>
    </table>`;
}

export function renderSubscriptionConfirmed(data: SubscriptionConfirmedData): EmailPayload {
  const plan = planLabel(data.plan);
  const subject = `Frontier Alpha ${plan} · Active`;
  const dashboardUrl = deriveDashboardUrl(data.portalUrl);
  const billing = formatBillingDate(data.nextBillingDate);

  const pillBlock = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td align="left" style="padding:0;">${activatedPill()}</td>
      </tr>
    </table>`;

  const headerBlock = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td>
          ${monoKicker('Subscription · Active', COLORS.textMuted)}
          ${spacer(10)}
          <div style="font-family:${FONT_SANS};color:${COLORS.white};font-size:30px;font-weight:700;letter-spacing:-0.01em;line-height:1.15;">${escapeHtml(plan)} unlocked</div>
          ${spacer(10)}
          <div style="font-family:${FONT_SANS};color:${COLORS.textMuted};font-size:14px;line-height:1.5;">
            ${escapeHtml(data.displayName)}, your billing cycle is anchored. Receipt arrives separately from Stripe.
          </div>
          ${spacer(20)}
          <div style="border-top:1px solid ${COLORS.border};"></div>
          ${detailRow('Plan', plan)}
          ${detailRow('Next billing', billing)}
          ${detailRow('Receipt', 'Sent by Stripe')}
        </td>
      </tr>
    </table>`;

  const body = `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td style="padding:8px 32px 32px 32px;">
        ${pillBlock}
        ${spacer(16)}
        ${card({ body: headerBlock })}
        ${spacer(24)}
        ${cta({ href: data.portalUrl, label: 'Manage Subscription', accent: 'sovereign' })}
        ${spacer(14)}
        <div style="font-family:${FONT_MONO};color:${COLORS.textMuted};font-size:11px;letter-spacing:0.18em;text-transform:uppercase;">
          <a href="${escapeHtml(dashboardUrl)}" style="color:${COLORS.textMuted};text-decoration:none;border-bottom:1px solid ${COLORS.border};">Open dashboard</a>
        </div>
        ${spacer(16)}
        <div style="font-family:${FONT_MONO};color:${COLORS.textDim};font-size:10px;letter-spacing:0.2em;text-transform:uppercase;">Activated ${escapeHtml(new Date().toUTCString())}</div>
      </td>
    </tr>
  </table>`;

  const html = shell({
    accent: 'sovereign',
    preheader: `${plan} plan active — next billing ${billing}.`,
    body,
  });

  const text = [
    `FRONTIER ALPHA · ${plan.toUpperCase()} ACTIVE`,
    '',
    `Plan:         ${plan}`,
    `Next billing: ${billing}`,
    'Receipt:      Sent separately from Stripe',
    '',
    `Manage subscription: ${data.portalUrl}`,
    `Open dashboard:      ${dashboardUrl}`,
    '',
    '— FRONTIER ALPHA · METAVENTIONSAI.COM',
  ].join('\n');

  return { subject, html, text };
}
