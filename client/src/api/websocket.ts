type MessageHandler = (data: unknown) => void;

export type ConnectionState = 'connected' | 'reconnecting' | 'disconnected';
export type TransportType = 'websocket' | 'sse' | 'polling' | null;

/**
 * Real-time quote client.
 *
 * Transport priority:
 * 1. WebSocket → ws://server:port/ws/quotes (persistent, <20ms latency)
 * 2. SSE → /api/v1/quotes/stream?sse=true (30s timeout, auto-reconnect)
 * 3. Polling → /api/v1/quotes/stream (10s interval fallback)
 *
 * US-028: Hardened reconnection with:
 * - Jittered exponential backoff
 * - Page visibility API (pause when tab hidden)
 * - Heartbeat ping/pong (30s interval, 5s timeout)
 * - Max 10 attempts before polling fallback
 * - Reconnect countdown emitted on each attempt
 */
class QuoteStreamClient {
  private ws: WebSocket | null = null;
  private eventSource: EventSource | null = null;
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private handlers: Map<string, Set<MessageHandler>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10; // US-028: increased from 5
  private baseReconnectDelay = 1000; // 1s base
  private subscribedSymbols: string[] = [];
  private isConnected = false;
  private _connectionState: ConnectionState = 'disconnected';
  private transport: TransportType = null;

  // US-028: Heartbeat state
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimeout: ReturnType<typeof setTimeout> | null = null;

  // US-028: Reconnect countdown timer
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  // US-028: Page visibility
  private _visibilityHandler: (() => void) | null = null;
  private pendingReconnectAt: number | null = null;

  constructor() {
    if (typeof document !== 'undefined') {
      this._visibilityHandler = () => {
        if (!document.hidden && this._connectionState === 'reconnecting' && this.pendingReconnectAt !== null) {
          // Tab became visible — reconnect immediately instead of waiting
          const remaining = this.pendingReconnectAt - Date.now();
          if (remaining > 0) {
            // Still waiting — let timer fire naturally
          }
          // If tab was hidden for a long time and we had no pending reconnect, try now
          if (this.reconnectTimer === null && !this.isConnected) {
            this.connect();
          }
        }
      };
      document.addEventListener('visibilitychange', this._visibilityHandler);
    }
  }

  /**
   * Connect to the quote stream.
   * Tries WebSocket first, falls back to SSE, then polling.
   */
  connect() {
    if (this.isConnected) return;

    // Try WebSocket first (connects to Fastify server)
    const wsUrl = this.getWebSocketUrl();
    if (wsUrl) {
      this.connectWebSocket(wsUrl);
    } else if (typeof EventSource !== 'undefined') {
      this.connectSSE();
    } else {
      this.startPolling();
    }
  }

  /**
   * Build WebSocket URL from environment
   */
  private getWebSocketUrl(): string | null {
    const apiUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_WS_URL;
    if (!apiUrl) {
      // Default to same host in dev (Fastify server on port 3000)
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const port = import.meta.env.VITE_SERVER_PORT || '3000';
      return `${protocol}//${window.location.hostname}:${port}/ws/quotes`;
    }
    // Convert http(s) URL to ws(s)
    return apiUrl.replace(/^http/, 'ws') + '/ws/quotes';
  }

