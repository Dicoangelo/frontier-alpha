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
  amethyst: '#7B2CFF',
  cyan: '#18E6FF',
  magenta: '#FF3DF2',
  gold: '#D7B26D',
  teal: '#00FFC6',
  holo: '#5AA7FF',
} as const;

// ─── Semantic Colors (light mode defaults) ────────────────────────────
// These match the CSS custom properties in index.css :root / .dark
export const colors = {
  // Primary action color (accent amethyst)
  primary: brand.amethyst,
  accent: brand.amethyst,
  accentHover: '#6920e0',
  accentLight: 'rgba(123, 44, 255, 0.08)',
  accentSecondary: brand.cyan,

  // Semantic state colors
  positive: '#10b981',
  negative: '#ef4444',
  success: '#10b981',
  danger: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',

  // Text
  text: '#0B1020',
  textSecondary: 'rgba(0, 0, 0, 0.6)',
  textMuted: 'rgba(0, 0, 0, 0.4)',

  // Backgrounds
  bg: '#F8FAFC',
  bgSecondary: 'rgba(255, 255, 255, 0.85)',
  bgTertiary: 'rgba(0, 0, 0, 0.03)',

  // Borders
  border: 'rgba(11, 16, 32, 0.1)',
  borderLight: 'rgba(11, 16, 32, 0.05)',
} as const;

// ─── Dark Mode Overrides ──────────────────────────────────────────────
export const darkColors = {
  primary: brand.amethyst,
  accent: brand.amethyst,
  accentHover: '#9454ff',
  accentLight: 'rgba(123, 44, 255, 0.15)',
  accentSecondary: brand.cyan,

  positive: '#34d399',
  negative: '#f87171',
  success: '#34d399',
  danger: '#f87171',
  warning: '#fbbf24',
  info: '#60a5fa',

  text: '#E6EDF5',
  textSecondary: 'rgba(255, 255, 255, 0.65)',
  textMuted: 'rgba(255, 255, 255, 0.45)',

  bg: '#0F1219',
  bgSecondary: 'rgba(22, 28, 45, 0.55)',
  bgTertiary: 'rgba(255, 255, 255, 0.04)',

  border: 'rgba(255, 255, 255, 0.12)',
  borderLight: 'rgba(255, 255, 255, 0.06)',
} as const;

// ─── Surfaces ─────────────────────────────────────────────────────────
export const surfaces = {
  light: '#F5F7FA',
  dark: '#0B1020',
  deep: '#0F1219',
} as const;

// ─── Alert Severity Scale ─────────────────────────────────────────────
export const severity = {
  critical: { text: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.2)' },
  high:     { text: '#f97316', bg: 'rgba(249, 115, 22, 0.1)', border: 'rgba(249, 115, 22, 0.2)' },
  medium:   { text: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.2)' },
  low:      { text: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)', border: 'rgba(59, 130, 246, 0.2)' },
} as const;

// ─── Factor Category Colors ───────────────────────────────────────────
export const factorColors = {
  momentum:   '#3b82f6',
  quality:    '#10b981',
  value:      '#8b5cf6',
  volatility: '#f97316',
  size:       '#6366f1',
  macro:      '#ef4444',
  sector:     '#06b6d4',
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
