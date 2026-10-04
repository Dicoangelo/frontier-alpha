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
 *                    colors.positive        // '#10b981'
 *                    cssVar('--color-positive')  // 'var(--color-positive)'
 */

// ─── Brand Palette ────────────────────────────────────────────────────
export const brand = {
  amethyst: '#285cc4', cyan: '#327991', magenta: '#7b72b4',
  gold: '#ae7c30', teal: '#318565', holo: '#3972c5',
} as const;

// Mirrors the workspace's light palette. Chart components prefer cssVar().
export const colors = {
  primary: '#285cc4', accent: '#285cc4', accentHover: '#204ca5',
  accentLight: '#eaf0fc', accentSecondary: '#327991',
  positive: '#20764f', negative: '#b43f48', success: '#20764f',
  danger: '#b43f48', warning: '#94620d', info: '#285cc4',
  text: '#202b3c', textSecondary: '#526175', textMuted: '#65748a',
  bg: '#f6f8fb', bgSecondary: '#ffffff', bgTertiary: '#eef2f7',
  border: '#dfe5ed', borderLight: '#edf0f4',
} as const;

export const darkColors = {
  primary: '#366bd0', accent: '#366bd0', accentHover: '#447bdf',
  accentLight: '#273a57', accentSecondary: '#87b4c6',
  positive: '#8ac9a6', negative: '#e3a0a4', success: '#8ac9a6',
  danger: '#e3a0a4', warning: '#dabc7b', info: '#94baff',
  text: '#e6ecf4', textSecondary: '#b8c5d6', textMuted: '#99a9bd',
  bg: '#171d26', bgSecondary: '#1e2632', bgTertiary: '#293344',
  border: '#354153', borderLight: '#2c3747',
} as const;

export const surfaces = {
  light: '#f6f8fb', dark: '#1e2632', deep: '#171d26',
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

  // Brand / accent
  primary:         '--color-primary',
  accent:          '--color-accent',
  accentHover:     '--color-accent-hover',
  accentLight:     '--color-accent-light',
  accentSecondary: '--color-accent-secondary',

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