  /**
   * Connect via native WebSocket to Fastify server
   */
  private connectWebSocket(url: string) {
    try {
      this.ws = new WebSocket(url);
      this.transport = 'websocket';

      this.ws.onopen = () => {
        this.isConnected = true;
        this.setConnectionState('connected');
        this.reconnectAttempts = 0;
        this.notifyHandlers('connected', { connected: true });

        // Re-subscribe all tracked symbols after reconnect (US-028: AC#3)
        if (this.subscribedSymbols.length > 0) {
          this.sendWsSubscribe(this.subscribedSymbols);
        }

        // US-028: Start heartbeat
        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data as string) as Record<string, unknown>;
          if (message.type === 'pong') {
            // Heartbeat pong received — clear pong timeout
            this.clearHeartbeatTimeout();
          } else if (message.type === 'quote' && message.data) {
            this.notifyHandlers('quote', message.data);
          }
        } catch (e) {
          console.error('WebSocket message parse error:', e);
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.ws = null;
        this.stopHeartbeat();
        this.setConnectionState('reconnecting');
        this.notifyHandlers('connected', { connected: false });
        this.attemptReconnect();
      };

      this.ws.onerror = (err) => {
        console.warn('WebSocket error, falling back to SSE:', err);
        this.ws?.close();
        this.ws = null;
        this.transport = null;
        this.stopHeartbeat();

        // Fall back to SSE
        if (typeof EventSource !== 'undefined') {
          this.connectSSE();
        } else {
          this.startPolling();
        }
      };
    } catch {
      // WebSocket constructor can throw (e.g., invalid URL)
      this.connectSSE();
    }
  }

  /**
   * Send subscribe message over WebSocket
   */
  private sendWsSubscribe(symbols: string[]) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'subscribe', symbols }));
    }
  }

  /**
   * US-028: Heartbeat — ping every 30s, reconnect if no pong within 5s
   */
  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
        // Expect pong within 5s
        this.heartbeatTimeout = setTimeout(() => {
          console.warn('WebSocket heartbeat timeout — reconnecting');
          this.ws?.close();
        }, 5000);
      }
    }, 30000);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval !== null) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.clearHeartbeatTimeout();
  }

  private clearHeartbeatTimeout() {
    if (this.heartbeatTimeout !== null) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  }

  /**
   * Connect using Server-Sent Events (fallback for Vercel deployments)
   */
  private connectSSE() {
    if (this.subscribedSymbols.length === 0) return;

    this.transport = 'sse';
    const apiUrl = import.meta.env.VITE_API_URL || '';
    const symbolsParam = this.subscribedSymbols.join(',');
    const url = `${apiUrl}/api/v1/quotes/stream?symbols=${symbolsParam}&sse=true`;

    this.eventSource = new EventSource(url);

    this.eventSource.onopen = () => {
      this.isConnected = true;
      this.setConnectionState('connected');
      this.reconnectAttempts = 0;
      this.notifyHandlers('connected', { connected: true });
    };

    this.eventSource.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string) as Record<string, unknown>;

        if (message.type === 'quotes' && Array.isArray(message.data)) {
          for (const quote of message.data as unknown[]) {
            this.notifyHandlers('quote', quote);
          }
        } else if (message.type === 'complete') {
          // SSE stream ended (30s timeout), reconnect
          this.reconnect();
        }
      } catch (e) {
        console.error('SSE message parse error:', e);
      }
    };

    this.eventSource.onerror = () => {
      this.isConnected = false;
      this.setConnectionState('reconnecting');
      this.notifyHandlers('connected', { connected: false });
      this.eventSource?.close();
      this.eventSource = null;
      this.attemptReconnect();
    };
  }

  /**
   * Fallback polling for environments without SSE/WebSocket
   */
  private startPolling() {
    this.transport = 'polling';
    const apiUrl = import.meta.env.VITE_API_URL || '';

    const poll = async () => {
      if (this.subscribedSymbols.length === 0) return;

      try {
        const symbolsParam = this.subscribedSymbols.join(',');
        const response = await fetch(`${apiUrl}/api/v1/quotes/stream?symbols=${symbolsParam}`);

        if (response.ok) {
          const result = await response.json() as { success: boolean; data?: unknown[] };
          if (result.success && Array.isArray(result.data)) {
            this.isConnected = true;
            this.notifyHandlers('connected', { connected: true });

            for (const quote of result.data) {
              this.notifyHandlers('quote', quote);
            }
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
        this.isConnected = false;
        this.notifyHandlers('connected', { connected: false });
      }
    };

    poll();
    this.pollingInterval = setInterval(poll, 10000);
  }

  /**
   * Subscribe to symbols
   */
  subscribe(symbols: string[]) {
    const newSymbols = symbols.filter(s => !this.subscribedSymbols.includes(s));
    if (newSymbols.length === 0) return;

    this.subscribedSymbols = [...new Set([...this.subscribedSymbols, ...symbols])];

    if (this.transport === 'websocket' && this.ws?.readyState === WebSocket.OPEN) {
      // WebSocket: just send subscribe for new symbols (no reconnect needed)
      this.sendWsSubscribe(newSymbols);
    } else if (this.isConnected) {
      // SSE/polling: need to reconnect with full symbol list
      this.disconnect();
      this.connect();
    } else {
      this.connect();
    }
  }

  /**
   * Unsubscribe from symbols
   */
  unsubscribe(symbols: string[]) {
    this.subscribedSymbols = this.subscribedSymbols.filter(s => !symbols.includes(s));

    if (this.subscribedSymbols.length === 0) {
      this.disconnect();
    } else if (this.transport !== 'websocket' && this.isConnected) {
      // SSE/polling need reconnect to change symbols
      this.disconnect();
      this.connect();
    }
  }

  /**
   * Register event handler
   */
  on(type: string, handler: MessageHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);

    return () => {
      this.handlers.get(type)?.delete(handler);
    };
  }

  private notifyHandlers(type: string, data: unknown) {
    this.handlers.get(type)?.forEach((handler) => handler(data));
  }

  /**
   * US-028: Jittered exponential backoff
   * delay = baseDelay * 2^attempt * (0.5 + Math.random() * 0.5)
   */
  computeReconnectDelay(attempt: number): number {
    return this.baseReconnectDelay * Math.pow(2, attempt) * (0.5 + Math.random() * 0.5);
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.setConnectionState('disconnected');
      this.transport = null;
      this.startPolling();
      return;
    }

    // US-028: Pause reconnection when tab is hidden
    if (typeof document !== 'undefined' && document.hidden) {
      // Tab is hidden — defer reconnection to visibilitychange
      this.setConnectionState('reconnecting');
      const onVisible = () => {
        document.removeEventListener('visibilitychange', onVisible);
        this.attemptReconnect();
      };
      document.addEventListener('visibilitychange', onVisible);
      return;
    }

    this.reconnectAttempts++;

    // US-028: Jittered exponential backoff
    const delay = this.computeReconnectDelay(this.reconnectAttempts - 1);
    this.setConnectionState('reconnecting');
    this.pendingReconnectAt = Date.now() + delay;
    this.notifyHandlers('connectionState', {
      state: this._connectionState,
      attempt: this.reconnectAttempts,
      nextRetryMs: delay,
      transport: this.transport,
    });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.pendingReconnectAt = null;
      this.connect();
    }, delay);
  }

  private setConnectionState(state: ConnectionState) {
    this._connectionState = state;
    this.notifyHandlers('connectionState', { state, transport: this.transport });
  }

  private reconnect() {
    this.disconnect();
    setTimeout(() => {
      this.connect();
    }, 5000);
  }

  /**
   * Disconnect from the stream and clean up ALL timers (US-028: AC#7)
   */
  disconnect() {
    this.isConnected = false;
    this.setConnectionState('disconnected');

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    // US-028: Clean up all timers
    this.stopHeartbeat();

    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.pendingReconnectAt = null;
    this.transport = null;
    this.notifyHandlers('connected', { connected: false });
  }

  /**
   * Remove page visibility event listener and clean up
   */
  destroy() {
    this.disconnect();
    if (this._visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
      this._visibilityHandler = null;
    }
  }

  get connected(): boolean {
    return this.isConnected;
  }

  get symbols(): string[] {
    return [...this.subscribedSymbols];
  }

  get activeTransport(): TransportType {
    return this.transport;
  }

  get connectionState(): ConnectionState {
    return this._connectionState;
  }

  get nextRetryMs(): number | null {
    if (this.pendingReconnectAt === null) return null;
    return Math.max(0, this.pendingReconnectAt - Date.now());
  }
}

// Export singleton instance
export const wsClient = new QuoteStreamClient();
