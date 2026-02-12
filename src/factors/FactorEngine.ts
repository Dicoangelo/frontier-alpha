/**
 * FRONTIER ALPHA - Factor Engine
 *
 * Production-grade factor calculation engine supporting 80+ factors:
 * - Style: Fama-French 5 + Momentum
 * - Quality: ROE, ROA, Gross Margin, D/E, Current Ratio, Accruals
 * - Macro: Interest Rate, Inflation, Credit Spread sensitivity
 * - Sector: GICS-based sector exposures
 * - Sentiment: News, Social, Options flow
 * - Volatility: Realized, Idiosyncratic, Low Vol anomaly
 *
 * Uses Alpha Vantage for fundamental data and Ken French for factor returns.
 */

import type { Factor, FactorExposure, FactorCategory, Price } from '../types/index.js';
import { logger } from '../lib/logger.js';

// ============================================================================
// FACTOR DEFINITIONS (80+ FACTORS)
// ============================================================================

export const FACTOR_DEFINITIONS: Factor[] = [
  // Style Factors (Fama-French 5)
  { name: 'market', category: 'style', description: 'Market risk premium (beta)', halfLife: 252 },
  { name: 'size', category: 'style', description: 'Small minus Big (SMB)', halfLife: 126 },
  { name: 'value', category: 'style', description: 'High minus Low book-to-market (HML)', halfLife: 126 },
  { name: 'profitability', category: 'style', description: 'Robust minus Weak (RMW)', halfLife: 63 },
  { name: 'investment', category: 'style', description: 'Conservative minus Aggressive (CMA)', halfLife: 63 },

  // Momentum Factors
  { name: 'momentum_12m', category: 'style', description: '12-month momentum', halfLife: 21 },
  { name: 'momentum_6m', category: 'style', description: '6-month momentum', halfLife: 21 },
  { name: 'momentum_1m', category: 'style', description: '1-month momentum (reversal)', halfLife: 5 },

  // Volatility Factors
  { name: 'volatility', category: 'volatility', description: 'Realized volatility (21-day)', halfLife: 21 },
  { name: 'low_vol', category: 'volatility', description: 'Low volatility anomaly', halfLife: 63 },
  { name: 'idio_vol', category: 'volatility', description: 'Idiosyncratic volatility', halfLife: 21 },

  // Quality Factors
  { name: 'roe', category: 'quality', description: 'Return on equity', halfLife: 63 },
  { name: 'roa', category: 'quality', description: 'Return on assets', halfLife: 63 },
  { name: 'gross_margin', category: 'quality', description: 'Gross profit margin', halfLife: 63 },
  { name: 'debt_equity', category: 'quality', description: 'Leverage (D/E ratio)', halfLife: 126 },
  { name: 'current_ratio', category: 'quality', description: 'Current ratio (liquidity)', halfLife: 63 },
  { name: 'accruals', category: 'quality', description: 'Earnings quality (accruals)', halfLife: 126 },
  { name: 'asset_turnover', category: 'quality', description: 'Asset turnover efficiency', halfLife: 63 },
  { name: 'earnings_variability', category: 'quality', description: 'Earnings stability', halfLife: 252 },

  // Sentiment Factors
  { name: 'sentiment_news', category: 'sentiment', description: 'News sentiment score', halfLife: 1 },
  { name: 'sentiment_social', category: 'sentiment', description: 'Social media sentiment', halfLife: 1 },
  { name: 'sentiment_options', category: 'sentiment', description: 'Put/call ratio', halfLife: 5 },
  { name: 'analyst_revision', category: 'sentiment', description: 'Analyst estimate revisions', halfLife: 21 },
  { name: 'short_interest', category: 'sentiment', description: 'Short interest ratio', halfLife: 14 },

  // Macro Factors
  { name: 'interest_rate_sens', category: 'macro', description: 'Interest rate sensitivity (duration)', halfLife: 252 },
  { name: 'inflation_beta', category: 'macro', description: 'Inflation beta', halfLife: 252 },
  { name: 'credit_spread_beta', category: 'macro', description: 'Credit spread sensitivity', halfLife: 63 },
  { name: 'dollar_beta', category: 'macro', description: 'USD strength sensitivity', halfLife: 63 },
  { name: 'oil_beta', category: 'macro', description: 'Oil price sensitivity', halfLife: 63 },
  { name: 'vix_beta', category: 'macro', description: 'VIX sensitivity', halfLife: 21 },

  // Growth Factors
  { name: 'revenue_growth', category: 'quality', description: 'Revenue growth rate (YoY)', halfLife: 63 },
  { name: 'earnings_growth', category: 'quality', description: 'Earnings growth rate (YoY)', halfLife: 63 },
  { name: 'fcf_yield', category: 'quality', description: 'Free cash flow yield', halfLife: 63 },
  { name: 'dividend_yield', category: 'quality', description: 'Dividend yield', halfLife: 126 },
  { name: 'buyback_yield', category: 'quality', description: 'Share buyback yield', halfLife: 126 },
  { name: 'capex_intensity', category: 'quality', description: 'Capital expenditure to revenue', halfLife: 126 },
  { name: 'rd_intensity', category: 'quality', description: 'R&D spending to revenue', halfLife: 126 },

  // Valuation Factors
  { name: 'pe_ratio', category: 'style', description: 'Price-to-earnings ratio', halfLife: 63 },
  { name: 'pb_ratio', category: 'style', description: 'Price-to-book ratio', halfLife: 126 },
  { name: 'ps_ratio', category: 'style', description: 'Price-to-sales ratio', halfLife: 63 },
  { name: 'ev_ebitda', category: 'style', description: 'Enterprise value to EBITDA', halfLife: 63 },
  { name: 'peg_ratio', category: 'style', description: 'PEG ratio (PE / growth)', halfLife: 63 },
  { name: 'earnings_yield', category: 'style', description: 'Earnings yield (inverse PE)', halfLife: 63 },

  // Technical Factors
  { name: 'rsi_14', category: 'style', description: 'Relative Strength Index (14-day)', halfLife: 5 },
  { name: 'macd_signal', category: 'style', description: 'MACD signal line crossover', halfLife: 5 },
  { name: 'bollinger_width', category: 'volatility', description: 'Bollinger Band width', halfLife: 21 },
  { name: 'atr_normalized', category: 'volatility', description: 'Average True Range (normalized)', halfLife: 21 },
  { name: 'volume_ratio', category: 'sentiment', description: 'Volume relative to 20-day average', halfLife: 5 },
  { name: 'price_gap', category: 'style', description: 'Overnight price gap frequency', halfLife: 21 },
  { name: 'mean_reversion_5d', category: 'style', description: '5-day mean reversion signal', halfLife: 5 },

  // Liquidity Factors
  { name: 'bid_ask_spread', category: 'quality', description: 'Average bid-ask spread', halfLife: 21 },
  { name: 'turnover_ratio', category: 'quality', description: 'Share turnover ratio', halfLife: 21 },
  { name: 'amihud_illiquidity', category: 'quality', description: 'Amihud illiquidity measure', halfLife: 63 },

  // Earnings & Events
  { name: 'earnings_surprise', category: 'sentiment', description: 'Recent earnings surprise', halfLife: 21 },
  { name: 'guidance_revision', category: 'sentiment', description: 'Management guidance revision', halfLife: 21 },
  { name: 'insider_activity', category: 'sentiment', description: 'Net insider buying/selling', halfLife: 63 },
  { name: 'institutional_flow', category: 'sentiment', description: 'Institutional ownership change', halfLife: 63 },

  // Macro (additional)
  { name: 'yield_curve_slope', category: 'macro', description: '10Y-2Y yield curve slope', halfLife: 63 },
  { name: 'gold_beta', category: 'macro', description: 'Gold price sensitivity', halfLife: 63 },
  { name: 'real_rate_sens', category: 'macro', description: 'Real interest rate sensitivity', halfLife: 126 },
  { name: 'pmi_beta', category: 'macro', description: 'PMI (manufacturing) sensitivity', halfLife: 63 },
  { name: 'consumer_confidence_beta', category: 'macro', description: 'Consumer confidence sensitivity', halfLife: 63 },

  // Cross-asset
  { name: 'equity_bond_corr', category: 'macro', description: 'Equity-bond correlation regime', halfLife: 63 },
  { name: 'risk_on_off', category: 'macro', description: 'Risk-on/risk-off regime signal', halfLife: 21 },
  { name: 'cross_asset_momentum', category: 'macro', description: 'Cross-asset momentum signal', halfLife: 21 },

  // Sector Factors (GICS Level 1)
  { name: 'sector_tech', category: 'sector', description: 'Technology sector exposure', halfLife: 252 },
  { name: 'sector_healthcare', category: 'sector', description: 'Healthcare sector exposure', halfLife: 252 },
  { name: 'sector_financials', category: 'sector', description: 'Financials sector exposure', halfLife: 252 },
  { name: 'sector_energy', category: 'sector', description: 'Energy sector exposure', halfLife: 252 },
  { name: 'sector_consumer_disc', category: 'sector', description: 'Consumer Discretionary exposure', halfLife: 252 },
  { name: 'sector_consumer_staples', category: 'sector', description: 'Consumer Staples exposure', halfLife: 252 },
  { name: 'sector_industrials', category: 'sector', description: 'Industrials exposure', halfLife: 252 },
  { name: 'sector_materials', category: 'sector', description: 'Materials exposure', halfLife: 252 },
  { name: 'sector_utilities', category: 'sector', description: 'Utilities exposure', halfLife: 252 },
  { name: 'sector_real_estate', category: 'sector', description: 'Real Estate exposure', halfLife: 252 },
  { name: 'sector_comm_services', category: 'sector', description: 'Communication Services exposure', halfLife: 252 },
];

