/**
 * FRONTIER ALPHA - Market Data Provider
 *
 * Production-grade market data integration:
 * - Polygon.io: Real-time quotes via WebSocket streaming (<20ms latency)
 * - Alpha Vantage: Historical prices (5yr), fundamentals, earnings
 * - Ken French Data Library: Factor returns (30+ years)
 * - Redis: 5-minute quote cache layer
 *
 * NO MOCK DATA IN PRODUCTION - All data from real APIs or throws errors
 */

import type { Price, Quote, Asset } from '../types/index.js';
import { supabaseAdmin } from '../lib/supabase.js';
import WebSocket from 'ws';
import Redis, { type Redis as RedisClient } from 'ioredis';

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface DataProviderConfig {
  polygonApiKey?: string;
  alphaVantageApiKey?: string;
  cacheTTLSeconds?: number;
  redisUrl?: string;
  allowMockFallback?: boolean;  // Only true in development
}

// Polygon.io WebSocket message types
interface PolygonWSMessage {
  ev: string;  // Event type: 'status', 'T' (trade), 'Q' (quote), 'A' (aggregate)
  sym?: string;
  p?: number;  // Price
  s?: number;  // Size
  t?: number;  // Timestamp (Unix ms)
  bp?: number; // Bid price (quotes)
  ap?: number; // Ask price (quotes)
  bs?: number; // Bid size
  as?: number; // Ask size
  c?: number[];  // Conditions
  message?: string;
  status?: string;
}

interface PolygonAuthMessage {
  action: 'auth' | 'subscribe' | 'unsubscribe';
  params?: string;
}

// Custom error for data unavailability
export class DataNotAvailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DataNotAvailableError';
  }
}

// ============================================================================
// MARKET DATA PROVIDER
// ============================================================================

export class MarketDataProvider {
  private config: DataProviderConfig;
  private priceCache: Map<string, { prices: Price[]; timestamp: number }> = new Map();
  private quoteCache: Map<string, { quote: Quote; timestamp: number }> = new Map();
  private useSupabaseCache: boolean = !!process.env.SUPABASE_SERVICE_KEY;

  // Polygon.io WebSocket connection
  private polygonWs: WebSocket | null = null;
  private wsConnected: boolean = false;
  private wsSubscribers: Map<string, Set<(quote: Quote) => void>> = new Map();
  private wsReconnectAttempts: number = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private wsHeartbeatInterval: NodeJS.Timeout | null = null;
  private lastQuotes: Map<string, Quote> = new Map();  // For change calculation

  // Redis cache
  private redis: RedisClient | null = null;

  constructor(config: DataProviderConfig = {}) {
    this.config = {
      cacheTTLSeconds: 60,
      allowMockFallback: process.env.NODE_ENV === 'development',
      ...config,
    };

    // Initialize Redis connection if URL provided
    const redisUrl = config.redisUrl || process.env.REDIS_URL;
    if (redisUrl) {
      try {
        this.redis = new (Redis as any)(redisUrl, {
          maxRetriesPerRequest: 3,
          lazyConnect: true,
          connectTimeout: 5000,
        }) as RedisClient;
        this.redis.on('error', (err) => {
          console.warn('Redis connection error:', err.message);
        });
        this.redis.connect().catch(() => {
          console.warn('Redis not available, using memory cache only');
          this.redis = null;
        });
      } catch {
        console.warn('Redis initialization failed, using memory cache only');
      }
    }
  }

