/**
 * SEC EDGAR Filings API
 *
 * Endpoints for fetching SEC filings for portfolio symbols.
 *
 * GET /api/v1/sec/filings?symbols=AAPL,MSFT - Get recent filings for symbols
 * GET /api/v1/sec/filings/recent - Get all recent filings (last 24h)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';

// ============================================================================
// TYPES
// ============================================================================

interface SECFiling {
  id: string;
  type: string;
  title: string;
  accessionNumber: string;
  filedAt: string;
  url: string;
  cik: string;
  symbol?: string;
  companyName: string;
  description: string;
  formUrl?: string;
}

interface FilingAlert {
  id: string;
  type: 'sec_filing';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  message: string;
  timestamp: string;
  acknowledged: boolean;
  filing: SECFiling;
  suggestedAction: string;
  typeDescription: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SEC_BASE_URL = 'https://www.sec.gov';
const SEC_DATA_URL = 'https://data.sec.gov';
const USER_AGENT = 'Frontier-Alpha/1.0 (https://frontier-alpha.com; contact@frontier-alpha.com)';

// Filing type severity mapping
const FILING_SEVERITY: Record<string, 'critical' | 'high' | 'medium' | 'low'> = {
  '8-K': 'high',
  '8-K/A': 'high',
  '10-K': 'high',
  '10-K/A': 'high',
  '10-Q': 'medium',
  '10-Q/A': 'medium',
  '4': 'medium',
  '4/A': 'medium',
  'SC 13D': 'high',
  'SC 13D/A': 'high',
  'SC 13G': 'medium',
  'SC 13G/A': 'medium',
  '13F-HR': 'low',
  '13F-HR/A': 'low',
  'DEF 14A': 'medium',
  'DEFA14A': 'medium',
  'S-1': 'high',
  'S-1/A': 'high',
  'S-3': 'medium',
  'NT 10-K': 'critical',
  'NT 10-Q': 'high',
};

// Filing type descriptions
const FILING_DESCRIPTIONS: Record<string, string> = {
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
  'NT 10-K': 'Late Filing Notification (Annual)',
  'NT 10-Q': 'Late Filing Notification (Quarterly)',
};

// Suggested actions by filing type
const SUGGESTED_ACTIONS: Record<string, string> = {
  '8-K': 'Review material event disclosure for potential portfolio impact.',
  '10-K': 'Review annual report for financial performance and forward guidance.',
  '10-Q': 'Check quarterly results against expectations.',
  '4': 'Note insider transaction - could signal sentiment about company.',
  'SC 13D': 'Activist investor filing - potential for corporate changes.',
  'SC 13G': 'Large institutional position change noted.',
  '13F-HR': 'Review institutional holdings changes.',
  'DEF 14A': 'Review proxy for upcoming shareholder votes.',
  'S-1': 'New securities registration - potential dilution.',
  'NT 10-K': 'URGENT: Late annual report - investigate reason for delay.',
  'NT 10-Q': 'Late quarterly report - may indicate issues.',
};

// ============================================================================
// CIK MAPPING CACHE
// ============================================================================

let tickerToCikCache: Map<string, string> = new Map();
let cikToTickerCache: Map<string, string> = new Map();
let cikToNameCache: Map<string, string> = new Map();
let cacheLastUpdated: Date | null = null;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Popular company CIKs as fallback
const FALLBACK_MAPPINGS: Record<string, { cik: string; name: string }> = {
  AAPL: { cik: '320193', name: 'Apple Inc.' },
  MSFT: { cik: '789019', name: 'Microsoft Corporation' },
  NVDA: { cik: '1045810', name: 'NVIDIA Corporation' },
  GOOGL: { cik: '1652044', name: 'Alphabet Inc.' },
  GOOG: { cik: '1652044', name: 'Alphabet Inc.' },
  AMZN: { cik: '1018724', name: 'Amazon.com, Inc.' },
  META: { cik: '1326801', name: 'Meta Platforms, Inc.' },
  TSLA: { cik: '1318605', name: 'Tesla, Inc.' },
  'BRK.B': { cik: '1067983', name: 'Berkshire Hathaway Inc.' },
  JPM: { cik: '51143', name: 'JPMorgan Chase & Co.' },
  BAC: { cik: '70858', name: 'Bank of America Corporation' },
  JNJ: { cik: '200406', name: 'Johnson & Johnson' },
  UNH: { cik: '731766', name: 'UnitedHealth Group Incorporated' },
  V: { cik: '1403161', name: 'Visa Inc.' },
  WMT: { cik: '104169', name: 'Walmart Inc.' },
  PG: { cik: '80424', name: 'Procter & Gamble Company' },
  HD: { cik: '354950', name: 'Home Depot, Inc.' },
  MA: { cik: '1141391', name: 'Mastercard Incorporated' },
  DIS: { cik: '1744489', name: 'Walt Disney Company' },
  NFLX: { cik: '1065280', name: 'Netflix, Inc.' },
  ABBV: { cik: '1800', name: 'AbbVie Inc.' },
  AVGO: { cik: '1551152', name: 'Broadcom Inc.' },
  CRM: { cik: '858877', name: 'Salesforce, Inc.' },
  XOM: { cik: '320187', name: 'Exxon Mobil Corporation' },
  CVX: { cik: '93410', name: 'Chevron Corporation' },
  PFE: { cik: '78003', name: 'Pfizer Inc.' },
  KO: { cik: '21344', name: 'Coca-Cola Company' },
  PEP: { cik: '66740', name: 'PepsiCo, Inc.' },
  COST: { cik: '732712', name: 'Costco Wholesale Corporation' },
  ADBE: { cik: '1613103', name: 'Adobe Inc.' },
  AMD: { cik: '1467373', name: 'Advanced Micro Devices, Inc.' },
  INTC: { cik: '909832', name: 'Intel Corporation' },
  UBER: { cik: '1326380', name: 'Uber Technologies, Inc.' },
  ABNB: { cik: '1559720', name: 'Airbnb, Inc.' },
  PLTR: { cik: '1792789', name: 'Palantir Technologies Inc.' },
  COIN: { cik: '1834518', name: 'Coinbase Global, Inc.' },
  SQ: { cik: '1512673', name: 'Block, Inc.' },
  SHOP: { cik: '1594805', name: 'Shopify Inc.' },
  SNOW: { cik: '1640147', name: 'Snowflake Inc.' },
  DDOG: { cik: '1784291', name: 'Datadog, Inc.' },
  ZM: { cik: '1585521', name: 'Zoom Video Communications, Inc.' },
  CRWD: { cik: '1535527', name: 'CrowdStrike Holdings, Inc.' },
};

/**
 * Load CIK mappings from SEC
 */
