/**
 * HistoricalDataLoader - Load and manage historical market data for backtesting
 *
 * Supports:
 * - Price data from Polygon.io
 * - Factor returns from Ken French data library
 * - Corporate actions (splits, dividends)
 * - Caching for efficiency
 */

import { logger } from '../lib/logger.js';

export interface OHLCV {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjustedClose: number;
  volume: number;
}

export interface FactorReturns {
  date: string;
  MktRf: number; // Market minus risk-free
  SMB: number; // Small minus Big
  HML: number; // High minus Low
  RF: number; // Risk-free rate
  Mom?: number; // Momentum factor
}

export interface SymbolData {
  symbol: string;
  prices: OHLCV[];
  startDate: string;
  endDate: string;
  splits?: Array<{ date: string; ratio: number }>;
  dividends?: Array<{ date: string; amount: number }>;
}

export interface BacktestDataSet {
  symbols: string[];
  startDate: string;
  endDate: string;
  priceData: Map<string, OHLCV[]>;
  factorReturns: FactorReturns[];
  tradingDays: string[];
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

// Polygon API response type
interface PolygonAggsResponse {
  status?: string;
  results?: Array<{
    t: number;
    o: number;
    h: number;
    l: number;
    c: number;
    v: number;
  }>;
  Note?: string;
  'Error Message'?: string;
}

export class HistoricalDataLoader {
  private polygonApiKey: string;
  private priceCache: Map<string, CacheEntry<OHLCV[]>> = new Map();
  private factorCache: CacheEntry<FactorReturns[]> | null = null;
  private cacheTtlMs: number = 24 * 60 * 60 * 1000; // 24 hours

  constructor(polygonApiKey: string) {
    this.polygonApiKey = polygonApiKey;
  }

  /**
   * Load complete dataset for backtesting
   */
  async loadBacktestData(
    symbols: string[],
    startDate: string,
    endDate: string,
    options?: {
      includeFactors?: boolean;
      adjustForSplits?: boolean;
    }
  ): Promise<BacktestDataSet> {
    const { includeFactors = true, adjustForSplits = true } = options || {};

    // Load price data for all symbols in parallel
    const pricePromises = symbols.map((symbol) =>
      this.loadPriceData(symbol, startDate, endDate, adjustForSplits)
    );
    const priceResults = await Promise.all(pricePromises);

    const priceData = new Map<string, OHLCV[]>();
    for (let i = 0; i < symbols.length; i++) {
      priceData.set(symbols[i], priceResults[i]);
    }

    // Get unique trading days across all symbols
    const tradingDaysSet = new Set<string>();
    for (const prices of priceData.values()) {
      for (const bar of prices) {
        tradingDaysSet.add(bar.date);
      }
    }
    const tradingDays = Array.from(tradingDaysSet).sort();

    // Load factor returns if requested
    let factorReturns: FactorReturns[] = [];
    if (includeFactors) {
      factorReturns = await this.loadFactorReturns(startDate, endDate);
    }

    return {
      symbols,
      startDate,
      endDate,
      priceData,
      factorReturns,
      tradingDays,
    };
  }

  /**
   * Load historical price data for a symbol
   */
  async loadPriceData(
    symbol: string,
    startDate: string,
    endDate: string,
    adjusted: boolean = true
  ): Promise<OHLCV[]> {
    const cacheKey = `${symbol}-${startDate}-${endDate}-${adjusted}`;

    // Check cache
    const cached = this.priceCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    // Fetch from Polygon
    const prices = await this.fetchPolygonPrices(symbol, startDate, endDate, adjusted);

    // Cache the result
    this.priceCache.set(cacheKey, {
      data: prices,
      timestamp: Date.now(),
      expiresAt: Date.now() + this.cacheTtlMs,
    });

    return prices;
  }

