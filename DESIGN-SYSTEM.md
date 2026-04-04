# Frontier Alpha — Design System Map

> Generated: 2026-03-25 | Source: `client/src/index.css` + `client/tailwind.config.js` + component scan

---

## 1. CSS Variables (Custom Properties)

All tokens are defined in `client/src/index.css` under `@layer base`. Two scopes: `:root` (light) and `.dark` (dark).

### Backgrounds

| Variable | Light | Dark |
|---|---|---|
| `--color-bg` | `#F8FAFC` | `#0F1219` |
| `--color-bg-secondary` | `rgba(255,255,255,0.85)` | `rgba(22,28,45,0.55)` |
| `--color-bg-tertiary` | `rgba(0,0,0,0.03)` | `rgba(255,255,255,0.04)` |
| `--color-bg-tooltip` | `#0F1219` | `#1a1f2e` |

### Text

| Variable | Light | Dark |
|---|---|---|
| `--color-text` | `#0B1020` | `#E6EDF5` |
| `--color-text-secondary` | `rgba(0,0,0,0.6)` | `rgba(255,255,255,0.65)` |
| `--color-text-muted` | `rgba(0,0,0,0.4)` | `rgba(255,255,255,0.45)` |
| `--color-text-inverse` | `#ffffff` | `#0B1020` |

### Borders

| Variable | Light | Dark |
|---|---|---|
| `--color-border` | `rgba(11,16,32,0.1)` | `rgba(255,255,255,0.12)` |
| `--color-border-light` | `rgba(11,16,32,0.05)` | `rgba(255,255,255,0.06)` |
| `--color-border-hover` | `rgba(11,16,32,0.2)` | `rgba(255,255,255,0.22)` |

### Primary / Accent

| Variable | Light | Dark |
|---|---|---|
| `--color-primary` | `#7B2CFF` | `#7B2CFF` |
| `--color-accent` | `#7B2CFF` | `#7B2CFF` |
| `--color-accent-hover` | `#6920e0` | `#9454ff` |
| `--color-accent-light` | `rgba(123,44,255,0.08)` | `rgba(123,44,255,0.15)` |
| `--color-accent-secondary` | `#18E6FF` | `#18E6FF` |

### Semantic State

| Variable | Light | Dark |
|---|---|---|
| `--color-positive` | `#10b981` | `#34d399` |
| `--color-negative` | `#ef4444` | `#f87171` |
| `--color-success` | `#10b981` | `#34d399` |
| `--color-danger` | `#ef4444` | `#f87171` |
| `--color-warning` | `#f59e0b` | `#fbbf24` |
| `--color-info` | `#3b82f6` | `#60a5fa` |

> Note: `--color-positive` and `--color-success` are duplicates. Same for `--color-negative`/`--color-danger`. Consolidation opportunity.

### Chart Palette

| Variable | Light | Dark |
|---|---|---|
| `--chart-primary` | `#3b82f6` | `#60a5fa` |
| `--chart-secondary` | `#10b981` | `#34d399` |
| `--chart-accent` | `#f59e0b` | `#fbbf24` |
| `--chart-danger` | `#ef4444` | `#f87171` |
| `--chart-purple` | `#8b5cf6` | `#a78bfa` |
| `--chart-cyan` | `#06b6d4` | `#22d3ee` |
| `--chart-pink` | `#EC4899` | `#F472B6` |
| `--chart-teal` | `#14B8A6` | `#2DD4BF` |

### Brand

| Variable | Value (both modes) |
|---|---|
| `--color-brand-teal` | `#00FFC6` |
| `--font-mono` | `'JetBrains Mono', monospace` |
| `--color-card-shadow` | `0 4px 30px rgba(0,0,0,0.03)` (light) / `rgba(0,0,0,0.2)` (dark) |

---

## 2. Tailwind Theme Extensions (`client/tailwind.config.js`)

```
darkMode: 'class'   ← class-based dark mode, controlled by themeStore
```

### Custom Color Scale

```
brand:
  amethyst: #7B2CFF   ← primary accent
  cyan:     #18E6FF   ← secondary accent
  magenta:  #FF3DF2   ← sovereign spectrum start
  gold:     #D7B26D   ← premium tier indicator
  teal:     #00FFC6   ← compute halo
  holo:     #5AA7FF   ← halo end

surface:
  light:    #F5F7FA
  dark:     #0B1020
  deep:     #0F1219   ← sidebar / dark bg

frontier:
  50-900    sky/blue range — used for frontier-specific product accents
```

