/**
 * SEC EDGAR RSS Monitor
 *
 * Real-time monitoring of SEC filings via EDGAR RSS feeds.
 * Uses the official SEC EDGAR Atom/RSS feeds for reliable filing alerts.
 *
 * Feed URLs:
 * - All recent filings: https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&output=atom
 * - Company filings: https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=XXXXXX&output=atom
 * - Filing type filter: &type=10-K, &type=8-K, etc.
 */

import axios from 'axios';

// ============================================================================
// TYPES
// ============================================================================

export interface EdgarFiling {
  id: string;
  type: string;
  title: string;
  accessionNumber: string;
  filedAt: Date;
  url: string;
  cik: string;
  symbol?: string;
  companyName: string;
  description: string;
  size?: string;
  formUrl?: string;
}

export interface FilingAlert {
  id: string;
  type: 'sec_filing';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  message: string;
  timestamp: Date;
  acknowledged: boolean;
  filing: EdgarFiling;
  suggestedAction: string;
}

export interface CIKMapping {
  cik: string;
  ticker: string;
  companyName: string;
  lastUpdated: Date;
}

// ============================================================================
// CONSTANTS
// ============================================================================

// SEC EDGAR RSS feed base URL
const SEC_BASE_URL = 'https://www.sec.gov';
const SEC_DATA_URL = 'https://data.sec.gov';

// Required User-Agent for SEC API (SEC requires identification)
const USER_AGENT = 'Frontier-Alpha/1.0 (https://frontier-alpha.com; contact@frontier-alpha.com)';

// Filing type severity mapping
const FILING_SEVERITY: Record<string, 'critical' | 'high' | 'medium' | 'low'> = {
  '8-K': 'high',        // Material events - often market-moving
  '8-K/A': 'high',      // Amended 8-K
  '10-K': 'high',       // Annual report - comprehensive financial info
  '10-K/A': 'high',     // Amended 10-K
  '10-Q': 'medium',     // Quarterly report
  '10-Q/A': 'medium',   // Amended 10-Q
  '4': 'medium',        // Insider transactions
  '4/A': 'medium',      // Amended Form 4
  'SC 13D': 'high',     // Beneficial ownership > 5% (activist)
  'SC 13D/A': 'high',   // Amended SC 13D
  'SC 13G': 'medium',   // Beneficial ownership > 5% (passive)
  'SC 13G/A': 'medium', // Amended SC 13G
  '13F-HR': 'low',      // Institutional holdings quarterly
  '13F-HR/A': 'low',    // Amended 13F
  'DEF 14A': 'medium',  // Proxy statement
  'DEFA14A': 'medium',  // Additional proxy materials
  'S-1': 'high',        // IPO registration
  'S-1/A': 'high',      // Amended S-1
  'S-3': 'medium',      // Shelf registration
  'S-3/A': 'medium',    // Amended S-3
  '424B4': 'medium',    // Prospectus
  '424B5': 'medium',    // Prospectus supplement
  '6-K': 'low',         // Foreign issuer report
  '20-F': 'medium',     // Foreign annual report
  'NT 10-K': 'high',    // Late filing notification - red flag
  'NT 10-Q': 'medium',  // Late quarterly notification
};

// Important filing types to monitor
const IMPORTANT_FILING_TYPES = [
  '8-K', '10-K', '10-Q', '4',
  'SC 13D', 'SC 13G', '13F-HR',
  'DEF 14A', 'S-1', 'S-3',
  'NT 10-K', 'NT 10-Q',
];

// ============================================================================
// CIK TICKER MAPPING SERVICE
// ============================================================================

// In-memory cache for CIK to ticker mappings
let tickerToCikCache: Map<string, string> = new Map();
let cikToTickerCache: Map<string, string> = new Map();
let cikToNameCache: Map<string, string> = new Map();
let cacheLastUpdated: Date | null = null;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Fetch and cache the SEC company tickers mapping
 * Uses SEC's official company_tickers.json endpoint
 */
