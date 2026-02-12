/**
 * FRONTIER ALPHA - SEC Filings Parser
 * 
 * Parses SEC EDGAR filings for trading signals:
 * - 8-K: Material events (earnings, management changes, M&A)
 * - 10-Q: Quarterly reports (financials, risks, outlook)
 * - 10-K: Annual reports (comprehensive analysis)
 * - Form 4: Insider trading activity
 * 
 * Extracts key sections, calculates sentiment, identifies risk factors.
 */

import { SentimentAnalyzer } from '../sentiment/SentimentAnalyzer.js';

// ============================================================================
// TYPES
// ============================================================================

export type FilingType = '8-K' | '10-Q' | '10-K' | 'Form4' | '13F';

export interface SECFiling {
  accessionNumber: string;
  cik: string;
  ticker: string;
  companyName: string;
  filingType: FilingType;
  filingDate: Date;
  acceptanceTime: Date;
  url: string;
}

export interface FilingAnalysis {
  filing: SECFiling;
  sections: FilingSection[];
  sentiment: {
    overall: number;  // -1 to +1
    riskFactors: number;
    outlook: number;
    financials: number;
  };
  keyMetrics: KeyMetric[];
  riskFlags: RiskFlag[];
  insiderActivity?: InsiderActivity;
}

export interface FilingSection {
  name: string;
  content: string;
  sentiment: number;
  keywords: string[];
}

export interface KeyMetric {
  name: string;
  value: number;
  change?: number;
  unit: string;
}

export interface RiskFlag {
  type: 'legal' | 'financial' | 'operational' | 'regulatory' | 'competitive';
  severity: 'high' | 'medium' | 'low';
  description: string;
}

export interface InsiderActivity {
  transactions: InsiderTransaction[];
  netActivity: 'buying' | 'selling' | 'neutral';
  totalValue: number;
}

export interface InsiderTransaction {
  name: string;
  title: string;
  transactionType: 'buy' | 'sell' | 'exercise';
  shares: number;
  price: number;
  date: Date;
}

// ============================================================================
// SEC FILINGS PARSER
// ============================================================================

export class SECFilingsParser {
  private sentimentAnalyzer: SentimentAnalyzer;
  private baseUrl = 'https://www.sec.gov/cgi-bin/browse-edgar';
  private edgarUrl = 'https://data.sec.gov/submissions';

  constructor() {
    this.sentimentAnalyzer = new SentimentAnalyzer();
  }

  /**
   * Get recent filings for a ticker
   */
  async getRecentFilings(
    ticker: string,
    filingTypes: FilingType[] = ['8-K', '10-Q', '10-K'],
    limit: number = 10
  ): Promise<SECFiling[]> {
    // In production: Call SEC EDGAR API
    // Mock: Generate realistic filings
    
    const cik = this.tickerToCik(ticker);
    const filings: SECFiling[] = [];
    const now = new Date();

    for (let i = 0; i < limit; i++) {
      const type = filingTypes[i % filingTypes.length];
      const daysAgo = i * 30 + Math.floor(Math.random() * 15);
      const filingDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);

      filings.push({
        accessionNumber: `0001234567-${String(now.getFullYear()).slice(-2)}-${String(i).padStart(6, '0')}`,
        cik,
        ticker,
        companyName: this.tickerToName(ticker),
        filingType: type,
        filingDate,
        acceptanceTime: new Date(filingDate.getTime() + 60 * 60 * 1000),
        url: `https://www.sec.gov/Archives/edgar/data/${cik}/...`,
      });
    }