### Custom Animations (Tailwind)

| Class | Duration | Notes |
|---|---|---|
| `animate-shimmer` | 1.5s infinite | skeleton loading |
| `animate-fade-in` | 0.3s | opacity 0→1 |
| `animate-fade-in-up` | 0.4s | opacity + translateY(10px) |
| `animate-slide-in-right` | 0.3s | translateX(20px)→0 |
| `animate-slide-in-left` | 0.3s | translateX(-20px)→0 |
| `animate-scale-in` | 0.2s | scale(0.95)→1 |
| `animate-bounce-in` | 0.5s | scale(0.3)→1.05→0.9→1 |
| `animate-pulse-subtle` | 2s infinite | opacity 1→0.7 |
| `animate-glow` | 2s infinite alternate | amethyst/cyan box-shadow |
| `animate-pulse-green` | 2s infinite | green ring pulse (live data indicator) |
| `animate-donut-draw` | 0.8s forwards | SVG stroke draw (donut chart) |

---

## 3. CSS Component Classes (`@layer components`)

### Glass Morphism System

| Class | Purpose |
|---|---|
| `.glass-slab` | Standard card/panel (backdrop-blur:16px, saturate:140%) |
| `.glass-slab-floating` | Floating elements — sidebar, dropdowns (blur:24px) |
| `.glass-liquid-subtle` | Subtle gradient glass (blur:25px, saturate:160%) |
| `.glass-modal` | Modal dialogs (blur:30px) |
| `.glass-gold` | Premium/gold tier elements (blur:45px, saturate:200%) |

All glass variants have `.dark` overrides in-place.

### Gradient System

| Class | Colors |
|---|---|
| `.gradient-brand` | `#FF3DF2 → #7B2CFF → #18E6FF` (Sovereign Spectrum, horizontal) |
| `.gradient-brand-135` | Same, 135deg diagonal |
| `.gradient-brand-subtle` | Muted amethyst/cyan background tint |
| `.gradient-gold` | `#D7B26D → #F9D976 → #B38728` |
| `.gradient-halo` | `brand-teal → #18E6FF → #5AA7FF` |
| `.text-gradient-brand` | Text clip version of sovereign spectrum |
| `.text-gradient-gold` | Text clip gold gradient |
| `.text-gradient-halo` | Text clip halo gradient |

### Sovereign Spectrum Border

`.border-sovereign` — gradient border via `padding-box` / `border-box` trick. Dark mode variant included.

### Utility Classes

| Class | Purpose |
|---|---|
| `.mono` | `font-family: var(--font-mono)` |
| `.nav-link` | Underline swipe hover animation |
| `.click-feedback` | scale(0.96) on active |
| `.grid-bg` | Subtle grid lines (light) / radial spectral gradients (dark) |
| `.sovereign-bar` | 3px top accent bar (sovereign spectrum gradient) |
| `.reveal-hidden` / `.reveal-visible` | Scroll-reveal animation pair |
| `.page-transition` | fade-in-up 0.4s on route change |

### Keyframes (CSS-level, not Tailwind)

| Name | Effect |
|---|---|
| `quote-flash-up` | Green flash (600ms, live price update) |
| `quote-flash-down` | Red flash (600ms, live price update) |
| `shimmer` | 2s linear skeleton shimmer |

Dark variants of quote flashes are defined separately.

---

## 4. Theming Strategy

**Implementation:** Zustand store (`client/src/stores/themeStore.ts`) + class on `<html>`

- Modes: `'light' | 'dark' | 'system'`
- Persisted to `localStorage` under key `frontier-theme`
- Default: `dark`
- System preference: `prefers-color-scheme` media query listener
- Applied immediately on load (before React hydrates) — no FOUC

**Strategy:** CSS custom property swap. The `.dark` class on `<html>` causes all `--color-*` variables to resolve to dark-mode values. Tailwind `dark:` prefix variant also works via same `.dark` class.

---

## 5. Typography

| Property | Value |
|---|---|
| Primary font | `'Inter', system-ui, -apple-system, sans-serif` (set on `html`) |
| Monospace font | `'JetBrains Mono', monospace` (CSS variable `--font-mono`, utility `.mono`) |
| Body rendering | `antialiased` (via Tailwind) |

**Font size scale used in components:**
- `text-xs` — badge labels, metadata
- `text-sm` — secondary content, small buttons
- `text-base` — body default, medium buttons
- `text-lg` — card titles, large buttons
- `text-xl` / `text-2xl` — page headers (inferred from usage)

