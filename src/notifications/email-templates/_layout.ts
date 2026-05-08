/**
 * Shared email layout primitives for Frontier Alpha transactional emails.
 *
 * All HTML uses inline styles only — no <style> blocks, no flexbox, no grid.
 * Tables drive layout for Gmail/Outlook/Apple Mail compatibility.
 */

export const COLORS = {
  bg: '#05070D',
  surface: 'rgba(255,255,255,0.05)',
  border: 'rgba(255,255,255,0.10)',
  text: '#F4F6FB',
  textMuted: '#9AA3B2',
  textDim: '#6B7280',
  white: '#FFFFFF',
  gradSovereign: 'linear-gradient(90deg, #FF3DF2 0%, #7B2CFF 50%, #18E6FF 100%)',
  gradHalo: 'linear-gradient(90deg, #00FFC6 0%, #18E6FF 50%, #5AA7FF 100%)',
  // Solid fallbacks for clients that strip gradients (Outlook desktop)
  sovereignFallback: '#7B2CFF',
  haloFallback: '#18E6FF',
} as const;

export const FONT_SANS = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
export const FONT_MONO = "'JetBrains Mono', 'SF Mono', Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";

export type Accent = 'sovereign' | 'halo';

export function accentBar(accent: Accent): string {
  const grad = accent === 'halo' ? COLORS.gradHalo : COLORS.gradSovereign;
  const fallback = accent === 'halo' ? COLORS.haloFallback : COLORS.sovereignFallback;
  return `<div style="height:3px;line-height:3px;font-size:0;background:${fallback};background-image:${grad};">&nbsp;</div>`;
}

export function header(): string {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.bg};">
    <tr>
      <td style="padding:32px 32px 16px 32px;">
        <div style="font-family:${FONT_MONO};color:${COLORS.white};font-size:13px;letter-spacing:0.4em;text-transform:uppercase;font-weight:600;">FRONTIER ALPHA</div>
      </td>
    </tr>
  </table>`;
}

export function footer(): string {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.bg};">
    <tr>
      <td style="padding:32px 32px 40px 32px;border-top:1px solid ${COLORS.border};">
        <div style="font-family:${FONT_MONO};color:${COLORS.textMuted};font-size:10px;letter-spacing:0.3em;text-transform:uppercase;">FRONTIER ALPHA &middot; METAVENTIONSAI.COM</div>
      </td>
    </tr>
  </table>`;
}

export interface ShellOptions {
  preheader?: string;
  accent?: Accent;
  body: string;
}

/**
 * Wrap body content in the canonical Frontier Alpha email shell:
 * dark background, accent bar, mono logo, footer.
 */
export function shell(opts: ShellOptions): string {
  const accent = opts.accent ?? 'sovereign';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>Frontier Alpha</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.bg};color:${COLORS.text};font-family:${FONT_SANS};-webkit-font-smoothing:antialiased;">
${opts.preheader ? `<div style="display:none;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">${escapeHtml(opts.preheader)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.bg};">
  <tr>
    <td align="center" style="padding:0;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:${COLORS.bg};">
        <tr><td>${accentBar(accent)}</td></tr>
        <tr><td>${header()}</td></tr>
        <tr><td>${opts.body}</td></tr>
        <tr><td>${footer()}</td></tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

export interface CardOptions {
  body: string;
  padding?: string;
}

export function card(opts: CardOptions): string {
  const padding = opts.padding ?? '24px';
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.surface};border:1px solid ${COLORS.border};border-radius:8px;">
    <tr>
      <td style="padding:${padding};color:${COLORS.text};font-family:${FONT_SANS};">${opts.body}</td>
    </tr>
  </table>`;
}

export interface CTAOptions {
  href: string;
  label: string;
  accent?: Accent;
}

export function cta(opts: CTAOptions): string {
  const accent = opts.accent ?? 'sovereign';
  const grad = accent === 'halo' ? COLORS.gradHalo : COLORS.gradSovereign;
  const fallback = accent === 'halo' ? COLORS.haloFallback : COLORS.sovereignFallback;
  // Outlook ignores background-image; the solid `background` is the fallback.
  return `<a href="${escapeAttr(opts.href)}" style="display:inline-block;background:${fallback};background-image:${grad};color:${COLORS.white};font-family:${FONT_MONO};font-size:12px;letter-spacing:0.18em;text-transform:uppercase;font-weight:600;text-decoration:none;padding:12px 22px;border-radius:4px;">${escapeHtml(opts.label)}</a>`;
}

export function monoKicker(text: string, color: string = COLORS.textMuted): string {
  return `<div style="font-family:${FONT_MONO};color:${color};font-size:11px;letter-spacing:0.3em;text-transform:uppercase;font-weight:500;">${escapeHtml(text)}</div>`;
}

export function tabularNum(value: string, color: string = COLORS.text, size: string = '24px'): string {
  return `<span style="font-family:${FONT_MONO};color:${color};font-size:${size};font-variant-numeric:tabular-nums;font-weight:600;">${escapeHtml(value)}</span>`;
}

export function spacer(height: number): string {
  return `<div style="height:${height}px;line-height:${height}px;font-size:0;">&nbsp;</div>`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeAttr(value: string): string {
  return escapeHtml(value);
}

export function formatCurrency(value: number, currency: string = 'USD'): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `$${value.toFixed(2)}`;
  }
}

export function formatSignedPct(pct: number, digits: number = 2): string {
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(digits)}%`;
}

export function formatSignedCurrency(value: number, currency: string = 'USD'): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  const abs = Math.abs(value);
  return `${sign}${formatCurrency(abs, currency)}`;
}
