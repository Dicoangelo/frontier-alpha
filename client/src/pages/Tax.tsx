/**
 * Tax Optimization Dashboard
 *
 * Four-tab layout: Summary (YTD gains/losses, tax liability, harvesting savings),
 * Harvest (opportunities table with action buttons), Wash Sales (flagged violations
 * with explanation), Report (downloadable annual report in CSV/JSON).
 *
 * All data is mock — ready for API integration with TaxLotTracker, HarvestingScanner,
 * WashSaleDetector, and TaxReportGenerator backend services.
 */

import { useState, useMemo } from 'react';
import {
  Receipt,
  Scissors,
  AlertTriangle,
  FileText,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Download,
  Info,
  ChevronDown,
  ChevronUp,
  ArrowDownToLine,
} from 'lucide-react';
import { Card } from '@/components/shared/Card';
import { Button } from '@/components/shared/Button';

// ── Types ──────────────────────────────────────────────────────

type TaxTab = 'summary' | 'harvest' | 'wash_sales' | 'report';

interface TaxSummaryData {
  taxYear: number;
  shortTermGains: number;
  shortTermLosses: number;
  longTermGains: number;
  longTermLosses: number;
  netShortTerm: number;
  netLongTerm: number;
  totalRealizedGain: number;
  estimatedTaxLiability: number;
  harvestingSavings: number;
  washSaleAdjustment: number;
}

interface HarvestOpportunity {
  id: string;
  symbol: string;
  shares: number;
  costBasis: number;
  currentPrice: number;
  unrealizedLoss: number;
  estimatedTaxSavings: number;
  holdingPeriod: 'short_term' | 'long_term';
  replacements: string[];
}

interface WashSaleEntry {
  id: string;
  saleSymbol: string;
  saleDate: string;
  saleShares: number;
  saleLoss: number;
  replacementSymbol: string;
  replacementDate: string;
  replacementShares: number;
  disallowedLoss: number;
  matchType: 'same_ticker' | 'substantially_identical';
}

interface ReportRow {
  description: string;
  dateAcquired: string;
  dateSold: string;
  proceeds: number;
  costBasis: number;
  adjustmentCode: string;
  adjustmentAmount: number;
  gainOrLoss: number;
  isShortTerm: boolean;
  symbol: string;
}

// ── Mock Data ──────────────────────────────────────────────────

const MOCK_SUMMARY: TaxSummaryData = {
  taxYear: 2026,
  shortTermGains: 4280.50,
  shortTermLosses: -1520.30,
  longTermGains: 8640.20,
  longTermLosses: -3210.80,
  netShortTerm: 2760.20,
  netLongTerm: 5429.40,
  totalRealizedGain: 8189.60,
  estimatedTaxLiability: 2148.72,
  harvestingSavings: 1843.50,
  washSaleAdjustment: 320.40,
};

const MOCK_HARVEST_OPPORTUNITIES: HarvestOpportunity[] = [
  { id: 'h1', symbol: 'INTC', shares: 50, costBasis: 42.80, currentPrice: 28.15, unrealizedLoss: -732.50, estimatedTaxSavings: 307.65, holdingPeriod: 'short_term', replacements: ['AMD', 'AVGO', 'TXN'] },
  { id: 'h2', symbol: 'DIS', shares: 30, costBasis: 118.40, currentPrice: 94.20, unrealizedLoss: -726.00, estimatedTaxSavings: 290.40, holdingPeriod: 'long_term', replacements: ['NFLX', 'CMCSA', 'GOOGL'] },
  { id: 'h3', symbol: 'BA', shares: 15, costBasis: 248.60, currentPrice: 198.30, unrealizedLoss: -754.50, estimatedTaxSavings: 316.89, holdingPeriod: 'short_term', replacements: ['LMT', 'GE', 'RTX'] },
  { id: 'h4', symbol: 'PFE', shares: 100, costBasis: 34.20, currentPrice: 27.85, unrealizedLoss: -635.00, estimatedTaxSavings: 254.00, holdingPeriod: 'long_term', replacements: ['JNJ', 'MRK', 'ABBV'] },
  { id: 'h5', symbol: 'VZ', shares: 60, costBasis: 41.50, currentPrice: 35.80, unrealizedLoss: -342.00, estimatedTaxSavings: 143.64, holdingPeriod: 'long_term', replacements: ['T', 'TMUS', 'CMCSA'] },
];