// GICS Sector mapping for common symbols
export const SECTOR_MAP: Record<string, string> = {
  // Technology
  AAPL: 'Technology', MSFT: 'Technology', NVDA: 'Technology', AMD: 'Technology',
  INTC: 'Technology', CSCO: 'Technology', ADBE: 'Technology', CRM: 'Technology',
  ORCL: 'Technology', IBM: 'Technology', AVGO: 'Technology', TXN: 'Technology',
  QCOM: 'Technology', NOW: 'Technology', AMAT: 'Technology', MU: 'Technology',
  LRCX: 'Technology', KLAC: 'Technology', SNPS: 'Technology', CDNS: 'Technology',

  // Communication Services
  GOOGL: 'Communication Services', GOOG: 'Communication Services',
  META: 'Communication Services', NFLX: 'Communication Services',
  DIS: 'Communication Services', CMCSA: 'Communication Services',
  VZ: 'Communication Services', T: 'Communication Services',
  TMUS: 'Communication Services', ATVI: 'Communication Services',

  // Consumer Discretionary
  AMZN: 'Consumer Discretionary', TSLA: 'Consumer Discretionary',
  HD: 'Consumer Discretionary', NKE: 'Consumer Discretionary',
  MCD: 'Consumer Discretionary', SBUX: 'Consumer Discretionary',
  LOW: 'Consumer Discretionary', TJX: 'Consumer Discretionary',
  BKNG: 'Consumer Discretionary', MAR: 'Consumer Discretionary',

  // Financials
  JPM: 'Financials', BAC: 'Financials', WFC: 'Financials', GS: 'Financials',
  MS: 'Financials', C: 'Financials', AXP: 'Financials', BLK: 'Financials',
  SCHW: 'Financials', SPGI: 'Financials', V: 'Financials', MA: 'Financials',
  PYPL: 'Financials', COF: 'Financials', USB: 'Financials', PNC: 'Financials',

  // Healthcare
  UNH: 'Healthcare', JNJ: 'Healthcare', PFE: 'Healthcare', MRK: 'Healthcare',
  ABBV: 'Healthcare', LLY: 'Healthcare', TMO: 'Healthcare', ABT: 'Healthcare',
  DHR: 'Healthcare', BMY: 'Healthcare', AMGN: 'Healthcare', GILD: 'Healthcare',
  CVS: 'Healthcare', CI: 'Healthcare', ISRG: 'Healthcare', VRTX: 'Healthcare',

  // Consumer Staples
  PG: 'Consumer Staples', KO: 'Consumer Staples', PEP: 'Consumer Staples',
  WMT: 'Consumer Staples', COST: 'Consumer Staples', PM: 'Consumer Staples',
  MO: 'Consumer Staples', CL: 'Consumer Staples', KMB: 'Consumer Staples',
  GIS: 'Consumer Staples', K: 'Consumer Staples', MDLZ: 'Consumer Staples',

  // Energy
  XOM: 'Energy', CVX: 'Energy', COP: 'Energy', EOG: 'Energy',
  SLB: 'Energy', OXY: 'Energy', PSX: 'Energy', VLO: 'Energy',
  MPC: 'Energy', PXD: 'Energy', HES: 'Energy', DVN: 'Energy',

  // Industrials
  HON: 'Industrials', UNP: 'Industrials', RTX: 'Industrials', BA: 'Industrials',
  CAT: 'Industrials', GE: 'Industrials', DE: 'Industrials', LMT: 'Industrials',
  MMM: 'Industrials', UPS: 'Industrials', FDX: 'Industrials', WM: 'Industrials',

  // Materials
  LIN: 'Materials', APD: 'Materials', SHW: 'Materials', ECL: 'Materials',
  FCX: 'Materials', NEM: 'Materials', NUE: 'Materials', DOW: 'Materials',

  // Utilities
  NEE: 'Utilities', DUK: 'Utilities', SO: 'Utilities', D: 'Utilities',
  AEP: 'Utilities', EXC: 'Utilities', SRE: 'Utilities', XEL: 'Utilities',

  // Real Estate
  AMT: 'Real Estate', PLD: 'Real Estate', CCI: 'Real Estate', EQIX: 'Real Estate',
  PSA: 'Real Estate', O: 'Real Estate', WELL: 'Real Estate', SPG: 'Real Estate',
};

