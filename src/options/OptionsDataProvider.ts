/**
 * Options Chain Data Provider
 *
 * Fetches full options chain data (calls/puts by expiration and strike)
 * from Polygon.io with mock data fallback when API keys are not configured.
 *
 * Features:
 * - Full options chain: calls and puts by expiration and strike
 * - Parsed fields: bid, ask, last, volume, open interest, IV per contract
 * - In-memory caching with 5-minute TTL
 * - Automatic fallback to mock data when POLYGON_API_KEY is absent
 */

import { logger } from '../lib/logger.js';
import type { OptionData, OptionsChain } from './ImpliedVolatility.js';

// ============================================================================
// POLYGON API RESPONSE TYPES
// ============================================================================

interface PolygonOptionContract {
  break_even_price?: number;
  day?: {
    change?: number;
    change_percent?: number;
    close?: number;
    high?: number;
    last_updated?: number;
    low?: number;
    open?: number;
    previous_close?: number;
    volume?: number;
    vwap?: number;
  };
  details?: {
    contract_type: 'call' | 'put';
    exercise_style?: string;
    expiration_date: string;
    shares_per_contract?: number;
    strike_price: number;
    ticker: string;
  };
  greeks?: {
    delta?: number;
    gamma?: number;
    theta?: number;
    vega?: number;
  };
  implied_volatility?: number;
  last_quote?: {
    ask?: number;
    ask_size?: number;
    bid?: number;
    bid_size?: number;
    last_updated?: number;
    midpoint?: number;
  };
  open_interest?: number;
  underlying_asset?: {
    change_to_break_even?: number;
    last_updated?: number;
    price?: number;
    ticker?: string;
  };
}

interface PolygonOptionsResponse {
  results?: PolygonOptionContract[];
  status?: string;
  request_id?: string;
  next_url?: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface OptionsDataProviderConfig {
  polygonApiKey?: string;
  cacheTtlMs?: number;
  maxExpirations?: number;
}

// ============================================================================
// CACHE ENTRY
// ============================================================================

interface CacheEntry {
  data: OptionsChain;
  expires: number;
}

// ============================================================================
// OPTIONS DATA PROVIDER
// ============================================================================

export class OptionsDataProvider {
  private polygonApiKey: string;
  private cacheTtlMs: number;
  private maxExpirations: number;
  private cache = new Map<string, CacheEntry>();

  constructor(config: OptionsDataProviderConfig = {}) {
    this.polygonApiKey = config.polygonApiKey || process.env.POLYGON_API_KEY || '';
    this.cacheTtlMs = config.cacheTtlMs ?? 5 * 60 * 1000; // 5 minutes
    this.maxExpirations = config.maxExpirations ?? 6;
  }

  /**
   * Fetch the full options chain for a symbol.
   * Uses Polygon.io when API key is available, otherwise returns mock data.
   */
  async getOptionsChain(symbol: string): Promise<OptionsChain> {
    const upperSymbol = symbol.toUpperCase();

    // Check cache
    const cached = this.cache.get(upperSymbol);
    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }

    let chain: OptionsChain;

    if (this.polygonApiKey) {
      try {
        chain = await this.fetchPolygonOptionsChain(upperSymbol);
      } catch {
        logger.warn({ symbol: upperSymbol }, 'Polygon options fetch failed, using mock data');
        chain = this.generateMockOptionsChain(upperSymbol);
      }
    } else {
      chain = this.generateMockOptionsChain(upperSymbol);
    }

    // Cache result
    this.cache.set(upperSymbol, {
      data: chain,
      expires: Date.now() + this.cacheTtlMs,
    });

    return chain;
  }

  /**
   * Fetch options chains for multiple symbols.
   */
  async getOptionsChainBatch(symbols: string[]): Promise<Map<string, OptionsChain>> {
    const results = new Map<string, OptionsChain>();

    for (const symbol of symbols) {
      const chain = await this.getOptionsChain(symbol);
      results.set(symbol.toUpperCase(), chain);
    }

    return results;
  }

  /**
   * Clear all cached data.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Check whether the provider is using live data (Polygon) or mock fallback.
   */
  get isLive(): boolean {
    return this.polygonApiKey.length > 0;
  }

  // ============================================================================
  // POLYGON.IO OPTIONS CHAIN
  // ============================================================================