**Weight usage:** `font-medium` (buttons), `font-semibold` (card titles, nav), `font-bold` (metrics, values)

---

## 6. Spacing & Layout

**Spacing convention (documented in `index.css`):**
```
Cards:    p-4 sm:p-6
Sections: gap-4 sm:gap-6
Pages:    p-4 sm:p-6 lg:p-8
```

**Layout grid:**
- Sidebar: fixed, `w-64`, `lg:block` (hidden on mobile)
- Main content: `lg:ml-64 mt-16 pb-20 lg:pb-8`
- Mobile nav: bottom bar, `lg:hidden`
- Header: fixed `h-16`

**Responsive breakpoints:** Standard Tailwind (`sm`, `md`, `lg`, `xl`) — no custom breakpoints defined.

**Touch targets:** `min-h-[44px] min-w-[44px]` enforced on all button sizes (Button + IconButton components).

---

## 7. Component Library Inventory

### Shared Components (`components/shared/`)

**UI Primitives:**
- `Button` — 5 variants (primary/secondary/danger/ghost/outline), 3 sizes, loading state, left/right icon slots
- `IconButton` — same variants, fixed square sizing, `aria-label` required
- `Card` — `glass-slab` wrapper, optional title + action slot
- `Badge` — 6 variants (success/warning/danger/info/neutral/default), uses `color-mix()` for bg tint
- `Spinner` — loading indicator
- `ScrollableTable` — horizontal scroll wrapper for data tables

**Loading & Skeleton:**
- `Skeleton` — text/rectangular/circular variants, multi-line support
- `SkeletonCard`, `SkeletonStatCard`, `SkeletonTableRow` — pre-built composites
- 13 page-specific skeleton screens (Dashboard, Portfolio, PositionList, FactorExposures, RiskMetrics, Chart, EarningsCalendar, EarningsPage, FactorsPage, OptionsPage, SettingsPage, CVRFPage, SharedPortfolioPage)

**Feedback & States:**
- `Toast` + `ToastContainer` — notification system
- `EmptyState` — generic; 8 pre-built variants (EmptyPortfolio, EmptyAlerts, EmptySearchResults, EmptyEarnings, NetworkError, DataLoadError, NoFactorData)
- `ConnectionStatus` — WebSocket connection indicator
- `MockDataBanner` — dev/demo mode banner

**Structural:**
- `ErrorBoundary`, `SectionErrorBoundary`, `withErrorBoundary`
- `PageTransition` — route-change fade-in-up via `key={location.pathname}`
- `VisuallyHidden`, `LiveRegion`, `SkipToMain`, `announce` — accessibility layer

**Mobile:**
- `PullToRefresh` — native-feel pull gesture
- `BottomSheet` + `useBottomSheet` hook

**Upgrade/Gate:**
- `UpgradeGate` — feature gating wrapper
- `UpgradeBanner` — CTA banner

### Layout Components (`components/layout/`)
- `Layout` — root shell: Header + Sidebar + MobileNav + HelpPanel + KeyboardHelpModal + PageTransition
- `Header` — top bar with menu/help toggle, theme toggle
- `Sidebar` — desktop nav (fixed, `w-64`)
- `MobileNav` — bottom tab bar
- `Sidebar.test.tsx` — test coverage present

### Feature Components

| Directory | Contents |
|---|---|
| `auth/` | LoginForm, SignupForm |
| `alerts/` | AlertCard, AlertDropdown, FactorDriftAlert, SECFilingAlert |
| `analytics/` | PerformanceAttribution |
| `charts/` | EquityCurve, MonteCarloChart |
| `cvrf/` | CVRFDashboard, CVRFBeliefDisplay, CVRFCycleHistory, CVRFEpisodeControls, CVRFEpisodeTimeline, CVRFStatsCard, EpisodeComparison, EpisodePerformanceChart, FactorWeightHeatmap, MetaPromptCard, RegimeTimeline, BeliefConstellation (test only) |
| `earnings/` | BeliefImpactPanel, EarningsCalendar, EarningsForecast, EarningsHeatmap, HistoricalReactions |
| `explainer/` | CognitiveInsight, ExplanationCard, TradeReasoning |
| `factors/` | FactorBar, FactorExposures |
| `help/` | HelpButton, HelpPanel, HelpTooltip |
| `ml/` | FactorAttribution, ModelVersions, RegimeDetector |
| `notifications/` | NotificationSettings |
| `onboarding/` | OnboardingProvider, WelcomeModal, FeatureTour |
| `options/` | GreeksHeatmap, OptionsChain, StrategySelector, VolSurface |
| `portfolio/` | PortfolioOverview, PositionList, ShareModal, WeightAllocation |
| `risk/` | RiskMetrics |
| `settings/` | APIKeys, NotificationSettings |
| `trading/` | AccountSummary, OrderHistory, OrderPreviewModal, PriceChart, TradeExecutor |