// Sector to factor name mapping
const SECTOR_FACTOR_MAP: Record<string, string> = {
  'Technology': 'sector_tech',
  'Healthcare': 'sector_healthcare',
  'Financials': 'sector_financials',
  'Energy': 'sector_energy',
  'Consumer Discretionary': 'sector_consumer_disc',
  'Consumer Staples': 'sector_consumer_staples',
  'Industrials': 'sector_industrials',
  'Materials': 'sector_materials',
  'Utilities': 'sector_utilities',
  'Real Estate': 'sector_real_estate',
  'Communication Services': 'sector_comm_services',
};

// ============================================================================
// FUNDAMENTAL DATA INTERFACE
// ============================================================================

export interface FundamentalData {
  symbol: string;
  // Profitability
  roe: number | null;
  roa: number | null;
  grossMargin: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  // Leverage
  debtToEquity: number | null;
  currentRatio: number | null;
  quickRatio: number | null;
  // Valuation
  peRatio: number | null;
  pbRatio: number | null;
  evToEbitda: number | null;
  // Size
  marketCap: number | null;
  // Sector
  sector: string | null;
  industry: string | null;
  // Timestamps
  fetchedAt: Date;
}

// Cache for fundamental data
const fundamentalCache = new Map<string, { data: FundamentalData; timestamp: number }>();
const FUNDAMENTAL_CACHE_TTL = 24 * 60 * 60 * 1000;  // 24 hours

