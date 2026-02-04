/**
 * Implied Volatility Calculator and Options Data Service
 *
 * Fetches options chain data and calculates implied volatility metrics
 * for portfolio risk assessment.
 */

import axios from 'axios';

interface OptionData {
  strike: number;
  expiration: string;
  bid: number;
  ask: number;
  last: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  type: 'call' | 'put';
}

interface IVData {
  symbol: string;
  currentPrice: number;
  ivRank: number; // 0-100, where current IV stands vs 52-week range
  ivPercentile: number;
  atmIV: number; // At-the-money implied volatility
  iv30: number; // 30-day implied volatility
  iv60: number; // 60-day implied volatility
  putCallRatio: number;
  expectedMove: {
    weekly: number;
    monthly: number;
    quarterly: number;
  };
  skew: number; // Put IV vs Call IV difference
  timestamp: Date;
}

interface OptionsChain {
  symbol: string;
  expirations: string[];
  calls: OptionData[];
  puts: OptionData[];
}

// Black-Scholes constants
const DAYS_IN_YEAR = 365;
const RISK_FREE_RATE = 0.05; // 5% risk-free rate

export class ImpliedVolatilityService {
  private cache = new Map<string, { data: IVData; expires: number }>();
  private cacheTtl = 5 * 60 * 1000; // 5 minutes

  /**
   * Get implied volatility data for a symbol
   */
  async getIVData(symbol: string): Promise<IVData | null> {
    // Check cache
    const cached = this.cache.get(symbol);
    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }

    try {
      const chain = await this.fetchOptionsChain(symbol);
      if (!chain) return null;

      const ivData = this.calculateIVMetrics(chain);

      // Cache result
      this.cache.set(symbol, {
        data: ivData,
        expires: Date.now() + this.cacheTtl,
      });

      return ivData;
    } catch (error) {
      console.error(`[IV] Error fetching IV data for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Get IV data for multiple symbols
   */
  async getIVDataBatch(symbols: string[]): Promise<Map<string, IVData>> {
    const results = new Map<string, IVData>();

    for (const symbol of symbols) {
      const data = await this.getIVData(symbol);
      if (data) {
        results.set(symbol, data);
      }
      // Rate limit
      await this.delay(200);
    }

    return results;
  }

  /**
   * Fetch options chain from data provider
   */
  private async fetchOptionsChain(symbol: string): Promise<OptionsChain | null> {
    try {
      // Use Yahoo Finance API (unofficial)
      const url = `https://query1.finance.yahoo.com/v7/finance/options/${symbol}`;

      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        timeout: 10000,
      });

      const data = response.data;
      if (!data?.optionChain?.result?.[0]) {
        return null;
      }

      const result = data.optionChain.result[0];
      const quote = result.quote;
      const options = result.options?.[0];

      if (!options) return null;

      const calls: OptionData[] = (options.calls || []).map((c: any) => ({
        strike: c.strike,
        expiration: new Date(c.expiration * 1000).toISOString(),
        bid: c.bid || 0,
        ask: c.ask || 0,
        last: c.lastPrice || 0,
        volume: c.volume || 0,
        openInterest: c.openInterest || 0,
        impliedVolatility: c.impliedVolatility || 0,
        type: 'call' as const,
      }));

      const puts: OptionData[] = (options.puts || []).map((p: any) => ({
        strike: p.strike,
        expiration: new Date(p.expiration * 1000).toISOString(),
        bid: p.bid || 0,
        ask: p.ask || 0,
        last: p.lastPrice || 0,
        volume: p.volume || 0,
        openInterest: p.openInterest || 0,
        impliedVolatility: p.impliedVolatility || 0,
        type: 'put' as const,
      }));

