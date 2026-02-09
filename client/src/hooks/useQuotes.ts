import { useEffect, useRef } from 'react';
import { wsClient } from '@/api/websocket';
import { useQuotesStore } from '@/stores/quotesStore';
import type { Quote } from '@/types';

/**
 * Hook for subscribing to real-time quote streaming.
 *
 * Connects to the SSE/WebSocket quote stream, subscribes to the given symbols,
 * and updates the Zustand quote store automatically.
 *
 * @param symbols - Array of stock symbols to subscribe to (e.g., ['AAPL', 'NVDA'])
 * @returns { quotes, isConnected, lastUpdate } from the global quote store
 *
 * @example
 * const { quotes, isConnected, lastUpdate } = useQuotes(['AAPL', 'NVDA', 'MSFT']);
 * const applePrice = quotes.get('AAPL')?.last;
 */
export function useQuotes(symbols: string[]) {
  const quotes = useQuotesStore((state) => state.quotes);
  const lastUpdate = useQuotesStore((state) => state.lastUpdate);
  const isConnected = useQuotesStore((state) => state.isConnected);
  const updateQuote = useQuotesStore((state) => state.updateQuote);
  const setConnected = useQuotesStore((state) => state.setConnected);

  // Stabilize symbols reference to avoid re-subscribing on every render
  const symbolsKey = symbols.sort().join(',');
  const prevSymbolsKey = useRef(symbolsKey);

  useEffect(() => {
    if (symbols.length === 0) return;

    // Connect to the stream
    wsClient.connect();
    wsClient.subscribe(symbols);

    // Listen for quote updates
    const unsubQuote = wsClient.on('quote', (data: unknown) => {
      if (data && typeof data === 'object' && 'symbol' in data) {
        updateQuote(data as Quote);
      }
    });

    // Listen for connection status
    const unsubConnected = wsClient.on('connected', (data: unknown) => {
      if (data && typeof data === 'object' && 'connected' in data) {
        setConnected((data as { connected: boolean }).connected);
      }
    });

    prevSymbolsKey.current = symbolsKey;

    return () => {
      unsubQuote();
      unsubConnected();
      wsClient.unsubscribe(symbols);
      wsClient.disconnect();
    };
  }, [symbolsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return { quotes, isConnected, lastUpdate };
}