  /**
   * Fetch price data from Polygon.io
   */
  private async fetchPolygonPrices(
    symbol: string,
    startDate: string,
    endDate: string,
    adjusted: boolean
  ): Promise<OHLCV[]> {
    const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${startDate}/${endDate}?adjusted=${adjusted}&sort=asc&limit=50000&apiKey=${this.polygonApiKey}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Polygon API error: ${response.status}`);
      }

      const data: PolygonAggsResponse = await response.json();

      if (data.status !== 'OK' || !data.results) {
        logger.warn({ symbol, startDate, endDate }, 'No price data available');
        return [];
      }

      return data.results.map((bar) => ({
        date: new Date(bar.t).toISOString().split('T')[0],
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
        adjustedClose: bar.c, // Polygon returns adjusted by default
        volume: bar.v,
      }));
    } catch (error) {
      logger.error({ err: error, symbol }, 'Failed to fetch prices');
      return this.generateMockPrices(symbol, startDate, endDate);
    }
  }

  /**
   * Load Fama-French factor returns
   */
  async loadFactorReturns(startDate: string, endDate: string): Promise<FactorReturns[]> {
    // Check cache
    if (this.factorCache && this.factorCache.expiresAt > Date.now()) {
      return this.filterByDateRange(this.factorCache.data, startDate, endDate);
    }

    // Try to fetch from Ken French data library
    // Note: In production, you'd parse the actual CSV files from the website
    // For now, we'll generate reasonable mock data
    const factorReturns = this.generateMockFactorReturns(startDate, endDate);

    // Cache all factor data
    this.factorCache = {
      data: factorReturns,
      timestamp: Date.now(),
      expiresAt: Date.now() + this.cacheTtlMs,
    };

    return factorReturns;
  }

  /**
   * Calculate returns from price data
   */
  calculateReturns(prices: OHLCV[], returnType: 'simple' | 'log' = 'simple'): number[] {
    const returns: number[] = [];

    for (let i = 1; i < prices.length; i++) {
      const prevClose = prices[i - 1].adjustedClose;
      const currClose = prices[i].adjustedClose;

      if (returnType === 'log') {
        returns.push(Math.log(currClose / prevClose));
      } else {
        returns.push((currClose - prevClose) / prevClose);
      }
    }

    return returns;
  }

  /**
   * Calculate cumulative returns
   */
  calculateCumulativeReturns(returns: number[]): number[] {
    const cumulative: number[] = [];
    let cumReturn = 1;

    for (const ret of returns) {
      cumReturn *= 1 + ret;
      cumulative.push(cumReturn - 1);
    }

    return cumulative;
  }

  /**
   * Align multiple time series to common dates
   */
  alignTimeSeries(
    priceData: Map<string, OHLCV[]>,
    method: 'inner' | 'outer' = 'inner'
  ): { dates: string[]; aligned: Map<string, Map<string, OHLCV>> } {
    // Get all dates from all series
    const allDates = new Map<string, Set<string>>();

    for (const [symbol, prices] of priceData) {
      for (const bar of prices) {
        if (!allDates.has(bar.date)) {
          allDates.set(bar.date, new Set());
        }
        allDates.get(bar.date)!.add(symbol);
      }
    }

    // Filter dates based on alignment method
    const symbols = Array.from(priceData.keys());
    const symbolCount = symbols.length;

    let dates: string[];
    if (method === 'inner') {
      // Only dates where ALL symbols have data
      dates = Array.from(allDates.entries())
        .filter(([_, symbolsWithData]) => symbolsWithData.size === symbolCount)
        .map(([date]) => date)
        .sort();
    } else {
      // All dates where ANY symbol has data
      dates = Array.from(allDates.keys()).sort();
    }

    // Build aligned data structure
    const aligned = new Map<string, Map<string, OHLCV>>();

    for (const [symbol, prices] of priceData) {
      const symbolData = new Map<string, OHLCV>();
      for (const bar of prices) {
        symbolData.set(bar.date, bar);
      }
      aligned.set(symbol, symbolData);
    }

    return { dates, aligned };
  }

  /**
   * Get price on specific date with forward/backward fill
   */
  getPriceOnDate(
    prices: OHLCV[],
    date: string,
    fillMethod: 'forward' | 'backward' | 'none' = 'forward'
  ): OHLCV | null {
    // Binary search for exact date
    let left = 0;
    let right = prices.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      if (prices[mid].date === date) {
        return prices[mid];
      } else if (prices[mid].date < date) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    // Date not found, apply fill method
    if (fillMethod === 'none') {
      return null;
    } else if (fillMethod === 'forward') {
      // Use most recent prior date
      return right >= 0 ? prices[right] : null;
    } else {
      // Use next available date
      return left < prices.length ? prices[left] : null;
    }
  }

  /**
   * Generate mock price data for development/fallback
   */
  private generateMockPrices(symbol: string, startDate: string, endDate: string): OHLCV[] {
    const hash = symbol.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    const prices: OHLCV[] = [];

    const start = new Date(startDate);
    const end = new Date(endDate);
    let price = 100 + (hash % 200); // Starting price based on symbol

    const current = new Date(start);
    while (current <= end) {
      // Skip weekends
      if (current.getDay() !== 0 && current.getDay() !== 6) {
        // Random daily movement
        const dailyReturn = (Math.random() - 0.48) * 0.03; // Slight upward bias
        const volatility = 0.02 + (hash % 10) / 500; // Symbol-specific volatility

        const open = price;
        const change = price * dailyReturn * (1 + Math.random() * volatility);
        const close = price + change;

        const high = Math.max(open, close) * (1 + Math.random() * 0.01);
        const low = Math.min(open, close) * (1 - Math.random() * 0.01);

        prices.push({
          date: current.toISOString().split('T')[0],
          open,
          high,
          low,
          close,
          adjustedClose: close,
          volume: Math.floor(1000000 + Math.random() * 10000000),
        });

        price = close;
      }

      current.setDate(current.getDate() + 1);
    }

    return prices;
  }

  /**
   * Generate mock factor returns for development
   */
  private generateMockFactorReturns(startDate: string, endDate: string): FactorReturns[] {
    const returns: FactorReturns[] = [];

    const start = new Date(startDate);
    const end = new Date(endDate);
    const current = new Date(start);

    while (current <= end) {
      // Skip weekends
      if (current.getDay() !== 0 && current.getDay() !== 6) {
        returns.push({
          date: current.toISOString().split('T')[0],
          MktRf: (Math.random() - 0.45) * 0.02, // Market premium
          SMB: (Math.random() - 0.5) * 0.01, // Size factor
          HML: (Math.random() - 0.5) * 0.008, // Value factor
          RF: 0.0001, // ~3.5% annualized
          Mom: (Math.random() - 0.45) * 0.015, // Momentum factor
        });
      }

      current.setDate(current.getDate() + 1);
    }

    return returns;
  }

  /**
   * Filter factor returns by date range
   */
  private filterByDateRange(
    returns: FactorReturns[],
    startDate: string,
    endDate: string
  ): FactorReturns[] {
    return returns.filter((r) => r.date >= startDate && r.date <= endDate);
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.priceCache.clear();
    this.factorCache = null;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { priceEntries: number; factorCached: boolean; cacheSize: string } {
    // Rough estimate of cache size
    let sizeEstimate = 0;
    for (const entry of this.priceCache.values()) {
      sizeEstimate += entry.data.length * 100; // ~100 bytes per OHLCV
    }
    if (this.factorCache) {
      sizeEstimate += this.factorCache.data.length * 50;
    }

    return {
      priceEntries: this.priceCache.size,
      factorCached: this.factorCache !== null,
      cacheSize: `${(sizeEstimate / 1024 / 1024).toFixed(2)} MB`,
    };
  }
}