      return {
        symbol,
        expirations: result.expirationDates?.map((d: number) =>
          new Date(d * 1000).toISOString()
        ) || [],
        calls,
        puts,
      };
    } catch (error) {
      console.error(`[IV] Error fetching options chain for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Calculate IV metrics from options chain
   */
  private calculateIVMetrics(chain: OptionsChain): IVData {
    const allOptions = [...chain.calls, ...chain.puts];

    if (allOptions.length === 0) {
      return this.getDefaultIVData(chain.symbol);
    }

    // Calculate average IV from options
    const ivValues = allOptions
      .filter(o => o.impliedVolatility > 0)
      .map(o => o.impliedVolatility);

    const atmIV = ivValues.length > 0
      ? ivValues.reduce((a, b) => a + b, 0) / ivValues.length
      : 0.3;

    // Calculate put/call ratio
    const totalCallVolume = chain.calls.reduce((sum, c) => sum + c.volume, 0);
    const totalPutVolume = chain.puts.reduce((sum, p) => sum + p.volume, 0);
    const putCallRatio = totalCallVolume > 0 ? totalPutVolume / totalCallVolume : 1;

    // Calculate skew (put IV - call IV)
    const callIVs = chain.calls.filter(c => c.impliedVolatility > 0).map(c => c.impliedVolatility);
    const putIVs = chain.puts.filter(p => p.impliedVolatility > 0).map(p => p.impliedVolatility);
    const avgCallIV = callIVs.length > 0 ? callIVs.reduce((a, b) => a + b, 0) / callIVs.length : atmIV;
    const avgPutIV = putIVs.length > 0 ? putIVs.reduce((a, b) => a + b, 0) / putIVs.length : atmIV;
    const skew = avgPutIV - avgCallIV;

    // Expected moves
    const weeklyMove = atmIV * Math.sqrt(7 / DAYS_IN_YEAR);
    const monthlyMove = atmIV * Math.sqrt(30 / DAYS_IN_YEAR);
    const quarterlyMove = atmIV * Math.sqrt(90 / DAYS_IN_YEAR);

    // IV Rank (simplified - assume 52-week range is 0.15-0.80)
    const ivRank = Math.min(100, Math.max(0, ((atmIV - 0.15) / (0.80 - 0.15)) * 100));

    return {
      symbol: chain.symbol,
      currentPrice: 0, // Would need to fetch separately
      ivRank: Math.round(ivRank),
      ivPercentile: Math.round(ivRank), // Simplified
      atmIV: Math.round(atmIV * 10000) / 100, // Convert to percentage
      iv30: Math.round(atmIV * 10000) / 100,
      iv60: Math.round(atmIV * 1.05 * 10000) / 100, // Slight adjustment
      putCallRatio: Math.round(putCallRatio * 100) / 100,
      expectedMove: {
        weekly: Math.round(weeklyMove * 10000) / 100,
        monthly: Math.round(monthlyMove * 10000) / 100,
        quarterly: Math.round(quarterlyMove * 10000) / 100,
      },
      skew: Math.round(skew * 10000) / 100,
      timestamp: new Date(),
    };
  }

  /**
   * Get default IV data when options are unavailable
   */
  private getDefaultIVData(symbol: string): IVData {
    // Default IV based on typical market conditions
    const defaultIV = 0.25; // 25%

    return {
      symbol,
      currentPrice: 0,
      ivRank: 50,
      ivPercentile: 50,
      atmIV: 25,
      iv30: 25,
      iv60: 26,
      putCallRatio: 1.0,
      expectedMove: {
        weekly: Math.round(defaultIV * Math.sqrt(7 / DAYS_IN_YEAR) * 10000) / 100,
        monthly: Math.round(defaultIV * Math.sqrt(30 / DAYS_IN_YEAR) * 10000) / 100,
        quarterly: Math.round(defaultIV * Math.sqrt(90 / DAYS_IN_YEAR) * 10000) / 100,
      },
      skew: 0,
      timestamp: new Date(),
    };
  }

  /**
   * Get expected move for earnings
   */
  calculateExpectedMoveForEarnings(
    atmIV: number,
    daysToEarnings: number
  ): number {
    // IV typically elevated before earnings
    // Expected move = IV * sqrt(time)
    const timeComponent = Math.sqrt(daysToEarnings / DAYS_IN_YEAR);
    return atmIV * timeComponent;
  }

  /**
   * Analyze IV for trading signals
   */
  analyzeIVSignal(ivData: IVData): {
    signal: 'high_iv' | 'low_iv' | 'neutral';
    description: string;
    recommendation: string;
  } {
    if (ivData.ivRank >= 70) {
      return {
        signal: 'high_iv',
        description: `IV is elevated (rank: ${ivData.ivRank}). Options are expensive.`,
        recommendation: 'Consider selling premium or waiting for IV crush.',
      };
    }

    if (ivData.ivRank <= 30) {
      return {
        signal: 'low_iv',
        description: `IV is depressed (rank: ${ivData.ivRank}). Options are cheap.`,
        recommendation: 'Consider buying options or protective puts.',
      };
    }

    return {
      signal: 'neutral',
      description: `IV is near average (rank: ${ivData.ivRank}).`,
      recommendation: 'No strong IV-based signal.',
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton
export const ivService = new ImpliedVolatilityService();
