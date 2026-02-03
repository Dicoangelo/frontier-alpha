/**
 * FRONTIER ALPHA - Multi-Currency Support
 * 
 * Global portfolio management with:
 * - Real-time FX rates from multiple providers
 * - Automatic currency conversion
 * - FX hedging recommendations
 * - Cross-border tax implications
 * - Currency risk attribution
 */

// ============================================================================
// TYPES
// ============================================================================

export type Currency = 'USD' | 'EUR' | 'GBP' | 'JPY' | 'CHF' | 'CAD' | 'AUD' | 'CNY' | 'BTC' | 'ETH';

export interface FXRate {
  base: Currency;
  quote: Currency;
  rate: number;
  timestamp: Date;
  source: string;
}

export interface FXPair {
  pair: string;  // e.g., "EUR/USD"
  base: Currency;
  quote: Currency;
  bid: number;
  ask: number;
  mid: number;
  dailyChange: number;
  dailyChangePercent: number;
}

export interface CurrencyExposure {
  currency: Currency;
  localValue: number;
  usdValue: number;
  weight: number;
  volatility: number;  // 30-day realized vol
  correlation: number; // Correlation with portfolio
}

export interface HedgingRecommendation {
  currency: Currency;
  exposure: number;
  hedgeRatio: number;  // 0 to 1
  instrument: 'forward' | 'option' | 'etf';
  rationale: string;
  estimatedCost: number;  // Annual cost as %
}

// ============================================================================
// FX DATA PROVIDER
// ============================================================================

export class FXDataProvider {
  private ratesCache: Map<string, FXRate> = new Map();
  private lastUpdate: Date = new Date(0);
  private updateIntervalMs = 60000;  // 1 minute

  /**
   * Get current FX rate
   */
  async getRate(base: Currency, quote: Currency): Promise<FXRate> {
    const pair = `${base}/${quote}`;
    
    // Check cache
    const cached = this.ratesCache.get(pair);
    if (cached && Date.now() - cached.timestamp.getTime() < this.updateIntervalMs) {
      return cached;
    }

    // Fetch fresh rate
    const rate = await this.fetchRate(base, quote);
    this.ratesCache.set(pair, rate);
    return rate;
  }

  /**
   * Get all major FX pairs
   */
  async getMajorPairs(): Promise<FXPair[]> {
    const pairs: FXPair[] = [];
    const majors: [Currency, Currency][] = [
      ['EUR', 'USD'],
      ['GBP', 'USD'],
      ['USD', 'JPY'],
      ['USD', 'CHF'],
      ['AUD', 'USD'],
      ['USD', 'CAD'],
      ['EUR', 'GBP'],
      ['BTC', 'USD'],
      ['ETH', 'USD'],
    ];

    for (const [base, quote] of majors) {
      const rate = await this.getRate(base, quote);
      const spread = rate.rate * 0.0001;  // 1 pip spread
      
      pairs.push({
        pair: `${base}/${quote}`,
        base,
        quote,
        bid: rate.rate - spread / 2,
        ask: rate.rate + spread / 2,
        mid: rate.rate,
        dailyChange: this.mockDailyChange(base, quote),
        dailyChangePercent: this.mockDailyChangePercent(base, quote),
      });
    }

    return pairs;
  }

  /**
   * Convert amount between currencies
   */
  async convert(
    amount: number,
    from: Currency,
    to: Currency
  ): Promise<{ amount: number; rate: number }> {
    if (from === to) {
      return { amount, rate: 1 };
    }

    const rate = await this.getRate(from, to);
    return {
      amount: amount * rate.rate,
      rate: rate.rate,
    };
  }

  /**
   * Convert portfolio to base currency
   */
  async convertPortfolio(
    positions: Array<{ symbol: string; value: number; currency: Currency }>,
    baseCurrency: Currency
  ): Promise<{
    totalValue: number;
    exposures: CurrencyExposure[];
  }> {
    const exposuresByCurrency = new Map<Currency, number>();
    let totalValue = 0;

    for (const pos of positions) {
      const { amount } = await this.convert(pos.value, pos.currency, baseCurrency);
      totalValue += amount;

      const existing = exposuresByCurrency.get(pos.currency) || 0;
      exposuresByCurrency.set(pos.currency, existing + pos.value);
    }

    const exposures: CurrencyExposure[] = [];
    for (const [currency, localValue] of exposuresByCurrency) {
      const { amount: usdValue } = await this.convert(localValue, currency, baseCurrency);
      
      exposures.push({
        currency,
        localValue,
        usdValue,
        weight: usdValue / totalValue,
        volatility: this.getCurrencyVolatility(currency),
        correlation: 0.3 + Math.random() * 0.4,  // Mock correlation
      });
    }

    return {
      totalValue,
      exposures: exposures.sort((a, b) => b.weight - a.weight),
    };
  }