### Component Patterns Observed
- **Variant map pattern** — `Button`, `Badge` use `const variants = {}` lookup tables
- **Pre-built composite pattern** — `EmptyState` has 8 named pre-builts; `Skeleton` has page-specific screens
- **Provider + hook** — `BottomSheet` exposes `useBottomSheet`; `OnboardingProvider` wraps tree
- **Index barrel exports** — `shared/index.ts`, `cvrf/index.ts`, `help/index.ts`, `trading/index.ts`, `onboarding/index.ts`
- No framer-motion detected — all animation is pure CSS (Tailwind keyframes + custom `@keyframes`)
- No compound component pattern observed
- No render prop pattern observed

---

## 8. Hardcoded Color Audit

**Files with hardcoded hex/rgba values in components:**

| File | Severity | Detail |
|---|---|---|
| `components/help/HelpTooltip.tsx` | Low | `#0F1219` used as fallback in `var(--color-bg-tooltip, #0F1219)` — acceptable fallback pattern |
| `components/options/GreeksHeatmap.tsx` | Medium | Dynamically computed `rgb(r,g,b)` in `getColor()` function for heatmap cell coloring; `#fff` fallback in CSS var call |

**Assessment:** Hardcoded colors are minimal and contextually justified (heatmap = computed interpolation, tooltip = safe fallback). No rogue `#hex` values in arbitrary component styles.

---

## 9. Animation System Summary

**Three layers:**

1. **Tailwind `animate-*` classes** (defined in `tailwind.config.js` keyframes) — entry animations, loading states, glow effects
2. **CSS `@keyframes` in `index.css`** — quote flash (price update feedback), skeleton shimmer
3. **Tailwind `transition-*` utilities** — hover/active state transitions on interactive elements

**No framer-motion.** Zero dependency on external animation library.

**Reduced motion:** `@media (prefers-reduced-motion: reduce)` collapses all `animation-duration` to `0.01ms` and `transition-duration` to `0.01ms` globally.

---

## 10. What Is Already Well-Systematized

- **Color system** — comprehensive dual-mode CSS variable system. Every color has a light/dark pair. `--color-*` naming is consistent and semantic.
- **Theming** — Zustand store with localStorage persistence, system preference detection, no FOUC.
- **Glass morphism** — 5 well-named utility classes covering all use cases (slab, floating, modal, subtle, gold).
- **Animation vocabulary** — 10 named keyframe animations covering all common UI motion needs.
- **Shared component library** — Button, Badge, Card, Skeleton, EmptyState, Toast all exist and are used. Barrel exports through `shared/index.ts`.
- **Accessibility baseline** — VisuallyHidden, LiveRegion, SkipToMain, focus ring management, 44px touch targets.
- **Gradient language** — sovereign spectrum (magenta→amethyst→cyan) is consistently applied in gradients, borders, nav underlines, and top bar.

---

## 11. What Is Ad-Hoc / Could Be Improved

### Duplicate semantic tokens
`--color-positive` = `--color-success`, `--color-negative` = `--color-danger`. Both pairs are defined redundantly. Pick one per meaning and alias the other.

### `color-mix()` in Badge
`Badge` uses `color-mix(in_srgb, var(--color-positive) 10%, transparent)` for tinted backgrounds. This is modern but has limited browser support in older targets. An explicit `--color-positive-bg` token would be more portable.

### Inline CSS var references in JSX
Several components use `text-[var(--color-text)]`, `bg-[var(--color-bg-secondary)]` directly in className strings rather than the utility classes defined in `@layer utilities` (`.text-theme`, `.bg-theme-secondary`). These custom utility classes exist but adoption is inconsistent.

### `frontier.*` Tailwind scale underused
The `frontier.50–900` blue scale in `tailwind.config.js` appears to be a product-specific color ramp that's not reflected in the CSS variable system. Unclear if it's actively used or a leftover from initial setup.

### No explicit spacing token system
Spacing follows the convention in the CSS comment (`p-4 sm:p-6`) but there are no spacing tokens — it's purely documented convention, not enforced. A `spacing` extension in Tailwind config (or semantic spacing classes) would make this machine-enforceable.

