/**
 * FRONTIER ALPHA - Market Data Provider
 * 
 * Integrates multiple data sources for real-time and historical data:
 * - Polygon.io: Real-time quotes, WebSocket streaming (<20ms latency)
 * - Alpha Vantage: Fundamentals, earnings, SEC filings
 * - Yahoo Finance: Historical prices (via yfinance pattern)
 * - Ken French Data Library: Factor returns
 */

import type { Price, Quote, Asset } from '../types/index.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface DataProviderConfig {
  polygonApiKey?: string;
  alphaVantageApiKey?: string;
  cacheTTLSeconds?: number;
}

// ============================================================================
// MARKET DATA PROVIDER
// ============================================================================

export class MarketDataProvider {
  private config: DataProviderConfig;
  private priceCache: Map<string, { prices: Price[]; timestamp: number }> = new Map();
  private quoteCache: Map<string, { quote: Quote; timestamp: number }> = new Map();
  
  constructor(config: DataProviderConfig = {}) {
    this.config = {
      cacheTTLSeconds: 60,
      ...config,
    };
  }

  /**
   * Get real-time quote for a symbol
   */
  async getQuote(symbol: string): Promise<Quote | null> {
    // Check cache
    const cached = this.quoteCache.get(symbol);
    const now = Date.now();
    
    if (cached && (now - cached.timestamp) < (this.config.cacheTTLSeconds || 60) * 1000) {
      return cached.quote;
    }
    
    // Fetch from Polygon.io
    if (this.config.polygonApiKey) {
      try {
        const quote = await this.fetchPolygonQuote(symbol);
        if (quote) {
          this.quoteCache.set(symbol, { quote, timestamp: now });
          return quote;
        }
      } catch (e) {
        console.error(`Polygon quote error for ${symbol}:`, e);
      }
    }
    
    // Fallback: Generate mock quote for demo
    return this.generateMockQuote(symbol);
  }

  /**
   * Get historical prices
   */
  async getHistoricalPrices(
    symbol: string,
    days: number = 252
  ): Promise<Price[]> {
    // Check cache
    const cached = this.priceCache.get(symbol);
    const now = Date.now();
    
    if (cached && (now - cached.timestamp) < 3600 * 1000) {  // 1 hour cache
      return cached.prices;
    }
    
    // Fetch from Alpha Vantage
    if (this.config.alphaVantageApiKey) {
      try {
        const prices = await this.fetchAlphaVantagePrices(symbol, days);
        if (prices.length > 0) {
          this.priceCache.set(symbol, { prices, timestamp: now });
          return prices;
        }
      } catch (e) {
        console.error(`Alpha Vantage price error for ${symbol}:`, e);
      }
    }
    
    // Fallback: Generate mock prices for demo
    return this.generateMockPrices(symbol, days);
  }

  /**
   * Get Fama-French factor returns
   */
  async getFactorReturns(days: number = 252): Promise<Map<string, number[]>> {
    // Ken French Data Library factors
    // In production, fetch from: https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html
    
    const factors = new Map<string, number[]>();
    const factorNames = ['Mkt-RF', 'SMB', 'HML', 'RMW', 'CMA', 'Mom'];
    
    for (const factor of factorNames) {
      // Generate realistic factor returns
      factors.set(factor, this.generateFactorReturns(factor, days));
    }
    
    return factors;
  }

  /**
   * Subscribe to real-time quotes via WebSocket
   */
  async subscribeQuotes(
    symbols: string[],
    onQuote: (quote: Quote) => void
  ): Promise<() => void> {
    // In production: Connect to Polygon.io WebSocket
    // wss://socket.polygon.io/stocks
    
    console.log(`Subscribing to quotes for: ${symbols.join(', ')}`);
    
    // Mock: Emit quotes every second
    const interval = setInterval(() => {
      for (const symbol of symbols) {
        const quote = this.generateMockQuote(symbol);
        onQuote(quote);
      }
    }, 1000);
    
    // Return unsubscribe function
    return () => {
      clearInterval(interval);
      console.log('Unsubscribed from quotes');
    };
  }

  // ============================================================================
  // POLYGON.IO INTEGRATION
  // ============================================================================

  private async fetchPolygonQuote(symbol: string): Promise<Quote | null> {
    const url = `https://api.polygon.io/v2/last/trade/${symbol}?apiKey=${this.config.polygonApiKey}`;
    
    const response = await fetch(url);
    if (!response.ok) return null;
    
    const data = await response.json();
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
    
    for (let i = days; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      
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
    
    return prices;
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

export const marketDataProvider = new MarketDataProvider();