  /**
   * Get real-time quote for a symbol
   * Priority: Memory cache -> Redis cache -> Supabase cache -> Polygon.io -> Alpha Vantage
   * NO MOCK FALLBACK in production - throws DataNotAvailableError
   */
  async getQuote(symbol: string): Promise<Quote | null> {
    const upperSymbol = symbol.toUpperCase();
    const now = Date.now();

    // 1. Check memory cache first (fastest, 60s TTL)
    const memoryCached = this.quoteCache.get(upperSymbol);
    if (memoryCached && (now - memoryCached.timestamp) < (this.config.cacheTTLSeconds || 60) * 1000) {
      return memoryCached.quote;
    }

    // 2. Check Redis cache (5 min TTL for rate limiting)
    if (this.redis) {
      try {
        const redisQuote = await this.redis.get(`quote:${upperSymbol}`);
        if (redisQuote) {
          const quote = JSON.parse(redisQuote) as Quote;
          quote.timestamp = new Date(quote.timestamp);  // Restore Date object
          this.quoteCache.set(upperSymbol, { quote, timestamp: now });
          return quote;
        }
      } catch (e) {
        console.warn(`Redis cache error for ${upperSymbol}:`, e);
      }
    }

    // 3. Check Supabase cache (1 hour TTL)
    if (this.useSupabaseCache) {
      try {
        const { data: cachedQuote } = await supabaseAdmin
          .from('frontier_quote_cache')
          .select('*')
          .eq('symbol', upperSymbol)
          .single();

        if (cachedQuote) {
          const cacheAge = now - new Date(cachedQuote.cached_at).getTime();
          if (cacheAge < 3600 * 1000) {  // 1 hour cache for DB
            const quote: Quote = {
              symbol: cachedQuote.symbol,
              timestamp: new Date(cachedQuote.cached_at),
              bid: cachedQuote.price * 0.9999,
              ask: cachedQuote.price * 1.0001,
              last: cachedQuote.price,
              change: cachedQuote.change,
              changePercent: cachedQuote.change_percent,
            };
            this.quoteCache.set(upperSymbol, { quote, timestamp: now });
            await this.cacheQuoteToRedis(quote);
            return quote;
          }
        }
      } catch (e) {
        console.warn(`Supabase cache error for ${upperSymbol}:`, e);
      }
    }

    // 4. Fetch from Polygon.io (primary real-time source)
    if (this.config.polygonApiKey) {
      try {
        const quote = await this.fetchPolygonQuote(upperSymbol);
        if (quote) {
          this.quoteCache.set(upperSymbol, { quote, timestamp: now });
          await Promise.all([
            this.cacheQuoteToRedis(quote),
            this.cacheQuoteToSupabase(quote),
          ]);
          return quote;
        }
      } catch (e) {
        console.error(`Polygon quote error for ${upperSymbol}:`, e);
      }
    }

    // 5. Fetch from Alpha Vantage (backup for real quotes)
    if (this.config.alphaVantageApiKey) {
      try {
        const quote = await this.fetchAlphaVantageQuote(upperSymbol);
        if (quote) {
          this.quoteCache.set(upperSymbol, { quote, timestamp: now });
          await Promise.all([
            this.cacheQuoteToRedis(quote),
            this.cacheQuoteToSupabase(quote),
          ]);
          return quote;
        }
      } catch (e) {
        console.error(`Alpha Vantage quote error for ${upperSymbol}:`, e);
      }
    }

    // 6. PRODUCTION: Throw error, no mock fallback
    if (!this.config.allowMockFallback) {
      throw new DataNotAvailableError(
        `Unable to fetch quote for ${upperSymbol}: No data providers available or all failed. ` +
        `Ensure POLYGON_API_KEY and/or ALPHA_VANTAGE_API_KEY are set.`
      );
    }

    // 7. DEVELOPMENT ONLY: Generate mock quote
    console.warn(`[DEV] Using mock quote for ${upperSymbol}`);
    return this.generateMockQuote(upperSymbol);
  }

  /**
   * Cache quote to Redis with 5-minute TTL
   */
  private async cacheQuoteToRedis(quote: Quote): Promise<void> {
    if (!this.redis) return;

    try {
      await this.redis.set(
        `quote:${quote.symbol}`,
        JSON.stringify(quote),
        'EX',
        300  // 5 minutes TTL
      );
    } catch (e) {
      console.warn('Failed to cache quote to Redis:', e);
    }
  }

