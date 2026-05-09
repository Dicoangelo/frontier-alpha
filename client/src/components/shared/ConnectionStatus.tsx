import { useEffect, useState } from 'react';
import { wsClient, type ConnectionState, type TransportType } from '@/api/websocket';
import { DegradedService } from './DegradedService';

/**
 * Visual indicator for WebSocket connection state.
 *
 * US-005: refactored on top of <DegradedService>. Connection-specific
 * concerns (close code, attempt counter, transport label, reconnect
 * countdown) are massaged into the primitive's `service` + `reason` +
 * `onRetry` shape. Future degradations (rate limiter, AI explainer, billing
 * webhook lag) inherit the same affordance for free.
 *
 * State → render:
 * - connected: nothing
 * - reconnecting: warning pill with attempt + countdown in tooltip; no
 *   onRetry (reconnect is already in flight)
 * - offline (terminal, US-006): warning pill with close-code reason; clicking
 *   Reconnect calls wsClient.resetWebSocket() — clears wsAbandoned, resets
 *   counters, fresh handshake. On success the banner clears within 5s; on
 *   failure it returns to offline within 5s with the new close code.
 * - disconnected (transient pre-connect): warning pill, no onRetry.
 *
 * US-028: transport label (WS/SSE/Poll) lives in the tooltip reason.
 */

const CLOSE_CODE_LABELS: Record<number, string> = {
  1000: 'Normal closure',
  1001: 'Endpoint going away',
  1002: 'Protocol error',
  1003: 'Unsupported data',
  1005: 'No status received',
  1006: 'Abnormal closure (no close frame)',
  1007: 'Invalid frame payload',
  1008: 'Policy violation',
  1009: 'Message too big',
  1010: 'Mandatory extension missing',
  1011: 'Internal server error',
  1012: 'Service restart',
  1013: 'Try again later',
  1014: 'Bad gateway',
  1015: 'TLS handshake failure',
};

function describeCloseCode(code: number | null): string {
  if (code === null) return 'Connection unavailable';
  const label = CLOSE_CODE_LABELS[code] ?? 'Unknown reason';
  return `WebSocket closed with code ${code} (${label})`;
}

function transportLabelFor(transport: TransportType): string | null {
  if (transport === 'websocket') return 'WS';
  if (transport === 'sse') return 'SSE';
  if (transport === 'polling') return 'Poll';
  return null;
}

export function ConnectionStatus() {
  const [state, setState] = useState<ConnectionState>(wsClient.connectionState);
  const [transport, setTransport] = useState<TransportType>(wsClient.activeTransport);
  const [attempt, setAttempt] = useState(0);
  const [countdownMs, setCountdownMs] = useState<number | null>(null);
  const [closeCode, setCloseCode] = useState<number | null>(wsClient.closeCode);

  useEffect(() => {
    return wsClient.on('connectionState', (data: unknown) => {
      const payload = data as {
        state: ConnectionState;
        transport?: TransportType;
        attempt?: number;
        nextRetryMs?: number;
        closeCode?: number | null;
      };
      setState(payload.state);
      if (payload.transport !== undefined) setTransport(payload.transport);
      if (payload.attempt !== undefined) setAttempt(payload.attempt);
      if (payload.nextRetryMs !== undefined) setCountdownMs(payload.nextRetryMs);
      else if (payload.state === 'connected') setCountdownMs(null);
      else if (payload.state === 'offline') setCountdownMs(null);
      if (payload.closeCode !== undefined) setCloseCode(payload.closeCode);
      else setCloseCode(wsClient.closeCode);
    });
  }, []);

  // Countdown ticker (only relevant while reconnecting)
  useEffect(() => {
    if (state !== 'reconnecting') return;
    if (countdownMs === null || countdownMs <= 0) return;

    const interval = setInterval(() => {
      const remaining = wsClient.nextRetryMs;
      if (remaining !== null && remaining > 0) {
        setCountdownMs(remaining);
      } else {
        setCountdownMs(null);
        clearInterval(interval);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [countdownMs, state]);

  if (state === 'connected') return null;

  const transportLabel = transportLabelFor(transport);
  const countdownSec = countdownMs !== null ? Math.ceil(countdownMs / 1000) : null;

  // Build the tooltip "reason" string per state. The pill copy stays generic
  // ("Live feed offline · polling fallback") inside <DegradedService>; the
  // close-code / attempt detail shows on hover/long-press as required by the
  // US-005 acceptance criteria.
  let reason: string;
  if (state === 'reconnecting') {
    const parts: string[] = ['Reconnecting'];
    if (attempt > 0) parts.push(`attempt ${attempt}`);
    if (countdownSec !== null && countdownSec > 0) parts.push(`next try in ${countdownSec}s`);
    if (transportLabel) parts.push(`transport ${transportLabel}`);
    reason = parts.join(' · ');
  } else if (state === 'offline') {
    const detail = describeCloseCode(closeCode);
    reason = transportLabel ? `${detail} · transport ${transportLabel}` : detail;
  } else {
    // disconnected (transient)
    reason = transportLabel ? `Disconnected · transport ${transportLabel}` : 'Disconnected · data may be stale';
  }

  // Only the terminal 'offline' state exposes the manual reconnect button.
  // While 'reconnecting' the WS layer is already trying — clicking Reconnect
  // would just kick off a duplicate handshake.
  const onRetry = state === 'offline' ? () => wsClient.resetWebSocket() : undefined;

  return (
    <DegradedService
      service="Live feed"
      reason={reason}
      severity="warning"
      onRetry={onRetry}
      position="pill-bottom-right"
    />
  );
}

/**
 * Small dot indicator for use in headers/toolbars.
 * US-028: Also shows transport badge.
 *
 * Unchanged in US-005 — the dot is a glanceable status, not a degradation
 * affordance, so it doesn't need the <DegradedService> chrome.
 */
export function ConnectionDot() {
  const [state, setState] = useState<ConnectionState>(wsClient.connectionState);
  const [transport, setTransport] = useState<TransportType>(wsClient.activeTransport);

  useEffect(() => {
    return wsClient.on('connectionState', (data: unknown) => {
      const payload = data as { state: ConnectionState; transport?: TransportType };
      setState(payload.state);
      if (payload.transport !== undefined) setTransport(payload.transport);
    });
  }, []);

  const colors: Record<ConnectionState, string> = {
    connected: 'bg-[var(--color-positive)]',
    reconnecting: 'bg-[var(--color-warning)] animate-pulse-subtle',
    disconnected: 'bg-[var(--color-danger)]',
    offline: 'bg-[var(--color-negative)]',
  };

  const transportLabel = transportLabelFor(transport);
  const labels: Record<ConnectionState, string> = {
    connected: `Live feed connected${transportLabel ? ` (${transportLabel})` : ''}`,
    reconnecting: 'Reconnecting to live feed',
    disconnected: 'Live feed disconnected',
    offline: 'Live feed offline (using polling fallback)',
  };

  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${colors[state]}`}
      title={labels[state]}
      aria-label={labels[state]}
      role="status"
    />
  );
}
