import type React from 'react';

/**
 * Metaventions AI Design System — Theme Constants
 *
 * Single source of truth for all colors, spacing, and design tokens.
 * CSS custom properties are defined in index.css; this file mirrors them
 * as TypeScript constants for use in JS/TS (e.g. chart libraries, inline styles).
 *
 * Usage:
 *   CSS/Tailwind  → var(--color-positive)  or  text-accent
 *   TypeScript     → import { colors, cssVar } from '@/lib/theme'
 *                    colors.positive        // '#197764'
 *                    cssVar('--color-positive')  // 'var(--color-positive)'
 */

// ─── Brand Palette ────────────────────────────────────────────────────
export const brand = {
  amethyst: '#176b96', cyan: '#167c80', magenta: '#7976a8',
  gold: '#ae803d', teal: '#268573', holo: '#247fac',
} as const;

// Mirrors the workspace's light palette. Chart components prefer cssVar().
export const colors = {
  primary: '#176b96', accent: '#176b96', accentHover: '#12577b',
  accentLight: '#e7f2f8', accentSecondary: '#167c80',
  accentSecondaryText: '#146f73',
  actionPrimary: '#176b96', actionPrimaryHover: '#12577b',
  actionDanger: '#b5474d', actionDangerHover: '#a2363e', actionPositive: '#197764',
  positive: '#197764', negative: '#b5474d', success: '#197764',
  danger: '#b5474d', warning: '#94631f', info: '#176b96',
  text: '#182b3a', textSecondary: '#4f6475', textMuted: '#5b6f81',
  bg: '#f1f4f7', bgSecondary: '#ffffff', bgTertiary: '#eaf0f4',
  border: '#d7e0e7', borderLight: '#e8edf1', controlBorder: '#788a99', focus: '#176b96',
} as const;

export const darkColors = {
  primary: '#257da9', accent: '#257da9', accentHover: '#1b6c95',
  accentLight: '#203f53', accentSecondary: '#7ec3c5',
  accentSecondaryText: '#7ec3c5',
  actionPrimary: '#23769f', actionPrimaryHover: '#1b6c95',
  actionDanger: '#b5474d', actionDangerHover: '#a2363e', actionPositive: '#197764',
  positive: '#7fcbb4', negative: '#e5a0a6', success: '#7fcbb4',
  danger: '#e5a0a6', warning: '#ddbc82', info: '#8dc8e6',
  text: '#e3ecf3', textSecondary: '#b7c8d6', textMuted: '#93aabe',
  bg: '#101923', bgSecondary: '#17232f', bgTertiary: '#213141',
  border: '#314353', borderLight: '#253747', controlBorder: '#748b9e', focus: '#8dc8e6',
} as const;

export const surfaces = {
  light: '#f1f4f7', dark: '#17232f', deep: '#101923',
} as const;

// Semantic states follow the selected appearance, including tooltip text.
export const severity = {
  critical: { text: 'var(--color-negative)', bg: 'color-mix(in srgb, var(--color-negative) 8%, transparent)', border: 'color-mix(in srgb, var(--color-negative) 24%, transparent)' },
  high: { text: 'var(--color-warning)', bg: 'color-mix(in srgb, var(--color-warning) 8%, transparent)', border: 'color-mix(in srgb, var(--color-warning) 24%, transparent)' },
  medium: { text: 'var(--color-warning)', bg: 'color-mix(in srgb, var(--color-warning) 8%, transparent)', border: 'color-mix(in srgb, var(--color-warning) 24%, transparent)' },
  low: { text: 'var(--color-info)', bg: 'var(--color-accent-light)', border: 'var(--color-border)' },
} as const;

export const factorColors = {
  momentum: 'var(--chart-primary)', quality: 'var(--chart-secondary)',
  value: 'var(--chart-purple)', volatility: 'var(--chart-accent)',
  size: 'var(--chart-teal)', macro: 'var(--chart-danger)', sector: 'var(--chart-cyan)',
} as const;

// ─── CSS Variable Helper ──────────────────────────────────────────────
// Returns a CSS var() reference for use in inline styles
export function cssVar(name: string): string {
  return `var(${name})`;
}