const MOCK_WASH_SALES: WashSaleEntry[] = [
  { id: 'w1', saleSymbol: 'GOOGL', saleDate: '2026-01-15', saleShares: 10, saleLoss: -480.00, replacementSymbol: 'GOOGL', replacementDate: '2026-01-28', replacementShares: 10, disallowedLoss: 480.00, matchType: 'same_ticker' },
  { id: 'w2', saleSymbol: 'GOOG', saleDate: '2026-02-01', saleShares: 5, saleLoss: -215.00, replacementSymbol: 'GOOGL', replacementDate: '2026-02-08', replacementShares: 8, disallowedLoss: 215.00, matchType: 'substantially_identical' },
  { id: 'w3', saleSymbol: 'TSLA', saleDate: '2025-12-20', saleShares: 8, saleLoss: -640.00, replacementSymbol: 'TSLA', replacementDate: '2026-01-05', replacementShares: 8, disallowedLoss: 640.00, matchType: 'same_ticker' },
];

const MOCK_REPORT_ROWS: ReportRow[] = [
  { description: '50 shares AAPL', dateAcquired: '2025-03-15', dateSold: '2026-01-20', proceeds: 12250.00, costBasis: 9500.00, adjustmentCode: '', adjustmentAmount: 0, gainOrLoss: 2750.00, isShortTerm: false, symbol: 'AAPL' },
  { description: '30 shares MSFT', dateAcquired: '2025-06-10', dateSold: '2026-02-05', proceeds: 13200.00, costBasis: 11400.00, adjustmentCode: '', adjustmentAmount: 0, gainOrLoss: 1800.00, isShortTerm: false, symbol: 'MSFT' },
  { description: '25 shares NVDA', dateAcquired: '2025-11-01', dateSold: '2026-01-28', proceeds: 19375.00, costBasis: 17500.00, adjustmentCode: '', adjustmentAmount: 0, gainOrLoss: 1875.00, isShortTerm: true, symbol: 'NVDA' },
  { description: '10 shares GOOGL', dateAcquired: '2025-08-20', dateSold: '2026-01-15', proceeds: 1680.00, costBasis: 2160.00, adjustmentCode: 'W', adjustmentAmount: 480.00, gainOrLoss: 0, isShortTerm: true, symbol: 'GOOGL' },
  { description: '20 shares META', dateAcquired: '2025-09-05', dateSold: '2026-01-30', proceeds: 12800.00, costBasis: 11200.00, adjustmentCode: '', adjustmentAmount: 0, gainOrLoss: 1600.00, isShortTerm: true, symbol: 'META' },
  { description: '40 shares AMD', dateAcquired: '2025-04-12', dateSold: '2026-02-10', proceeds: 6200.00, costBasis: 7400.00, adjustmentCode: '', adjustmentAmount: 0, gainOrLoss: -1200.00, isShortTerm: false, symbol: 'AMD' },
];

// ── Helpers ────────────────────────────────────────────────────

