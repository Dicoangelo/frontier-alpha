import { useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * US-005: <DegradedService> — reusable primitive for "this service is in a
 * degraded mode, the app is fine" affordances.
 *
 * Cross-cutting P2 (extract reusable primitives, not instance fixes). Today
 * <ConnectionStatus> uses this for the WebSocket fallback pill. v1.4 will
 * route the rate limiter banner, AI explainer slow-path, and billing webhook
 * lag indicators through the same component.
 *
 * Visual register:
 * - Pill (default `pill-bottom-right`): glass-slab-floating + dim type-rail.
 *   The user must NOT think "data is wrong" — they must think "live updates
 *   off, polling instead". Subdued severity glow, mono micro-copy.
 * - Banner (`banner-top`): full-width type-rail variant for store-level
 *   degradation (e.g. AI explainer slow). Same component, different chrome.
 *
 * Mobile: the bottom-right pill respects `safe-area-inset-bottom` so it
 * doesn't crash into the iOS home indicator or the in-app bottom nav on
 * notched devices.
 *
 * Props:
 * - service: human-readable service label (e.g. "Live feed", "AI explainer")
 * - reason: short close-reason / status detail (rendered in tooltip on the
 *   pill, inline on the banner). Examples: "WebSocket closed with code 1006",
 *   "Provider rate-limited · retrying in 4s".
 * - severity: 'info' | 'warning' | 'error' (default 'warning')
 * - onRetry: optional click handler. When provided, renders a "Reconnect"
 *   text button with a refresh icon. The handler is expected to clear any
 *   abandoned flags and trigger a fresh attempt; the parent decides whether
 *   to optimistically hide the pill or wait for the next state event.
 * - position: 'pill-bottom-right' (default) | 'banner-top'
 */

export type DegradedServiceSeverity = 'info' | 'warning' | 'error';
export type DegradedServicePosition = 'pill-bottom-right' | 'banner-top';

export interface DegradedServiceProps {
  service: string;
  reason: string;
  severity?: DegradedServiceSeverity;
  onRetry?: () => void;
  position?: DegradedServicePosition;
}

interface SeverityTokens {
  rail: string;        // before-pseudo bg color class
  text: string;        // copy + icon color class
  glow: string;        // outer glow shadow class
  ring: string;        // focus-visible ring color class
}

const SEVERITY_TOKENS: Record<DegradedServiceSeverity, SeverityTokens> = {
  info: {
    rail: 'before:bg-[var(--color-info)]',
    text: 'text-[var(--color-info)]',
    glow: 'shadow-[0_18px_60px_-20px_rgba(59,130,246,0.35)]',
    ring: 'focus-visible:ring-[var(--color-info)]',
  },
  warning: {
    rail: 'before:bg-[var(--color-warning)]',
    text: 'text-[var(--color-warning)]',
    glow: 'shadow-[0_18px_60px_-20px_rgba(245,158,11,0.4)]',
    ring: 'focus-visible:ring-[var(--color-warning)]',
  },
  error: {
    rail: 'before:bg-[var(--color-negative)]',
    text: 'text-[var(--color-negative)]',
    glow: 'shadow-[0_18px_60px_-20px_rgba(239,68,68,0.4)]',
    ring: 'focus-visible:ring-[var(--color-negative)]',
  },
};

export function DegradedService({
  service,
  reason,
  severity = 'warning',
  onRetry,
  position = 'pill-bottom-right',
}: DegradedServiceProps) {
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const tokens = SEVERITY_TOKENS[severity];
  const ariaLabel = `${service} degraded — ${reason}`;

  if (position === 'banner-top') {
    return (
      <div
        role="status"
        aria-live="polite"
        data-degraded-service={service}
        data-degraded-severity={severity}
        className={`
          glass-slab-floating relative overflow-hidden
          rounded-none border-y border-theme
          pl-5 pr-4 py-2 flex items-center justify-center gap-3
          before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0
          before:w-[3px]
          ${tokens.rail} ${tokens.glow} ${tokens.text}
        `}
      >
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <p className="mono text-[10px] sm:text-xs tracking-[0.25em] uppercase font-medium">
          <span>{service} degraded</span>
          <span className="ml-2 opacity-70 normal-case tracking-normal">
            {reason}
          </span>
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className={`
              ml-2 inline-flex items-center gap-1
              mono text-[10px] tracking-[0.25em] uppercase font-medium
              px-2 py-1 rounded-sm
              hover:opacity-80 animate-press
              focus:outline-none focus-visible:ring-2 ${tokens.ring}
              transition-opacity duration-200
            `}
            aria-label={`Retry ${service}`}
          >
            <RefreshCw className="w-3 h-3" aria-hidden="true" />
            <span>Retry</span>
          </button>
        )}
      </div>
    );
  }

  // Default: pill, bottom-right, mobile-safe.
  // Positioning: fixed bottom-right with safe-area-inset padding so iOS
  // notch / Android nav bar doesn't clip it. z-40 sits below modals (z-50)
  // and toasts (z-50+).
  return (
    <div
      role="status"
      aria-live="polite"
      data-degraded-service={service}
      data-degraded-severity={severity}
      style={{
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)',
        right: 'calc(env(safe-area-inset-right, 0px) + 1rem)',
      }}
      className={`
        glass-slab-floating fixed z-40
        rounded-full pl-4 pr-2 py-2 flex items-center gap-2
        before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0
        before:w-[3px] before:rounded-l-full
        ${tokens.rail} ${tokens.glow} ${tokens.text}
        opacity-90 hover:opacity-100
        transition-[opacity,transform] duration-300
      `}
    >
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full bg-current`}
        aria-hidden="true"
      />
      <span
        className="mono text-[10px] tracking-[0.25em] uppercase font-medium"
        // Tooltip: hover on desktop, long-press on mobile (native title is the
        // baseline for touch, the local state lets us add a glass tooltip if
        // we want to upgrade later).
        title={reason}
        aria-label={ariaLabel}
        onMouseEnter={() => setTooltipOpen(true)}
        onMouseLeave={() => setTooltipOpen(false)}
        onFocus={() => setTooltipOpen(true)}
        onBlur={() => setTooltipOpen(false)}
        tabIndex={0}
      >
        {service} · polling mode
      </span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className={`
            inline-flex items-center gap-1 ml-1 px-2 py-0.5 rounded-full
            mono text-[10px] tracking-[0.25em] uppercase font-medium
            hover:opacity-80 animate-press
            focus:outline-none focus-visible:ring-2 ${tokens.ring}
            transition-opacity duration-200
          `}
          aria-label={`Reconnect ${service}`}
        >
          <RefreshCw className="w-3 h-3" aria-hidden="true" />
          <span>Reconnect</span>
        </button>
      )}
      {tooltipOpen && (
        <span
          role="tooltip"
          className="
            absolute right-0 -top-9
            glass-slab-floating rounded-md px-2 py-1
            mono text-[9px] tracking-[0.2em] uppercase
            text-theme-muted whitespace-nowrap
            pointer-events-none
          "
        >
          {reason}
        </span>
      )}
    </div>
  );
}