// ─── CSS Variable Names (mirrors index.css) ───────────────────────────
// Use these when referencing CSS custom properties programmatically
export const cssVars = {
  // Core
  bg:              '--color-bg',
  bgSecondary:     '--color-bg-secondary',
  bgTertiary:      '--color-bg-tertiary',
  text:            '--color-text',
  textSecondary:   '--color-text-secondary',
  textMuted:       '--color-text-muted',
  border:          '--color-border',
  borderLight:     '--color-border-light',
  controlBorder:   '--color-control-border',
  focus:           '--color-focus',

  // Brand / accent
  primary:         '--color-primary',
  accent:          '--color-accent',
  accentHover:     '--color-accent-hover',
  accentLight:     '--color-accent-light',
  accentSecondary: '--color-accent-secondary',
  accentSecondaryText: '--color-accent-secondary-text',
  actionPrimary:   '--color-action-primary',
  actionPrimaryHover: '--color-action-primary-hover',
  actionDanger:    '--color-action-danger',
  actionDangerHover: '--color-action-danger-hover',
  actionPositive:  '--color-action-positive',

  // Semantic states
  positive:        '--color-positive',
  negative:        '--color-negative',
  success:         '--color-success',
  danger:          '--color-danger',
  warning:         '--color-warning',
  info:            '--color-info',

  // Brand
  brandTeal:       '--color-brand-teal',

  // Misc
  cardShadow:      '--color-card-shadow',
  fontMono:        '--font-mono',
} as const;

// ─── Spacing Scale ────────────────────────────────────────────────────
// Matches Tailwind's default spacing scale for consistency
export const spacing = {
  0:    '0px',
  0.5:  '0.125rem',
  1:    '0.25rem',
  1.5:  '0.375rem',
  2:    '0.5rem',
  2.5:  '0.625rem',
  3:    '0.75rem',
  4:    '1rem',
  5:    '1.25rem',
  6:    '1.5rem',
  8:    '2rem',
  10:   '2.5rem',
  12:   '3rem',
  16:   '4rem',
  20:   '5rem',
  24:   '6rem',
} as const;

// ─── Typography ───────────────────────────────────────────────────────
export const fonts = {
  sans: "'Inter', system-ui, -apple-system, sans-serif",
  mono: "'JetBrains Mono', monospace",
} as const;

// ─── Category Colors (for CVRF, charts, multi-series) ───────────────
// Maps to CSS chart variables — use these in D3/canvas/SVG code
export const categoryColors: Record<string, string> = {
  style:      'var(--chart-primary)',
  quality:    'var(--chart-secondary)',
  volatility: 'var(--chart-danger)',
  sentiment:  'var(--chart-purple)',
  macro:      'var(--chart-accent)',
  sector:     'var(--chart-cyan)',
};

// Ordered palette for multi-series charts (conviction timeline, etc.)
export const chartPalette = [
  'var(--chart-primary)',
  'var(--chart-secondary)',
  'var(--chart-danger)',
  'var(--chart-purple)',
  'var(--chart-accent)',
  'var(--chart-cyan)',
  'var(--chart-pink)',
  'var(--chart-teal)',
];

// Semantic gauge colors (conviction, confidence, etc.)
export function gaugeColor(value: number): string {
  if (value >= 0.7) return 'var(--color-positive)';
  if (value >= 0.4) return 'var(--color-warning)';
  return 'var(--color-negative)';
}

// ─── Recharts Shared Styles ──────────────────────────────────────────
// Reuse across all Recharts <Tooltip contentStyle={...} /> instances.
// `color` is set explicitly because Recharts otherwise inherits from a
// neutral default that disappears against the dark surface in dark mode
// (was rendering black-on-dark in dark mode previously).
export const rechartsTooltipStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-bg-secondary, var(--color-bg, #fff))',
  border: '1px solid var(--color-border)',
  borderRadius: '8px',
  fontSize: '12px',
  color: 'var(--color-text)',
  boxShadow: '0 4px 16px rgba(25, 43, 69, 0.12)',
};

// Recharts <Tooltip> draws individual entries via separate <li> nodes that
// inherit color from their inline-styled wrapper, NOT from `contentStyle`.
// Pass these to `itemStyle` and `labelStyle` so the per-entry text is
// readable in both themes.
export const rechartsTooltipItemStyle: React.CSSProperties = {
  color: 'var(--color-text)',
};

export const rechartsTooltipLabelStyle: React.CSSProperties = {
  color: 'var(--color-text-muted)',
  fontSize: '11px',
  marginBottom: '4px',
};

// ─── Full Theme Export ────────────────────────────────────────────────
export const theme = {
  brand,
  colors,
  darkColors,
  surfaces,
  severity,
  factorColors,
  spacing,
  fonts,
  cssVar,
  cssVars,
} as const;

export default theme;