async function loadCIKMappings(): Promise<void> {
  if (cacheLastUpdated && Date.now() - cacheLastUpdated.getTime() < CACHE_TTL_MS) {
    return;
  }

  try {
    const response = await axios.get(`${SEC_DATA_URL}/company_tickers.json`, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
      timeout: 15000,
    });

    const data = response.data;
    tickerToCikCache = new Map();
    cikToTickerCache = new Map();
    cikToNameCache = new Map();

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
    console.log(`[SEC API] Loaded ${tickerToCikCache.size} CIK mappings`);
  } catch (error) {
    console.error('[SEC API] Failed to load CIK mappings:', error);
    // Load fallback mappings
    for (const [ticker, { cik, name }] of Object.entries(FALLBACK_MAPPINGS)) {
      tickerToCikCache.set(ticker, cik);
      cikToTickerCache.set(cik, ticker);
      cikToNameCache.set(cik, name);
    }
  }
}

/**
 * Get CIK for ticker
 */
async function getCIK(ticker: string): Promise<string | null> {
  await loadCIKMappings();
  const upperTicker = ticker.toUpperCase();

  // Check cache first
  if (tickerToCikCache.has(upperTicker)) {
    return tickerToCikCache.get(upperTicker) || null;
  }

  // Check fallback
  if (FALLBACK_MAPPINGS[upperTicker]) {
    return FALLBACK_MAPPINGS[upperTicker].cik;
  }

  return null;
}

// ============================================================================
// FILING FETCHER
// ============================================================================

/**
 * Fetch filings from SEC using their JSON API
 */