async function loadCIKMappings(): Promise<void> {
  // Check if cache is still valid
  if (cacheLastUpdated && Date.now() - cacheLastUpdated.getTime() < CACHE_TTL_MS) {
    return;
  }

  try {
    // SEC provides a JSON file with all company tickers
    const response = await axios.get(`${SEC_DATA_URL}/company_tickers.json`, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
      timeout: 15000,
    });

    const data = response.data;

    // Clear existing caches
    tickerToCikCache = new Map();
    cikToTickerCache = new Map();
    cikToNameCache = new Map();

    // company_tickers.json format: { "0": { "cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc." }, ... }
    for (const key of Object.keys(data)) {
      const entry = data[key];
      const cik = String(entry.cik_str);
      const ticker = entry.ticker?.toUpperCase();
      const name = entry.title;

      if (ticker && cik) {
        tickerToCikCache.set(ticker, cik);
        cikToTickerCache.set(cik, ticker);
        if (name) {
          cikToNameCache.set(cik, name);
        }
      }
    }

    cacheLastUpdated = new Date();
    console.log(`[EdgarMonitor] Loaded ${tickerToCikCache.size} CIK mappings`);
  } catch (error) {
    console.error('[EdgarMonitor] Failed to load CIK mappings:', error);
    // Keep using existing cache if available
    if (tickerToCikCache.size === 0) {
      // Load fallback mappings for common stocks
      loadFallbackMappings();
    }
  }
}

/**
 * Fallback mappings for most common stocks
 */
function loadFallbackMappings(): void {
  const fallbackMappings: [string, string, string][] = [
    ['320193', 'AAPL', 'Apple Inc.'],
    ['789019', 'MSFT', 'Microsoft Corporation'],
    ['1045810', 'NVDA', 'NVIDIA Corporation'],
    ['1652044', 'GOOGL', 'Alphabet Inc.'],
    ['1018724', 'AMZN', 'Amazon.com, Inc.'],
    ['1326801', 'META', 'Meta Platforms, Inc.'],
    ['1318605', 'TSLA', 'Tesla, Inc.'],
    ['1067983', 'BRK-B', 'Berkshire Hathaway Inc.'],
    ['51143', 'JPM', 'JPMorgan Chase & Co.'],
    ['70858', 'BAC', 'Bank of America Corporation'],
    ['200406', 'JNJ', 'Johnson & Johnson'],
    ['731766', 'UNH', 'UnitedHealth Group Incorporated'],
    ['1403161', 'V', 'Visa Inc.'],
    ['104169', 'WMT', 'Walmart Inc.'],
    ['80424', 'PG', 'Procter & Gamble Company'],
    ['354950', 'HD', 'Home Depot, Inc.'],
    ['1141391', 'MA', 'Mastercard Incorporated'],
    ['1744489', 'DIS', 'Walt Disney Company'],
    ['1065280', 'NFLX', 'Netflix, Inc.'],
    ['1800', 'ABBV', 'AbbVie Inc.'],
    ['1551152', 'AVGO', 'Broadcom Inc.'],
    ['858877', 'CRM', 'Salesforce, Inc.'],
    ['320187', 'XOM', 'Exxon Mobil Corporation'],
    ['93410', 'CVX', 'Chevron Corporation'],
    ['78003', 'PFE', 'Pfizer Inc.'],
    ['21344', 'KO', 'Coca-Cola Company'],
    ['66740', 'PEP', 'PepsiCo, Inc.'],
    ['732712', 'COST', 'Costco Wholesale Corporation'],
    ['1613103', 'ADBE', 'Adobe Inc.'],
    ['1467373', 'AMD', 'Advanced Micro Devices, Inc.'],
    ['909832', 'INTC', 'Intel Corporation'],
    ['1045609', 'NXPI', 'NXP Semiconductors N.V.'],
    ['1326380', 'UBER', 'Uber Technologies, Inc.'],
    ['1418091', 'TWTR', 'X Corp.'],
    ['1559720', 'ABNB', 'Airbnb, Inc.'],
    ['1585521', 'RIVN', 'Rivian Automotive, Inc.'],
    ['1805521', 'LCID', 'Lucid Group, Inc.'],
    ['1792789', 'PLTR', 'Palantir Technologies Inc.'],
    ['1834518', 'COIN', 'Coinbase Global, Inc.'],
    ['1543151', 'BABA', 'Alibaba Group Holding Limited'],
  ];

  for (const [cik, ticker, name] of fallbackMappings) {
    tickerToCikCache.set(ticker, cik);
    cikToTickerCache.set(cik, ticker);
    cikToNameCache.set(cik, name);
  }

  console.log('[EdgarMonitor] Loaded fallback CIK mappings');
}