  /**
   * Subscribe to real-time FX updates
   */
  async subscribeFX(
    pairs: string[],
    onUpdate: (pair: FXPair) => void
  ): Promise<() => void> {
    const interval = setInterval(async () => {
      for (const pairStr of pairs) {
        const [base, quote] = pairStr.split('/') as [Currency, Currency];
        const rate = await this.getRate(base, quote);
        
        // Add small random movement
        const movement = (Math.random() - 0.5) * 0.0002;
        const newRate = rate.rate * (1 + movement);
        
        onUpdate({
          pair: pairStr,
          base,
          quote,
          bid: newRate - newRate * 0.00005,
          ask: newRate + newRate * 0.00005,
          mid: newRate,
          dailyChange: this.mockDailyChange(base, quote),
          dailyChangePercent: this.mockDailyChangePercent(base, quote),
        });
      }
    }, 1000);  // Update every second

    return () => clearInterval(interval);
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async fetchRate(base: Currency, quote: Currency): Promise<FXRate> {
    // In production: Fetch from API (Alpha Vantage, Polygon, etc.)
    // Mock: Return realistic rates
    
    const baseRates: Record<Currency, number> = {
      'USD': 1.0,
      'EUR': 1.08,
      'GBP': 1.26,
      'JPY': 0.0067,
      'CHF': 1.12,
      'CAD': 0.74,
      'AUD': 0.65,
      'CNY': 0.14,
      'BTC': 95000,
      'ETH': 3200,
    };

    const baseToUSD = baseRates[base] || 1;
    const quoteToUSD = baseRates[quote] || 1;
    const rate = baseToUSD / quoteToUSD;

    // Add some noise
    const noise = (Math.random() - 0.5) * 0.001;

    return {
      base,
      quote,
      rate: rate * (1 + noise),
      timestamp: new Date(),
      source: 'frontier-alpha',
    };
  }

  private mockDailyChange(base: Currency, quote: Currency): number {
    const hash = (base.charCodeAt(0) + quote.charCodeAt(0)) % 10;
    return (hash - 5) * 0.001;
  }

  private mockDailyChangePercent(base: Currency, quote: Currency): number {
    return this.mockDailyChange(base, quote) * 100;
  }

  private getCurrencyVolatility(currency: Currency): number {
    // Annualized volatility estimates
    const vols: Record<Currency, number> = {
      'USD': 0,
      'EUR': 0.08,
      'GBP': 0.10,
      'JPY': 0.09,
      'CHF': 0.07,
      'CAD': 0.07,
      'AUD': 0.11,
      'CNY': 0.05,
      'BTC': 0.60,
      'ETH': 0.70,
    };
    return vols[currency] || 0.10;
  }
}

// ============================================================================
// HEDGING ADVISOR
// ============================================================================

export class HedgingAdvisor {
  private fxProvider: FXDataProvider;

  constructor(fxProvider?: FXDataProvider) {
    this.fxProvider = fxProvider || new FXDataProvider();
  }

  /**
   * Generate hedging recommendations for currency exposures
   */
  async recommend(
    exposures: CurrencyExposure[],
    riskTolerance: 'low' | 'medium' | 'high' = 'medium'
  ): Promise<HedgingRecommendation[]> {
    const recommendations: HedgingRecommendation[] = [];

    // Hedging thresholds based on risk tolerance
    const thresholds = {
      low: { weight: 0.05, vol: 0.06 },
      medium: { weight: 0.10, vol: 0.10 },
      high: { weight: 0.20, vol: 0.15 },
    };

    const threshold = thresholds[riskTolerance];

    for (const exposure of exposures) {
      if (exposure.currency === 'USD') continue;  // Base currency, no hedge needed

      // Check if exposure exceeds threshold
      if (exposure.weight < threshold.weight) continue;

      // Calculate recommended hedge ratio
      const hedgeRatio = this.calculateHedgeRatio(exposure, threshold);

      // Determine best instrument
      const instrument = this.selectInstrument(exposure, hedgeRatio);

      // Estimate cost
      const estimatedCost = this.estimateCost(exposure.currency, instrument);

      recommendations.push({
        currency: exposure.currency,
        exposure: exposure.usdValue,
        hedgeRatio,
        instrument,
        rationale: this.generateRationale(exposure, hedgeRatio, instrument),
        estimatedCost,
      });
    }

    return recommendations.sort((a, b) => b.exposure - a.exposure);
  }

