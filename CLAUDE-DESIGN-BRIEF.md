# Claude Design Brief — FrontierAlpha Redesign

Paste this into `claude.ai/design` after linking the GitHub repo. Upload the attachments listed in §7 alongside it.

---

## 1. What we're building

**Product:** FrontierAlpha — AI-Powered Portfolio Intelligence (80+ factor cognitive model, self-improving beliefs, explainable recommendations).
**Company:** Metaventions AI. Brand line: *"Architected Intelligence."*
**Live URL:** https://frontier-alpha.metaventionsai.com
**Repo:** https://github.com/Dicoangelo/frontier-alpha (link this project)
**Scope of this brief:** Landing hero + authenticated Dashboard + Portfolio page. Trading / Options / CVRF follow in round 2.

## 2. Stack constraints (non-negotiable)

- **React 19.2** + **Vite** (no Next.js, no RSC)
- **Tailwind v4** with `@tailwindcss/postcss` and CSS custom properties (tokens live in `client/src/index.css` as `var(--color-*)`)
- **Charts:** Recharts 3.7 + d3 7.9 — do NOT propose Chart.js, Tremor, or Nivo
- **Routing:** `react-router-dom` 7.13
- **State:** Zustand 5 + @tanstack/react-query 5
- **Icons:** `lucide-react` only
- Components must work against existing hooks: `useQuotes`, `useAuthStore`, `@/components/portfolio/*`, `@/components/charts/EquityCurve`
- Light AND dark theme required — tokens already switch via `[data-theme]` on `<html>`

## 3. Brand tokens (Metaventions AI — use these exactly)

```
--bg-obsidian: #05070D       /* deepest dark */
--bg-midnight: #0B1020       /* dark canvas */
--bg-fog:      #F5F7FA       /* light canvas */
--bg-pearl:    #E6EDF5       /* light secondary */

--accent-amethyst: #7B2CFF   /* primary */
--accent-cyan:     #18E6FF   /* secondary */
--accent-magenta:  #FF3DF2
--accent-teal:     #00FFC6
--accent-gold:     #D7B26D   /* premium tier only */
```

**Sovereign Spectrum gradient** (primary brand): `linear-gradient(90deg, #FF3DF2 0%, #7B2CFF 50%, #18E6FF 100%)`
**Glass slab (dark):** `rgba(11,16,32,0.85)` + `backdrop-filter: blur(12px)` + `border: 1px solid rgba(255,255,255,0.1)`
**Typography:** Inter for body, JetBrains Mono for metrics/labels (always `tracking-[0.3em] uppercase` for mono labels)
**Radius:** `rounded-sm` everywhere (sharp, NOT pill-rounded). This is intentional — do not change it.
**Logo rule:** "METAVENTIONS AI" — never abbreviate. "AI" rendered in cyan.

## 4. Audience

Quantitative retail investors + analyst prosumers. They've seen Bloomberg Terminal, Koyfin, and Composer. They hate fintech-consumer cuteness (no rounded neobank pastels, no cartoon mascots). They want **density, precision, and explainability** — but on a modern cognitive-UI surface, not a 1990s trader cockpit.

Think: **Linear × Bloomberg × Arc Browser**, with a purple-amethyst identity.

## 5. The five design pain points (ranked)

Derived from `FRONTIER-ALPHA-PRD-AUDIT.md` — 31 stories across 4 active PRDs, most with scaffolding already in `client/src/components/`.

### P1 — Landing hero is understated for an AI product
Current landing (`client/src/pages/Landing.tsx`): single headline, ticker input, four preset chips, no proof. No visual demonstration that this is an AI cognitive factor engine. Competitors show their product. We tell.
**Want:** A hero that *shows* the factor model working — live animated factor exposure bars, a ticker that types itself, a rotating "because…" explainability caption. Keep the `<input>` CTA and quick-portfolio chips intact.

### P2 — Dashboard lacks a status bar + hierarchical read
`Dashboard.tsx` (489 lines) renders Portfolio Overview, Position List, Factor Exposures, Risk Metrics, Equity Curve, Cognitive Insight in a flat grid. No top status strip (market hours, data freshness, connection state, alert count). No visual weight ordering — every card reads the same. **Want:** DASH-001 status bar across top, DASH-002 position deltas with sparklines (component `PriceChart.tsx` already exists, 263 lines), DASH-005 weight donut (`WeightAllocation.tsx` exists), DASH-003 equity curve with touch/crosshair interaction.