async function fetchFilingsFromSEC(
  cik: string,
  symbol: string,
  maxFilings: number = 20,
  maxDaysOld: number = 30
): Promise<FilingAlert[]> {
  const alerts: FilingAlert[] = [];

  try {
    const normalizedCIK = cik.padStart(10, '0');
    const url = `${SEC_DATA_URL}/submissions/CIK${normalizedCIK}.json`;

    const response = await axios.get(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
      timeout: 15000,
    });

    const data = response.data;
    const companyName = data.name || symbol;
    const recentFilings = data.filings?.recent || {};
    const forms = recentFilings.form || [];
    const filingDates = recentFilings.filingDate || [];
    const accessionNumbers = recentFilings.accessionNumber || [];
    const primaryDocuments = recentFilings.primaryDocument || [];

    const cutoffDate = new Date(Date.now() - maxDaysOld * 24 * 60 * 60 * 1000);
    let count = 0;

    for (let i = 0; i < forms.length && count < maxFilings; i++) {
      const filingType = forms[i];
      const filingDate = filingDates[i];
      const accessionNumber = accessionNumbers[i];
      const primaryDoc = primaryDocuments[i];

      const filedAt = new Date(filingDate);
      if (filedAt < cutoffDate) continue;

      const severity = FILING_SEVERITY[filingType] || 'low';
      const formattedAccession = accessionNumber.replace(/-/g, '');
      const filingUrl = `${SEC_BASE_URL}/Archives/edgar/data/${cik}/${formattedAccession}/${primaryDoc}`;
      const formUrl = `${SEC_BASE_URL}/Archives/edgar/data/${cik}/${formattedAccession}`;

      alerts.push({
        id: `sec-${symbol}-${accessionNumber}`,
        type: 'sec_filing',
        severity,
        title: `SEC Filing: ${filingType}`,
        message: `${symbol} (${companyName}) filed a ${filingType} with the SEC on ${filingDate}.`,
        timestamp: filedAt.toISOString(),
        acknowledged: false,
        filing: {
          id: accessionNumber,
          type: filingType,
          title: `${filingType} - ${companyName}`,
          accessionNumber,
          filedAt: filedAt.toISOString(),
          url: filingUrl,
          cik,
          symbol,
          companyName,
          description: FILING_DESCRIPTIONS[filingType] || filingType,
          formUrl,
        },
        suggestedAction: SUGGESTED_ACTIONS[filingType] || 'Review filing for potential portfolio impact.',
        typeDescription: FILING_DESCRIPTIONS[filingType] || filingType,
      });

      count++;
    }
  } catch (error) {
    console.error(`[SEC API] Error fetching filings for ${symbol}:`, error);
  }

  return alerts;
}

/**
 * Fetch recent filings from RSS feed
 */
async function fetchRecentFilingsFromRSS(hoursBack: number = 24): Promise<FilingAlert[]> {
  const alerts: FilingAlert[] = [];

  try {
    const url = `${SEC_BASE_URL}/cgi-bin/browse-edgar?action=getcurrent&output=atom&count=100`;

    const response = await axios.get(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/atom+xml',
      },
      timeout: 15000,
    });

    const xml = response.data;
    const cutoffTime = Date.now() - hoursBack * 60 * 60 * 1000;

    // Parse Atom feed
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let match;

    while ((match = entryRegex.exec(xml)) !== null) {
      const entry = match[1];

      const titleMatch = entry.match(/<title[^>]*>([^<]+)<\/title>/);
      const linkMatch = entry.match(/<link[^>]*href="([^"]+)"/);
      const updatedMatch = entry.match(/<updated>([^<]+)<\/updated>/);
      const idMatch = entry.match(/<id>([^<]+)<\/id>/);

      if (titleMatch && linkMatch && updatedMatch) {
        const title = decodeXmlEntities(titleMatch[1]);
        const url = linkMatch[1];
        const filedAt = new Date(updatedMatch[1]);

        // Skip if older than cutoff
        if (filedAt.getTime() < cutoffTime) continue;

        // Parse filing type
        const typeMatch = title.match(/^([A-Z0-9-/]+(?:\/A)?)\s*-/);
        const filingType = typeMatch ? typeMatch[1].trim() : 'UNKNOWN';

        // Extract company name
        const companyMatch = title.match(/-\s*(.+?)\s*\(/);
        const companyName = companyMatch ? companyMatch[1].trim() : 'Unknown Company';

        // Extract CIK
        let cik = '';
        const cikFromTitle = title.match(/\((\d{10})\)/);
        if (cikFromTitle) {
          cik = cikFromTitle[1].replace(/^0+/, '');
        }

        // Get ticker symbol
        const symbol = cik ? cikToTickerCache.get(cik) : undefined;

        // Extract accession number
        const accessionMatch = url.match(/(\d{10}-\d{2}-\d{6})/);
        const accessionNumber = accessionMatch ? accessionMatch[1] : '';

        const severity = FILING_SEVERITY[filingType] || 'low';

        alerts.push({
          id: idMatch ? idMatch[1] : `sec-${cik}-${Date.now()}`,
          type: 'sec_filing',
          severity,
          title: `SEC Filing: ${filingType}`,
          message: `${symbol || companyName} filed a ${filingType} with the SEC.`,
          timestamp: filedAt.toISOString(),
          acknowledged: false,
          filing: {
            id: accessionNumber,
            type: filingType,
            title,
            accessionNumber,
            filedAt: filedAt.toISOString(),
            url,
            cik,
            symbol,
            companyName,
            description: FILING_DESCRIPTIONS[filingType] || filingType,
          },
          suggestedAction: SUGGESTED_ACTIONS[filingType] || 'Review filing for potential portfolio impact.',
          typeDescription: FILING_DESCRIPTIONS[filingType] || filingType,
        });
      }
    }
  } catch (error) {
    console.error('[SEC API] Error fetching recent filings:', error);
  }

  return alerts;
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