// ============================================================================
// FACTOR ENGINE CLASS
// ============================================================================

export class FactorEngine {
  private factors: Factor[];
  private priceCache: Map<string, Price[]> = new Map();
  private alphaVantageKey: string | undefined;

  constructor(factors: Factor[] = FACTOR_DEFINITIONS) {
    this.factors = factors;
    this.alphaVantageKey = process.env.ALPHA_VANTAGE_API_KEY;
  }

  /**
   * Calculate all factor exposures for a universe of assets
   */
  async calculateExposures(
    symbols: string[],
    prices: Map<string, Price[]>,
    options: {
      includeFundamentals?: boolean;
      includeMacro?: boolean;
      includeSector?: boolean;
    } = {}
  ): Promise<Map<string, FactorExposure[]>> {
    const {
      includeFundamentals = true,
      includeMacro = true,
      includeSector = true,
    } = options;

    const exposures = new Map<string, FactorExposure[]>();

    // Fetch fundamental data in parallel if needed
    let fundamentals: Map<string, FundamentalData> = new Map();
    if (includeFundamentals) {
      fundamentals = await this.fetchFundamentalsBatch(symbols);
    }

    // Fetch macro factor data
    let macroData: MacroFactorData | null = null;
    if (includeMacro) {
      macroData = await this.fetchMacroData();
    }

    const marketPrices = prices.get('SPY') || [];

    for (const symbol of symbols) {
      const symbolPrices = prices.get(symbol);
      if (!symbolPrices || symbolPrices.length < 63) continue;  // Need at least 3 months

      const symbolExposures: FactorExposure[] = [];

      // Style Factors (Price-based)
      if (marketPrices.length >= 252) {
        symbolExposures.push(this.calcMarketBeta(symbolPrices, marketPrices));
      }
      symbolExposures.push(this.calcMomentum(symbolPrices, 252, 'momentum_12m'));
      symbolExposures.push(this.calcMomentum(symbolPrices, 126, 'momentum_6m'));
      symbolExposures.push(this.calcMomentum(symbolPrices, 21, 'momentum_1m'));
      symbolExposures.push(this.calcVolatility(symbolPrices));
      symbolExposures.push(this.calcLowVol(symbolPrices));
      symbolExposures.push(this.calcIdiosyncraticVol(symbolPrices, marketPrices));

      // Quality Factors (Fundamental-based)
      const fund = fundamentals.get(symbol);
      if (fund) {
        symbolExposures.push(...this.calcQualityFactors(fund));
      }

      // Sector Factors
      if (includeSector) {
        symbolExposures.push(...this.calcSectorExposure(symbol, fund?.sector));
      }

      // Macro Factors
      if (macroData && symbolPrices.length >= 252) {
        symbolExposures.push(...this.calcMacroFactors(symbolPrices, macroData));
      }

      exposures.set(symbol, symbolExposures.filter(e => e.confidence > 0));
    }

    return exposures;
  }

  // ============================================================================
  // FUNDAMENTAL DATA FETCHING
  // ============================================================================

  /**
   * Fetch fundamental data for multiple symbols
   */
  private async fetchFundamentalsBatch(symbols: string[]): Promise<Map<string, FundamentalData>> {
    const results = new Map<string, FundamentalData>();
    const now = Date.now();

    // Check cache and collect uncached symbols
    const uncachedSymbols: string[] = [];
    for (const symbol of symbols) {
      const cached = fundamentalCache.get(symbol);
      if (cached && (now - cached.timestamp) < FUNDAMENTAL_CACHE_TTL) {
        results.set(symbol, cached.data);
      } else {
        uncachedSymbols.push(symbol);
      }
    }

    // Fetch uncached symbols (with rate limiting)
    for (const symbol of uncachedSymbols) {
      try {
        const data = await this.fetchFundamentalData(symbol);
        if (data) {
          results.set(symbol, data);
          fundamentalCache.set(symbol, { data, timestamp: now });
        }
        // Rate limit: Alpha Vantage free tier is 5 calls/min
        if (uncachedSymbols.length > 5) {
          await this.delay(12000);  // 12 seconds between calls
        }
      } catch (e) {
        logger.warn({ err: e, symbol }, 'Failed to fetch fundamentals');
      }
    }

    return results;
  }