### P3 — Portfolio table is desktop-only, no mobile story
`Portfolio.tsx` (630 lines) uses a horizontal table that overflows on mobile. PRD US-016 is open. **Want:** Card/list hybrid under 768px — show symbol, weight, PnL% hero, expand-to-detail. Use `BottomSheet.tsx` (already exists) for row detail on mobile.

### P4 — Trading and Options use inline color literals instead of tokens
`Options.tsx` is 1,443 lines with ~37 hardcoded `#rrggbb` values. Theme switching is broken on those pages. TRADE-001 / OPT-001 open. **Want:** Replace with `var(--color-*)` — establish a per-domain token layer (`--trade-bid`, `--trade-ask`, `--trade-flat`) that maps to the core palette. Design spec first, code migration second.

### P5 — No micro-interaction language
Skeletons exist (`components/shared/Skeleton.tsx`), toast exists, empty states exist — but there's no unified motion grammar. Page transitions are hard cuts. DASH-006 / TRADE-002 / OPT-002 all open. **Want:** One motion system — staggered fade-in (60ms per item), scale(0.96) on `:active`, holographic text pulse (4s ease-in-out between cyan and amethyst) on primary numbers.

## 6. Deliverables (what Claude Design should produce)

Priority 1 (this session):
1. **Landing hero v2** — Full-bleed dark section, animated factor-bar backdrop, typing ticker demo, persistent input + quick-portfolio chips below. Matching light variant.
2. **Dashboard shell with status bar** — Sticky top strip: market status pill, data-freshness timestamp, WebSocket connection dot, alerts badge. Grid below with 3 priority zones.
3. **Mobile portfolio card** — 320–480px width, expandable row with sparkline.

Priority 2 (round 2):
4. Unified token spec for Trading/Options color semantics.
5. Motion system spec (staggers, easings, durations).
6. Empty state + error illustrations that match the sovereign-spectrum identity.

**Output format:** React components in TSX using Tailwind classes with our CSS vars. Export .zip and hand off to Claude Code when ready.

## 7. Attachments to upload

From `~/projects/frontier-alpha/screenshots/`:
- `current-landing-full.png` — current landing baseline
- `current-pricing.png` — current pricing page (color palette reference)
- `05-dashboard-light.png` — most recent dashboard capture
- `02-portfolio.png` — portfolio page desktop
- `11-pricing-dark.png` — dark theme reference

From `~/visual_assets/finals/` (style references — aesthetic, not copy):
- `convergence-glass.png` — desired glass morphism density
- `landing-dark-fixed-hero.png` — hero composition we like
- `03b-metrics-hero.png` — metric presentation style
- `mobile-hero.png` — mobile hero rhythm

Brand bible: `~/.claude/identity.md` — upload whole file, it has all tokens.

## 8. What NOT to do

- No rounded corners > `rounded-sm`
- No shadcn/ui — we don't have Radix primitives installed
- No dark-mode-only — must ship both themes
- No emoji in final UI
- No Chart.js or alternative chart libs
- Don't rewrite `EquityCurve.tsx` — it has working d3 logic; we're *wrapping* it with new chrome
- Don't break the `?` fallback route or the `/landing` public route

## 9. Success criteria

- Landing hero loads < 2s, LCP element is the headline not an image
- Dashboard status bar always visible, sticky on scroll
- Mobile portfolio usable at 375px width with no horizontal scroll
- All components pass `bun run build` without TypeScript errors
- Theme toggle flips everything (0 hardcoded hex in changed files)

---

**Opening prompt to paste into the Claude Design chat after linking the repo:**

> Redesign FrontierAlpha's landing hero and authenticated dashboard for **React 19 + Vite + Tailwind v4** using the Metaventions AI tokens in the attached `identity.md`. Start with the landing hero — I want a full-bleed dark hero that visually demonstrates the 80-factor cognitive model (animated bar backdrop + typing-ticker demo) with the existing ticker input and quick-portfolio chips preserved below the fold. Match the glass-morphism density in `convergence-glass.png` and the composition in `landing-dark-fixed-hero.png`. Output TSX with `var(--color-*)` tokens only — no hardcoded hex. When the hero is locked, move on to the dashboard status bar (DASH-001) and position sparklines (DASH-002). Repo: github.com/Dicoangelo/frontier-alpha. Target component paths: `client/src/pages/Landing.tsx` and `client/src/pages/Dashboard.tsx`.
