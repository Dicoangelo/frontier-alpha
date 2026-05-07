import { useState } from 'react';
import { Info } from 'lucide-react';
import type { FactorExposure } from '@/types';

// Factor categories and descriptions
const FACTOR_INFO: Record<string, { category: string; color: string; description: string }> = {
  // Momentum factors
  momentum_12m: { category: 'Momentum', color: 'blue', description: 'Past 12-month price performance relative to market' },
  momentum_6m: { category: 'Momentum', color: 'blue', description: 'Past 6-month price performance relative to market' },
  momentum_3m: { category: 'Momentum', color: 'blue', description: 'Past 3-month price performance relative to market' },

  // Quality factors
  roe: { category: 'Quality', color: 'green', description: 'Return on Equity - profitability relative to shareholder equity' },
  roa: { category: 'Quality', color: 'green', description: 'Return on Assets - profitability relative to total assets' },
  gross_margin: { category: 'Quality', color: 'green', description: 'Gross profit margin - revenue minus cost of goods sold' },
  debt_equity: { category: 'Quality', color: 'green', description: 'Debt to equity ratio - financial leverage' },
  current_ratio: { category: 'Quality', color: 'green', description: 'Current assets / current liabilities - short-term liquidity' },

  // Value factors
  value: { category: 'Value', color: 'purple', description: 'Book-to-market ratio - value vs growth positioning' },
  pe_ratio: { category: 'Value', color: 'purple', description: 'Price-to-earnings ratio - earnings relative to price' },
  pb_ratio: { category: 'Value', color: 'purple', description: 'Price-to-book ratio - price relative to book value' },

  // Volatility factors
  low_vol: { category: 'Volatility', color: 'orange', description: 'Low volatility factor - preference for stable stocks' },
  volatility: { category: 'Volatility', color: 'orange', description: 'Historical price volatility exposure' },

  // Size factors
  size: { category: 'Size', color: 'indigo', description: 'Market capitalization factor - large vs small cap tilt' },

  // Macro factors
  interest_rate_sensitivity: { category: 'Macro', color: 'red', description: 'Sensitivity to interest rate changes' },
  inflation_beta: { category: 'Macro', color: 'red', description: 'Response to inflation expectations' },
  credit_spread_beta: { category: 'Macro', color: 'red', description: 'Sensitivity to credit spread changes' },
  vix_beta: { category: 'Macro', color: 'red', description: 'Response to market volatility changes' },

  // Sector factors
  sector_tech: { category: 'Sector', color: 'cyan', description: 'Technology sector exposure' },
  sector_healthcare: { category: 'Sector', color: 'cyan', description: 'Healthcare sector exposure' },
  sector_financials: { category: 'Sector', color: 'cyan', description: 'Financial services sector exposure' },
  sector_consumer: { category: 'Sector', color: 'cyan', description: 'Consumer discretionary sector exposure' },
  sector_energy: { category: 'Sector', color: 'cyan', description: 'Energy sector exposure' },
};

const CATEGORY_COLORS: Record<string, string> = {
  Momentum: 'bg-[color-mix(in_srgb,var(--color-info)_12%,transparent)] text-[var(--color-info)]',
  Quality: 'bg-[color-mix(in_srgb,var(--color-positive)_12%,transparent)] text-[var(--color-positive)]',
  Value: 'bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-[var(--color-accent)]',
  Volatility: 'bg-[color-mix(in_srgb,var(--color-warning)_12%,transparent)] text-[var(--color-warning)]',
  Size: 'bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-[var(--color-accent)]',
  Macro: 'bg-[color-mix(in_srgb,var(--color-negative)_12%,transparent)] text-[var(--color-negative)]',
  Sector: 'bg-[color-mix(in_srgb,var(--color-info)_12%,transparent)] text-[var(--color-info)]',
  Other: 'bg-theme-tertiary text-theme-secondary',
};

const BAR_COLORS: Record<string, { positive: string; negative: string }> = {
  Momentum: { positive: 'bg-[var(--color-info)]', negative: 'bg-[var(--color-info)]' },
  Quality: { positive: 'bg-[var(--color-positive)]', negative: 'bg-[var(--color-positive)]' },
  Value: { positive: 'bg-[var(--color-accent)]', negative: 'bg-[var(--color-accent)]' },
  Volatility: { positive: 'bg-[var(--color-warning)]', negative: 'bg-[var(--color-warning)]' },
  Size: { positive: 'bg-[var(--color-accent)]', negative: 'bg-[var(--color-accent)]' },
  Macro: { positive: 'bg-[var(--color-negative)]', negative: 'bg-[var(--color-negative)]' },
  Sector: { positive: 'bg-[var(--color-info)]', negative: 'bg-[var(--color-info)]' },
  Other: { positive: 'bg-[var(--color-bg-tertiary)]', negative: 'bg-[var(--color-text-muted)]' },
};

