import { useEffect, useMemo, useState } from 'react';
import { useAlertsStore } from '@/stores/alertsStore';

type MarketPhase = 'pre' | 'open' | 'post' | 'closed';

interface MarketStatusStripProps {
  isConnected: boolean;
  lastUpdate: number | null;
}

function getMarketPhase(now: Date): { phase: MarketPhase; nextChange: Date; nextLabel: string } {
  // US Eastern Time calculation — naive, ignores holidays
  const easternOffsetMs = (() => {
    // DST rough: US DST runs second Sunday March → first Sunday November
    const m = now.getUTCMonth();
    const d = now.getUTCDate();
    const dstApprox = (m > 2 && m < 10) || (m === 2 && d > 7) || (m === 10 && d < 7);
    return (dstApprox ? -4 : -5) * 60 * 60 * 1000;
  })();

  const et = new Date(now.getTime() + easternOffsetMs);
  const day = et.getUTCDay();
  const hour = et.getUTCHours();
  const minute = et.getUTCMinutes();
  const minutesSinceMidnight = hour * 60 + minute;

  const PRE_START = 4 * 60;        // 04:00 ET
  const OPEN = 9 * 60 + 30;        // 09:30 ET
  const CLOSE = 16 * 60;           // 16:00 ET
  const POST_END = 20 * 60;        // 20:00 ET

  const setET = (mins: number): Date => {
    const target = new Date(et);
    target.setUTCHours(0, mins, 0, 0);
    return new Date(target.getTime() - easternOffsetMs);
  };

  const isWeekend = day === 0 || day === 6;
  if (isWeekend) {
    // Next Monday 09:30 ET
    const daysToMon = day === 0 ? 1 : 2;
    const next = setET(OPEN);
    next.setUTCDate(next.getUTCDate() + daysToMon);
    return { phase: 'closed', nextChange: next, nextLabel: 'Opens' };
  }

  if (minutesSinceMidnight < PRE_START) {
    return { phase: 'closed', nextChange: setET(PRE_START), nextLabel: 'Pre-market' };
  }
  if (minutesSinceMidnight < OPEN) {
    return { phase: 'pre', nextChange: setET(OPEN), nextLabel: 'Opens' };
  }
  if (minutesSinceMidnight < CLOSE) {
    return { phase: 'open', nextChange: setET(CLOSE), nextLabel: 'Closes' };
  }
  if (minutesSinceMidnight < POST_END) {
    return { phase: 'post', nextChange: setET(POST_END), nextLabel: 'After-hours ends' };
  }
  // Evening — next open tomorrow (unless Friday → Monday)
  const daysAhead = day === 5 ? 3 : 1;
  const next = setET(OPEN);
  next.setUTCDate(next.getUTCDate() + daysAhead);
  return { phase: 'closed', nextChange: next, nextLabel: 'Opens' };
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  return `${seconds}s`;
}

function formatAgo(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 2) return 'live';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  return `${Math.floor(min / 60)}h ago`;
}

const PHASE_LABEL: Record<MarketPhase, string> = {
  pre: 'Pre-Market',
  open: 'Open',
  post: 'After-Hours',
  closed: 'Closed',
};

const PHASE_COLOR: Record<MarketPhase, string> = {
  pre: 'var(--color-warning)',
  open: 'var(--color-positive)',
  post: 'var(--color-warning)',
  closed: 'var(--color-text-muted)',
};