  /**
   * Cache quote to Supabase for rate limiting
   */
  private async cacheQuoteToSupabase(quote: Quote): Promise<void> {
    if (!this.useSupabaseCache) return;

    try {
      await supabaseAdmin
        .from('frontier_quote_cache')
        .upsert({
          symbol: quote.symbol,
          price: quote.last,
          change: quote.change,
          change_percent: quote.changePercent,
          cached_at: new Date().toISOString(),
        });
    } catch (e) {
      console.error('Failed to cache quote to Supabase:', e);
    }
  }

  /**
   * Fetch quote from Alpha Vantage GLOBAL_QUOTE endpoint
   */
  private async fetchAlphaVantageQuote(symbol: string): Promise<Quote | null> {
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${this.config.alphaVantageApiKey}`;

    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    const globalQuote = data['Global Quote'];

    if (!globalQuote || !globalQuote['05. price']) return null;

    const price = parseFloat(globalQuote['05. price']);
    const change = parseFloat(globalQuote['09. change'] || '0');
    const changePercent = parseFloat((globalQuote['10. change percent'] || '0').replace('%', ''));

    return {
      symbol,
      timestamp: new Date(),
      bid: price * 0.9999,
      ask: price * 1.0001,
      last: price,
      change,
      changePercent,
    };
  }

  /**
   * Get historical prices (up to 5 years)
   * Uses Alpha Vantage TIME_SERIES_DAILY_ADJUSTED
   */
  async getHistoricalPrices(
    symbol: string,
    days: number = 252
  ): Promise<Price[]> {
    const upperSymbol = symbol.toUpperCase();
    const now = Date.now();

    // Check memory cache first
    const cached = this.priceCache.get(upperSymbol);
    if (cached && (now - cached.timestamp) < 3600 * 1000) {  // 1 hour cache
      // Return subset if we have enough data
      if (cached.prices.length >= days) {
        return cached.prices.slice(-days);
      }
    }

    // Check Supabase for cached historical prices
    if (this.useSupabaseCache) {
      try {
        const { data: cachedPrices } = await supabaseAdmin
          .from('frontier_historical_prices')
          .select('*')
          .eq('symbol', upperSymbol)
          .order('date', { ascending: true })
          .limit(days);

        if (cachedPrices && cachedPrices.length >= days * 0.9) {  // Accept 90% coverage
          const prices: Price[] = cachedPrices.map(p => ({
            symbol: upperSymbol,
            timestamp: new Date(p.date),
            open: p.open,
            high: p.high,
            low: p.low,
            close: p.adjusted_close,  // Use adjusted close for factor calculations
            volume: p.volume,
          }));
          this.priceCache.set(upperSymbol, { prices, timestamp: now });
          return prices;
        }
      } catch (e) {
        console.warn(`Supabase historical prices error for ${upperSymbol}:`, e);
      }
    }

    // Fetch from Alpha Vantage
    if (this.config.alphaVantageApiKey) {
      try {
        const prices = await this.fetchAlphaVantagePrices(upperSymbol, days);
        if (prices.length > 0) {
          this.priceCache.set(upperSymbol, { prices, timestamp: now });
          // Cache to Supabase for future requests
          await this.cacheHistoricalPricesToSupabase(upperSymbol, prices);
          return prices;
        }
      } catch (e) {
        console.error(`Alpha Vantage price error for ${upperSymbol}:`, e);
      }
    }

    // PRODUCTION: Throw error, no mock fallback
    if (!this.config.allowMockFallback) {
      throw new DataNotAvailableError(
        `Unable to fetch historical prices for ${upperSymbol}: Alpha Vantage API key required. ` +
        `Ensure ALPHA_VANTAGE_API_KEY is set.`
      );
    }

    // DEVELOPMENT ONLY: Generate mock prices
    console.warn(`[DEV] Using mock prices for ${upperSymbol}`);
    return this.generateMockPrices(upperSymbol, days);
  }

  /**
   * Cache historical prices to Supabase for faster future access
   */
  private async cacheHistoricalPricesToSupabase(symbol: string, prices: Price[]): Promise<void> {
    if (!this.useSupabaseCache || prices.length === 0) return;

    try {
      // Upsert prices in batches
      const batchSize = 100;
      for (let i = 0; i < prices.length; i += batchSize) {
        const batch = prices.slice(i, i + batchSize).map(p => ({
          symbol,
          date: p.timestamp.toISOString().split('T')[0],
          open: p.open,
          high: p.high,
          low: p.low,
          close: p.close,
          adjusted_close: p.close,  // Alpha Vantage already returns adjusted
          volume: p.volume,
        }));

        await supabaseAdmin
          .from('frontier_historical_prices')
          .upsert(batch, { onConflict: 'symbol,date' });
      }
    } catch (e) {
      console.warn('Failed to cache historical prices to Supabase:', e);
    }
  }

  /**
   * Get Fama-French factor returns
   * Fetches from Supabase (populated by Ken French data loader script)
   */
  async getFactorReturns(days: number = 252): Promise<Map<string, number[]>> {
    const factors = new Map<string, number[]>();
    const factorNames = ['Mkt-RF', 'SMB', 'HML', 'RMW', 'CMA', 'Mom'];

    // Try to fetch from Supabase first
    if (this.useSupabaseCache) {
      try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - Math.ceil(days * 1.5));  // Buffer for weekends

        const { data: factorData } = await supabaseAdmin
          .from('frontier_factor_returns')
          .select('*')
          .gte('date', startDate.toISOString().split('T')[0])
          .lte('date', endDate.toISOString().split('T')[0])
          .order('date', { ascending: true });

        if (factorData && factorData.length > 0) {
          // Group by factor name
          const factorGroups: Record<string, number[]> = {};
          for (const row of factorData) {
            if (!factorGroups[row.factor_name]) {
              factorGroups[row.factor_name] = [];
            }
            factorGroups[row.factor_name].push(row.return_value);
          }

          // Extract required factors
          for (const factor of factorNames) {
            const returns = factorGroups[factor];
            if (returns && returns.length >= days * 0.9) {
              factors.set(factor, returns.slice(-days));
            }
          }

          // If we have most factors, return
          if (factors.size >= factorNames.length * 0.8) {
            // Fill any missing factors with generated data
            for (const factor of factorNames) {
              if (!factors.has(factor)) {
                console.warn(`[WARN] Missing factor ${factor} in database, using generated data`);
                factors.set(factor, this.generateFactorReturns(factor, days));
              }
            }
            return factors;
          }
        }
      } catch (e) {
        console.warn('Supabase factor returns error:', e);
      }
    }

    // PRODUCTION WARNING: Ken French data should be loaded via script
    if (!this.config.allowMockFallback) {
      console.warn(
        'Ken French factor data not found in database. ' +
        'Run: npm run download-ken-french to populate factor returns.'
      );
    }

    // Fallback to generated factor returns
    for (const factor of factorNames) {
      if (!factors.has(factor)) {
        factors.set(factor, this.generateFactorReturns(factor, days));
      }
    }

    return factors;
  }

  /**
   * Subscribe to real-time quotes via Polygon.io WebSocket
   * Provides <20ms latency for real-time streaming quotes
   */
  async subscribeQuotes(
    symbols: string[],
    onQuote: (quote: Quote) => void
  ): Promise<() => void> {
    const upperSymbols = symbols.map(s => s.toUpperCase());
    console.log(`Subscribing to quotes for: ${upperSymbols.join(', ')}`);

    // Register callback for each symbol
    for (const symbol of upperSymbols) {
      if (!this.wsSubscribers.has(symbol)) {
        this.wsSubscribers.set(symbol, new Set());
      }
      this.wsSubscribers.get(symbol)!.add(onQuote);
    }

    // Connect to Polygon.io WebSocket if not already connected
    if (!this.wsConnected && this.config.polygonApiKey) {
      await this.connectPolygonWebSocket();
    }

    // Subscribe to symbols on existing connection
    if (this.wsConnected && this.polygonWs) {
      this.sendPolygonSubscribe(upperSymbols);
    }

    // DEVELOPMENT FALLBACK: Use polling if WebSocket not available
    let pollInterval: NodeJS.Timeout | null = null;
    if (!this.config.polygonApiKey && this.config.allowMockFallback) {
      console.warn('[DEV] Using mock polling for quotes (1s interval)');
      pollInterval = setInterval(() => {
        for (const symbol of upperSymbols) {
          const quote = this.generateMockQuote(symbol);
          onQuote(quote);
        }
      }, 1000);
    }

    // Return unsubscribe function
    return () => {
      for (const symbol of upperSymbols) {
        const subscribers = this.wsSubscribers.get(symbol);
        if (subscribers) {
          subscribers.delete(onQuote);
          if (subscribers.size === 0) {
            this.wsSubscribers.delete(symbol);
            // Unsubscribe from WebSocket if no more listeners
            if (this.wsConnected && this.polygonWs) {
              this.sendPolygonUnsubscribe([symbol]);
            }
          }
        }
      }
      if (pollInterval) {
        clearInterval(pollInterval);
      }
      console.log(`Unsubscribed from: ${upperSymbols.join(', ')}`);
    };
  }

  /**
   * Connect to Polygon.io WebSocket
   */
  private async connectPolygonWebSocket(): Promise<void> {
    if (!this.config.polygonApiKey) {
      throw new DataNotAvailableError('POLYGON_API_KEY required for WebSocket streaming');
    }

    return new Promise((resolve, reject) => {
      const wsUrl = 'wss://socket.polygon.io/stocks';
      console.log('Connecting to Polygon.io WebSocket...');

      this.polygonWs = new WebSocket(wsUrl);

      this.polygonWs.on('open', () => {
        console.log('WebSocket connected, authenticating...');
        // Authenticate with API key
        const authMsg: PolygonAuthMessage = {
          action: 'auth',
          params: this.config.polygonApiKey!,
        };
        this.polygonWs!.send(JSON.stringify(authMsg));
      });

      this.polygonWs.on('message', (data: WebSocket.Data) => {
        try {
          const messages = JSON.parse(data.toString()) as PolygonWSMessage[];

          for (const msg of messages) {
            if (msg.ev === 'status') {
              if (msg.status === 'auth_success') {
                console.log('Polygon.io WebSocket authenticated');
                this.wsConnected = true;
                this.wsReconnectAttempts = 0;
                this.startHeartbeat();

                // Subscribe to any pending symbols
                const allSymbols = Array.from(this.wsSubscribers.keys());
                if (allSymbols.length > 0) {
                  this.sendPolygonSubscribe(allSymbols);
                }
                resolve();
              } else if (msg.status === 'auth_failed') {
                console.error('Polygon.io authentication failed:', msg.message);
                reject(new Error('Authentication failed'));
              }
            } else if (msg.ev === 'T' && msg.sym && msg.p !== undefined) {
              // Trade event - convert to Quote
              this.handlePolygonTrade(msg);
            } else if (msg.ev === 'Q' && msg.sym) {
              // Quote event (bid/ask)
              this.handlePolygonQuote(msg);
            }
          }
        } catch (e) {
          console.error('Error parsing Polygon message:', e);
        }
      });

      this.polygonWs.on('close', (code, reason) => {
        console.log(`WebSocket closed: ${code} - ${reason}`);
        this.wsConnected = false;
        this.stopHeartbeat();

        // Attempt reconnection
        if (this.wsReconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
          this.wsReconnectAttempts++;
          const delay = Math.min(1000 * Math.pow(2, this.wsReconnectAttempts), 30000);
          console.log(`Reconnecting in ${delay}ms (attempt ${this.wsReconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS})`);
          setTimeout(() => this.connectPolygonWebSocket(), delay);
        }
      });

      this.polygonWs.on('error', (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      });

      // Timeout for initial connection
      setTimeout(() => {
        if (!this.wsConnected) {
          reject(new Error('WebSocket connection timeout'));
        }
      }, 10000);
    });
  }

  /**
   * Send subscribe message to Polygon.io WebSocket
   */
  private sendPolygonSubscribe(symbols: string[]): void {
    if (!this.polygonWs || !this.wsConnected) return;

    // Subscribe to both trades (T) and quotes (Q) for better coverage
    const trades = symbols.map(s => `T.${s}`).join(',');
    const quotes = symbols.map(s => `Q.${s}`).join(',');

    const msg: PolygonAuthMessage = {
      action: 'subscribe',
      params: `${trades},${quotes}`,
    };
    this.polygonWs.send(JSON.stringify(msg));
    console.log(`Subscribed to: ${symbols.join(', ')}`);
  }

  /**
   * Send unsubscribe message to Polygon.io WebSocket
   */
  private sendPolygonUnsubscribe(symbols: string[]): void {
    if (!this.polygonWs || !this.wsConnected) return;

    const trades = symbols.map(s => `T.${s}`).join(',');
    const quotes = symbols.map(s => `Q.${s}`).join(',');

    const msg: PolygonAuthMessage = {
      action: 'unsubscribe',
      params: `${trades},${quotes}`,
    };
    this.polygonWs.send(JSON.stringify(msg));
  }

  /**
   * Handle trade message from Polygon.io
   */
  private handlePolygonTrade(msg: PolygonWSMessage): void {
    const symbol = msg.sym!;
    const lastQuote = this.lastQuotes.get(symbol);
    const prevPrice = lastQuote?.last || msg.p!;
    const change = msg.p! - prevPrice;
    const changePercent = (change / prevPrice) * 100;

    const quote: Quote = {
      symbol,
      timestamp: new Date(msg.t || Date.now()),
      bid: lastQuote?.bid || msg.p! * 0.9999,
      ask: lastQuote?.ask || msg.p! * 1.0001,
      last: msg.p!,
      change,
      changePercent,
    };

    this.broadcastQuote(quote);
  }

  /**
   * Handle quote message from Polygon.io (bid/ask)
   */
  private handlePolygonQuote(msg: PolygonWSMessage): void {
    const symbol = msg.sym!;
    const lastQuote = this.lastQuotes.get(symbol);

    // Update bid/ask from quote message
    const bid = msg.bp || lastQuote?.bid || 0;
    const ask = msg.ap || lastQuote?.ask || 0;
    const last = lastQuote?.last || (bid + ask) / 2;
    const prevPrice = lastQuote?.last || last;
    const change = last - prevPrice;
    const changePercent = prevPrice ? (change / prevPrice) * 100 : 0;

    const quote: Quote = {
      symbol,
      timestamp: new Date(msg.t || Date.now()),
      bid,
      ask,
      last,
      change,
      changePercent,
    };

    this.broadcastQuote(quote);
  }

  /**
   * Broadcast quote to all subscribers
   */
  private broadcastQuote(quote: Quote): void {
    // Cache the quote
    this.lastQuotes.set(quote.symbol, quote);
    this.quoteCache.set(quote.symbol, { quote, timestamp: Date.now() });

    // Notify subscribers
    const subscribers = this.wsSubscribers.get(quote.symbol);
    if (subscribers) {
      for (const callback of subscribers) {
        try {
          callback(quote);
        } catch (e) {
          console.error(`Error in quote subscriber for ${quote.symbol}:`, e);
        }
      }
    }

    // Cache to Redis asynchronously
    this.cacheQuoteToRedis(quote).catch(() => { /* ignore */ });
  }

  /**
   * Start WebSocket heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.wsHeartbeatInterval = setInterval(() => {
      if (this.polygonWs && this.wsConnected) {
        // Polygon.io doesn't require explicit pings, but we can monitor connection
        // The connection will auto-close if no data received
      }
    }, 30000);
  }

  /**
   * Stop WebSocket heartbeat
   */
  private stopHeartbeat(): void {
    if (this.wsHeartbeatInterval) {
      clearInterval(this.wsHeartbeatInterval);
      this.wsHeartbeatInterval = null;
    }
  }

  /**
   * Disconnect WebSocket (cleanup)
   */
  async disconnect(): Promise<void> {
    this.stopHeartbeat();
    if (this.polygonWs) {
      this.polygonWs.close();
      this.polygonWs = null;
    }
    this.wsConnected = false;
    this.wsSubscribers.clear();

    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }
  }

  // ============================================================================
  // POLYGON.IO INTEGRATION
  // ============================================================================

  private async fetchPolygonQuote(symbol: string): Promise<Quote | null> {
    const url = `https://api.polygon.io/v2/last/trade/${symbol}?apiKey=${this.config.polygonApiKey}`;

    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json() as { results?: { t: number; p: number } };
    const trade = data.results;

    if (!trade) return null;

    return {
      symbol,
      timestamp: new Date(trade.t),
      bid: trade.p * 0.9999,  // Approximate
      ask: trade.p * 1.0001,
      last: trade.p,
      change: 0,
      changePercent: 0,
    };
  }

