/**
 * SEC EDGAR Integration Module
 *
 * Provides real-time SEC filing monitoring and alerts for portfolio companies.
 *
 * Features:
 * - RSS feed monitoring via EDGAR Atom feeds
 * - CIK to ticker symbol mapping with caching
 * - Filing type severity classification
 * - Alert generation for important filings
 *
 * Usage:
 * ```typescript
 * import { edgarMonitor, getCIKForTicker } from './sec';
 *
 * // Fetch filings for a symbol
 * const filings = await edgarMonitor.fetchFilingsForSymbol('AAPL');
 *
 * // Start polling for new filings
 * edgarMonitor.startPolling(['AAPL', 'MSFT', 'NVDA'], 5 * 60 * 1000);
 *
 * // Register callback for new filings
 * edgarMonitor.onFiling((alert) => {
 *   console.log('New filing:', alert);
 * });
 * ```
 */

// EDGAR RSS Monitor - primary implementation with full RSS feed support
export {
  EdgarMonitor,
  edgarMonitor,
  getCIKForTicker,
  getTickerForCIK,
  getCompanyNameForCIK,
  IMPORTANT_FILING_TYPES,
  FILING_SEVERITY,
  type EdgarFiling,
  type FilingAlert,
  type CIKMapping,
} from './EdgarMonitor.js';

// Legacy SEC Filing Monitor - kept for backward compatibility
export {
  SECFilingMonitor,
  secFilingMonitor,
} from './SECFilingMonitor.js';
