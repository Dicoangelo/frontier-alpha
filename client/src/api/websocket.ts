type MessageHandler = (data: unknown) => void;

/**
 * Real-time quote client.
 *
 * Transport priority:
 * 1. WebSocket → ws://server:port/ws/quotes (persistent, <20ms latency)
 * 2. SSE → /api/v1/quotes/stream?sse=true (30s timeout, auto-reconnect)
 * 3. Polling → /api/v1/quotes/stream (10s interval fallback)
 */
class QuoteStreamClient {
  private ws: WebSocket | null = null;
  private eventSource: EventSource | null = null;
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private handlers: Map<string, Set<MessageHandler>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000;
  private subscribedSymbols: string[] = [];
  private isConnected = false;
  private transport: 'websocket' | 'sse' | 'polling' | null = null;

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
        console.log('WebSocket connected');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.notifyHandlers('connected', { connected: true });

        // Subscribe to any pending symbols
        if (this.subscribedSymbols.length > 0) {
          this.sendWsSubscribe(this.subscribedSymbols);
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'quote' && message.data) {
            this.notifyHandlers('quote', message.data);
          }
        } catch (e) {
          console.error('WebSocket message parse error:', e);
        }
      };

      this.ws.onclose = () => {
        console.log('WebSocket closed');
        this.isConnected = false;
        this.ws = null;
        this.notifyHandlers('connected', { connected: false });
        this.attemptReconnect();
      };

      this.ws.onerror = (err) => {
        console.warn('WebSocket error, falling back to SSE:', err);
        this.ws?.close();
        this.ws = null;
        this.transport = null;

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
      console.log('SSE connected');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.notifyHandlers('connected', { connected: true });
    };

    this.eventSource.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        if (message.type === 'quotes' && Array.isArray(message.data)) {
          for (const quote of message.data) {
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
      console.log('SSE error or disconnected');
      this.isConnected = false;
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
          const result = await response.json();
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

  private notifyHandlers(type: string, data: any) {
    this.handlers.get(type)?.forEach((handler) => handler(data));
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('Max reconnect attempts reached, falling back to polling');
      this.transport = null;
      this.startPolling();
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connect();
    }, delay);
  }

  private reconnect() {
    this.disconnect();
    setTimeout(() => {
      this.connect();
    }, 5000);
  }

  /**
   * Disconnect from the stream
   */
  disconnect() {
    this.isConnected = false;

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

    this.transport = null;
    this.notifyHandlers('connected', { connected: false });
  }

  get connected(): boolean {
    return this.isConnected;
  }

  get symbols(): string[] {
    return [...this.subscribedSymbols];
  }

  get activeTransport(): string | null {
    return this.transport;
  }
}

// Export singleton instance
export const wsClient = new QuoteStreamClient();
