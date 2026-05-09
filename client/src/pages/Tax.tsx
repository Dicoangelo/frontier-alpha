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
import { Button } from '@/components/shared/Button';
import { ScrollableTable } from '@/components/shared/ScrollableTable';
import { MockDataBanner } from '@/components/shared/MockDataBanner';

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
    <div className="glass-slab rounded-xl p-4 sm:p-6 flex items-center gap-3 animate-enter transition-[border-color,box-shadow] duration-200">
      <div
        className="p-2.5 rounded-lg flex-shrink-0"
        style={{ backgroundColor: `color-mix(in srgb, ${cssColor} 12%, transparent)` }}
      >
        <Icon className="w-5 h-5" style={{ color: cssColor }} aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">{label}</p>
        <p className={`mono tabular-nums text-xl font-bold mt-1 ${color ?? 'text-theme'}`}>{value}</p>
        {subtext && <p className="text-xs text-theme-muted mt-0.5">{subtext}</p>}
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
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-stagger animate-fade-in-up"
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

      {/* Gains/Losses Breakdown — long vs short term, two-column block via table */}
      <section
        className="glass-slab rounded-2xl p-6 sm:p-8 animate-fade-in-up"
        style={{ animationDelay: '50ms', animationFillMode: 'both' }}
      >
        <header className="mb-6">
          <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Realized P&amp;L</p>
          <h2 className="text-lg font-bold text-theme mt-1">Gains &amp; Losses Breakdown</h2>
        </header>
        <ScrollableTable>
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="px-4 py-3 text-left mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Category</th>
                <th className="px-4 py-3 text-right mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Gains</th>
                <th className="px-4 py-3 text-right mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Losses</th>
                <th className="px-4 py-3 text-right mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Net</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[var(--color-border-light)] hover:bg-[var(--color-bg-tertiary)] transition-colors duration-200">
                <td className="px-4 py-3 mono uppercase text-[11px] tracking-[0.2em] font-semibold text-theme">Short-Term</td>
                <td className="px-4 py-3 text-right mono tabular-nums text-[var(--color-positive)]">{formatCurrency(data.shortTermGains)}</td>
                <td className="px-4 py-3 text-right mono tabular-nums text-[var(--color-negative)]">{formatCurrency(data.shortTermLosses)}</td>
                <td className={`px-4 py-3 text-right mono tabular-nums font-bold ${data.netShortTerm >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
                  {formatCurrency(data.netShortTerm, true)}
                </td>
              </tr>
              <tr className="border-b border-[var(--color-border-light)] hover:bg-[var(--color-bg-tertiary)] transition-colors duration-200">
                <td className="px-4 py-3 mono uppercase text-[11px] tracking-[0.2em] font-semibold text-theme">Long-Term</td>
                <td className="px-4 py-3 text-right mono tabular-nums text-[var(--color-positive)]">{formatCurrency(data.longTermGains)}</td>
                <td className="px-4 py-3 text-right mono tabular-nums text-[var(--color-negative)]">{formatCurrency(data.longTermLosses)}</td>
                <td className={`px-4 py-3 text-right mono tabular-nums font-bold ${data.netLongTerm >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
                  {formatCurrency(data.netLongTerm, true)}
                </td>
              </tr>
              <tr className="bg-[var(--color-bg-tertiary)]">
                <td className="px-4 py-3 mono uppercase text-[11px] tracking-[0.2em] font-bold text-theme">Total</td>
                <td className="px-4 py-3 text-right mono tabular-nums font-bold text-[var(--color-positive)]">{formatCurrency(data.shortTermGains + data.longTermGains)}</td>
                <td className="px-4 py-3 text-right mono tabular-nums font-bold text-[var(--color-negative)]">{formatCurrency(data.shortTermLosses + data.longTermLosses)}</td>
                <td className={`px-4 py-3 text-right mono tabular-nums font-bold text-lg ${data.totalRealizedGain >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
                  {formatCurrency(data.totalRealizedGain, true)}
                </td>
              </tr>
            </tbody>
          </table>
        </ScrollableTable>
      </section>
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
        className="glass-slab-floating relative overflow-hidden rounded-xl pl-5 pr-4 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[image:var(--gradient-sovereign)] shadow-[0_18px_60px_-20px_rgba(123,44,255,0.25)] animate-fade-in-up"
        style={{ animationDelay: '0ms', animationFillMode: 'both' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="p-2 rounded-lg shrink-0"
            style={{ backgroundColor: 'color-mix(in srgb, var(--color-accent) 10%, transparent)' }}
          >
            <Scissors className="w-5 h-5 text-[var(--color-accent)]" aria-hidden="true" />
          </div>
          <div>
            <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">
              {opportunities.length} harvesting opportunities
            </p>
            <p className="text-sm text-theme-secondary mt-1">
              Total estimated savings:{' '}
              <span className="mono tabular-nums font-bold text-[var(--color-accent)]">{formatCurrency(totalSavings)}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Opportunities table */}
      <section
        className="glass-slab rounded-2xl p-4 sm:p-6 animate-fade-in-up"
        style={{ animationDelay: '50ms', animationFillMode: 'both' }}
      >
        <ScrollableTable>
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="px-4 py-3 text-left mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Symbol</th>
                <th className="px-4 py-3 text-right mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Shares</th>
                <th className="px-4 py-3 text-right mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Cost Basis</th>
                <th className="px-4 py-3 text-right mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Current</th>
                <th className="px-4 py-3 text-right mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Loss</th>
                <th className="px-4 py-3 text-right mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Tax Savings</th>
                <th className="px-4 py-3 text-left mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Replacements</th>
                <th className="px-4 py-3 text-center mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Action</th>
              </tr>
            </thead>
            <tbody>
              {opportunities.map((opp) => {
                const isHarvested = harvested.has(opp.id);
                return (
                  <tr
                    key={opp.id}
                    className={`border-b border-[var(--color-border-light)] last:border-0 transition-colors duration-200 ${
                      isHarvested ? 'opacity-50' : 'hover:bg-[var(--color-bg-tertiary)]'
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="mono uppercase font-bold text-theme">{opp.symbol}</span>
                        <span
                          className={`mono text-[10px] tracking-[0.2em] uppercase px-1.5 py-0.5 rounded ${
                            opp.holdingPeriod === 'short_term'
                              ? 'text-[var(--color-warning)]'
                              : 'text-[var(--color-positive)]'
                          }`}
                          style={{
                            backgroundColor:
                              opp.holdingPeriod === 'short_term'
                                ? 'color-mix(in srgb, var(--color-warning) 10%, transparent)'
                                : 'color-mix(in srgb, var(--color-positive) 10%, transparent)',
                          }}
                        >
                          {opp.holdingPeriod === 'short_term' ? 'ST' : 'LT'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right mono tabular-nums text-theme">{opp.shares}</td>
                    <td className="px-4 py-3 text-right mono tabular-nums text-theme">${opp.costBasis.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right mono tabular-nums text-theme">${opp.currentPrice.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right mono tabular-nums text-[var(--color-negative)] font-bold">{formatCurrency(opp.unrealizedLoss, true)}</td>
                    <td className="px-4 py-3 text-right mono tabular-nums text-[var(--color-accent)] font-bold">{formatCurrency(opp.estimatedTaxSavings)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {opp.replacements.map((sym) => (
                          <span
                            key={sym}
                            className="mono uppercase px-2 py-0.5 text-[10px] tracking-[0.2em] bg-[var(--color-bg-tertiary)] text-theme-muted rounded border border-[var(--color-border-light)] hover:border-[var(--color-accent)] transition-colors duration-200"
                          >
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
        </ScrollableTable>
      </section>
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
        className="glass-slab-floating relative overflow-hidden rounded-xl pl-5 pr-4 py-4 before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[var(--color-warning)] shadow-[0_18px_60px_-20px_rgba(245,158,11,0.35)] animate-fade-in-up"
        style={{ animationDelay: '0ms', animationFillMode: 'both' }}
      >
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-[var(--color-warning)] flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="mono text-[10px] tracking-[0.3em] uppercase font-semibold text-theme">What is a Wash Sale?</p>
            <p className="text-sm text-theme-secondary mt-1">
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
        <p className="text-sm text-theme-secondary">
          <strong className="mono tabular-nums text-theme">{violations.length}</strong> violations detected &middot;
          Total disallowed:{' '}
          <span className="mono tabular-nums font-bold text-[var(--color-warning)]">{formatCurrency(totalDisallowed)}</span>
        </p>
      </div>

      {/* Violations */}
      <div className="space-y-3 animate-stagger">
        {violations.map((v, index) => {
          const isExpanded = expandedId === v.id;
          return (
            <section
              key={v.id}
              className="glass-slab rounded-xl p-4 sm:p-6 animate-enter animate-fade-in-up"
              style={{ animationDelay: `${50 * index}ms`, animationFillMode: 'both' }}
            >
              <button
                className="w-full flex items-center justify-between gap-4 text-left min-h-[44px] animate-press"
                onClick={() => setExpandedId(isExpanded ? null : v.id)}
                aria-expanded={isExpanded}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: 'color-mix(in srgb, var(--color-warning) 10%, transparent)' }}
                  >
                    <AlertTriangle className="w-5 h-5 text-[var(--color-warning)]" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="mono uppercase font-bold text-theme">{v.saleSymbol}</span>
                      <span className="mono tabular-nums text-[11px] text-theme-muted">{formatDate(v.saleDate)}</span>
                      <span
                        className={`mono uppercase px-1.5 py-0.5 text-[10px] tracking-[0.2em] rounded ${
                          v.matchType === 'same_ticker'
                            ? 'text-[var(--color-warning)]'
                            : 'text-[var(--color-accent)]'
                        }`}
                        style={{
                          backgroundColor:
                            v.matchType === 'same_ticker'
                              ? 'color-mix(in srgb, var(--color-warning) 10%, transparent)'
                              : 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
                        }}
                      >
                        {v.matchType === 'same_ticker' ? 'Same Ticker' : 'Substantially Identical'}
                      </span>
                    </div>
                    <p className="text-sm text-theme-secondary mt-1">
                      Sold <span className="mono tabular-nums">{v.saleShares}</span> shares at{' '}
                      <span className="mono tabular-nums text-[var(--color-negative)]">{formatCurrency(v.saleLoss)}</span> loss &middot;
                      Disallowed:{' '}
                      <span className="mono tabular-nums text-[var(--color-warning)] font-bold">{formatCurrency(v.disallowedLoss)}</span>
                    </p>
                  </div>
                </div>
                {isExpanded
                  ? <ChevronUp className="w-5 h-5 text-theme-muted flex-shrink-0" aria-hidden="true" />
                  : <ChevronDown className="w-5 h-5 text-theme-muted flex-shrink-0" aria-hidden="true" />}
              </button>

              {isExpanded && (
                <div className="mt-4 pt-4 border-t border-[var(--color-border-light)] text-sm space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted mb-1">Sale</p>
                      <p className="text-theme">
                        <span className="mono tabular-nums">{v.saleShares}</span> shares of{' '}
                        <span className="mono uppercase font-bold">{v.saleSymbol}</span> on{' '}
                        <span className="mono tabular-nums">{formatDate(v.saleDate)}</span>
                      </p>
                      <p className="mono tabular-nums text-[var(--color-negative)] mt-1">Loss: {formatCurrency(v.saleLoss)}</p>
                    </div>
                    <div>
                      <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted mb-1">Replacement Purchase</p>
                      <p className="text-theme">
                        <span className="mono tabular-nums">{v.replacementShares}</span> shares of{' '}
                        <span className="mono uppercase font-bold">{v.replacementSymbol}</span> on{' '}
                        <span className="mono tabular-nums">{formatDate(v.replacementDate)}</span>
                      </p>
                      <p className="mono tabular-nums text-[var(--color-warning)] mt-1">Disallowed: {formatCurrency(v.disallowedLoss)}</p>
                    </div>
                  </div>
                  <div className="p-3 bg-[var(--color-bg-tertiary)] rounded-md border border-[var(--color-border-light)]">
                    <p className="text-theme-secondary">
                      <strong className="text-theme">Impact:</strong>{' '}
                      The <span className="mono tabular-nums">{formatCurrency(v.disallowedLoss)}</span> loss
                      cannot be deducted this tax year. It has been added to the cost basis of the{' '}
                      <span className="mono tabular-nums">{v.replacementShares}</span> replacement
                      shares of <span className="mono uppercase">{v.replacementSymbol}</span>, which will reduce your taxable gain when those shares are eventually sold.
                    </p>
                  </div>
                </div>
              )}
            </section>
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
          <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Filing</p>
          <h3 className="text-sm font-bold text-theme mt-1">Annual Tax Report — <span className="mono tabular-nums">{summary.taxYear}</span></h3>
          <p className="text-xs text-theme-muted mt-0.5">Form 8949 / Schedule D compatible</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => downloadReport('csv')}
            aria-label="Download report as CSV"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-sm bg-[image:var(--gradient-sovereign)] text-white mono text-[10px] font-black tracking-[0.3em] uppercase animate-press animate-lift shadow-[0_4px_20px_rgba(123,44,255,0.35)] hover:brightness-110 transition-[box-shadow,transform] duration-200"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            CSV
          </button>
          <button
            type="button"
            onClick={() => downloadReport('json')}
            aria-label="Download report as JSON"
            className="glass-slab inline-flex items-center gap-2 px-5 py-3 rounded-sm text-theme mono text-[10px] font-bold tracking-[0.3em] uppercase animate-press animate-lift hover:border-[var(--color-border-hover)] transition-[border-color,box-shadow] duration-200"
          >
            <ArrowDownToLine className="w-4 h-4" aria-hidden="true" />
            JSON
          </button>
        </div>
      </div>

      {/* Transaction table */}
      <section
        className="glass-slab rounded-2xl p-4 sm:p-6 animate-fade-in-up"
        style={{ animationDelay: '50ms', animationFillMode: 'both' }}
      >
        <ScrollableTable>
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="px-4 py-3 text-left mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Description</th>
                <th className="px-4 py-3 text-left mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Acquired</th>
                <th className="px-4 py-3 text-left mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Sold</th>
                <th className="px-4 py-3 text-right mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Proceeds</th>
                <th className="px-4 py-3 text-right mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Cost Basis</th>
                <th className="px-4 py-3 text-center mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Adj</th>
                <th className="px-4 py-3 text-right mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Gain/Loss</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, idx) => (
                <tr
                  key={idx}
                  className="border-b border-[var(--color-border-light)] last:border-0 hover:bg-[var(--color-bg-tertiary)] transition-colors duration-200"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-theme">{row.description}</span>
                      <span
                        className={`mono uppercase px-1.5 py-0.5 text-[10px] tracking-[0.2em] rounded ${
                          row.isShortTerm ? 'text-[var(--color-warning)]' : 'text-[var(--color-positive)]'
                        }`}
                        style={{
                          backgroundColor: row.isShortTerm
                            ? 'color-mix(in srgb, var(--color-warning) 10%, transparent)'
                            : 'color-mix(in srgb, var(--color-positive) 10%, transparent)',
                        }}
                      >
                        {row.isShortTerm ? 'ST' : 'LT'}
                      </span>
                      {row.adjustmentCode === 'W' && (
                        <span
                          className="mono uppercase px-1.5 py-0.5 text-[10px] tracking-[0.2em] rounded text-[var(--color-warning)]"
                          style={{ backgroundColor: 'color-mix(in srgb, var(--color-warning) 10%, transparent)' }}
                        >
                          W
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 mono tabular-nums text-xs text-theme-muted">{formatDate(row.dateAcquired)}</td>
                  <td className="px-4 py-3 mono tabular-nums text-xs text-theme-muted">{formatDate(row.dateSold)}</td>
                  <td className="px-4 py-3 text-right mono tabular-nums text-theme">{formatCurrency(row.proceeds)}</td>
                  <td className="px-4 py-3 text-right mono tabular-nums text-theme">{formatCurrency(row.costBasis)}</td>
                  <td className="px-4 py-3 text-center mono tabular-nums">
                    {row.adjustmentAmount > 0 ? (
                      <span className="text-[var(--color-warning)]">{formatCurrency(row.adjustmentAmount)}</span>
                    ) : (
                      <span className="text-theme-muted">—</span>
                    )}
                  </td>
                  <td
                    className={`px-4 py-3 text-right mono tabular-nums font-bold ${
                      row.gainOrLoss > 0
                        ? 'text-[var(--color-positive)]'
                        : row.gainOrLoss < 0
                          ? 'text-[var(--color-negative)]'
                          : 'text-theme-muted'
                    }`}
                  >
                    {formatCurrency(row.gainOrLoss, true)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollableTable>

        {rows.length > 5 && (
          <div className="mt-4 text-center">
            <button
              onClick={() => setShowAll((prev) => !prev)}
              className="mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-accent)] hover:underline min-h-[44px] animate-press"
            >
              {showAll ? 'Show less' : `Show all ${rows.length} transactions`}
            </button>
          </div>
        )}
      </section>
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
      <MockDataBanner force pageKey="tax" />

      {/* Header */}
      <div
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in-up"
        style={{ animationDelay: '0ms', animationFillMode: 'both' }}
      >
        <div>
          <p className="mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-theme-muted mb-2">
            Execution · Tax
          </p>
          <h1 className="text-2xl lg:text-3xl font-bold text-theme">
            <span className="text-gradient-brand">Tax Optimization</span>
          </h1>
          <p className="text-sm text-theme-secondary mt-1">
            Harvesting opportunities, wash sale compliance &amp; annual reporting
          </p>
        </div>
        <div className="glass-slab-floating rounded-xl px-4 py-2.5 flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-[var(--color-accent)]" aria-hidden="true" />
          <span className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Tax Year</span>
          <strong className="mono tabular-nums text-sm font-bold text-theme">{MOCK_SUMMARY.taxYear}</strong>
        </div>
      </div>

      {/* Tab Selector — segmented control */}
      <div
        className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-1 rounded-lg bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] animate-fade-in-up"
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
              className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-md min-h-[44px] mono text-[11px] tracking-[0.2em] uppercase font-semibold animate-press transition-colors duration-200 whitespace-nowrap ${
                isActive
                  ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                  : 'text-theme-secondary hover:text-theme'
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