    return filings;
  }

  /**
   * Analyze a filing for trading signals
   */
  async analyzeFiling(filing: SECFiling): Promise<FilingAnalysis> {
    // In production: Fetch and parse actual filing
    // Mock: Generate analysis based on filing type

    const sections = await this.extractSections(filing);
    const sentiment = await this.calculateSentiment(sections);
    const keyMetrics = this.extractKeyMetrics(filing);
    const riskFlags = this.identifyRiskFlags(sections);

    let insiderActivity: InsiderActivity | undefined;
    if (filing.filingType === 'Form4') {
      insiderActivity = this.parseForm4(filing);
    }

    return {
      filing,
      sections,
      sentiment,
      keyMetrics,
      riskFlags,
      insiderActivity,
    };
  }

  /**
   * Get insider trading summary for a ticker
   */
  async getInsiderActivity(
    ticker: string,
    days: number = 90
  ): Promise<InsiderActivity> {
    // Mock insider transactions
    const transactions: InsiderTransaction[] = [];
    const now = Date.now();

    const insiders = [
      { name: 'John Smith', title: 'CEO' },
      { name: 'Jane Doe', title: 'CFO' },
      { name: 'Bob Johnson', title: 'Director' },
      { name: 'Alice Williams', title: 'VP Sales' },
    ];

    for (let i = 0; i < 5; i++) {
      const insider = insiders[Math.floor(Math.random() * insiders.length)];
      const isBuy = Math.random() > 0.4;  // 60% sells (typical)
      const shares = Math.floor(1000 + Math.random() * 50000);
      const price = 50 + Math.random() * 200;

      transactions.push({
        name: insider.name,
        title: insider.title,
        transactionType: isBuy ? 'buy' : 'sell',
        shares,
        price,
        date: new Date(now - Math.random() * days * 24 * 60 * 60 * 1000),
      });
    }

    // Calculate net activity
    let netBuys = 0;
    let netSells = 0;

    for (const t of transactions) {
      if (t.transactionType === 'buy') {
        netBuys += t.shares * t.price;
      } else {
        netSells += t.shares * t.price;
      }
    }

    const netActivity = netBuys > netSells * 1.2 ? 'buying' :
                       netSells > netBuys * 1.2 ? 'selling' : 'neutral';

    return {
      transactions: transactions.sort((a, b) => b.date.getTime() - a.date.getTime()),
      netActivity,
      totalValue: Math.abs(netBuys - netSells),
    };
  }

  /**
   * Monitor filings in real-time
   */
  async monitorFilings(
    tickers: string[],
    onFiling: (analysis: FilingAnalysis) => void
  ): Promise<() => void> {
    // In production: Poll SEC EDGAR or use RSS feed
    // Mock: Simulate occasional filings

    const interval = setInterval(async () => {
      // 10% chance of new filing each minute
      if (Math.random() > 0.1) return;

      const ticker = tickers[Math.floor(Math.random() * tickers.length)];
      const types: FilingType[] = ['8-K', '10-Q', 'Form4'];
      const type = types[Math.floor(Math.random() * types.length)];

      const filing: SECFiling = {
        accessionNumber: `0001234567-${Date.now()}`,
        cik: this.tickerToCik(ticker),
        ticker,
        companyName: this.tickerToName(ticker),
        filingType: type,
        filingDate: new Date(),
        acceptanceTime: new Date(),
        url: 'https://www.sec.gov/...',
      };

      const analysis = await this.analyzeFiling(filing);
      onFiling(analysis);
    }, 60000);  // Check every minute

    return () => clearInterval(interval);
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async extractSections(filing: SECFiling): Promise<FilingSection[]> {
    // Mock section extraction based on filing type
    const sections: FilingSection[] = [];

    if (filing.filingType === '8-K') {
      sections.push(
        {
          name: 'Results of Operations',
          content: 'The Company reported quarterly revenue of $XX billion, representing YY% growth year-over-year.',
          sentiment: 0.3 + Math.random() * 0.4,
          keywords: ['revenue', 'growth', 'operating income'],
        },
        {
          name: 'Financial Statements',
          content: 'Net income increased by XX% compared to the prior year period.',
          sentiment: 0.2 + Math.random() * 0.3,
          keywords: ['net income', 'earnings', 'profit'],
        }
      );
    } else if (filing.filingType === '10-Q' || filing.filingType === '10-K') {
      sections.push(
        {
          name: 'Risk Factors',
          content: 'The Company faces risks related to market competition, regulatory changes, and economic uncertainty.',
          sentiment: -0.2 - Math.random() * 0.3,
          keywords: ['risk', 'competition', 'regulatory', 'uncertainty'],
        },
        {
          name: 'Management Discussion',
          content: 'Management believes the Company is well-positioned for continued growth in the coming quarters.',
          sentiment: 0.2 + Math.random() * 0.4,
          keywords: ['growth', 'opportunity', 'positioned'],
        },
        {
          name: 'Business Overview',
          content: 'The Company continued to expand its market share through innovation and strategic partnerships.',
          sentiment: 0.3 + Math.random() * 0.2,
          keywords: ['expansion', 'innovation', 'partnership'],
        }
      );
    }

    return sections;
  }

  private async calculateSentiment(sections: FilingSection[]): Promise<{
    overall: number;
    riskFactors: number;
    outlook: number;
    financials: number;
  }> {
    let overall = 0;
    let riskFactors = 0;
    let outlook = 0;
    let financials = 0;

    for (const section of sections) {
      overall += section.sentiment;

      if (section.name.toLowerCase().includes('risk')) {
        riskFactors = section.sentiment;
      } else if (section.name.toLowerCase().includes('management') || 
                 section.name.toLowerCase().includes('outlook')) {
        outlook = section.sentiment;
      } else if (section.name.toLowerCase().includes('financial') ||
                 section.name.toLowerCase().includes('results')) {
        financials = section.sentiment;
      }
    }

    return {
      overall: sections.length > 0 ? overall / sections.length : 0,
      riskFactors,
      outlook,
      financials,
    };
  }

  private extractKeyMetrics(_filing: SECFiling): KeyMetric[] {
    // Mock key metric extraction
    return [
      { name: 'Revenue', value: 10.5 + Math.random() * 5, change: 0.08 + Math.random() * 0.1, unit: 'B$' },
      { name: 'EPS', value: 1.2 + Math.random() * 0.5, change: 0.05 + Math.random() * 0.15, unit: '$' },
      { name: 'Gross Margin', value: 0.35 + Math.random() * 0.15, change: 0.01 * (Math.random() - 0.5), unit: '%' },
      { name: 'Operating Cash Flow', value: 2 + Math.random() * 3, change: 0.1 + Math.random() * 0.2, unit: 'B$' },
    ];
  }

  private identifyRiskFlags(sections: FilingSection[]): RiskFlag[] {
    const flags: RiskFlag[] = [];

    for (const section of sections) {
      const content = section.content.toLowerCase();

      if (content.includes('lawsuit') || content.includes('litigation')) {
        flags.push({
          type: 'legal',
          severity: 'medium',
          description: 'Ongoing or potential legal proceedings mentioned',
        });
      }

      if (content.includes('investigation') || content.includes('regulatory')) {
        flags.push({
          type: 'regulatory',
          severity: 'high',
          description: 'Regulatory investigation or compliance concerns',
        });
      }

      if (content.includes('restructuring') || content.includes('layoff')) {
        flags.push({
          type: 'operational',
          severity: 'medium',
          description: 'Corporate restructuring or workforce changes',
        });
      }

      if (content.includes('debt') && content.includes('increase')) {
        flags.push({
          type: 'financial',
          severity: 'medium',
          description: 'Increased debt levels noted',
        });
      }
    }

    return flags;
  }

  private parseForm4(filing: SECFiling): InsiderActivity {
    // Mock Form 4 parsing
    const isBuy = Math.random() > 0.6;
    const shares = Math.floor(5000 + Math.random() * 50000);
    const price = 50 + Math.random() * 200;

    return {
      transactions: [{
        name: 'Executive Officer',
        title: 'CEO',
        transactionType: isBuy ? 'buy' : 'sell',
        shares,
        price,
        date: filing.filingDate,
      }],
      netActivity: isBuy ? 'buying' : 'selling',
      totalValue: shares * price,
    };
  }

  private tickerToCik(ticker: string): string {
    // Mock CIK lookup
    const hash = ticker.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    return String(hash * 12345).padStart(10, '0');
  }

  private tickerToName(ticker: string): string {
    const names: Record<string, string> = {
      'AAPL': 'Apple Inc.',
      'NVDA': 'NVIDIA Corporation',
      'MSFT': 'Microsoft Corporation',
      'GOOGL': 'Alphabet Inc.',
      'AMZN': 'Amazon.com Inc.',
      'META': 'Meta Platforms Inc.',
      'TSLA': 'Tesla Inc.',
    };
    return names[ticker] || `${ticker} Corporation`;
  }

  /**
   * Generate filing alert message
   */
  formatAlert(analysis: FilingAnalysis): string {
    const { filing, sentiment, riskFlags, insiderActivity } = analysis;
    
    const sentimentIcon = sentiment.overall > 0.2 ? '📈' : 
                          sentiment.overall < -0.2 ? '📉' : '➡️';
    
    let alert = `📋 **New ${filing.filingType} Filing: ${filing.ticker}**\n`;
    alert += `${sentimentIcon} Overall Sentiment: ${(sentiment.overall * 100).toFixed(0)}%\n`;
    
    if (riskFlags.length > 0) {
      const highRisks = riskFlags.filter(r => r.severity === 'high');
      if (highRisks.length > 0) {
        alert += `⚠️ ${highRisks.length} high-severity risk flag(s) identified\n`;
      }
    }
    
    if (insiderActivity) {
      const icon = insiderActivity.netActivity === 'buying' ? '🟢' : 
                   insiderActivity.netActivity === 'selling' ? '🔴' : '⚪';
      alert += `${icon} Insider Activity: ${insiderActivity.netActivity.toUpperCase()}\n`;
    }
    
    alert += `\n[View Filing](${filing.url})`;
    
    return alert;
  }
}

export const secFilingsParser = new SECFilingsParser();