export function MarketStatusStrip({ isConnected, lastUpdate }: MarketStatusStripProps) {
  const [now, setNow] = useState<Date>(() => new Date());
  const [helpOpen, setHelpOpen] = useState(false);
  const unreadAlerts = useAlertsStore((s) => s.unreadCount);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '?' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        setHelpOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setHelpOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const { phase, nextChange, nextLabel } = useMemo(() => getMarketPhase(now), [now]);
  const countdown = formatCountdown(nextChange.getTime() - now.getTime());
  const freshnessMs = lastUpdate ? now.getTime() - lastUpdate : null;
  const freshnessColor =
    freshnessMs === null
      ? 'var(--color-text-muted)'
      : freshnessMs > 60_000
      ? 'var(--color-danger)'
      : freshnessMs > 15_000
      ? 'var(--color-warning)'
      : 'var(--color-text-muted)';

  const wsColor = isConnected ? 'var(--color-positive)' : 'var(--color-danger)';
  const wsAnim = isConnected ? 'animate-pulse-green' : '';

  return (
    <div
      className="sticky top-0 z-40 w-full backdrop-blur-md bg-[var(--color-bg-secondary)] border-b border-[var(--color-border-light)]"
      role="status"
      aria-label="Market status strip"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-9 flex items-center justify-between gap-4 text-[10px] mono tracking-[0.2em] uppercase">
        <div className="flex items-center gap-3 sm:gap-5 min-w-0 overflow-hidden">
          <span
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-sm border"
            style={{
              color: PHASE_COLOR[phase],
              borderColor: `color-mix(in srgb, ${PHASE_COLOR[phase]} 30%, transparent)`,
              backgroundColor: `color-mix(in srgb, ${PHASE_COLOR[phase]} 10%, transparent)`,
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: PHASE_COLOR[phase] }}
              aria-hidden="true"
            />
            {PHASE_LABEL[phase]}
          </span>

          <span className="hidden sm:inline text-[var(--color-text-muted)]">
            <span className="text-[var(--color-text-secondary)]">{nextLabel}</span>
            <span className="ml-2 tabular-nums">{countdown}</span>
          </span>

          <span className="hidden md:inline" style={{ color: freshnessColor }}>
            Quote <span className="tabular-nums">{freshnessMs === null ? '—' : formatAgo(freshnessMs)}</span>
          </span>
        </div>

        <div className="flex items-center gap-3 sm:gap-5 shrink-0">
          <span className="hidden sm:flex items-center gap-1.5 text-[var(--color-text-muted)]">
            <span
              className={`w-1.5 h-1.5 rounded-full ${wsAnim}`}
              style={{ backgroundColor: wsColor }}
              aria-hidden="true"
            />
            {isConnected ? 'Stream' : 'Offline'}
          </span>

          {unreadAlerts > 0 && (
            <span
              className="flex items-center gap-1 px-2 py-0.5 rounded-sm"
              style={{
                color: 'var(--color-warning)',
                backgroundColor: 'color-mix(in srgb, var(--color-warning) 12%, transparent)',
              }}
            >
              {unreadAlerts} Alert{unreadAlerts === 1 ? '' : 's'}
            </span>
          )}

          <button
            type="button"
            onClick={() => setHelpOpen((v) => !v)}
            className="hidden sm:inline w-4 h-4 rounded-sm text-[var(--color-text-muted)] hover:text-[var(--color-accent-secondary)] transition-colors"
            aria-label="Show market strip help (press ? key)"
            title="Press ? for help"
          >
            ?
          </button>
        </div>
      </div>

      {helpOpen && (
        <div
          className="absolute right-4 top-10 z-50 w-72 p-4 rounded-sm bg-[var(--color-bg-secondary)] border border-[var(--color-border)] shadow-lg text-[11px] text-[var(--color-text-secondary)]"
          role="dialog"
          aria-label="Market strip legend"
        >
          <div className="mono tracking-[0.3em] uppercase text-[9px] text-[var(--color-text-muted)] mb-2">
            Market Strip Legend
          </div>
          <ul className="space-y-1.5">
            <li><b className="text-[var(--color-text)]">Status pill</b> — phase of the US session</li>
            <li><b className="text-[var(--color-text)]">Countdown</b> — until next phase change (ET)</li>
            <li><b className="text-[var(--color-text)]">Quote</b> — seconds since last quote update</li>
            <li><b className="text-[var(--color-text)]">Stream</b> — green pulse = WebSocket connected</li>
            <li><b className="text-[var(--color-text)]">Alerts</b> — unacknowledged risk events</li>
          </ul>
          <div className="mt-3 text-[9px] mono tracking-[0.2em] uppercase text-[var(--color-text-muted)]">
            Press ? or Esc to close
          </div>
        </div>
      )}
    </div>
  );
}

export default MarketStatusStrip;
