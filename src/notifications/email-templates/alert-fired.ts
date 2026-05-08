/**
 * Alert-fired transactional email.
 *
 * Subject: [FRONTIER ALPHA] {Symbol} · {AlertType}
 * Body: alert kicker, symbol headline, condition met, current vs threshold,
 *       CTA back to dashboard.
 */

import {
  COLORS,
  FONT_MONO,
  FONT_SANS,
  card,
  cta,
  escapeHtml,
  formatSignedPct,
  monoKicker,
  shell,
  spacer,
  tabularNum,
} from './_layout.js';
import type { EmailPayload } from './types.js';

export interface AlertFiredData {
  symbol: string;
  alertType: string;
  condition: string;
  currentValue: number;
  threshold: number;
  dashboardUrl: string;
}

function formatValue(value: number): string {
  // Heuristic: values |x| <= 1 are likely percentages stored as fractions
  // (e.g. -0.08 -> -8.00%); larger values are rendered tabular as raw numbers.
  if (Math.abs(value) <= 1) {
    return formatSignedPct(value * 100);
  }
  return value.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

export function renderAlertFired(data: AlertFiredData): EmailPayload {
  const subject = `[FRONTIER ALPHA] ${data.symbol} · ${data.alertType}`;

  const symbolBlock = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td>
          ${monoKicker(`Alert · ${data.alertType}`, '#FF3DF2')}
          ${spacer(10)}
          <div style="font-family:${FONT_SANS};color:${COLORS.white};font-size:32px;font-weight:700;letter-spacing:-0.01em;">${escapeHtml(data.symbol)}</div>
          ${spacer(8)}
          <div style="font-family:${FONT_SANS};color:${COLORS.textMuted};font-size:15px;line-height:1.5;">${escapeHtml(data.condition)}</div>
        </td>
      </tr>
    </table>`;

  const valueRow = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td width="50%" valign="top" style="padding-right:12px;">
          ${monoKicker('Current', COLORS.textMuted)}
          ${spacer(6)}
          ${tabularNum(formatValue(data.currentValue), COLORS.white, '22px')}
        </td>
        <td width="50%" valign="top" style="padding-left:12px;border-left:1px solid ${COLORS.border};">
          ${monoKicker('Threshold', COLORS.textMuted)}
          ${spacer(6)}
          ${tabularNum(formatValue(data.threshold), COLORS.textMuted, '22px')}
        </td>
      </tr>
    </table>`;

  const body = `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td style="padding:8px 32px 32px 32px;">
        ${card({ body: symbolBlock })}
        ${spacer(16)}
        ${card({ body: valueRow })}
        ${spacer(24)}
        ${cta({ href: data.dashboardUrl, label: 'View in Dashboard', accent: 'sovereign' })}
        ${spacer(16)}
        <div style="font-family:${FONT_MONO};color:${COLORS.textDim};font-size:10px;letter-spacing:0.2em;text-transform:uppercase;">Alert fired ${escapeHtml(new Date().toUTCString())}</div>
      </td>
    </tr>
  </table>`;

  const html = shell({
    accent: 'sovereign',
    preheader: `${data.symbol} ${data.alertType}: ${data.condition}`,
    body,
  });

  const text = [
    `FRONTIER ALPHA · ${data.alertType.toUpperCase()}`,
    '',
    `${data.symbol}`,
    `${data.condition}`,
    '',
    `Current:   ${formatValue(data.currentValue)}`,
    `Threshold: ${formatValue(data.threshold)}`,
    '',
    `View in dashboard: ${data.dashboardUrl}`,
    '',
    '— FRONTIER ALPHA · METAVENTIONSAI.COM',
  ].join('\n');

  return { subject, html, text };
}
