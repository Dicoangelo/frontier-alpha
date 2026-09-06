import { useQuotesStore } from '@/stores/quotesStore';
import { wsClient } from '@/api/websocket';

export type FeedTone = 'live' | 'delayed' | 'offline';

export interface FeedStatus {
  /** Short pill copy: Live / Delayed / Offline. */
  label: string;
  tone: FeedTone;
  /** Accessible description, also used as the hover title. */
  aria: string;
}

/**
 * One source of truth for "how are quotes arriving right now".
 *
 * Every surface that shows feed state (header pill, dashboard greeting badge,
 * market strip) used to derive its own answer, and the header's was a
 * hardcoded "Live" that pulsed green even when the WebSocket tier was dead and
 * the strip beside it said "Offline". Quotes on the current plan are 15-minute
 * delayed and normally arrive by REST polling, so the honest default while
 * data flows is "Delayed"; "Live" is reserved for an open push socket.
 */
export function useFeedStatus(): FeedStatus {
  const isConnected = useQuotesStore((s) => s.isConnected);
  const transport = wsClient.activeTransport;
  if (!isConnected) {
    return { label: 'Offline', tone: 'offline', aria: 'Quote feed offline' };
  }
  if (transport === 'websocket') {
    return { label: 'Live', tone: 'live', aria: 'Quote feed live (streaming)' };
  }
  return { label: 'Delayed', tone: 'delayed', aria: 'Quote feed delayed (15-minute quotes, polling)' };
}
