/**
 * Welcome transactional email.
 *
 * Subject: Welcome to Frontier Alpha
 * Body: cognitive-read kicker, gradient "Frontier Alpha" headline, three-up
 *       capability grid, CTA into the dashboard.
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

export interface WelcomeData {
  displayName: string;
  dashboardUrl: string;
}

interface FeatureCard {
  kicker: string;
  body: string;
}

const FEATURES: FeatureCard[] = [
  { kicker: '80+ FACTORS', body: 'Cross-sectional decomposition on every position' },
  { kicker: 'LIVE DATA', body: 'Polygon real-time stream + 140K+ data points' },
  { kicker: 'EXPLAINABLE AI', body: 'Every output ships with the cognitive trail' },
];

function featureCardHtml(feature: FeatureCard): string {
  const inner = `
    ${monoKicker(feature.kicker, COLORS.white)}
    ${spacer(8)}
    <div style="font-family:${FONT_SANS};color:${COLORS.textMuted};font-size:14px;line-height:1.5;">${escapeHtml(feature.body)}</div>`;
  return card({ body: inner, padding: '20px' });
}

export function renderWelcome(data: WelcomeData): EmailPayload {
  const subject = 'Welcome to Frontier Alpha';

  const headerBlock = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td>
          ${monoKicker('Welcome · Cognitive Read', COLORS.textMuted)}
          ${spacer(14)}
          <div style="font-family:${FONT_SANS};font-size:34px;font-weight:700;letter-spacing:-0.01em;line-height:1.1;">
            <span style="color:${COLORS.white};">Welcome to </span><!--
            --><span style="color:${COLORS.sovereignFallback};background:${COLORS.gradSovereign};-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;">Frontier Alpha</span>
          </div>
          ${spacer(14)}
          <div style="font-family:${FONT_SANS};color:${COLORS.textMuted};font-size:15px;line-height:1.55;">
            ${escapeHtml(data.displayName)}, your cognitive desk is live. Three primitives ship on day one.
          </div>
        </td>
      </tr>
    </table>`;

  // Outlook-safe 3-row stack of cards (no flex/grid).
  const featureGrid = FEATURES.map((feature, idx) => {
    const top = idx === 0 ? '' : `${spacer(12)}`;
    return `${top}${featureCardHtml(feature)}`;
  }).join('');

  const body = `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td style="padding:8px 32px 32px 32px;">
        ${card({ body: headerBlock })}
        ${spacer(20)}
        ${featureGrid}
        ${spacer(24)}
        ${cta({ href: data.dashboardUrl, label: 'Open Dashboard', accent: 'sovereign' })}
        ${spacer(16)}
        <div style="font-family:${FONT_MONO};color:${COLORS.textDim};font-size:10px;letter-spacing:0.2em;text-transform:uppercase;">First read · ${escapeHtml(new Date().toUTCString())}</div>
      </td>
    </tr>
  </table>`;

  const html = shell({
    accent: 'sovereign',
    preheader: `Welcome ${data.displayName} — your cognitive desk is live.`,
    body,
  });

  const text = [
    'FRONTIER ALPHA · WELCOME',
    '',
    `Welcome to Frontier Alpha, ${data.displayName}.`,
    'Your cognitive desk is live. Three primitives ship on day one:',
    '',
    ...FEATURES.map((f) => `  • ${f.kicker} — ${f.body}`),
    '',
    `Open dashboard: ${data.dashboardUrl}`,
    '',
    '— FRONTIER ALPHA · METAVENTIONSAI.COM',
  ].join('\n');

  return { subject, html, text };
}