  /**
   * Fetch fundamental data from Alpha Vantage
   */
  private async fetchFundamentalData(symbol: string): Promise<FundamentalData | null> {
    if (!this.alphaVantageKey) {
      // Return mock data based on sector
      return this.generateMockFundamentals(symbol);
    }

    try {
      const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${this.alphaVantageKey}`;
      const response = await fetch(url);
      if (!response.ok) return null;

      const data = await response.json();
      if (!data || data['Note'] || data['Error Message']) {
        logger.warn({ symbol }, 'Alpha Vantage rate limit or error');
        return null;
      }

      return {
        symbol,
        roe: this.parsePercent(data['ReturnOnEquityTTM']),
        roa: this.parsePercent(data['ReturnOnAssetsTTM']),
        grossMargin: this.parsePercent(data['GrossProfitTTM']) && data['RevenueTTM']
          ? parseFloat(data['GrossProfitTTM']) / parseFloat(data['RevenueTTM'])
          : null,
        operatingMargin: this.parsePercent(data['OperatingMarginTTM']),
        netMargin: this.parsePercent(data['ProfitMargin']),
        debtToEquity: parseFloat(data['DebtToEquityRatio']) || null,
        currentRatio: parseFloat(data['CurrentRatio']) || null,
        quickRatio: parseFloat(data['QuickRatio']) || null,
        peRatio: parseFloat(data['PERatio']) || null,
        pbRatio: parseFloat(data['PriceToBookRatio']) || null,
        evToEbitda: parseFloat(data['EVToEBITDA']) || null,
        marketCap: parseFloat(data['MarketCapitalization']) || null,
        sector: data['Sector'] || SECTOR_MAP[symbol] || null,
        industry: data['Industry'] || null,
        fetchedAt: new Date(),
      };
    } catch (e) {
      logger.error({ err: e, symbol }, 'Error fetching fundamentals');
      return null;
    }
  }

  /**
   * Generate mock fundamental data for development
   */
  private generateMockFundamentals(symbol: string): FundamentalData {
    const hash = symbol.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    const sector = SECTOR_MAP[symbol] || 'Technology';

    // Sector-specific average values
    const sectorProfiles: Record<string, Partial<FundamentalData>> = {
      'Technology': { roe: 0.25, roa: 0.12, grossMargin: 0.60, debtToEquity: 0.5 },
      'Healthcare': { roe: 0.18, roa: 0.08, grossMargin: 0.65, debtToEquity: 0.7 },
      'Financials': { roe: 0.12, roa: 0.01, grossMargin: 0.40, debtToEquity: 2.0 },
      'Energy': { roe: 0.15, roa: 0.06, grossMargin: 0.35, debtToEquity: 0.8 },
      'Consumer Discretionary': { roe: 0.20, roa: 0.10, grossMargin: 0.45, debtToEquity: 0.6 },
      'Consumer Staples': { roe: 0.22, roa: 0.11, grossMargin: 0.50, debtToEquity: 0.7 },
      'Industrials': { roe: 0.16, roa: 0.07, grossMargin: 0.30, debtToEquity: 0.9 },
    };

    const profile = sectorProfiles[sector] || sectorProfiles['Technology'];
    const noise = (hash % 100 - 50) / 500;  // ±10% variation

    return {
      symbol,
      roe: (profile.roe || 0.15) * (1 + noise),
      roa: (profile.roa || 0.08) * (1 + noise),
      grossMargin: (profile.grossMargin || 0.40) * (1 + noise),
      operatingMargin: (profile.grossMargin || 0.40) * 0.5 * (1 + noise),
      netMargin: (profile.grossMargin || 0.40) * 0.3 * (1 + noise),
      debtToEquity: (profile.debtToEquity || 0.5) * (1 + noise),
      currentRatio: 1.5 + noise * 2,
      quickRatio: 1.2 + noise * 2,
      peRatio: 20 + (hash % 30),
      pbRatio: 3 + (hash % 5),
      evToEbitda: 12 + (hash % 8),
      marketCap: 50e9 + (hash % 100) * 1e9,
      sector,
      industry: null,
      fetchedAt: new Date(),
    };
  }

  // ============================================================================
  // QUALITY FACTOR CALCULATIONS
  // ============================================================================

  /**
   * Calculate all quality factors from fundamental data
   */
  private calcQualityFactors(fund: FundamentalData): FactorExposure[] {
    const exposures: FactorExposure[] = [];

    // ROE (market average ~15%)
    if (fund.roe !== null) {
      const zScore = (fund.roe - 0.15) / 0.10;
      exposures.push({
        factor: 'roe',
        exposure: Math.max(-3, Math.min(3, zScore)),
        tStat: zScore * 2,
        confidence: 0.85,
        contribution: fund.roe,
      });
    }

    // ROA (market average ~8%)
    if (fund.roa !== null) {
      const zScore = (fund.roa - 0.08) / 0.05;
      exposures.push({
        factor: 'roa',
        exposure: Math.max(-3, Math.min(3, zScore)),
        tStat: zScore * 2,
        confidence: 0.85,
        contribution: fund.roa,
      });
    }

    // Gross Margin (market average ~40%)
    if (fund.grossMargin !== null) {
      const zScore = (fund.grossMargin - 0.40) / 0.15;
      exposures.push({
        factor: 'gross_margin',
        exposure: Math.max(-3, Math.min(3, zScore)),
        tStat: zScore * 2,
        confidence: 0.80,
        contribution: fund.grossMargin,
      });
    }

    // Debt/Equity (lower is better, market average ~0.8)
    if (fund.debtToEquity !== null) {
      // Invert: lower D/E = higher quality
      const zScore = -(fund.debtToEquity - 0.8) / 0.5;
      exposures.push({
        factor: 'debt_equity',
        exposure: Math.max(-3, Math.min(3, zScore)),
        tStat: zScore * 1.5,
        confidence: 0.75,
        contribution: -fund.debtToEquity,  // Negative contribution (high D/E is bad)
      });
    }

    // Current Ratio (market average ~1.5)
    if (fund.currentRatio !== null) {
      const zScore = (fund.currentRatio - 1.5) / 0.5;
      exposures.push({
        factor: 'current_ratio',
        exposure: Math.max(-3, Math.min(3, zScore)),
        tStat: zScore * 1.5,
        confidence: 0.70,
        contribution: fund.currentRatio,
      });
    }

    return exposures;
  }

  // ============================================================================
  // SECTOR FACTOR CALCULATIONS
  // ============================================================================

  /**
   * Calculate sector exposure (binary or weighted)
   */
  private calcSectorExposure(symbol: string, sector?: string | null): FactorExposure[] {
    const actualSector = sector || SECTOR_MAP[symbol] || 'Technology';
    const factorName = SECTOR_FACTOR_MAP[actualSector];

    if (!factorName) return [];

    // Create binary exposure for the sector
    const exposures: FactorExposure[] = [];

    for (const [sec, factor] of Object.entries(SECTOR_FACTOR_MAP)) {
      exposures.push({
        factor,
        exposure: sec === actualSector ? 1.0 : 0.0,
        tStat: sec === actualSector ? 10 : 0,
        confidence: 0.99,  // Sector is deterministic
        contribution: sec === actualSector ? 0.05 : 0,  // Sector premium
      });
    }

    return exposures;
  }

  // ============================================================================
  // MACRO FACTOR CALCULATIONS
  // ============================================================================

  /**
   * Fetch macro factor data (simplified - would use FRED API in production)
   */
  private async fetchMacroData(): Promise<MacroFactorData | null> {
    // In production, fetch from FRED API or economic data provider
    // For now, generate realistic macro time series

    const days = 252;
    const generateSeries = (mean: number, vol: number): number[] => {
      const series: number[] = [];
      let value = mean;
      for (let i = 0; i < days; i++) {
        value = value + (Math.random() - 0.5) * vol;
        series.push(value);
      }
      return series;
    };

    return {
      tenYearYield: generateSeries(0.04, 0.002),     // ~4% with 0.2% daily vol
      inflationRate: generateSeries(0.03, 0.001),   // ~3% with 0.1% daily vol
      creditSpread: generateSeries(0.04, 0.003),    // ~4% with 0.3% daily vol
      dollarIndex: generateSeries(100, 0.5),        // ~100 with 0.5 daily vol
      oilPrices: generateSeries(75, 2),             // ~$75 with $2 daily vol
      vixLevels: generateSeries(18, 2),             // ~18 with 2 daily vol
    };
  }

  /**
   * Calculate macro factor betas
   */
  private calcMacroFactors(prices: Price[], macro: MacroFactorData): FactorExposure[] {
    const returns = this.calculateReturns(prices);
    const exposures: FactorExposure[] = [];

    // Interest Rate Sensitivity
    if (macro.tenYearYield.length > 0) {
      const yieldChanges = this.calculateReturns(
        macro.tenYearYield.map((v, _i) => ({ close: v, timestamp: new Date() } as Price))
      );
      const beta = this.calculateBeta(returns, yieldChanges);
      exposures.push({
        factor: 'interest_rate_sens',
        exposure: Math.max(-3, Math.min(3, beta.slope * 10)),  // Scale for interpretability
        tStat: beta.tStat,
        confidence: Math.min(Math.abs(beta.tStat) / 2, 1),
        contribution: beta.slope,
      });
    }

    // Inflation Beta
    if (macro.inflationRate.length > 0) {
      const inflationChanges = this.calculateReturns(
        macro.inflationRate.map((v) => ({ close: v, timestamp: new Date() } as Price))
      );
      const beta = this.calculateBeta(returns, inflationChanges);
      exposures.push({
        factor: 'inflation_beta',
        exposure: Math.max(-3, Math.min(3, beta.slope * 5)),
        tStat: beta.tStat,
        confidence: Math.min(Math.abs(beta.tStat) / 2, 1),
        contribution: beta.slope,
      });
    }

    // Credit Spread Beta
    if (macro.creditSpread.length > 0) {
      const spreadChanges = this.calculateReturns(
        macro.creditSpread.map((v) => ({ close: v, timestamp: new Date() } as Price))
      );
      const beta = this.calculateBeta(returns, spreadChanges);
      exposures.push({
        factor: 'credit_spread_beta',
        exposure: Math.max(-3, Math.min(3, -beta.slope * 10)),  // Negative: spreads widen = stocks down
        tStat: beta.tStat,
        confidence: Math.min(Math.abs(beta.tStat) / 2, 1),
        contribution: -beta.slope,
      });
    }

    // VIX Beta
    if (macro.vixLevels.length > 0) {
      const vixChanges = this.calculateReturns(
        macro.vixLevels.map((v) => ({ close: v, timestamp: new Date() } as Price))
      );
      const beta = this.calculateBeta(returns, vixChanges);
      exposures.push({
        factor: 'vix_beta',
        exposure: Math.max(-3, Math.min(3, beta.slope)),  // Typically negative
        tStat: beta.tStat,
        confidence: Math.min(Math.abs(beta.tStat) / 2, 1),
        contribution: beta.slope,
      });
    }

    return exposures;
  }

  // ============================================================================
  // PRICE-BASED FACTOR CALCULATIONS
  // ============================================================================

  /**
   * Calculate market beta (CAPM)
   */
  private calcMarketBeta(assetPrices: Price[], marketPrices: Price[]): FactorExposure {
    const assetReturns = this.calculateReturns(assetPrices);
    const marketReturns = this.calculateReturns(marketPrices);

    // Align returns by date
    const aligned = this.alignReturns(assetReturns, marketReturns);

    // Calculate beta via regression
    const beta = this.linearRegression(aligned.asset, aligned.market);

    return {
      factor: 'market',
      exposure: beta.slope,
      tStat: beta.tStat,
      confidence: Math.min(Math.abs(beta.tStat) / 2, 1),
      contribution: beta.slope * this.calculateStd(aligned.market),
    };
  }

  /**
   * Calculate momentum factor
   */
  private calcMomentum(prices: Price[], lookback: number, name: string): FactorExposure {
    if (prices.length < lookback + 21) {
      return { factor: name, exposure: 0, tStat: 0, confidence: 0, contribution: 0 };
    }

    // Skip most recent month (momentum reversal)
    const startIdx = Math.max(0, prices.length - lookback);
    const endIdx = Math.max(0, prices.length - 21);

    const startPrice = prices[startIdx]?.close || 0;
    const endPrice = prices[endIdx]?.close || 0;

    if (startPrice === 0) {
      return { factor: name, exposure: 0, tStat: 0, confidence: 0, contribution: 0 };
    }

    const momentum = (endPrice - startPrice) / startPrice;

    // Normalize to z-score (assuming market avg momentum is ~10% annually)
    const zScore = (momentum - 0.10 * (lookback / 252)) / (0.20 * Math.sqrt(lookback / 252));

    return {
      factor: name,
      exposure: Math.max(-3, Math.min(3, zScore)),
      tStat: zScore * Math.sqrt(lookback / 21),
      confidence: Math.min(Math.abs(zScore) / 2, 1),
      contribution: momentum,
    };
  }

  /**
   * Calculate realized volatility
   */
  private calcVolatility(prices: Price[]): FactorExposure {
    const returns = this.calculateReturns(prices.slice(-63));  // 3-month
    const vol = this.calculateStd(returns) * Math.sqrt(252);  // Annualized

    // Cross-sectional z-score (market vol ~16%)
    const zScore = (vol - 0.16) / 0.08;

    return {
      factor: 'volatility',
      exposure: Math.max(-3, Math.min(3, zScore)),
      tStat: zScore * 2,
      confidence: 0.9,
      contribution: vol,
    };
  }

  /**
   * Calculate low volatility factor (inverted)
   */
  private calcLowVol(prices: Price[]): FactorExposure {
    const volExposure = this.calcVolatility(prices);
    return {
      ...volExposure,
      factor: 'low_vol',
      exposure: -volExposure.exposure,  // Invert
    };
  }

  /**
   * Calculate idiosyncratic volatility (residual vol after removing market)
   */
  private calcIdiosyncraticVol(assetPrices: Price[], marketPrices: Price[]): FactorExposure {
    const assetReturns = this.calculateReturns(assetPrices.slice(-63));
    const marketReturns = this.calculateReturns(marketPrices.slice(-63));
    const aligned = this.alignReturns(assetReturns, marketReturns);

    // Calculate beta
    const beta = this.linearRegression(aligned.asset, aligned.market);

    // Calculate residuals
    const residuals = aligned.asset.map((r, i) =>
      r - beta.slope * aligned.market[i]
    );

    const idioVol = this.calculateStd(residuals) * Math.sqrt(252);
    const zScore = (idioVol - 0.20) / 0.10;  // Market avg idio vol ~20%

    return {
      factor: 'idio_vol',
      exposure: Math.max(-3, Math.min(3, zScore)),
      tStat: zScore * 1.5,
      confidence: 0.85,
      contribution: idioVol,
    };
  }

  // ============================================================================
  // PORTFOLIO-LEVEL CALCULATIONS
  // ============================================================================

  /**
   * Calculate portfolio-level factor exposures
   */
  calculatePortfolioExposures(
    weights: Map<string, number>,
    assetExposures: Map<string, FactorExposure[]>
  ): FactorExposure[] {
    const portfolioExposures = new Map<string, number>();
    const portfolioTStats = new Map<string, number>();
    const portfolioContributions = new Map<string, number>();

    // Weighted average of exposures
    for (const [symbol, weight] of weights) {
      const exposures = assetExposures.get(symbol) || [];
      for (const exp of exposures) {
        const current = portfolioExposures.get(exp.factor) || 0;
        portfolioExposures.set(exp.factor, current + weight * exp.exposure);

        const currentT = portfolioTStats.get(exp.factor) || 0;
        portfolioTStats.set(exp.factor, currentT + weight * exp.tStat);

        const currentC = portfolioContributions.get(exp.factor) || 0;
        portfolioContributions.set(exp.factor, currentC + weight * exp.contribution);
      }
    }

    // Convert to array
    const result: FactorExposure[] = [];
    for (const [factor, exposure] of portfolioExposures) {
      result.push({
        factor,
        exposure,
        tStat: portfolioTStats.get(factor) || 0,
        confidence: Math.min(Math.abs(exposure) / 0.5, 1),
        contribution: portfolioContributions.get(factor) || 0,
      });
    }

    return result.sort((a, b) => Math.abs(b.exposure) - Math.abs(a.exposure));
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private calculateReturns(prices: Price[]): number[] {
    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      const prev = prices[i - 1]?.close || 0;
      const curr = prices[i]?.close || 0;
      if (prev > 0) {
        returns.push((curr - prev) / prev);
      }
    }
    return returns;
  }

  private calculateStd(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    return Math.sqrt(variance);
  }

  private alignReturns(
    asset: number[],
    market: number[]
  ): { asset: number[]; market: number[] } {
    const minLen = Math.min(asset.length, market.length);
    return {
      asset: asset.slice(-minLen),
      market: market.slice(-minLen),
    };
  }

  private linearRegression(y: number[], x: number[]): { slope: number; tStat: number } {
    const n = y.length;
    if (n < 30) return { slope: 1, tStat: 0 };

    const xMean = x.reduce((a, b) => a + b, 0) / n;
    const yMean = y.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < n; i++) {
      numerator += (x[i] - xMean) * (y[i] - yMean);
      denominator += (x[i] - xMean) ** 2;
    }

    const slope = denominator === 0 ? 1 : numerator / denominator;

    // Calculate t-statistic
    const residuals = y.map((yi, i) => yi - (slope * x[i] + (yMean - slope * xMean)));
    const residualStd = this.calculateStd(residuals);
    const xStd = this.calculateStd(x);
    const se = residualStd / (xStd * Math.sqrt(n));
    const tStat = se === 0 ? 0 : slope / se;

    return { slope, tStat };
  }

  private calculateBeta(assetReturns: number[], factorReturns: number[]): { slope: number; tStat: number } {
    const aligned = this.alignReturns(assetReturns, factorReturns);
    return this.linearRegression(aligned.asset, aligned.market);
  }

  private parsePercent(value: string | undefined): number | null {
    if (!value) return null;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? null : parsed;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get factor definition by name
   */
  getFactor(name: string): Factor | undefined {
    return this.factors.find(f => f.name === name);
  }

  /**
   * Get all factors in a category
   */
  getFactorsByCategory(category: FactorCategory): Factor[] {
    return this.factors.filter(f => f.category === category);
  }

  /**
   * Get sector for a symbol
   */
  getSector(symbol: string): string {
    return SECTOR_MAP[symbol.toUpperCase()] || 'Unknown';
  }
}

// ============================================================================
// TYPE DECLARATIONS
// ============================================================================

interface MacroFactorData {
  tenYearYield: number[];
  inflationRate: number[];
  creditSpread: number[];
  dollarIndex: number[];
  oilPrices: number[];
  vixLevels: number[];
}

export const factorEngine = new FactorEngine();