/**
 * Get CIK for a ticker symbol
 */
export async function getCIKForTicker(ticker: string): Promise<string | null> {
  await loadCIKMappings();
  return tickerToCikCache.get(ticker.toUpperCase()) || null;
}

/**
 * Get ticker for a CIK
 */
export async function getTickerForCIK(cik: string): Promise<string | null> {
  await loadCIKMappings();
  // Normalize CIK (remove leading zeros for lookup)
  const normalizedCik = cik.replace(/^0+/, '');
  return cikToTickerCache.get(normalizedCik) || null;
}

/**
 * Get company name for a CIK
 */
export async function getCompanyNameForCIK(cik: string): Promise<string | null> {
  await loadCIKMappings();
  const normalizedCik = cik.replace(/^0+/, '');
  return cikToNameCache.get(normalizedCik) || null;
}

// ============================================================================
// EDGAR RSS MONITOR CLASS
// ============================================================================

export class EdgarMonitor {
  private lastCheckedFilings: Map<string, Date> = new Map();
  private alertHistory: FilingAlert[] = [];
  private pollingInterval: NodeJS.Timeout | null = null;
  private onFilingCallback: ((filing: FilingAlert) => void) | null = null;

  /**
   * Fetch recent filings from SEC EDGAR RSS feed
   */
  async fetchRecentFilings(options: {
    count?: number;
    filingType?: string;
    companyName?: string;
    owner?: 'include' | 'exclude' | 'only';
  } = {}): Promise<EdgarFiling[]> {
    const { count = 100, filingType, companyName, owner = 'include' } = options;

    try {
      // Build RSS feed URL
      const params = new URLSearchParams({
        action: 'getcurrent',
        output: 'atom',
        count: String(count),
        owner,
      });

      if (filingType) {
        params.set('type', filingType);
      }
      if (companyName) {
        params.set('company', companyName);
      }

      const url = `${SEC_BASE_URL}/cgi-bin/browse-edgar?${params.toString()}`;

      const response = await axios.get(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/atom+xml',
        },
        timeout: 15000,
      });

