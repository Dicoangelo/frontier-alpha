/**
 * SEC EDGAR Filing Monitor
 *
 * Monitors SEC filings for portfolio companies and generates alerts
 * for significant filings (10-K, 10-Q, 8-K, etc.)
 */

import axios from 'axios';
import { logger } from '../lib/logger.js';

interface SECFiling {
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
  size?: number;
}

interface FilingAlert {
  id: string;
  type: 'sec_filing';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  message: string;
  timestamp: Date;
  acknowledged: boolean;
  filing: SECFiling;
  suggestedAction: string;
}

// SEC filing type importance
const FILING_SEVERITY: Record<string, 'critical' | 'high' | 'medium' | 'low'> = {
  '8-K': 'high',      // Material events
  '10-K': 'high',     // Annual report
  '10-Q': 'medium',   // Quarterly report
  '4': 'medium',      // Insider transactions
  'SC 13D': 'high',   // Beneficial ownership > 5%
  'SC 13G': 'medium', // Beneficial ownership (passive)
  '13F-HR': 'low',    // Institutional holdings
  'DEF 14A': 'medium', // Proxy statement
  'S-1': 'high',      // IPO registration
  'S-3': 'medium',    // Shelf registration
  '424B4': 'medium',  // Prospectus
  '6-K': 'low',       // Foreign issuer reports
};

// CIK to ticker mapping (popular stocks)
const CIK_TICKER_MAP: Record<string, string> = {
  '320193': 'AAPL',
  '789019': 'MSFT',
  '1045810': 'NVDA',
  '1652044': 'GOOGL',
  '1018724': 'AMZN',
  '1326801': 'META',
  '1318605': 'TSLA',
  '1067983': 'BRK.B',
  '51143': 'JPM',
  '70858': 'BAC',
};

export class SECFilingMonitor {
  private baseUrl = 'https://www.sec.gov';
  private userAgent = 'Frontier-Alpha contact@frontier-alpha.com';
  private lastCheckedFilings = new Map<string, Date>();
  private alertHistory: FilingAlert[] = [];

  /**
   * Fetch recent filings for a given CIK
   */
  async fetchFilingsForCIK(cik: string): Promise<SECFiling[]> {
    try {
      // Normalize CIK to 10 digits
      const normalizedCIK = cik.padStart(10, '0');

      // Use SEC's submissions endpoint (JSON)
      const url = `${this.baseUrl}/cgi-bin/browse-edgar?action=getcompany&CIK=${normalizedCIK}&type=&dateb=&owner=include&count=20&output=atom`;

      const response = await axios.get(url, {
        headers: {
          'User-Agent': this.userAgent,
          Accept: 'application/atom+xml',
        },
        timeout: 10000,
      });

      return this.parseAtomFeed(response.data, cik);
    } catch (error) {
      logger.error({ err: error, cik }, 'SECFilingMonitor error fetching filings');
      return [];
    }
  }

  /**
   * Fetch filings for a ticker symbol
   */
  async fetchFilingsForSymbol(symbol: string): Promise<SECFiling[]> {
    const cik = await this.getCIKForSymbol(symbol);
    if (!cik) {
      logger.warn({ symbol }, 'SECFilingMonitor could not find CIK for symbol');
      return [];
    }

    const filings = await this.fetchFilingsForCIK(cik);
    return filings.map((f) => ({ ...f, symbol }));
  }

  /**
   * Check for new filings for a list of symbols
   */
  async checkForNewFilings(symbols: string[]): Promise<FilingAlert[]> {
    const alerts: FilingAlert[] = [];

    for (const symbol of symbols) {
      try {
        const filings = await this.fetchFilingsForSymbol(symbol);
        const newFilings = this.filterNewFilings(symbol, filings);

        for (const filing of newFilings) {
          const alert = this.createAlert(filing);
          alerts.push(alert);
          this.alertHistory.push(alert);
        }

        // Rate limit: SEC allows 10 requests/second
        await this.delay(150);
      } catch (error) {
        logger.error({ err: error, symbol }, 'SECFilingMonitor error checking symbol');
      }
    }

    // Keep only last 100 alerts
    if (this.alertHistory.length > 100) {
      this.alertHistory = this.alertHistory.slice(-100);
    }

    return alerts;
  }

