import { useEffect, useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { wsClient, type ConnectionState, type TransportType } from '@/api/websocket';

/**
 * Visual indicator + banner for WebSocket connection state.
 * Green dot = connected, yellow = reconnecting, red = disconnected.
 * US-028: Shows transport type (WS/SSE/Poll) and reconnect countdown.
 */
export function ConnectionStatus() {
  const [state, setState] = useState<ConnectionState>(wsClient.connectionState);
  const [transport, setTransport] = useState<TransportType>(wsClient.activeTransport);
  const [attempt, setAttempt] = useState(0);
  const [countdownMs, setCountdownMs] = useState<number | null>(null);

  useEffect(() => {
    return wsClient.on('connectionState', (data: unknown) => {
      const payload = data as {
        state: ConnectionState;
        transport?: TransportType;
        attempt?: number;
        nextRetryMs?: number;
      };
      setState(payload.state);
      if (payload.transport !== undefined) setTransport(payload.transport);
      if (payload.attempt !== undefined) setAttempt(payload.attempt);
      if (payload.nextRetryMs !== undefined) setCountdownMs(payload.nextRetryMs);
      else if (payload.state === 'connected') setCountdownMs(null);
    });
  }, []);

  // Countdown ticker
  useEffect(() => {
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
  }, [countdownMs]);

  if (state === 'connected') return null;

  const transportLabel = transport === 'websocket' ? 'WS' : transport === 'sse' ? 'SSE' : transport === 'polling' ? 'Poll' : null;
  const countdownSec = countdownMs !== null ? Math.ceil(countdownMs / 1000) : null;

  const isReconnecting = state === 'reconnecting';
  const railClass = isReconnecting
    ? 'before:bg-[var(--color-warning)]'
    : 'before:bg-[var(--color-negative)]';
  const textClass = isReconnecting
    ? 'text-[var(--color-warning)]'
    : 'text-[var(--color-negative)]';
  const glowClass = isReconnecting
    ? 'shadow-[0_18px_60px_-20px_rgba(245,158,11,0.45)]'
    : 'shadow-[0_18px_60px_-20px_rgba(239,68,68,0.45)]';
  const dotClass = isReconnecting
    ? 'bg-[var(--color-warning)] animate-pulse-subtle'
    : 'bg-[var(--color-negative)]';

  return (
    <div
      role="status"
      aria-live="polite"
      className={`
        glass-slab-floating fixed top-20 right-4 z-40
        rounded-full pl-4 pr-3 py-2 flex items-center gap-2
        before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:rounded-l-full
        ${railClass} ${glowClass} ${textClass}
        transition-[opacity,transform] duration-300
      `}
    >
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full ${dotClass}`}
        aria-hidden="true"
      />
      {isReconnecting ? (
        <>
          <Wifi className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="mono text-[10px] tracking-[0.25em] uppercase font-medium">
            Reconnecting
            {attempt > 0 && ` · ${attempt}`}
            {countdownSec !== null && countdownSec > 0 && ` · ${countdownSec}s`}
            {transportLabel && <span className="ml-1 opacity-70">· {transportLabel}</span>}
          </span>
        </>
      ) : (
        <>
          <WifiOff className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="mono text-[10px] tracking-[0.25em] uppercase font-medium">
            Offline · Data Stale
            {transportLabel && <span className="ml-1 opacity-70">· {transportLabel}</span>}
          </span>
        </>
      )}
    </div>
  );
}

/**
 * Small dot indicator for use in headers/toolbars.
 * US-028: Also shows transport badge.
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
  };

  const transportLabel = transport === 'websocket' ? 'WS' : transport === 'sse' ? 'SSE' : transport === 'polling' ? 'Poll' : '';
  const labels: Record<ConnectionState, string> = {
    connected: `Live feed connected${transportLabel ? ` (${transportLabel})` : ''}`,
    reconnecting: 'Reconnecting to live feed',
    disconnected: 'Live feed disconnected',
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
