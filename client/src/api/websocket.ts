type MessageHandler = (data: unknown) => void;

/**
 * Real-time quote client using Server-Sent Events (SSE)
 * Falls back to polling for browsers that don't support SSE
 */
class QuoteStreamClient {
  private eventSource: EventSource | null = null;
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private handlers: Map<string, Set<MessageHandler>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000;
  private subscribedSymbols: string[] = [];
  private isConnected = false;

  /**
   * Connect to the quote stream
   */
  connect() {
    if (this.isConnected) return;

    // SSE is supported in all modern browsers
    if (typeof EventSource !== 'undefined') {
      this.connectSSE();
    } else {
      this.startPolling();
    }
  }

  /**
   * Connect using Server-Sent Events
   */
  private connectSSE() {
    if (this.subscribedSymbols.length === 0) {
      console.log('No symbols to subscribe to');
      return;
    }

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
          // Notify quote handlers for each quote
          for (const quote of message.data) {
            this.notifyHandlers('quote', quote);
          }
        } else if (message.type === 'complete') {
          // Stream ended, reconnect to continue
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
   * Fallback polling for environments without SSE
   */
  private startPolling() {
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

    // Initial poll
    poll();

    // Poll every 10 seconds
    this.pollingInterval = setInterval(poll, 10000);
  }

  /**
   * Subscribe to symbols
   */
  subscribe(symbols: string[]) {
    const newSymbols = symbols.filter(s => !this.subscribedSymbols.includes(s));
    if (newSymbols.length === 0) return;

    this.subscribedSymbols = [...new Set([...this.subscribedSymbols, ...symbols])];

    // Reconnect with new symbols if already connected, or connect if not yet connected
    if (this.isConnected) {
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

    // Reconnect with remaining symbols
    if (this.isConnected && this.subscribedSymbols.length > 0) {
      this.disconnect();
      this.connect();
    } else if (this.subscribedSymbols.length === 0) {
      this.disconnect();
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

  /**
   * Notify all handlers of a specific type
   */
  private notifyHandlers(type: string, data: any) {
    const handlers = this.handlers.get(type);
    handlers?.forEach((handler) => handler(data));
  }

  /**
   * Attempt to reconnect after disconnect
   */
  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('Max reconnect attempts reached, falling back to polling');
      this.startPolling();
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connectSSE();
    }, delay);
  }

  /**
   * Reconnect to get fresh stream
   */
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

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    this.notifyHandlers('connected', { connected: false });
  }

  /**
   * Get connection status
   */
  get connected(): boolean {
    return this.isConnected;
  }

  /**
   * Get currently subscribed symbols
   */
  get symbols(): string[] {
    return [...this.subscribedSymbols];
  }
}

// Export singleton instance
export const wsClient = new QuoteStreamClient();