  private async fetchPolygonOptionsChain(symbol: string): Promise<OptionsChain> {
    const baseUrl = `https://api.polygon.io/v3/snapshot/options/${symbol}`;
    const url = `${baseUrl}?limit=250&apiKey=${this.polygonApiKey}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Polygon options API error: ${response.status}`);
    }

    const data: PolygonOptionsResponse = await response.json() as PolygonOptionsResponse;

    if (!data.results || data.results.length === 0) {
      logger.info({ symbol }, 'No options data from Polygon, using mock');
      return this.generateMockOptionsChain(symbol);
    }

    // Parse contracts
    const calls: OptionData[] = [];
    const puts: OptionData[] = [];
    const expirationSet = new Set<string>();
    let underlyingPrice = 0;

    for (const contract of data.results) {
      if (!contract.details) continue;

      const expiration = contract.details.expiration_date;
      expirationSet.add(expiration);

      if (contract.underlying_asset?.price && underlyingPrice === 0) {
        underlyingPrice = contract.underlying_asset.price;
      }

      const parsed: OptionData = {
        strike: contract.details.strike_price,
        expiration,
        bid: contract.last_quote?.bid ?? 0,
        ask: contract.last_quote?.ask ?? 0,
        last: contract.day?.close ?? contract.last_quote?.midpoint ?? 0,
        volume: contract.day?.volume ?? 0,
        openInterest: contract.open_interest ?? 0,
        impliedVolatility: contract.implied_volatility ?? 0,
        delta: contract.greeks?.delta,
        gamma: contract.greeks?.gamma,
        theta: contract.greeks?.theta,
        vega: contract.greeks?.vega,
        type: contract.details.contract_type,
      };

      if (contract.details.contract_type === 'call') {
        calls.push(parsed);
      } else {
        puts.push(parsed);
      }
    }

    // Handle pagination if there's a next_url
    // (Polygon returns paginated results for large chains)
    // For now we use the first page — full pagination can be added later.

    const expirations = Array.from(expirationSet).sort();

    return {
      symbol,
      expirations,
      calls,
      puts,
      underlyingPrice: underlyingPrice || undefined,
    };
  }

  // ============================================================================
  // MOCK DATA GENERATOR
  // ============================================================================

  /**
   * Generate realistic mock options chain data for demo/testing.
   * Uses a deterministic seed from the symbol so the same symbol always
   * produces the same chain.
   */
  generateMockOptionsChain(symbol: string): OptionsChain {
    // Deterministic base price from symbol hash
    const hash = symbol.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    const basePrice = 50 + (hash % 450); // $50 – $500

    // Generate expirations: weekly + monthly out to ~3 months
    const expirations: string[] = [];
    const now = new Date();
    for (let i = 0; i < this.maxExpirations; i++) {
      const exp = new Date(now);
      // 7, 14, 21, 30, 60, 90 days out
      const daysOut = i < 3 ? 7 * (i + 1) : [30, 60, 90][i - 3];
      exp.setDate(exp.getDate() + daysOut);
      // Snap to Friday
      const dayOfWeek = exp.getDay();
      const daysToFriday = (5 - dayOfWeek + 7) % 7;
      exp.setDate(exp.getDate() + daysToFriday);
      expirations.push(exp.toISOString().split('T')[0]);
    }

    const calls: OptionData[] = [];
    const puts: OptionData[] = [];

    // Seeded PRNG (Mulberry32) for deterministic mock data
    let s = hash;
    const rand = (): number => {
      s |= 0;
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    // Strikes: 5 below to 5 above ATM in $5 increments (or $1 for cheap stocks)
    const strikeIncrement = basePrice > 100 ? 5 : 1;
    const atmStrike = Math.round(basePrice / strikeIncrement) * strikeIncrement;
    const strikes: number[] = [];
    for (let i = -5; i <= 5; i++) {
      strikes.push(atmStrike + i * strikeIncrement);
    }

    for (const expiration of expirations) {
      const daysToExpiry = Math.max(
        1,
        (new Date(expiration).getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );
      const timeDecay = Math.sqrt(daysToExpiry / 365);

      for (const strike of strikes) {
        const moneyness = (basePrice - strike) / basePrice;
        const baseIV = 0.25 + Math.abs(moneyness) * 0.3; // Smile

        // Call pricing
        const callIntrinsic = Math.max(0, basePrice - strike);
        const callTimeValue = basePrice * baseIV * timeDecay * 0.4 * (0.8 + rand() * 0.4);
        const callPrice = callIntrinsic + callTimeValue;
        const callSpread = callPrice * (0.02 + rand() * 0.03);

        calls.push({
          strike,
          expiration,
          bid: Math.max(0, +(callPrice - callSpread / 2).toFixed(2)),
          ask: +(callPrice + callSpread / 2).toFixed(2),
          last: +callPrice.toFixed(2),
          volume: Math.floor(rand() * 2000),
          openInterest: Math.floor(rand() * 10000),
          impliedVolatility: +(baseIV + (rand() - 0.5) * 0.02).toFixed(4),
          delta: +(0.5 + moneyness * 2).toFixed(3),
          gamma: +(0.03 * (1 - Math.abs(moneyness) * 3)).toFixed(4),
          theta: +(-callPrice * 0.01 * (1 / Math.sqrt(daysToExpiry))).toFixed(3),
          vega: +(basePrice * timeDecay * 0.01).toFixed(3),
          type: 'call',
        });

        // Put pricing
        const putIntrinsic = Math.max(0, strike - basePrice);
        const putTimeValue = basePrice * baseIV * timeDecay * 0.4 * (0.8 + rand() * 0.4);
        const putPrice = putIntrinsic + putTimeValue;
        const putSpread = putPrice * (0.02 + rand() * 0.03);

        puts.push({
          strike,
          expiration,
          bid: Math.max(0, +(putPrice - putSpread / 2).toFixed(2)),
          ask: +(putPrice + putSpread / 2).toFixed(2),
          last: +putPrice.toFixed(2),
          volume: Math.floor(rand() * 1500),
          openInterest: Math.floor(rand() * 8000),
          impliedVolatility: +(baseIV + 0.02 + (rand() - 0.5) * 0.02).toFixed(4), // puts slightly higher IV (skew)
          delta: +(-0.5 + moneyness * 2).toFixed(3),
          gamma: +(0.03 * (1 - Math.abs(moneyness) * 3)).toFixed(4),
          theta: +(-putPrice * 0.01 * (1 / Math.sqrt(daysToExpiry))).toFixed(3),
          vega: +(basePrice * timeDecay * 0.01).toFixed(3),
          type: 'put',
        });
      }
    }

    return {
      symbol,
      expirations,
      calls,
      puts,
      underlyingPrice: basePrice,
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const optionsDataProvider = new OptionsDataProvider();
