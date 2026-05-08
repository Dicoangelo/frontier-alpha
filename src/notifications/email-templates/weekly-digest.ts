/**
 * Weekly-digest transactional email.
 *
 * Subject: Frontier Alpha · {dateRange}
 * Body: halo-gradient kicker + headline, portfolio summary card with
 *       sign-colored delta, top/worst mover row, dashboard CTA.
 */

import {
  COLORS,
  FONT_MONO,
  FONT_SANS,
  card,
  cta,
  escapeHtml,
  formatCurrency,
  formatSignedCurrency,
  formatSignedPct,
  monoKicker,
  shell,
  spacer,
  tabularNum,
} from './_layout.js';
import type { EmailPayload } from './types.js';

export interface WeeklyDigestData {
  displayName: string;
  dateRange: string; // e.g. "Apr 28 – May 4, 2026"
  portfolioValue: number;
  portfolioDelta: number; // dollar amount, can be negative
  portfolioDeltaPct: number; // e.g. 2.3 for +2.3%
  topMover: { symbol: string; pct: number; because: string };
  worstMover: { symbol: string; pct: number };
  dashboardUrl: string;
}

const POS = '#10b981';
const NEG = '#ef4444';

function signColor(value: number): string {
  if (value > 0) return POS;
  if (value < 0) return NEG;
  return COLORS.text;
}

function moverCard(opts: {
  kicker: string;
  symbol: string;
  pct: number;
  because?: string;
}): string {
  const color = signColor(opts.pct);
  const becauseHtml = opts.because
    ? `${spacer(8)}<div style="font-family:${FONT_SANS};color:${COLORS.textMuted};font-size:13px;line-height:1.45;">${escapeHtml(opts.because)}</div>`
    : '';
  const inner = `
    ${monoKicker(opts.kicker, COLORS.textMuted)}
    ${spacer(10)}
    <div style="font-family:${FONT_SANS};color:${COLORS.white};font-size:22px;font-weight:700;letter-spacing:-0.01em;">${escapeHtml(opts.symbol)}</div>
    ${spacer(6)}
    ${tabularNum(formatSignedPct(opts.pct), color, '18px')}
    ${becauseHtml}`;
  return card({ body: inner, padding: '20px' });
}

export function renderWeeklyDigest(data: WeeklyDigestData): EmailPayload {
  const subject = `Frontier Alpha · ${data.dateRange}`;
  const deltaColor = signColor(data.portfolioDelta);

  const headerBlock = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td>
          ${monoKicker('Weekly Digest', COLORS.textMuted)}
          ${spacer(12)}
          <div style="font-family:${FONT_SANS};font-size:30px;font-weight:700;letter-spacing:-0.01em;line-height:1.15;">
            <span style="color:${COLORS.haloFallback};background:${COLORS.gradHalo};-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;">${escapeHtml(data.dateRange)}</span>
          </div>
          ${spacer(10)}
          <div style="font-family:${FONT_SANS};color:${COLORS.textMuted};font-size:14px;line-height:1.5;">
            ${escapeHtml(data.displayName)}, here is your week on the cognitive desk.
          </div>
        </td>
      </tr>
    </table>`;

  const summaryBlock = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td>
          ${monoKicker('Portfolio Value', COLORS.textMuted)}
          ${spacer(10)}
          ${tabularNum(formatCurrency(data.portfolioValue), COLORS.white, '32px')}
          ${spacer(10)}
          <div>
            <span style="font-family:${FONT_MONO};color:${deltaColor};font-size:14px;font-variant-numeric:tabular-nums;font-weight:600;">${escapeHtml(formatSignedCurrency(data.portfolioDelta))}</span>
            <span style="font-family:${FONT_MONO};color:${COLORS.textMuted};font-size:14px;">&nbsp;·&nbsp;</span>
            <span style="font-family:${FONT_MONO};color:${deltaColor};font-size:14px;font-variant-numeric:tabular-nums;font-weight:600;">(${escapeHtml(formatSignedPct(data.portfolioDeltaPct))})</span>
          </div>
        </td>
      </tr>
    </table>`;

  // Outlook-safe two-column row using table cells (no flex/grid).
  const moversRow = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td width="50%" valign="top" style="padding-right:8px;">
          ${moverCard({
            kicker: 'Top Mover',
            symbol: data.topMover.symbol,
            pct: data.topMover.pct,
            because: data.topMover.because,
          })}
        </td>
        <td width="50%" valign="top" style="padding-left:8px;">
          ${moverCard({
            kicker: 'Worst Mover',
            symbol: data.worstMover.symbol,
            pct: data.worstMover.pct,
          })}
        </td>
      </tr>
    </table>`;

  const body = `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td style="padding:8px 32px 32px 32px;">
        ${card({ body: headerBlock })}
        ${spacer(16)}
        ${card({ body: summaryBlock })}
        ${spacer(16)}
        ${moversRow}
        ${spacer(24)}
        ${cta({ href: data.dashboardUrl, label: 'View Full Digest', accent: 'halo' })}
        ${spacer(16)}
        <div style="font-family:${FONT_MONO};color:${COLORS.textDim};font-size:10px;letter-spacing:0.2em;text-transform:uppercase;">Digest generated ${escapeHtml(new Date().toUTCString())}</div>
      </td>
    </tr>
  </table>`;

  const html = shell({
    accent: 'halo',
    preheader: `${data.dateRange} · ${formatCurrency(data.portfolioValue)} (${formatSignedPct(data.portfolioDeltaPct)})`,
    body,
  });

  const text = [
    `FRONTIER ALPHA · WEEKLY DIGEST · ${data.dateRange}`,
    '',
    `Portfolio:  ${formatCurrency(data.portfolioValue)}`,
    `Δ:          ${formatSignedCurrency(data.portfolioDelta)} (${formatSignedPct(data.portfolioDeltaPct)})`,
    '',
    `Top mover:   ${data.topMover.symbol} ${formatSignedPct(data.topMover.pct)} — ${data.topMover.because}`,
    `Worst mover: ${data.worstMover.symbol} ${formatSignedPct(data.worstMover.pct)}`,
    '',
    `View full digest: ${data.dashboardUrl}`,
    '',
    '— FRONTIER ALPHA · METAVENTIONSAI.COM',
  ].join('\n');

  return { subject, html, text };
}