interface FactorBarProps {
  factor: FactorExposure;
  showCategory?: boolean;
}

export function FactorBar({ factor, showCategory = true }: FactorBarProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  const isPositive = factor.exposure >= 0;
  const barWidth = Math.min(Math.abs(factor.exposure) * 50, 50); // Max 50%

  const info = FACTOR_INFO[factor.factor] || { category: 'Other', color: 'gray', description: 'Factor exposure' };
  const categoryColor = CATEGORY_COLORS[info.category] || CATEGORY_COLORS.Other;
  const barColor = BAR_COLORS[info.category] || BAR_COLORS.Other;

  // Signal strength indicator
  const signalStrength = Math.abs(factor.tStat);
  const signalLabel = signalStrength >= 2 ? 'Strong' : signalStrength >= 1 ? 'Moderate' : 'Weak';
  const signalColor = signalStrength >= 2 ? 'text-[var(--color-positive)]' : signalStrength >= 1 ? 'text-[var(--color-warning)]' : 'text-theme-muted';

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2 min-w-0">
          {showCategory && (
            <span className={`mono text-[10px] tracking-[0.2em] uppercase font-semibold px-1.5 py-0.5 rounded ${categoryColor}`}>
              {info.category}
            </span>
          )}
          <span className="mono text-xs tracking-wider uppercase font-semibold text-theme-secondary truncate">
            {factor.factor.replace(/_/g, ' ')}
          </span>
          <div className="relative flex-shrink-0">
            <button
              type="button"
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
              onFocus={() => setShowTooltip(true)}
              onBlur={() => setShowTooltip(false)}
              className="text-theme-muted hover:text-theme-secondary transition-colors duration-200 animate-press"
              aria-label={`More info about ${info.category}`}
            >
              <Info className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            {showTooltip && (
              <div className="glass-slab-floating absolute left-0 bottom-full mb-2 w-64 p-3 rounded-lg z-20 shadow-[0_18px_60px_-20px_rgba(0,0,0,0.25)] animate-enter">
                <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted mb-1">Definition</p>
                <p className="text-xs text-theme leading-relaxed">{info.description}</p>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className={`mono text-[10px] tracking-wider uppercase ${signalColor}`}>{signalLabel}</span>
          <span className={`mono tabular-nums text-sm font-bold ${isPositive ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'}`}>
            {isPositive ? '+' : ''}{factor.exposure.toFixed(2)}
          </span>
        </div>
      </div>

      <div className="relative h-3 bg-[var(--color-bg-tertiary)] rounded-full overflow-hidden border border-theme-light">
        {/* Background grid */}
        <div className="absolute inset-0 flex" aria-hidden="true">
          <div className="w-1/4 border-r border-theme-light" />
          <div className="w-1/4 border-r border-theme-light" />
          <div className="w-1/4 border-r border-theme-light" />
          <div className="w-1/4" />
        </div>

        {/* Center line */}
        <div className="absolute top-0 left-1/2 w-0.5 h-full bg-theme-muted z-10" aria-hidden="true" />

        {/* Bar */}
        <div
          className={`absolute top-0 h-full rounded-full transition-[width,left] duration-500 ${
            isPositive ? barColor.positive : barColor.negative
          }`}
          style={{
            left: isPositive ? '50%' : `${50 - barWidth}%`,
            width: `${barWidth}%`,
          }}
        />
      </div>

      <div className="flex justify-between items-center mono text-[10px] tracking-wider uppercase text-theme-muted">
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-semibold ${
          signalStrength >= 2
            ? 'bg-[color-mix(in_srgb,var(--color-positive)_12%,transparent)] text-[var(--color-positive)]'
            : signalStrength >= 1
              ? 'bg-[color-mix(in_srgb,var(--color-warning)_12%,transparent)] text-[var(--color-warning)]'
              : 'bg-theme-tertiary text-theme-muted'
        }`}>
          {signalLabel} Signal
        </span>
        <span>
          contribution ·{' '}
          <span className={`tabular-nums ${factor.contribution > 0 ? 'text-[var(--color-positive)]' : factor.contribution < 0 ? 'text-[var(--color-negative)]' : ''}`}>
            {factor.contribution > 0 ? '+' : ''}{(factor.contribution * 100).toFixed(1)}%
          </span>
        </span>
        <span>
          confidence ·{' '}
          <span className={`tabular-nums ${factor.confidence >= 0.8 ? 'text-[var(--color-positive)] font-medium' : ''}`}>
            {(factor.confidence * 100).toFixed(0)}%
          </span>
        </span>
      </div>
    </div>
  );
}