### No explicit z-index token layer
Z-index values are scattered as bare Tailwind (`z-40`, `z-50`) or inline. A `z-index` scale in the Tailwind config (e.g., `z-modal`, `z-overlay`, `z-sidebar`) would prevent stacking collisions.

### Two `NotificationSettings` components
`components/notifications/NotificationSettings.tsx` and `components/settings/NotificationSettings.tsx` appear to duplicate the same feature. Consolidation needed.

---

## 12. Stitch Integration Opportunities

### Tokens that map directly to Stitch

| Current token | Stitch equivalent |
|---|---|
| `--color-bg` / `--color-bg-secondary` / `--color-bg-tertiary` | `surface.default`, `surface.raised`, `surface.sunken` |
| `--color-text` / `--color-text-secondary` / `--color-text-muted` | `text.primary`, `text.secondary`, `text.disabled` |
| `--color-border` / `--color-border-light` / `--color-border-hover` | `border.default`, `border.subtle`, `border.interactive` |
| `--color-positive` / `--color-negative` / `--color-warning` / `--color-info` | `semantic.success`, `semantic.error`, `semantic.warning`, `semantic.info` |
| `--color-accent` / `--color-accent-hover` / `--color-accent-light` | `brand.primary`, `brand.primary.hover`, `brand.primary.subtle` |
| `--chart-*` (8 colors) | `data-viz.1` through `data-viz.8` |

### Components that could be Stitch-backed

| Component | Migration effort | Notes |
|---|---|---|
| `Button` | Low | Already uses token references; map variant classes to Stitch button variants |
| `Badge` | Low | Token-based; map variant map to Stitch badge component |
| `Card` | Low | Thin wrapper over `glass-slab`; would benefit from Stitch surface token |
| `Skeleton` | Medium | Works well; shimmer animation could become a Stitch pattern |
| `EmptyState` | Medium | Good structure; icon slot + action slot matches Stitch empty state API |
| `Toast` | Medium | Custom implementation; Stitch toast would unify notification behavior |
| `BottomSheet` | High | Mobile-specific; custom gesture handling |
| All skeleton screens | High | Page-level compositions — keep as-is until Stitch page templates exist |

### Migration Path Recommendation

**Phase 1 — Token Alignment (no visual change):**
1. Deduplicate `--color-positive`/`--color-success` and `--color-negative`/`--color-danger`
2. Add `--color-positive-bg`, `--color-negative-bg`, etc. as explicit tint tokens (replace `color-mix()` in Badge)
3. Add z-index tokens to Tailwind config (`z-overlay`, `z-modal`, `z-sidebar`, `z-tooltip`)
4. Consolidate the two `NotificationSettings` components

**Phase 2 — Utility Class Adoption:**
1. Audit and replace `text-[var(--color-text)]` inline patterns with `.text-theme`, `.text-theme-secondary`, `.text-theme-muted` across all components
2. Enforce spacing convention with a lint rule or Tailwind preset

**Phase 3 — Stitch Component Swap:**
1. Start with `Button` and `Badge` (lowest risk, token-aligned)
2. Move `Card` to Stitch surface component
3. Move `Toast` to Stitch notification system
4. Evaluate `EmptyState` and `Skeleton` — keep custom if Stitch equivalents don't cover financial data patterns

**Do NOT migrate:**
- Glass morphism classes (`.glass-slab`, `.glass-modal`) — domain-specific visual language, not generic UI
- Sovereign spectrum gradient utilities — brand identity, not systematizable into generic tokens
- Quote flash animations — trading domain-specific, unlikely to exist in Stitch
- The `grid-bg` dark mode gradient background — pure aesthetic, keep in `index.css`

---

## 13. Quick Reference Card

```
DESIGN SYSTEM ENTRYPOINTS:
  Tokens:         client/src/index.css (:root and .dark)
  Tailwind ext:   client/tailwind.config.js
  Theme store:    client/src/stores/themeStore.ts
  Shared lib:     client/src/components/shared/index.ts

BRAND COLORS:
  Primary:        #7B2CFF  (amethyst)
  Secondary:      #18E6FF  (cyan)
  Spectrum start: #FF3DF2  (magenta)
  Gold:           #D7B26D
  Teal:           #00FFC6

GLASS MORPHISM:
  Standard card:  .glass-slab
  Floating panel: .glass-slab-floating
  Modal:          .glass-modal

THEMING:
  Strategy:       CSS vars + .dark class on <html>
  Toggle:         useThemeStore().toggle()
  Default mode:   dark
```