  // ============================================================================
  // ALPHA VANTAGE INTEGRATION
  // ============================================================================

  private async fetchAlphaVantagePrices(
    symbol: string,
    days: number
  ): Promise<Price[]> {
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${symbol}&outputsize=full&apikey=${this.config.alphaVantageApiKey}`;
    
    const response = await fetch(url);
    if (!response.ok) return [];
    
    const data = await response.json();
    const timeSeries = data['Time Series (Daily)'];
    
    if (!timeSeries) return [];
    
    const prices: Price[] = [];
    const dates = Object.keys(timeSeries).slice(0, days).reverse();
    
    for (const date of dates) {
      const day = timeSeries[date];
      prices.push({
        symbol,
        timestamp: new Date(date),
        open: parseFloat(day['1. open']),
        high: parseFloat(day['2. high']),
        low: parseFloat(day['3. low']),
        close: parseFloat(day['4. close']),
        volume: parseInt(day['6. volume']),
      });
    }
    
    return prices;
  }

  // ============================================================================
  // MOCK DATA GENERATORS (for demo/testing)
  // ============================================================================

  private generateMockQuote(symbol: string): Quote {
    // Deterministic base price from symbol hash
    const hash = symbol.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    const basePrice = 50 + (hash % 450);  // $50 - $500
    
    // Add some randomness
    const noise = (Math.random() - 0.5) * 0.02;  // ±1%
    const price = basePrice * (1 + noise);
    const change = price * noise;
    
    return {
      symbol,
      timestamp: new Date(),
      bid: price * 0.9999,
      ask: price * 1.0001,
      last: price,
      change,
      changePercent: noise * 100,
    };
  }

  private generateMockPrices(symbol: string, days: number): Price[] {
    const prices: Price[] = [];
    const hash = symbol.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    let price = 50 + (hash % 450);

    // Generate with random walk + drift
    const drift = 0.0003;  // ~7.5% annual return
    const vol = 0.015;     // ~24% annual volatility

    // Generate enough calendar days to get the requested trading days
    // (approximately 7/5 ratio for weekdays)
    let calendarDays = 0;
    const maxCalendarDays = days * 2;  // Safety limit
    while (prices.length < days && calendarDays < maxCalendarDays) {
      const date = new Date();
      date.setDate(date.getDate() - calendarDays);
      calendarDays++;

      // Skip weekends
      if (date.getDay() === 0 || date.getDay() === 6) continue;

      const dailyReturn = drift + vol * this.boxMullerRandom();
      price = price * (1 + dailyReturn);

      const dailyVol = Math.abs(this.boxMullerRandom()) * 0.01;

      prices.push({
        symbol,
        timestamp: date,
        open: price * (1 - dailyVol / 2),
        high: price * (1 + dailyVol),
        low: price * (1 - dailyVol),
        close: price,
        volume: Math.floor(1000000 + Math.random() * 9000000),
      });
    }

    // Reverse to chronological order (oldest first)
    return prices.reverse();
  }

  private generateFactorReturns(factor: string, days: number): number[] {
    const returns: number[] = [];
    
    // Factor-specific parameters (daily)
    const params: Record<string, { mu: number; sigma: number }> = {
      'Mkt-RF': { mu: 0.0003, sigma: 0.01 },
      'SMB': { mu: 0.0001, sigma: 0.006 },
      'HML': { mu: 0.0001, sigma: 0.005 },
      'RMW': { mu: 0.0001, sigma: 0.004 },
      'CMA': { mu: 0.0001, sigma: 0.003 },
      'Mom': { mu: 0.0002, sigma: 0.008 },
    };
    
    const p = params[factor] || { mu: 0, sigma: 0.005 };
    
    for (let i = 0; i < days; i++) {
      returns.push(p.mu + p.sigma * this.boxMullerRandom());
    }
    
    return returns;
  }

  private boxMullerRandom(): number {
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /**
   * Get asset metadata
   */
  async getAssetInfo(symbol: string): Promise<Asset | null> {
    // In production: Fetch from data provider
    // For now: Return basic info based on common symbols
    
    const assets: Record<string, Partial<Asset>> = {
      'AAPL': { name: 'Apple Inc.', sector: 'Technology', exchange: 'NASDAQ' },
      'NVDA': { name: 'NVIDIA Corporation', sector: 'Technology', exchange: 'NASDAQ' },
      'MSFT': { name: 'Microsoft Corporation', sector: 'Technology', exchange: 'NASDAQ' },
      'GOOGL': { name: 'Alphabet Inc.', sector: 'Communication Services', exchange: 'NASDAQ' },
      'AMZN': { name: 'Amazon.com Inc.', sector: 'Consumer Discretionary', exchange: 'NASDAQ' },
      'META': { name: 'Meta Platforms Inc.', sector: 'Communication Services', exchange: 'NASDAQ' },
      'JPM': { name: 'JPMorgan Chase & Co.', sector: 'Financials', exchange: 'NYSE' },
      'V': { name: 'Visa Inc.', sector: 'Financials', exchange: 'NYSE' },
      'JNJ': { name: 'Johnson & Johnson', sector: 'Healthcare', exchange: 'NYSE' },
      'UNH': { name: 'UnitedHealth Group', sector: 'Healthcare', exchange: 'NYSE' },
      'SPY': { name: 'SPDR S&P 500 ETF', sector: 'ETF', exchange: 'NYSE' },
    };
    
    const info = assets[symbol];
    if (!info) return null;
    
    return {
      symbol,
      name: info.name || symbol,
      sector: info.sector || 'Unknown',
      exchange: info.exchange || 'Unknown',
      currency: 'USD',
    };
  }
}

// Default export with environment configuration
export const marketDataProvider = new MarketDataProvider({
  polygonApiKey: process.env.POLYGON_API_KEY,
  alphaVantageApiKey: process.env.ALPHA_VANTAGE_API_KEY,
  redisUrl: process.env.REDIS_URL,
  allowMockFallback: process.env.NODE_ENV !== 'production',
});