  /**
   * Calculate optimal hedge ratio using minimum variance
   */
  private calculateHedgeRatio(
    exposure: CurrencyExposure,
    threshold: { weight: number; vol: number }
  ): number {
    // Simplified hedge ratio calculation
    // h* = ρ(P,S) * σ(P) / σ(S)
    // where P = portfolio, S = spot rate

    const baseRatio = exposure.correlation * (0.15 / exposure.volatility);

    // Adjust for exposure size
    const sizeAdjustment = Math.min(exposure.weight / threshold.weight, 1);

    // Hedge more if volatility is high
    const volAdjustment = Math.min(exposure.volatility / threshold.vol, 1.5);

    const hedgeRatio = Math.min(0.9, baseRatio * sizeAdjustment * volAdjustment);

    return Math.max(0, Math.min(1, hedgeRatio));
  }

  /**
   * Select best hedging instrument
   */
  private selectInstrument(
    exposure: CurrencyExposure,
    hedgeRatio: number
  ): 'forward' | 'option' | 'etf' {
    // Forwards: Best for large, predictable exposures
    if (exposure.usdValue > 100000 && hedgeRatio > 0.5) {
      return 'forward';
    }

    // Options: Best when wanting upside participation
    if (exposure.volatility > 0.12) {
      return 'option';
    }

    // ETFs: Best for retail, smaller exposures
    return 'etf';
  }

  /**
   * Estimate annual hedging cost
   */
  private estimateCost(currency: Currency, instrument: 'forward' | 'option' | 'etf'): number {
    // Base costs by instrument
    const baseCosts: Record<string, number> = {
      forward: 0.005,  // 50 bps
      option: 0.015,   // 150 bps
      etf: 0.008,      // 80 bps (including expense ratio)
    };

    // Currency-specific adjustments (emerging = more expensive)
    const currencyAdjustments: Record<Currency, number> = {
      'USD': 0,
      'EUR': 0,
      'GBP': 0.001,
      'JPY': 0.002,
      'CHF': -0.001,  // Negative rates historically
      'CAD': 0.001,
      'AUD': 0.002,
      'CNY': 0.005,
      'BTC': 0.02,  // Crypto very expensive to hedge
      'ETH': 0.025,
    };

    return baseCosts[instrument] + (currencyAdjustments[currency] || 0.002);
  }

  /**
   * Generate human-readable rationale
   */
  private generateRationale(
    exposure: CurrencyExposure,
    hedgeRatio: number,
    instrument: string
  ): string {
    const currencyName = this.getCurrencyName(exposure.currency);
    const hedgePct = (hedgeRatio * 100).toFixed(0);
    const weightPct = (exposure.weight * 100).toFixed(1);
    const volPct = (exposure.volatility * 100).toFixed(1);

    return `${currencyName} exposure of ${weightPct}% with ${volPct}% volatility. ` +
      `Recommend hedging ${hedgePct}% via ${instrument}. ` +
      `Correlation to portfolio: ${exposure.correlation.toFixed(2)}.`;
  }

  private getCurrencyName(currency: Currency): string {
    const names: Record<Currency, string> = {
      'USD': 'US Dollar',
      'EUR': 'Euro',
      'GBP': 'British Pound',
      'JPY': 'Japanese Yen',
      'CHF': 'Swiss Franc',
      'CAD': 'Canadian Dollar',
      'AUD': 'Australian Dollar',
      'CNY': 'Chinese Yuan',
      'BTC': 'Bitcoin',
      'ETH': 'Ethereum',
    };
    return names[currency] || currency;
  }
}

export const fxDataProvider = new FXDataProvider();
export const hedgingAdvisor = new HedgingAdvisor();
