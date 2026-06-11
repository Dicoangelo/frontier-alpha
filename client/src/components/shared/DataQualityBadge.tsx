/**
 * Data Quality Window Badge (IDEA-CIN-4)
 *
 * Surfaces what every quant desk knows but consumer fintech never shows:
 * data reliability varies by clock. The first and last 30 minutes of the
 * US session are auction-driven and noisy; midday is clean; after the
 * close the data is settled. One timestamp comparison, one pill.
 */

import { Activity, CheckCircle2, Moon } from 'lucide-react';

export type QualityWindow = 'noisy' | 'clean' | 'settled';

interface SessionClock {
  /** Minutes since midnight, US/Eastern. */
  minutes: number;
  /** 0 = Sunday … 6 = Saturday, US/Eastern. */
  weekday: number;
}

const SESSION_OPEN = 9 * 60 + 30; // 09:30 ET
const SESSION_CLOSE = 16 * 60; //   16:00 ET
const NOISY_EDGE_MINUTES = 30;

const ET_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour12: false,
  hour: 'numeric',
  minute: 'numeric',
  weekday: 'short',
});

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toEasternClock(date: Date): SessionClock {
  const parts = ET_FORMATTER.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  // Intl may render midnight as "24" with hour12:false in some engines.
  const hour = Number(get('hour')) % 24;
  const minute = Number(get('minute'));
  const weekday = WEEKDAYS.indexOf(get('weekday'));
  return { minutes: hour * 60 + minute, weekday };
}

/**
 * Classify a capture timestamp into its market quality window.
 * Weekends and outside-session hours are 'settled' — the data reflects a
 * completed session rather than a live, possibly-thin tape.
 */
export function getQualityWindow(capturedAt: Date = new Date()): QualityWindow {
  const { minutes, weekday } = toEasternClock(capturedAt);

  const isWeekend = weekday === 0 || weekday === 6;
  if (isWeekend || minutes < SESSION_OPEN || minutes >= SESSION_CLOSE) {
    return 'settled';
  }
  if (minutes < SESSION_OPEN + NOISY_EDGE_MINUTES || minutes >= SESSION_CLOSE - NOISY_EDGE_MINUTES) {
    return 'noisy';
  }
  return 'clean';
}

const WINDOW_COPY: Record<QualityWindow, { label: string; explain: string }> = {
  noisy: {
    label: 'Open/Close Window',
    explain:
      'Captured within 30 minutes of the open or close — auction-driven prices make factor readings less stable.',
  },
  clean: {
    label: 'Mid-Session',
    explain: 'Captured mid-session — the cleanest window for factor readings.',
  },
  settled: {
    label: 'Settled',
    explain: 'Captured outside market hours — reflects the completed session.',
  },
};

interface DataQualityBadgeProps {
  /** When the underlying data was captured. Defaults to "now" (live view). */
  capturedAt?: Date;
  className?: string;
}

export function DataQualityBadge({ capturedAt, className = '' }: DataQualityBadgeProps) {
  const window = getQualityWindow(capturedAt);
  const copy = WINDOW_COPY[window];

  const tone =
    window === 'noisy'
      ? 'text-[var(--color-warning)] border-[var(--color-warning)]/30'
      : window === 'clean'
        ? 'text-[var(--color-positive)] border-[var(--color-positive)]/30'
        : 'text-theme-muted border-theme-light';

  const Icon = window === 'noisy' ? Activity : window === 'clean' ? CheckCircle2 : Moon;

  return (
    <span
      title={copy.explain}
      data-testid="data-quality-badge"
      data-quality-window={window}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border mono text-[10px] tracking-wider uppercase ${tone} ${className}`}
    >
      <Icon className="w-3 h-3" aria-hidden="true" />
      {copy.label}
    </span>
  );
}