      return this.parseAtomFeed(response.data);
    } catch (error) {
      console.error('[EdgarMonitor] Error fetching recent filings:', error);
      return [];
    }
  }

  /**
   * Fetch filings for a specific company by CIK
   */
  async fetchFilingsForCIK(cik: string, options: {
    count?: number;
    filingType?: string;
  } = {}): Promise<EdgarFiling[]> {
    const { count = 20, filingType } = options;

    try {
      // Normalize CIK to 10 digits
      const normalizedCIK = cik.replace(/^0+/, '').padStart(10, '0');

      const params = new URLSearchParams({
        action: 'getcompany',
        CIK: normalizedCIK,
        output: 'atom',
        count: String(count),
        owner: 'include',
      });

      if (filingType) {
        params.set('type', filingType);
      }

      const url = `${SEC_BASE_URL}/cgi-bin/browse-edgar?${params.toString()}`;

      const response = await axios.get(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/atom+xml',
        },
        timeout: 15000,
      });

      const filings = this.parseAtomFeed(response.data);

      // Add ticker symbol if available
      const ticker = await getTickerForCIK(cik);
      if (ticker) {
        return filings.map(f => ({ ...f, symbol: ticker }));
      }

      return filings;
    } catch (error) {
      console.error(`[EdgarMonitor] Error fetching filings for CIK ${cik}:`, error);
      return [];
    }
  }

  /**
   * Fetch filings for a ticker symbol
   */
  async fetchFilingsForSymbol(symbol: string, options: {
    count?: number;
    filingType?: string;
  } = {}): Promise<EdgarFiling[]> {
    const cik = await getCIKForTicker(symbol);
    if (!cik) {
      console.warn(`[EdgarMonitor] Could not find CIK for symbol: ${symbol}`);
      return [];
    }

    const filings = await this.fetchFilingsForCIK(cik, options);
    return filings.map(f => ({ ...f, symbol: symbol.toUpperCase() }));
  }

  /**
   * Fetch filings for multiple symbols
   */
  async fetchFilingsForSymbols(symbols: string[], options: {
    count?: number;
    maxDaysOld?: number;
  } = {}): Promise<EdgarFiling[]> {
    const { count = 10, maxDaysOld = 30 } = options;
    const allFilings: EdgarFiling[] = [];
    const cutoffDate = new Date(Date.now() - maxDaysOld * 24 * 60 * 60 * 1000);

    for (const symbol of symbols) {
      try {
        const filings = await this.fetchFilingsForSymbol(symbol, { count });

        // Filter by date
        const recentFilings = filings.filter(f => f.filedAt >= cutoffDate);
        allFilings.push(...recentFilings);

        // Rate limiting: SEC allows 10 requests/second
        await this.delay(120);
      } catch (error) {
        console.error(`[EdgarMonitor] Error fetching filings for ${symbol}:`, error);
      }
    }

    // Sort by filing date descending
    allFilings.sort((a, b) => b.filedAt.getTime() - a.filedAt.getTime());

    return allFilings;
  }

  /**
   * Check for new filings for portfolio symbols
   */
  async checkForNewFilings(symbols: string[]): Promise<FilingAlert[]> {
    const alerts: FilingAlert[] = [];

    for (const symbol of symbols) {
      try {
        const filings = await this.fetchFilingsForSymbol(symbol, { count: 10 });
        const lastChecked = this.lastCheckedFilings.get(symbol) || new Date(0);

        // Find new filings
        const newFilings = filings.filter(f => f.filedAt > lastChecked);

        for (const filing of newFilings) {
          // Only alert on important filing types
          if (IMPORTANT_FILING_TYPES.some(t => filing.type.startsWith(t))) {
            const alert = this.createAlert(filing);
            alerts.push(alert);
            this.alertHistory.push(alert);

            // Notify callback if registered
            if (this.onFilingCallback) {
              this.onFilingCallback(alert);
            }
          }
        }

        // Update last checked time
        if (filings.length > 0) {
          const mostRecent = filings.reduce((latest, f) =>
            f.filedAt > latest.filedAt ? f : latest
          );
          this.lastCheckedFilings.set(symbol, mostRecent.filedAt);
        }

        // Rate limit
        await this.delay(120);
      } catch (error) {
        console.error(`[EdgarMonitor] Error checking ${symbol}:`, error);
      }
    }

    // Keep only last 200 alerts
    if (this.alertHistory.length > 200) {
      this.alertHistory = this.alertHistory.slice(-200);
    }

    return alerts;
  }

  /**
   * Start polling for new filings
   */
  startPolling(symbols: string[], intervalMs: number = 5 * 60 * 1000): void {
    if (this.pollingInterval) {
      this.stopPolling();
    }

    // Initial check
    this.checkForNewFilings(symbols);

    // Set up interval
    this.pollingInterval = setInterval(() => {
      this.checkForNewFilings(symbols);
    }, intervalMs);

    console.log(`[EdgarMonitor] Started polling for ${symbols.length} symbols every ${intervalMs / 1000}s`);
  }

  /**
   * Stop polling
   */
  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      console.log('[EdgarMonitor] Stopped polling');
    }
  }

  /**
   * Register callback for new filings
   */
  onFiling(callback: (filing: FilingAlert) => void): void {
    this.onFilingCallback = callback;
  }

  /**
   * Get alert history
   */
  getAlertHistory(limit: number = 50): FilingAlert[] {
    return this.alertHistory.slice(-limit);
  }

  /**
   * Parse Atom feed from SEC EDGAR
   */
  private parseAtomFeed(xml: string): EdgarFiling[] {
    const filings: EdgarFiling[] = [];

    try {
      // Extract entries from Atom feed using regex (lightweight parsing)
      const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
      let match;

      while ((match = entryRegex.exec(xml)) !== null) {
        const entry = match[1];

        // Extract fields from entry
        const titleMatch = entry.match(/<title[^>]*>([^<]+)<\/title>/);
        const linkMatch = entry.match(/<link[^>]*href="([^"]+)"/);
        const updatedMatch = entry.match(/<updated>([^<]+)<\/updated>/);
        const summaryMatch = entry.match(/<summary[^>]*>([\s\S]*?)<\/summary>/);
        const idMatch = entry.match(/<id>([^<]+)<\/id>/);
        const categoryMatch = entry.match(/<category[^>]*term="([^"]+)"/);

        if (titleMatch && linkMatch) {
          const title = this.decodeXmlEntities(titleMatch[1]);
          const url = linkMatch[1];

          // Parse filing type from title (format: "10-K - Company Name (CIK)")
          const typeMatch = title.match(/^([A-Z0-9-/]+(?:\/A)?)\s*-/);
          const filingType = typeMatch ? typeMatch[1].trim() : categoryMatch?.[1] || 'UNKNOWN';

          // Extract company name
          const companyMatch = title.match(/-\s*(.+?)\s*\(/);
          const companyName = companyMatch ? companyMatch[1].trim() : 'Unknown Company';

          // Extract CIK from title or URL
          let cik = '';
          const cikFromTitle = title.match(/\((\d{10})\)/);
          if (cikFromTitle) {
            cik = cikFromTitle[1];
          } else {
            const cikFromUrl = url.match(/\/(\d{10})\//);
            if (cikFromUrl) {
              cik = cikFromUrl[1];
            }
          }

          // Extract accession number from URL
          const accessionMatch = url.match(/(\d{10}-\d{2}-\d{6})/);
          const accessionNumber = accessionMatch ? accessionMatch[1] : '';

          // Parse date
          const filedAt = updatedMatch ? new Date(updatedMatch[1]) : new Date();

          // Extract size from summary if available
          const sizeMatch = summaryMatch?.[1]?.match(/Size:\s*([^\s<]+)/i);
          const size = sizeMatch ? sizeMatch[1] : undefined;

          filings.push({
            id: idMatch ? idMatch[1] : `${cik}-${accessionNumber || Date.now()}`,
            type: filingType,
            title: title,
            accessionNumber,
            filedAt,
            url,
            cik: cik.replace(/^0+/, ''), // Normalize CIK
            companyName,
            description: summaryMatch ? this.decodeXmlEntities(summaryMatch[1].trim()) : '',
            size,
            formUrl: this.buildFormUrl(cik, accessionNumber),
          });
        }
      }
    } catch (error) {
      console.error('[EdgarMonitor] Error parsing Atom feed:', error);
    }

    return filings;
  }

  /**
   * Build direct URL to filing form
   */
  private buildFormUrl(cik: string, accessionNumber: string): string {
    if (!cik || !accessionNumber) return '';
    const normalizedCik = cik.replace(/^0+/, '');
    const cleanAccession = accessionNumber.replace(/-/g, '');
    return `${SEC_BASE_URL}/Archives/edgar/data/${normalizedCik}/${cleanAccession}`;
  }

  /**
   * Decode XML entities
   */
  private decodeXmlEntities(str: string): string {
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'");
  }

  /**
   * Create alert from filing
   */
  private createAlert(filing: EdgarFiling): FilingAlert {
    const severity = FILING_SEVERITY[filing.type] || 'low';
    const suggestedAction = this.getSuggestedAction(filing.type);

    return {
      id: `sec-${filing.accessionNumber || Date.now()}`,
      type: 'sec_filing',
      severity,
      title: `SEC Filing: ${filing.type}`,
      message: `${filing.symbol || filing.companyName} filed a ${filing.type} with the SEC.`,
      timestamp: filing.filedAt,
      acknowledged: false,
      filing,
      suggestedAction,
    };
  }

  /**
   * Get suggested action for filing type
   */
  private getSuggestedAction(filingType: string): string {
    const actions: Record<string, string> = {
      '8-K': 'Review material event disclosure for potential portfolio impact. Common triggers: earnings, management changes, M&A, material agreements.',
      '10-K': 'Review annual report for financial performance, risk factors, and forward guidance. Key sections: MD&A, financial statements, risk factors.',
      '10-Q': 'Check quarterly results against expectations. Review revenue trends, margin changes, and updated guidance.',
      '4': 'Insider transaction detected. Large purchases may signal confidence; sales could be routine or concerning depending on context.',
      'SC 13D': 'Activist investor filing - potential for corporate changes, board challenges, or strategic alternatives.',
      'SC 13G': 'Large institutional position change noted. Monitor for follow-up 13D if position becomes active.',
      '13F-HR': 'Review institutional holdings changes from major funds.',
      'DEF 14A': 'Review proxy for upcoming shareholder votes, executive compensation, and board nominees.',
      'S-1': 'New securities registration - potential dilution. Review offering size and use of proceeds.',
      'S-3': 'Shelf registration filed - company has ability to issue securities in the future.',
      'NT 10-K': 'Late annual report notification - RED FLAG. Investigate reason for delay.',
      'NT 10-Q': 'Late quarterly report notification - may indicate accounting issues or material events.',
    };

    return actions[filingType] || 'Review filing for potential portfolio impact.';
  }

  /**
   * Get filing type description
   */
  static getFilingTypeDescription(type: string): string {
    const descriptions: Record<string, string> = {
      '8-K': 'Current Report (Material Events)',
      '10-K': 'Annual Report',
      '10-Q': 'Quarterly Report',
      '4': 'Insider Transaction',
      'SC 13D': 'Beneficial Ownership (>5%, Active)',
      'SC 13G': 'Beneficial Ownership (>5%, Passive)',
      '13F-HR': 'Institutional Holdings',
      'DEF 14A': 'Proxy Statement',
      'S-1': 'Registration Statement (IPO)',
      'S-3': 'Shelf Registration',
      '424B4': 'Prospectus',
      '424B5': 'Prospectus Supplement',
      '6-K': 'Foreign Issuer Report',
      '20-F': 'Foreign Annual Report',
      'NT 10-K': 'Late Filing Notification (Annual)',
      'NT 10-Q': 'Late Filing Notification (Quarterly)',
    };

    return descriptions[type] || type;
  }

  /**
   * Get filing severity
   */
  static getFilingSeverity(type: string): 'critical' | 'high' | 'medium' | 'low' {
    return FILING_SEVERITY[type] || 'low';
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

// Export singleton instance
export const edgarMonitor = new EdgarMonitor();

// Export utility functions
export { IMPORTANT_FILING_TYPES, FILING_SEVERITY };