  /**
   * Get CIK for a ticker symbol
   */
  private async getCIKForSymbol(symbol: string): Promise<string | null> {
    // Check local map first
    for (const [cik, ticker] of Object.entries(CIK_TICKER_MAP)) {
      if (ticker === symbol.toUpperCase()) {
        return cik;
      }
    }

    try {
      // Query SEC's company search
      const searchUrl = `${this.baseUrl}/cgi-bin/browse-edgar?company=${symbol}&CIK=&type=&owner=include&count=10&action=getcompany&output=atom`;

      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': this.userAgent,
          Accept: 'application/atom+xml',
        },
        timeout: 10000,
      });

      // Parse CIK from response
      const cikMatch = response.data.match(/CIK=(\d{10})/);
      if (cikMatch) {
        return cikMatch[1].replace(/^0+/, ''); // Remove leading zeros
      }

      return null;
    } catch (error) {
      logger.error({ err: error, symbol }, 'SECFilingMonitor error getting CIK');
      return null;
    }
  }

  /**
   * Parse Atom feed from SEC EDGAR
   */
  private parseAtomFeed(xml: string, cik: string): SECFiling[] {
    const filings: SECFiling[] = [];

    try {
      // Extract entries from Atom feed
      const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
      let match;

      while ((match = entryRegex.exec(xml)) !== null) {
        const entry = match[1];

        const titleMatch = entry.match(/<title>([^<]+)<\/title>/);
        const linkMatch = entry.match(/<link[^>]*href="([^"]+)"/);
        const updatedMatch = entry.match(/<updated>([^<]+)<\/updated>/);
        const summaryMatch = entry.match(/<summary[^>]*>([^<]+)<\/summary>/);
        const idMatch = entry.match(/<id>([^<]+)<\/id>/);

        if (titleMatch && linkMatch && updatedMatch) {
          const title = titleMatch[1];
          const typeMatch = title.match(/^([A-Z0-9-/]+)/);
          const filingType = typeMatch ? typeMatch[1] : 'UNKNOWN';

          // Extract accession number from link
          const accessionMatch = linkMatch[1].match(/(\d{10}-\d{2}-\d{6})/);
          const accessionNumber = accessionMatch ? accessionMatch[1] : '';

          // Extract company name from title
          const companyMatch = title.match(/ - (.+)$/);
          const companyName = companyMatch ? companyMatch[1] : 'Unknown Company';

          filings.push({
            id: idMatch ? idMatch[1] : `${cik}-${Date.now()}`,
            type: filingType,
            title: title,
            accessionNumber,
            filedAt: new Date(updatedMatch[1]),
            url: linkMatch[1],
            cik,
            companyName,
            description: summaryMatch ? summaryMatch[1] : '',
          });
        }
      }
    } catch (error) {
      logger.error({ err: error }, 'SECFilingMonitor error parsing Atom feed');
    }

    return filings;
  }

  /**
   * Filter for new filings since last check
   */
  private filterNewFilings(symbol: string, filings: SECFiling[]): SECFiling[] {
    const lastChecked = this.lastCheckedFilings.get(symbol) || new Date(0);
    const newFilings = filings.filter((f) => f.filedAt > lastChecked);

    if (filings.length > 0) {
      const mostRecent = filings.reduce((latest, f) =>
        f.filedAt > latest.filedAt ? f : latest
      );
      this.lastCheckedFilings.set(symbol, mostRecent.filedAt);
    }

    return newFilings;
  }

  /**
   * Create alert from filing
   */
  private createAlert(filing: SECFiling): FilingAlert {
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

  /**
   * Get alert history
   */
  getAlertHistory(limit: number = 20): FilingAlert[] {
    return this.alertHistory.slice(-limit);
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
      '6-K': 'Foreign Issuer Report',
    };

    return descriptions[type] || type;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const secFilingMonitor = new SECFilingMonitor();
