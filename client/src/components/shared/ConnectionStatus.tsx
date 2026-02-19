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

  return (
    <div
      role="status"
      aria-live="polite"
      className={`
        flex items-center gap-2 px-4 py-2 text-xs font-medium transition-all duration-300
        ${state === 'reconnecting'
          ? 'bg-[var(--color-warning)]/10 text-[var(--color-warning)] border-b border-[var(--color-warning)]/20'
          : 'bg-[var(--color-danger)]/10 text-[var(--color-danger)] border-b border-[var(--color-danger)]/20'
        }
      `}
    >
      {state === 'reconnecting' ? (
        <>
          <Wifi className="w-3.5 h-3.5 animate-pulse" />
          <span>
            Live feed disconnected. Reconnecting
            {attempt > 0 && ` (attempt ${attempt})`}
            {countdownSec !== null && countdownSec > 0 && ` in ${countdownSec}s`}
            {transportLabel && <span className="ml-1 opacity-70">via {transportLabel}</span>}
            ...
          </span>
        </>
      ) : (
        <>
          <WifiOff className="w-3.5 h-3.5" />
          <span>
            Live feed disconnected. Data may be stale.
            {transportLabel && <span className="ml-1 opacity-70">[{transportLabel}]</span>}
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
    reconnecting: 'bg-[var(--color-warning)] animate-pulse',
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
