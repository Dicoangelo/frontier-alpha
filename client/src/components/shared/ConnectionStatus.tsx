import { useEffect, useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { wsClient, type ConnectionState } from '@/api/websocket';

/**
 * Visual indicator + banner for WebSocket connection state.
 * Green dot = connected, yellow = reconnecting, red = disconnected.
 * Shows a subtle banner during reconnection that auto-dismisses.
 */
export function ConnectionStatus() {
  const [state, setState] = useState<ConnectionState>(wsClient.connectionState);

  useEffect(() => {
    return wsClient.on('connectionState', (data: unknown) => {
      setState((data as { state: ConnectionState }).state);
    });
  }, []);

  if (state === 'connected') return null;

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
          Live feed disconnected. Reconnecting...
        </>
      ) : (
        <>
          <WifiOff className="w-3.5 h-3.5" />
          Live feed disconnected. Data may be stale.
        </>
      )}
    </div>
  );
}

/**
 * Small dot indicator for use in headers/toolbars.
 */
export function ConnectionDot() {
  const [state, setState] = useState<ConnectionState>(wsClient.connectionState);

  useEffect(() => {
    return wsClient.on('connectionState', (data: unknown) => {
      setState((data as { state: ConnectionState }).state);
    });
  }, []);

  const colors: Record<ConnectionState, string> = {
    connected: 'bg-[var(--color-positive)]',
    reconnecting: 'bg-[var(--color-warning)] animate-pulse',
    disconnected: 'bg-[var(--color-danger)]',
  };

  const labels: Record<ConnectionState, string> = {
    connected: 'Live feed connected',
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
