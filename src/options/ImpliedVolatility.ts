/**
 * Implied Volatility Calculator and Options Data Service
 *
 * Fetches options chain data and calculates implied volatility metrics
 * for portfolio risk assessment and earnings analysis.
 *
 * Features:
 * - Black-Scholes IV calculation from options prices
 * - Historical volatility (HV) as fallback when options data unavailable
 * - Expected move calculations for earnings and general volatility analysis
 * - IV rank and percentile calculations
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
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
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
  iv90: number; // 90-day implied volatility
  hv30: number; // 30-day historical volatility
  hv60: number; // 60-day historical volatility
  hv90: number; // 90-day historical volatility
  putCallRatio: number;
  expectedMove: {
    weekly: number;
    monthly: number;
    quarterly: number;
    earnings?: number; // Expected move specifically for earnings
  };
  expectedMoveInDollars?: {
    weekly: number;
    monthly: number;
    quarterly: number;
    earnings?: number;
  };
  skew: number; // Put IV vs Call IV difference
  termStructure: 'contango' | 'backwardation' | 'flat'; // IV term structure
  dataSource: 'options' | 'historical' | 'hybrid'; // Where data came from
  straddlePrice?: number; // ATM straddle price (call + put premium)
  timestamp: Date;
}

interface OptionsChain {
  symbol: string;
  expirations: string[];
  calls: OptionData[];
  puts: OptionData[];
  underlyingPrice?: number;
}

interface HistoricalPrice {
  date: string;
  close: number;
  volume: number;
}

interface EarningsIVContext {
  symbol: string;
  daysToEarnings: number;
  optionsExpectedMove: number; // From ATM straddle
  historicalExpectedMove: number; // From past earnings
  ivPremium: number; // How much IV is elevated vs normal
  recommendation: 'sell_premium' | 'buy_protection' | 'neutral';
  explanation: string;
}

// Black-Scholes constants
const DAYS_IN_YEAR = 365;
const TRADING_DAYS_IN_YEAR = 252;
const RISK_FREE_RATE = 0.0525; // Current Fed funds rate ~5.25%

export class ImpliedVolatilityService {
  private cache = new Map<string, { data: IVData; expires: number }>();
  private hvCache = new Map<string, { data: HistoricalPrice[]; expires: number }>();
  private ivHistoryCache = new Map<string, number[]>(); // 52-week IV history
  private cacheTtl = 5 * 60 * 1000; // 5 minutes
  private hvCacheTtl = 60 * 60 * 1000; // 1 hour for price history

  // ============================================================================
  // BLACK-SCHOLES MODEL FOR IV CALCULATION
  // ============================================================================

  /**
   * Cumulative distribution function for standard normal
   */
  private normalCDF(x: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);

    const t = 1.0 / (1.0 + p * x);
    const y =
      1.0 -
      ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return 0.5 * (1.0 + sign * y);
  }

  /**
   * Black-Scholes option price calculation
   */
  private blackScholesPrice(
    S: number, // Stock price
    K: number, // Strike price
    T: number, // Time to expiration (years)
    r: number, // Risk-free rate
    sigma: number, // Volatility
    isCall: boolean
  ): number {
    if (T <= 0) return Math.max(0, isCall ? S - K : K - S);

    const d1 =
      (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) /
      (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);

    if (isCall) {
      return S * this.normalCDF(d1) - K * Math.exp(-r * T) * this.normalCDF(d2);
    } else {
      return (
        K * Math.exp(-r * T) * this.normalCDF(-d2) - S * this.normalCDF(-d1)
      );
    }
  }

  /**
   * Calculate IV from option price using Newton-Raphson method
   */
  private calculateIVFromPrice(
    optionPrice: number,
    S: number, // Stock price
    K: number, // Strike price
    T: number, // Time to expiration (years)
    r: number, // Risk-free rate
    isCall: boolean
  ): number | null {
    if (optionPrice <= 0 || T <= 0) return null;

    // Intrinsic value check
    const intrinsic = Math.max(0, isCall ? S - K : K - S);
    if (optionPrice < intrinsic) return null;

    let sigma = 0.3; // Initial guess
    const tolerance = 0.0001;
    const maxIterations = 100;

    for (let i = 0; i < maxIterations; i++) {
      const price = this.blackScholesPrice(S, K, T, r, sigma, isCall);
      const vega = this.blackScholesVega(S, K, T, r, sigma);

      if (vega < 0.0001) break; // Vega too small

      const diff = optionPrice - price;
      if (Math.abs(diff) < tolerance) {
        return sigma;
      }

      sigma += diff / vega;

      // Bound sigma to reasonable range
      if (sigma < 0.01) sigma = 0.01;
      if (sigma > 5) sigma = 5;
    }

    return sigma > 0 && sigma < 5 ? sigma : null;
  }

  /**
   * Black-Scholes Vega (sensitivity to volatility)
   */
  private blackScholesVega(
    S: number,
    K: number,
    T: number,
    r: number,
    sigma: number
  ): number {
    if (T <= 0) return 0;

    const d1 =
      (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) /
      (sigma * Math.sqrt(T));

    return (
      (S * Math.sqrt(T) * Math.exp((-d1 * d1) / 2)) / Math.sqrt(2 * Math.PI)
    );
  }

  // ============================================================================
  // HISTORICAL VOLATILITY CALCULATION
  // ============================================================================

  /**
   * Calculate historical volatility from price data
   */
  calculateHistoricalVolatility(prices: HistoricalPrice[], days: number): number {
    if (prices.length < days + 1) {
      // Not enough data, use subset
      days = Math.max(5, prices.length - 1);
    }

    const recentPrices = prices.slice(0, days + 1);

    // Calculate log returns
    const returns: number[] = [];
    for (let i = 1; i < recentPrices.length; i++) {
      const logReturn = Math.log(
        recentPrices[i - 1].close / recentPrices[i].close
      );
      returns.push(logReturn);
    }

    if (returns.length === 0) return 0.25; // Default 25%

    // Calculate standard deviation of returns
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance =
      returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) /
      (returns.length - 1);
    const dailyVol = Math.sqrt(variance);

    // Annualize
    return dailyVol * Math.sqrt(TRADING_DAYS_IN_YEAR);
  }

  /**
   * Fetch historical prices for HV calculation
   */
  async fetchHistoricalPrices(symbol: string): Promise<HistoricalPrice[]> {
    // Check cache
    const cached = this.hvCache.get(symbol);
    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }

    try {
      // Use Yahoo Finance chart API
      const now = Math.floor(Date.now() / 1000);
      const oneYearAgo = now - 365 * 24 * 60 * 60;
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${oneYearAgo}&period2=${now}&interval=1d`;

      const response = await axios.get(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        timeout: 10000,
      });

      const result = response.data?.chart?.result?.[0];
      if (!result?.timestamp || !result?.indicators?.quote?.[0]) {
        return [];
      }

      const timestamps = result.timestamp;
      const closes = result.indicators.quote[0].close;
      const volumes = result.indicators.quote[0].volume;

      const prices: HistoricalPrice[] = [];
      for (let i = timestamps.length - 1; i >= 0; i--) {
        if (closes[i] != null) {
          prices.push({
            date: new Date(timestamps[i] * 1000).toISOString().split('T')[0],
            close: closes[i],
            volume: volumes[i] || 0,
          });
        }
      }

      // Cache result
      this.hvCache.set(symbol, {
        data: prices,
        expires: Date.now() + this.hvCacheTtl,
      });

      return prices;
    } catch (error) {
      console.error(`[IV] Error fetching historical prices for ${symbol}:`, error);
      return [];
    }
  }

  // ============================================================================
  // MAIN IV DATA METHODS
  // ============================================================================

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
      // Fetch options chain and historical prices in parallel
      const [chain, historicalPrices] = await Promise.all([
        this.fetchOptionsChain(symbol),
        this.fetchHistoricalPrices(symbol),
      ]);

      let ivData: IVData;

      if (chain && chain.calls.length > 0) {
        // Calculate IV metrics from options data
        ivData = this.calculateIVMetrics(chain, historicalPrices);
      } else if (historicalPrices.length > 0) {
        // Fallback to historical volatility
        ivData = this.calculateHVBasedMetrics(symbol, historicalPrices);
      } else {
        return this.getDefaultIVData(symbol);
      }

      // Cache result
      this.cache.set(symbol, {
        data: ivData,
        expires: Date.now() + this.cacheTtl,
      });

      return ivData;
    } catch (error) {
      console.error(`[IV] Error fetching IV data for ${symbol}:`, error);
      return this.getDefaultIVData(symbol);
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
  private calculateIVMetrics(
    chain: OptionsChain,
    historicalPrices: HistoricalPrice[] = []
  ): IVData {
    const allOptions = [...chain.calls, ...chain.puts];
    const currentPrice = chain.underlyingPrice || this.estimateUnderlyingPrice(chain);

    if (allOptions.length === 0) {
      return this.getDefaultIVData(chain.symbol);
    }

    // Find ATM options (closest to current price)
    const atmStrike = this.findATMStrike(chain.calls, currentPrice);
    const atmCall = chain.calls.find(c => c.strike === atmStrike);
    const atmPut = chain.puts.find(p => p.strike === atmStrike);

    // Calculate ATM IV using Black-Scholes if we have price data
    let atmIV: number;
    if (atmCall && atmPut && currentPrice > 0) {
      const expiration = atmCall.expiration;
      const daysToExpiry = this.calculateDaysToExpiry(expiration);
      const T = daysToExpiry / DAYS_IN_YEAR;

      // Calculate IV from ATM call
      const callMidPrice = (atmCall.bid + atmCall.ask) / 2 || atmCall.last;
      const putMidPrice = (atmPut.bid + atmPut.ask) / 2 || atmPut.last;

      const callIV = this.calculateIVFromPrice(
        callMidPrice,
        currentPrice,
        atmStrike,
        T,
        RISK_FREE_RATE,
        true
      );
      const putIV = this.calculateIVFromPrice(
        putMidPrice,
        currentPrice,
        atmStrike,
        T,
        RISK_FREE_RATE,
        false
      );

      // Average call and put IV for ATM
      const validIVs = [callIV, putIV].filter(iv => iv !== null && iv > 0) as number[];
      atmIV = validIVs.length > 0
        ? validIVs.reduce((a, b) => a + b, 0) / validIVs.length
        : this.calculateAverageIV(allOptions);
    } else {
      atmIV = this.calculateAverageIV(allOptions);
    }

    // Calculate ATM straddle price (for earnings expected move)
    const straddlePrice = atmCall && atmPut
      ? ((atmCall.bid + atmCall.ask) / 2 || atmCall.last) +
        ((atmPut.bid + atmPut.ask) / 2 || atmPut.last)
      : undefined;

    // Calculate IV by term (30, 60, 90 days)
    const { iv30, iv60, iv90 } = this.calculateTermIV(chain, currentPrice);

    // Calculate historical volatility
    const hv30 = historicalPrices.length > 0
      ? this.calculateHistoricalVolatility(historicalPrices, 30)
      : atmIV;
    const hv60 = historicalPrices.length > 0
      ? this.calculateHistoricalVolatility(historicalPrices, 60)
      : atmIV;
    const hv90 = historicalPrices.length > 0
      ? this.calculateHistoricalVolatility(historicalPrices, 90)
      : atmIV;

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

    // Determine term structure
    const termStructure: 'contango' | 'backwardation' | 'flat' =
      iv60 > iv30 * 1.05 ? 'contango' :
      iv60 < iv30 * 0.95 ? 'backwardation' : 'flat';

    // Expected moves
    const weeklyMove = atmIV * Math.sqrt(7 / DAYS_IN_YEAR);
    const monthlyMove = atmIV * Math.sqrt(30 / DAYS_IN_YEAR);
    const quarterlyMove = atmIV * Math.sqrt(90 / DAYS_IN_YEAR);

    // Earnings expected move from straddle
    const earningsMove = straddlePrice && currentPrice > 0
      ? straddlePrice / currentPrice
      : undefined;

    // IV Rank and Percentile
    const { ivRank, ivPercentile } = this.calculateIVRankAndPercentile(
      chain.symbol,
      atmIV,
      hv30
    );

    return {
      symbol: chain.symbol,
      currentPrice: Math.round(currentPrice * 100) / 100,
      ivRank,
      ivPercentile,
      atmIV: Math.round(atmIV * 10000) / 100,
      iv30: Math.round(iv30 * 10000) / 100,
      iv60: Math.round(iv60 * 10000) / 100,
      iv90: Math.round(iv90 * 10000) / 100,
      hv30: Math.round(hv30 * 10000) / 100,
      hv60: Math.round(hv60 * 10000) / 100,
      hv90: Math.round(hv90 * 10000) / 100,
      putCallRatio: Math.round(putCallRatio * 100) / 100,
      expectedMove: {
        weekly: Math.round(weeklyMove * 10000) / 100,
        monthly: Math.round(monthlyMove * 10000) / 100,
        quarterly: Math.round(quarterlyMove * 10000) / 100,
        earnings: earningsMove ? Math.round(earningsMove * 10000) / 100 : undefined,
      },
      expectedMoveInDollars: currentPrice > 0 ? {
        weekly: Math.round(currentPrice * weeklyMove * 100) / 100,
        monthly: Math.round(currentPrice * monthlyMove * 100) / 100,
        quarterly: Math.round(currentPrice * quarterlyMove * 100) / 100,
        earnings: earningsMove ? Math.round(straddlePrice! * 100) / 100 : undefined,
      } : undefined,
      skew: Math.round(skew * 10000) / 100,
      termStructure,
      dataSource: 'options',
      straddlePrice: straddlePrice ? Math.round(straddlePrice * 100) / 100 : undefined,
      timestamp: new Date(),
    };
  }

  /**
   * Calculate IV metrics based on historical volatility when options unavailable
   */
  private calculateHVBasedMetrics(
    symbol: string,
    historicalPrices: HistoricalPrice[]
  ): IVData {
    const hv30 = this.calculateHistoricalVolatility(historicalPrices, 30);
    const hv60 = this.calculateHistoricalVolatility(historicalPrices, 60);
    const hv90 = this.calculateHistoricalVolatility(historicalPrices, 90);

    const currentPrice = historicalPrices[0]?.close || 0;

    // Use HV as IV proxy (typically IV > HV, so add small premium)
    const ivPremium = 1.1; // 10% premium over HV
    const atmIV = hv30 * ivPremium;

    // Expected moves
    const weeklyMove = atmIV * Math.sqrt(7 / DAYS_IN_YEAR);
    const monthlyMove = atmIV * Math.sqrt(30 / DAYS_IN_YEAR);
    const quarterlyMove = atmIV * Math.sqrt(90 / DAYS_IN_YEAR);

    // IV Rank (use HV-based estimate)
    const { ivRank, ivPercentile } = this.calculateIVRankAndPercentile(
      symbol,
      atmIV,
      hv30
    );

    return {
      symbol,
      currentPrice: Math.round(currentPrice * 100) / 100,
      ivRank,
      ivPercentile,
      atmIV: Math.round(atmIV * 10000) / 100,
      iv30: Math.round(atmIV * 10000) / 100,
      iv60: Math.round(atmIV * 1.02 * 10000) / 100,
      iv90: Math.round(atmIV * 1.04 * 10000) / 100,
      hv30: Math.round(hv30 * 10000) / 100,
      hv60: Math.round(hv60 * 10000) / 100,
      hv90: Math.round(hv90 * 10000) / 100,
      putCallRatio: 1.0,
      expectedMove: {
        weekly: Math.round(weeklyMove * 10000) / 100,
        monthly: Math.round(monthlyMove * 10000) / 100,
        quarterly: Math.round(quarterlyMove * 10000) / 100,
      },
      expectedMoveInDollars: currentPrice > 0 ? {
        weekly: Math.round(currentPrice * weeklyMove * 100) / 100,
        monthly: Math.round(currentPrice * monthlyMove * 100) / 100,
        quarterly: Math.round(currentPrice * quarterlyMove * 100) / 100,
      } : undefined,
      skew: 0,
      termStructure: 'flat',
      dataSource: 'historical',
      timestamp: new Date(),
    };
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Find ATM strike price
   */
  private findATMStrike(options: OptionData[], currentPrice: number): number {
    if (options.length === 0) return currentPrice;

    const strikes = Array.from(new Set(options.map(o => o.strike))).sort((a, b) => a - b);
    let atmStrike = strikes[0];
    let minDiff = Math.abs(strikes[0] - currentPrice);

    for (const strike of strikes) {
      const diff = Math.abs(strike - currentPrice);
      if (diff < minDiff) {
        minDiff = diff;
        atmStrike = strike;
      }
    }

    return atmStrike;
  }

  /**
   * Estimate underlying price from options
   */
  private estimateUnderlyingPrice(chain: OptionsChain): number {
    if (chain.calls.length === 0) return 0;

    // Use the strike with highest open interest as proxy for ATM
    const allOptions = [...chain.calls, ...chain.puts];
    const maxOI = Math.max(...allOptions.map(o => o.openInterest));
    const atmOption = allOptions.find(o => o.openInterest === maxOI);

    return atmOption?.strike || chain.calls[Math.floor(chain.calls.length / 2)].strike;
  }

  /**
   * Calculate average IV from options
   */
  private calculateAverageIV(options: OptionData[]): number {
    const ivValues = options
      .filter(o => o.impliedVolatility > 0 && o.impliedVolatility < 5)
      .map(o => o.impliedVolatility);

    return ivValues.length > 0
      ? ivValues.reduce((a, b) => a + b, 0) / ivValues.length
      : 0.3;
  }

  /**
   * Calculate IV by term structure
   */
  private calculateTermIV(
    chain: OptionsChain,
    currentPrice: number
  ): { iv30: number; iv60: number; iv90: number } {
    const now = new Date();

    // Group options by approximate DTE
    const termBuckets = {
      short: [] as OptionData[], // 0-45 days
      medium: [] as OptionData[], // 45-75 days
      long: [] as OptionData[], // 75+ days
    };

    for (const option of [...chain.calls, ...chain.puts]) {
      const dte = this.calculateDaysToExpiry(option.expiration);
      if (dte <= 45) termBuckets.short.push(option);
      else if (dte <= 75) termBuckets.medium.push(option);
      else termBuckets.long.push(option);
    }

    const iv30 = this.calculateAverageIV(termBuckets.short) || 0.3;
    const iv60 = this.calculateAverageIV(termBuckets.medium) || iv30 * 1.02;
    const iv90 = this.calculateAverageIV(termBuckets.long) || iv30 * 1.04;

    return { iv30, iv60, iv90 };
  }

  /**
   * Calculate days to expiry
   */
  private calculateDaysToExpiry(expiration: string): number {
    const expDate = new Date(expiration);
    const now = new Date();
    return Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  /**
   * Calculate IV rank and percentile
   */
  private calculateIVRankAndPercentile(
    symbol: string,
    currentIV: number,
    hv30: number
  ): { ivRank: number; ivPercentile: number } {
    // Get or initialize IV history
    let ivHistory = this.ivHistoryCache.get(symbol);
    if (!ivHistory) {
      // Estimate historical IV range based on HV
      ivHistory = this.estimateIVHistory(hv30);
      this.ivHistoryCache.set(symbol, ivHistory);
    }

    // Add current IV to history
    ivHistory.unshift(currentIV);
    if (ivHistory.length > 252) ivHistory.pop();

    // Calculate 52-week high and low
    const ivMin = Math.min(...ivHistory);
    const ivMax = Math.max(...ivHistory);

    // IV Rank: (Current - 52wk Low) / (52wk High - 52wk Low)
    const ivRank = ivMax > ivMin
      ? Math.round(((currentIV - ivMin) / (ivMax - ivMin)) * 100)
      : 50;

    // IV Percentile: % of days with IV lower than current
    const lowerCount = ivHistory.filter(iv => iv < currentIV).length;
    const ivPercentile = Math.round((lowerCount / ivHistory.length) * 100);

    return {
      ivRank: Math.max(0, Math.min(100, ivRank)),
      ivPercentile: Math.max(0, Math.min(100, ivPercentile)),
    };
  }

  /**
   * Estimate IV history based on HV
   */
  private estimateIVHistory(baseHV: number): number[] {
    // Generate synthetic 252-day IV history
    const history: number[] = [];
    const baseIV = baseHV * 1.1; // IV typically above HV

    for (let i = 0; i < 252; i++) {
      // Add random variation
      const variation = (Math.random() - 0.5) * baseHV * 0.5;
      history.push(Math.max(0.1, baseIV + variation));
    }

    return history;
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
      iv90: 27,
      hv30: 23,
      hv60: 24,
      hv90: 24,
      putCallRatio: 1.0,
      expectedMove: {
        weekly: Math.round(defaultIV * Math.sqrt(7 / DAYS_IN_YEAR) * 10000) / 100,
        monthly: Math.round(defaultIV * Math.sqrt(30 / DAYS_IN_YEAR) * 10000) / 100,
        quarterly: Math.round(defaultIV * Math.sqrt(90 / DAYS_IN_YEAR) * 10000) / 100,
      },
      skew: 0,
      termStructure: 'flat',
      dataSource: 'historical',
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
   * Get earnings-specific IV context
   */
  async getEarningsIVContext(
    symbol: string,
    daysToEarnings: number,
    historicalAvgMove: number = 0.05
  ): Promise<EarningsIVContext> {
    const ivData = await this.getIVData(symbol);

    if (!ivData) {
      return {
        symbol,
        daysToEarnings,
        optionsExpectedMove: historicalAvgMove,
        historicalExpectedMove: historicalAvgMove,
        ivPremium: 0,
        recommendation: 'neutral',
        explanation: 'Unable to fetch options data. Using historical average.',
      };
    }

    // Options expected move from ATM straddle or IV-based calculation
    const optionsExpectedMove = ivData.expectedMove.earnings
      ? ivData.expectedMove.earnings / 100
      : this.calculateExpectedMoveForEarnings(ivData.atmIV / 100, daysToEarnings);

    // Calculate IV premium (how much IV is elevated vs normal)
    const ivPremium = ivData.ivRank > 50
      ? (ivData.ivRank - 50) / 50 // 0 to 1 scale
      : 0;

    // Determine recommendation
    let recommendation: 'sell_premium' | 'buy_protection' | 'neutral';
    let explanation: string;

    if (ivData.ivRank >= 75 && optionsExpectedMove > historicalAvgMove * 1.3) {
      recommendation = 'sell_premium';
      explanation = `IV rank (${ivData.ivRank}) is elevated and options are pricing in ±${(optionsExpectedMove * 100).toFixed(1)}% move vs ±${(historicalAvgMove * 100).toFixed(1)}% historical average. Options appear expensive - consider selling premium or iron condors.`;
    } else if (ivData.ivRank <= 30 && optionsExpectedMove < historicalAvgMove * 0.8) {
      recommendation = 'buy_protection';
      explanation = `IV rank (${ivData.ivRank}) is depressed and options are pricing in ±${(optionsExpectedMove * 100).toFixed(1)}% move vs ±${(historicalAvgMove * 100).toFixed(1)}% historical average. Options appear cheap - good time for protective puts or straddles.`;
    } else {
      recommendation = 'neutral';
      explanation = `IV rank (${ivData.ivRank}) is moderate. Options are pricing in ±${(optionsExpectedMove * 100).toFixed(1)}% move vs ±${(historicalAvgMove * 100).toFixed(1)}% historical average. No strong directional signal from volatility.`;
    }

    return {
      symbol,
      daysToEarnings,
      optionsExpectedMove,
      historicalExpectedMove: historicalAvgMove,
      ivPremium,
      recommendation,
      explanation,
    };
  }

  /**
   * Analyze IV for trading signals
   */
  analyzeIVSignal(ivData: IVData): {
    signal: 'high_iv' | 'low_iv' | 'neutral';
    description: string;
    recommendation: string;
    details: {
      ivVsHV: number; // IV vs HV ratio
      termStructure: string;
      putCallRatio: number;
    };
  } {
    // Calculate IV vs HV ratio
    const ivVsHV = ivData.hv30 > 0 ? ivData.atmIV / ivData.hv30 : 1;

    const details = {
      ivVsHV: Math.round(ivVsHV * 100) / 100,
      termStructure: ivData.termStructure,
      putCallRatio: ivData.putCallRatio,
    };

    if (ivData.ivRank >= 70) {
      let recommendation = 'Consider selling premium or waiting for IV crush.';
      if (ivData.termStructure === 'backwardation') {
        recommendation += ' Near-term IV is elevated - sell front-month options.';
      }
      if (ivData.putCallRatio > 1.3) {
        recommendation += ' High put/call ratio suggests fear - puts may be overpriced.';
      }

      return {
        signal: 'high_iv',
        description: `IV is elevated (rank: ${ivData.ivRank}, IV/HV: ${ivVsHV.toFixed(2)}x). Options are expensive.`,
        recommendation,
        details,
      };
    }

    if (ivData.ivRank <= 30) {
      let recommendation = 'Consider buying options or protective puts.';
      if (ivData.termStructure === 'contango') {
        recommendation += ' Term structure is in contango - LEAPS may offer better value.';
      }

      return {
        signal: 'low_iv',
        description: `IV is depressed (rank: ${ivData.ivRank}, IV/HV: ${ivVsHV.toFixed(2)}x). Options are cheap.`,
        recommendation,
        details,
      };
    }

    return {
      signal: 'neutral',
      description: `IV is near average (rank: ${ivData.ivRank}, IV/HV: ${ivVsHV.toFixed(2)}x).`,
      recommendation: 'No strong IV-based signal.',
      details,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export type { IVData, EarningsIVContext, OptionData, OptionsChain };

// Export singleton
export const ivService = new ImpliedVolatilityService();
