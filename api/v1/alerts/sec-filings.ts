import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';

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
}

// SEC filing type importance
const FILING_SEVERITY: Record<string, 'critical' | 'high' | 'medium' | 'low'> = {
  '8-K': 'high',
  '10-K': 'high',
  '10-Q': 'medium',
  '4': 'medium',
  'SC 13D': 'high',
  'SC 13G': 'medium',
  '13F-HR': 'low',
  'DEF 14A': 'medium',
  'S-1': 'high',
};

// Popular company CIKs
const TICKER_CIK_MAP: Record<string, string> = {
  AAPL: '320193',
  MSFT: '789019',
  NVDA: '1045810',
  GOOGL: '1652044',
  GOOG: '1652044',
  AMZN: '1018724',
  META: '1326801',
  TSLA: '1318605',
  'BRK.B': '1067983',
  JPM: '51143',
  BAC: '70858',
  JNJ: '200406',
  UNH: '731766',
  V: '1403161',
  WMT: '104169',
  PG: '80424',
  HD: '354950',
  MA: '1141391',
  DIS: '1744489',
  NFLX: '1065280',
};

function getSuggestedAction(filingType: string): string {
  const actions: Record<string, string> = {
    '8-K': 'Review material event disclosure for potential portfolio impact.',
    '10-K': 'Review annual report for financial performance and forward guidance.',
    '10-Q': 'Check quarterly results against expectations.',
    '4': 'Note insider transaction - could signal sentiment about company.',
    'SC 13D': 'Activist investor filing - potential for corporate changes.',
    'SC 13G': 'Large institutional position change noted.',
    'DEF 14A': 'Review proxy for upcoming shareholder votes.',
    'S-1': 'New securities registration - potential dilution.',
  };
  return actions[filingType] || 'Review filing for potential portfolio impact.';
}

async function fetchSECFilings(symbols: string[]): Promise<FilingAlert[]> {
  const alerts: FilingAlert[] = [];
  const userAgent = 'Frontier-Alpha/1.0 (contact@frontier-alpha.com)';

  for (const symbol of symbols) {
    const cik = TICKER_CIK_MAP[symbol.toUpperCase()];
    if (!cik) continue;

    try {
      // Use SEC's newer JSON endpoint
      const url = `https://data.sec.gov/submissions/CIK${cik.padStart(10, '0')}.json`;

      const response = await axios.get(url, {
        headers: {
          'User-Agent': userAgent,
          Accept: 'application/json',
        },
        timeout: 10000,
      });

      const data = response.data;
      const recentFilings = data.filings?.recent || {};
      const forms = recentFilings.form || [];
      const filingDates = recentFilings.filingDate || [];
      const accessionNumbers = recentFilings.accessionNumber || [];
      const primaryDocuments = recentFilings.primaryDocument || [];

      // Get last 10 filings
      const count = Math.min(10, forms.length);

      for (let i = 0; i < count; i++) {
        const filingType = forms[i];
        const filingDate = filingDates[i];
        const accessionNumber = accessionNumbers[i];
        const primaryDoc = primaryDocuments[i];

        // Skip if filing is older than 30 days
        const filedAt = new Date(filingDate);
        const daysSinceFiling = (Date.now() - filedAt.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceFiling > 30) continue;

        const severity = FILING_SEVERITY[filingType] || 'low';
        const formattedAccession = accessionNumber.replace(/-/g, '');
        const filingUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${formattedAccession}/${primaryDoc}`;

        alerts.push({
          id: `sec-${symbol}-${accessionNumber}`,
          type: 'sec_filing',
          severity,
          title: `SEC Filing: ${filingType}`,
          message: `${symbol} (${data.name}) filed a ${filingType} with the SEC on ${filingDate}.`,
          timestamp: filedAt.toISOString(),
          acknowledged: false,
          filing: {
            id: accessionNumber,
            type: filingType,
            title: `${filingType} - ${data.name}`,
            accessionNumber,
            filedAt: filedAt.toISOString(),
            url: filingUrl,
            cik,
            symbol,
            companyName: data.name || symbol,
            description: `${filingType} filing for ${data.name}`,
          },
          suggestedAction: getSuggestedAction(filingType),
        });
      }

      // Rate limit: SEC allows 10 requests/second
      await new Promise((resolve) => setTimeout(resolve, 150));
    } catch (error) {
      console.error(`[SEC] Error fetching filings for ${symbol}:`, error);
    }
  }

  // Sort by date descending
  alerts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return alerts;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const requestId = `req-${Math.random().toString(36).slice(2, 8)}`;

  try {
    if (req.method === 'GET') {
      // Get symbols from query
      const symbolsParam = req.query.symbols as string;
      const symbols = symbolsParam
        ? symbolsParam.split(',').map((s) => s.trim().toUpperCase())
        : ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN']; // Default watchlist

      const alerts = await fetchSECFilings(symbols);

      return res.status(200).json({
        success: true,
        data: {
          alerts,
          summary: {
            total: alerts.length,
            critical: alerts.filter((a) => a.severity === 'critical').length,
            high: alerts.filter((a) => a.severity === 'high').length,
            medium: alerts.filter((a) => a.severity === 'medium').length,
            low: alerts.filter((a) => a.severity === 'low').length,
          },
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
          symbols,
        },
      });
    }

    if (req.method === 'POST') {
      // Check for new filings for specific symbols
      const { symbols } = req.body as { symbols: string[] };

      if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'symbols array is required',
          meta: { requestId },
        });
      }

      const alerts = await fetchSECFilings(symbols.slice(0, 20)); // Limit to 20 symbols

      return res.status(200).json({
        success: true,
        data: { alerts },
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
    console.error('SEC filings error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      meta: { requestId },
    });
  }
}