// ============================================================================
// API HANDLER
// ============================================================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const requestId = `req-${Math.random().toString(36).slice(2, 8)}`;

  try {
    // Load CIK mappings
    await loadCIKMappings();

    if (req.method === 'GET') {
      const symbolsParam = req.query.symbols as string;
      const recent = req.query.recent as string;
      const maxDays = parseInt(req.query.days as string) || 30;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

      // GET /api/v1/sec/filings/recent - Get all recent filings
      if (recent === 'true' || req.url?.includes('/recent')) {
        const hoursBack = parseInt(req.query.hours as string) || 24;
        const alerts = await fetchRecentFilingsFromRSS(hoursBack);

        return res.status(200).json({
          success: true,
          data: {
            filings: alerts.slice(0, limit),
            summary: {
              total: alerts.length,
              critical: alerts.filter(a => a.severity === 'critical').length,
              high: alerts.filter(a => a.severity === 'high').length,
              medium: alerts.filter(a => a.severity === 'medium').length,
              low: alerts.filter(a => a.severity === 'low').length,
            },
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId,
            hoursBack,
          },
        });
      }

      // GET /api/v1/sec/filings?symbols=AAPL,MSFT
      const symbols = symbolsParam
        ? symbolsParam.split(',').map(s => s.trim().toUpperCase())
        : ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN']; // Default watchlist

      const allAlerts: FilingAlert[] = [];

      for (const symbol of symbols.slice(0, 20)) {
        const cik = await getCIK(symbol);
        if (!cik) {
          console.warn(`[SEC API] No CIK found for ${symbol}`);
          continue;
        }

        const alerts = await fetchFilingsFromSEC(cik, symbol, 15, maxDays);
        allAlerts.push(...alerts);

        // Rate limit
        await new Promise(resolve => setTimeout(resolve, 120));
      }

      // Sort by date descending
      allAlerts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Calculate summary
      const summary = {
        total: allAlerts.length,
        critical: allAlerts.filter(a => a.severity === 'critical').length,
        high: allAlerts.filter(a => a.severity === 'high').length,
        medium: allAlerts.filter(a => a.severity === 'medium').length,
        low: allAlerts.filter(a => a.severity === 'low').length,
        byType: {} as Record<string, number>,
        bySymbol: {} as Record<string, number>,
      };

      // Count by type and symbol
      for (const alert of allAlerts) {
        const type = alert.filing.type;
        const symbol = alert.filing.symbol || 'UNKNOWN';
        summary.byType[type] = (summary.byType[type] || 0) + 1;
        summary.bySymbol[symbol] = (summary.bySymbol[symbol] || 0) + 1;
      }

      return res.status(200).json({
        success: true,
        data: {
          filings: allAlerts.slice(0, limit),
          summary,
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
          symbols,
          daysBack: maxDays,
        },
      });
    }

    if (req.method === 'POST') {
      const { symbols, maxDays = 30 } = req.body as {
        symbols: string[];
        maxDays?: number;
      };

      if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'symbols array is required',
          meta: { requestId },
        });
      }

      const allAlerts: FilingAlert[] = [];

      for (const symbol of symbols.slice(0, 20)) {
        const cik = await getCIK(symbol.toUpperCase());
        if (!cik) continue;

        const alerts = await fetchFilingsFromSEC(cik, symbol.toUpperCase(), 15, maxDays);
        allAlerts.push(...alerts);

        await new Promise(resolve => setTimeout(resolve, 120));
      }

      allAlerts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      return res.status(200).json({
        success: true,
        data: {
          filings: allAlerts,
          summary: {
            total: allAlerts.length,
            critical: allAlerts.filter(a => a.severity === 'critical').length,
            high: allAlerts.filter(a => a.severity === 'high').length,
            medium: allAlerts.filter(a => a.severity === 'medium').length,
            low: allAlerts.filter(a => a.severity === 'low').length,
          },
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
        },
      });
    }

    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
      meta: { requestId },
    });
  } catch (error) {
    console.error('[SEC API] Handler error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      meta: { requestId },
    });
  }
}