function formatCurrency(value: number, showSign = false): string {
  const sign = showSign && value > 0 ? '+' : '';
  return `${sign}$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(isoDate: string): string {
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ── Metric Card ────────────────────────────────────────────────

function MetricCard({ label, value, subtext, color, icon: Icon }: {
  label: string;
  value: string;
  subtext?: string;
  color?: string;
  icon: typeof DollarSign;
}) {
  // Extract CSS variable for icon background
  const colorMatch = color?.match(/var\(([^)]+)\)/);
  const cssColor = colorMatch ? `var(${colorMatch[1]})` : 'var(--color-text-muted)';

  return (
    <div className="flex items-center gap-3 p-4 rounded-xl bg-[var(--color-bg-tertiary)] border border-[var(--color-border-light)] hover:shadow-lg transition-shadow duration-200">
      <div
        className="p-2.5 rounded-lg flex-shrink-0"
        style={{ backgroundColor: `color-mix(in srgb, ${cssColor} 12%, transparent)` }}
      >
        <Icon className="w-5 h-5" style={{ color: cssColor }} aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">{label}</p>
        <p className={`text-xl font-bold font-mono mt-0.5 ${color ?? 'text-[var(--color-text)]'}`}>{value}</p>
        {subtext && <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{subtext}</p>}
      </div>
    </div>
  );
}

// ── Summary Section ────────────────────────────────────────────

function SummarySection({ data }: { data: TaxSummaryData }) {
  return (
    <div className="space-y-6">
      {/* Top-line metrics */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in-up"
        style={{ animationDelay: '0ms', animationFillMode: 'both' }}
      >
        <MetricCard
          label="YTD Realized Gains"
          value={formatCurrency(data.totalRealizedGain, true)}
          subtext={`ST: ${formatCurrency(data.netShortTerm, true)} | LT: ${formatCurrency(data.netLongTerm, true)}`}
          color={data.totalRealizedGain >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}
          icon={data.totalRealizedGain >= 0 ? TrendingUp : TrendingDown}
        />
        <MetricCard
          label="Estimated Tax Liability"
          value={formatCurrency(data.estimatedTaxLiability)}
          subtext="Based on current federal + state rates"
          color="text-[var(--color-warning)]"
          icon={DollarSign}
        />
        <MetricCard
          label="Harvesting Savings"
          value={formatCurrency(data.harvestingSavings)}
          subtext={`${MOCK_HARVEST_OPPORTUNITIES.length} opportunities available`}
          color="text-[var(--color-accent)]"
          icon={Scissors}
        />
        <MetricCard
          label="Wash Sale Adjustments"
          value={formatCurrency(data.washSaleAdjustment)}
          subtext={`${MOCK_WASH_SALES.length} violations detected`}
          color="text-[var(--color-warning)]"
          icon={AlertTriangle}
        />
      </div>

      {/* Gains/Losses Breakdown */}
      <div
        className="animate-fade-in-up"
        style={{ animationDelay: '50ms', animationFillMode: 'both' }}
      >
        <Card title="Gains & Losses Breakdown">
          <div className="overflow-x-auto -mx-6">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">Category</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">Gains</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">Losses</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">Net</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-[var(--color-border)]">
                  <td className="px-4 py-3 font-medium text-[var(--color-text)]">Short-Term</td>
                  <td className="px-4 py-3 text-right font-mono text-[var(--color-positive)]">{formatCurrency(data.shortTermGains)}</td>
                  <td className="px-4 py-3 text-right font-mono text-[var(--color-negative)]">{formatCurrency(data.shortTermLosses)}</td>
                  <td className={`px-4 py-3 text-right font-mono font-bold ${data.netShortTerm >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
                    {formatCurrency(data.netShortTerm, true)}
                  </td>
                </tr>
                <tr className="border-b border-[var(--color-border)]">
                  <td className="px-4 py-3 font-medium text-[var(--color-text)]">Long-Term</td>
                  <td className="px-4 py-3 text-right font-mono text-[var(--color-positive)]">{formatCurrency(data.longTermGains)}</td>
                  <td className="px-4 py-3 text-right font-mono text-[var(--color-negative)]">{formatCurrency(data.longTermLosses)}</td>
                  <td className={`px-4 py-3 text-right font-mono font-bold ${data.netLongTerm >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
                    {formatCurrency(data.netLongTerm, true)}
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-bold text-[var(--color-text)]">Total</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-[var(--color-positive)]">{formatCurrency(data.shortTermGains + data.longTermGains)}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-[var(--color-negative)]">{formatCurrency(data.shortTermLosses + data.longTermLosses)}</td>
                  <td className={`px-4 py-3 text-right font-mono font-bold text-lg ${data.totalRealizedGain >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
                    {formatCurrency(data.totalRealizedGain, true)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── Harvest Section ────────────────────────────────────────────

function HarvestSection({ opportunities }: { opportunities: HarvestOpportunity[] }) {
  const [harvested, setHarvested] = useState<Set<string>>(new Set());

  const totalSavings = useMemo(
    () => opportunities.reduce((sum, o) => sum + o.estimatedTaxSavings, 0),
    [opportunities],
  );

  function handleHarvest(id: string) {
    setHarvested((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {/* Summary banner */}
      <div
        className="p-4 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in-up"
        style={{
          backgroundColor: 'rgba(123, 44, 255, 0.1)',
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: 'rgba(123, 44, 255, 0.2)',
          animationDelay: '0ms',
          animationFillMode: 'both',
        }}
      >
        <div className="flex items-center gap-2">
          <Scissors className="w-5 h-5 text-[var(--color-accent)]" aria-hidden="true" />
          <div>
            <p className="font-medium text-[var(--color-text)]">{opportunities.length} harvesting opportunities</p>
            <p className="text-sm text-[var(--color-text-muted)]">Total estimated savings: <span className="font-bold text-[var(--color-accent)] font-mono">{formatCurrency(totalSavings)}</span></p>
          </div>
        </div>
      </div>

      {/* Opportunities table */}
      <div
        className="animate-fade-in-up"
        style={{ animationDelay: '50ms', animationFillMode: 'both' }}
      >
        <Card>
          <div className="overflow-x-auto -mx-6">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">Symbol</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">Shares</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">Cost Basis</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">Current</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">Loss</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">Tax Savings</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">Replacements</th>
                  <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">Action</th>
                </tr>
              </thead>
              <tbody>
                {opportunities.map((opp) => {
                  const isHarvested = harvested.has(opp.id);
                  return (
                    <tr
                      key={opp.id}
                      className={`border-b border-[var(--color-border)] last:border-0 transition-all duration-200 ${
                        isHarvested ? 'opacity-50' : 'hover:bg-[var(--color-bg-secondary)]'
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-bold font-mono text-[var(--color-text)]">{opp.symbol}</span>
                          <span
                            className={`px-1.5 py-0.5 text-[10px] font-medium rounded text-[var(${opp.holdingPeriod === 'short_term' ? '--color-warning' : '--color-positive'})]`}
                            style={{ backgroundColor: opp.holdingPeriod === 'short_term' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)' }}
                          >
                            {opp.holdingPeriod === 'short_term' ? 'ST' : 'LT'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[var(--color-text)]">{opp.shares}</td>
                      <td className="px-4 py-3 text-right font-mono text-[var(--color-text)]">${opp.costBasis.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-mono text-[var(--color-text)]">${opp.currentPrice.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-mono text-[var(--color-negative)] font-bold">{formatCurrency(opp.unrealizedLoss, true)}</td>
                      <td className="px-4 py-3 text-right font-mono text-[var(--color-accent)] font-bold">{formatCurrency(opp.estimatedTaxSavings)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {opp.replacements.map((sym) => (
                            <span key={sym} className="px-2 py-0.5 text-xs font-mono bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)] rounded border border-[var(--color-border)] hover:border-[var(--color-accent)] transition-colors duration-200">
                              {sym}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Button
                          size="sm"
                          variant={isHarvested ? 'outline' : 'primary'}
                          onClick={() => handleHarvest(opp.id)}
                          disabled={isHarvested}
                          aria-label={isHarvested ? `${opp.symbol} harvested` : `Harvest ${opp.symbol}`}
                        >
                          {isHarvested ? 'Harvested' : 'Harvest'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── Wash Sales Section ─────────────────────────────────────────

function WashSalesSection({ violations }: { violations: WashSaleEntry[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const totalDisallowed = useMemo(
    () => violations.reduce((sum, v) => sum + v.disallowedLoss, 0),
    [violations],
  );

  return (
    <div className="space-y-4">
      {/* Explanation banner */}
      <div
        className="p-4 rounded-lg animate-fade-in-up"
        style={{
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: 'rgba(245, 158, 11, 0.2)',
          animationDelay: '0ms',
          animationFillMode: 'both',
        }}
      >
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-[var(--color-warning)] flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="font-medium text-[var(--color-text)]">What is a Wash Sale?</p>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              A wash sale occurs when you sell a security at a loss and repurchase the same or a
              &quot;substantially identical&quot; security within 30 days before or after the sale.
              The IRS disallows the loss deduction and adds it to the cost basis of the replacement shares.
            </p>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1 animate-fade-in-up"
        style={{ animationDelay: '50ms', animationFillMode: 'both' }}
      >
        <p className="text-sm text-[var(--color-text-muted)]">
          <strong className="text-[var(--color-text)]">{violations.length}</strong> violations detected &middot;
          Total disallowed: <span className="font-bold font-mono text-[var(--color-warning)]">{formatCurrency(totalDisallowed)}</span>
        </p>
      </div>

      {/* Violations */}
      <div className="space-y-3">
        {violations.map((v, index) => {
          const isExpanded = expandedId === v.id;
          return (
            <div
              key={v.id}
              className="animate-fade-in-up"
              style={{ animationDelay: `${50 * index}ms`, animationFillMode: 'both' }}
            >
              <Card>
                <button
                  className="w-full flex items-center justify-between gap-4 text-left min-h-[44px] hover:shadow-lg transition-shadow duration-200"
                  onClick={() => setExpandedId(isExpanded ? null : v.id)}
                  aria-expanded={isExpanded}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)' }}
                    >
                      <AlertTriangle className="w-5 h-5 text-[var(--color-warning)]" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold font-mono text-[var(--color-text)]">{v.saleSymbol}</span>
                        <span className="text-xs text-[var(--color-text-muted)]">{formatDate(v.saleDate)}</span>
                        <span
                          className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${
                            v.matchType === 'same_ticker'
                              ? 'text-[var(--color-warning)]'
                              : 'text-[var(--color-accent)]'
                          }`}
                          style={{
                            backgroundColor: v.matchType === 'same_ticker'
                              ? 'rgba(245, 158, 11, 0.1)'
                              : 'rgba(123, 44, 255, 0.1)',
                          }}
                        >
                          {v.matchType === 'same_ticker' ? 'Same Ticker' : 'Substantially Identical'}
                        </span>
                      </div>
                      <p className="text-sm text-[var(--color-text-muted)]">
                        Sold {v.saleShares} shares at <span className="text-[var(--color-negative)] font-mono">{formatCurrency(v.saleLoss)}</span> loss &middot;
                        Disallowed: <span className="text-[var(--color-warning)] font-mono font-bold">{formatCurrency(v.disallowedLoss)}</span>
                      </p>
                    </div>
                  </div>
                  {isExpanded
                    ? <ChevronUp className="w-5 h-5 text-[var(--color-text-muted)] flex-shrink-0" aria-hidden="true" />
                    : <ChevronDown className="w-5 h-5 text-[var(--color-text-muted)] flex-shrink-0" aria-hidden="true" />}
                </button>

                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-[var(--color-border)] text-sm space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <p className="text-[var(--color-text-muted)] text-xs uppercase tracking-wider mb-1">Sale</p>
                        <p className="text-[var(--color-text)]">
                          {v.saleShares} shares of <span className="font-mono font-bold">{v.saleSymbol}</span> on {formatDate(v.saleDate)}
                        </p>
                        <p className="text-[var(--color-negative)] font-mono">Loss: {formatCurrency(v.saleLoss)}</p>
                      </div>
                      <div>
                        <p className="text-[var(--color-text-muted)] text-xs uppercase tracking-wider mb-1">Replacement Purchase</p>
                        <p className="text-[var(--color-text)]">
                          {v.replacementShares} shares of <span className="font-mono font-bold">{v.replacementSymbol}</span> on {formatDate(v.replacementDate)}
                        </p>
                        <p className="text-[var(--color-warning)] font-mono">Disallowed: {formatCurrency(v.disallowedLoss)}</p>
                      </div>
                    </div>
                    <div className="p-3 bg-[var(--color-bg-secondary)] rounded-md">
                      <p className="text-[var(--color-text-muted)]">
                        <strong className="text-[var(--color-text)]">Impact:</strong> The {formatCurrency(v.disallowedLoss)} loss
                        cannot be deducted this tax year. It has been added to the cost basis of the {v.replacementShares} replacement
                        shares of {v.replacementSymbol}, which will reduce your taxable gain when those shares are eventually sold.
                      </p>
                    </div>
                  </div>
                )}
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Report Section ─────────────────────────────────────────────

function ReportSection({ rows, summary }: { rows: ReportRow[]; summary: TaxSummaryData }) {
  const [showAll, setShowAll] = useState(false);
  const visibleRows = showAll ? rows : rows.slice(0, 5);

  function downloadReport(format: 'csv' | 'json') {
    let content: string;
    let mimeType: string;
    let filename: string;

    if (format === 'json') {
      const report = {
        taxYear: summary.taxYear,
        generatedAt: new Date().toISOString(),
        summary: {
          shortTermGains: summary.shortTermGains,
          shortTermLosses: summary.shortTermLosses,
          longTermGains: summary.longTermGains,
          longTermLosses: summary.longTermLosses,
          netShortTerm: summary.netShortTerm,
          netLongTerm: summary.netLongTerm,
          totalRealizedGain: summary.totalRealizedGain,
          estimatedTaxLiability: summary.estimatedTaxLiability,
          washSaleAdjustment: summary.washSaleAdjustment,
        },
        transactions: rows,
      };
      content = JSON.stringify(report, null, 2);
      mimeType = 'application/json';
      filename = `tax-report-${summary.taxYear}.json`;
    } else {
      const header = 'Description,Date Acquired,Date Sold,Proceeds,Cost Basis,Adjustment Code,Adjustment Amount,Gain/Loss,Term,Symbol';
      const csvRows = rows.map((r) =>
        `"${r.description}",${r.dateAcquired},${r.dateSold},${r.proceeds.toFixed(2)},${r.costBasis.toFixed(2)},${r.adjustmentCode},${r.adjustmentAmount.toFixed(2)},${r.gainOrLoss.toFixed(2)},${r.isShortTerm ? 'Short-Term' : 'Long-Term'},${r.symbol}`
      );
      const summaryLines = [
        `# Tax Year: ${summary.taxYear}`,
        `# Total Realized Gain: ${summary.totalRealizedGain.toFixed(2)}`,
        `# Estimated Tax Liability: ${summary.estimatedTaxLiability.toFixed(2)}`,
        `# Wash Sale Adjustments: ${summary.washSaleAdjustment.toFixed(2)}`,
      ];
      content = [header, ...csvRows, '', ...summaryLines].join('\n');
      mimeType = 'text/csv';
      filename = `tax-report-${summary.taxYear}.csv`;
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {/* Download buttons */}
      <div
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in-up"
        style={{ animationDelay: '0ms', animationFillMode: 'both' }}
      >
        <div>
          <h3 className="font-medium text-[var(--color-text)]">Annual Tax Report — {summary.taxYear}</h3>
          <p className="text-sm text-[var(--color-text-muted)]">Form 8949 / Schedule D compatible</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Download className="w-4 h-4" aria-hidden="true" />}
            onClick={() => downloadReport('csv')}
            aria-label="Download report as CSV"
          >
            CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<ArrowDownToLine className="w-4 h-4" aria-hidden="true" />}
            onClick={() => downloadReport('json')}
            aria-label="Download report as JSON"
          >
            JSON
          </Button>
        </div>
      </div>

      {/* Transaction table */}
      <div
        className="animate-fade-in-up"
        style={{ animationDelay: '50ms', animationFillMode: 'both' }}
      >
        <Card>
          <div className="overflow-x-auto -mx-6">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">Description</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">Acquired</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">Sold</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">Proceeds</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">Cost Basis</th>
                  <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">Adj</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">Gain/Loss</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, idx) => (
                  <tr key={idx} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-bg-secondary)] transition-all duration-200">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[var(--color-text)]">{row.description}</span>
                        <span
                          className={`px-1.5 py-0.5 text-[10px] font-medium rounded text-[var(${row.isShortTerm ? '--color-warning' : '--color-positive'})]`}
                          style={{ backgroundColor: row.isShortTerm ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)' }}
                        >
                          {row.isShortTerm ? 'ST' : 'LT'}
                        </span>
                        {row.adjustmentCode === 'W' && (
                          <span
                            className="px-1.5 py-0.5 text-[10px] font-medium rounded text-[var(--color-warning)]"
                            style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)' }}
                          >
                            W
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text-muted)] font-mono text-xs">{formatDate(row.dateAcquired)}</td>
                    <td className="px-4 py-3 text-[var(--color-text-muted)] font-mono text-xs">{formatDate(row.dateSold)}</td>
                    <td className="px-4 py-3 text-right font-mono text-[var(--color-text)]">{formatCurrency(row.proceeds)}</td>
                    <td className="px-4 py-3 text-right font-mono text-[var(--color-text)]">{formatCurrency(row.costBasis)}</td>
                    <td className="px-4 py-3 text-center font-mono">
                      {row.adjustmentAmount > 0 ? (
                        <span className="text-[var(--color-warning)]">{formatCurrency(row.adjustmentAmount)}</span>
                      ) : (
                        <span className="text-[var(--color-text-muted)]">—</span>
                      )}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono font-bold ${
                      row.gainOrLoss > 0 ? 'text-[var(--color-positive)]' : row.gainOrLoss < 0 ? 'text-[var(--color-negative)]' : 'text-[var(--color-text-muted)]'
                    }`}>
                      {formatCurrency(row.gainOrLoss, true)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rows.length > 5 && (
            <div className="mt-4 text-center">
              <button
                onClick={() => setShowAll((prev) => !prev)}
                className="text-sm text-[var(--color-accent)] hover:underline min-h-[44px]"
              >
                {showAll ? 'Show less' : `Show all ${rows.length} transactions`}
              </button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────

export function Tax() {
  const [activeTab, setActiveTab] = useState<TaxTab>('summary');

  const tabs: { id: TaxTab; label: string; icon: typeof Receipt }[] = [
    { id: 'summary', label: 'Summary', icon: Receipt },
    { id: 'harvest', label: 'Harvest', icon: Scissors },
    { id: 'wash_sales', label: 'Wash Sales', icon: AlertTriangle },
    { id: 'report', label: 'Report', icon: FileText },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in-up"
        style={{ animationDelay: '0ms', animationFillMode: 'both' }}
      >
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-[var(--color-text)]">Tax Optimization</h1>
          <p className="text-[var(--color-text-muted)] mt-1">
            Harvesting opportunities, wash sale compliance &amp; annual reporting
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
          <DollarSign className="w-4 h-4" aria-hidden="true" />
          <span>Tax Year <strong className="text-[var(--color-text)]">{MOCK_SUMMARY.taxYear}</strong></span>
        </div>
      </div>

      {/* Tab Selector */}
      <div
        className="flex gap-1 p-1 bg-[var(--color-bg-secondary)] rounded-lg w-fit overflow-x-auto animate-fade-in-up"
        style={{ animationDelay: '50ms', animationFillMode: 'both' }}
        role="tablist"
        aria-label="Tax dashboard tabs"
      >
        {tabs.map((tab) => {
          const TabIcon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-controls={`tabpanel-tax-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-md transition-all min-h-[44px] whitespace-nowrap ${
                isActive
                  ? 'bg-[var(--color-bg)] text-[var(--color-text)] shadow-sm'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
              }`}
            >
              <TabIcon className="w-4 h-4" aria-hidden="true" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div
        id={`tabpanel-tax-${activeTab}`}
        role="tabpanel"
        aria-labelledby={activeTab}
        className="animate-fade-in-up"
        style={{ animationDelay: '100ms', animationFillMode: 'both' }}
      >
        {activeTab === 'summary' && <SummarySection data={MOCK_SUMMARY} />}
        {activeTab === 'harvest' && <HarvestSection opportunities={MOCK_HARVEST_OPPORTUNITIES} />}
        {activeTab === 'wash_sales' && <WashSalesSection violations={MOCK_WASH_SALES} />}
        {activeTab === 'report' && <ReportSection rows={MOCK_REPORT_ROWS} summary={MOCK_SUMMARY} />}
      </div>
    </div>
  );
}

export default Tax;
