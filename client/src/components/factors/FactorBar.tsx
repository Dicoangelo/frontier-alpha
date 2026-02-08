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
  Momentum: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  Quality: 'bg-green-500/10 text-green-500 border-green-500/20',
  Value: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  Volatility: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  Size: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20',
  Macro: 'bg-red-500/10 text-red-500 border-red-500/20',
  Sector: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
  Other: 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] border-[var(--color-border)]',
};

const BAR_COLORS: Record<string, { positive: string; negative: string }> = {
  Momentum: { positive: 'bg-blue-500', negative: 'bg-blue-400' },
  Quality: { positive: 'bg-green-500', negative: 'bg-green-400' },
  Value: { positive: 'bg-purple-500', negative: 'bg-purple-400' },
  Volatility: { positive: 'bg-orange-500', negative: 'bg-orange-400' },
  Size: { positive: 'bg-indigo-500', negative: 'bg-indigo-400' },
  Macro: { positive: 'bg-red-500', negative: 'bg-red-400' },
  Sector: { positive: 'bg-cyan-500', negative: 'bg-cyan-400' },
  Other: { positive: 'bg-gray-500', negative: 'bg-[var(--color-text-muted)]' },
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
  const signalColor = signalStrength >= 2 ? 'text-green-600' : signalStrength >= 1 ? 'text-yellow-600' : 'text-[var(--color-text-muted)]';

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          {showCategory && (
            <span className={`text-xs px-1.5 py-0.5 rounded border ${categoryColor}`}>
              {info.category}
            </span>
          )}
          <span className="text-sm font-medium text-[var(--color-text-secondary)] capitalize">
            {factor.factor.replace(/_/g, ' ')}
          </span>
          <div className="relative">
            <button
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
              className="text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
            {showTooltip && (
              <div className="absolute left-0 bottom-full mb-2 w-64 p-2 bg-gray-900 text-white text-xs rounded shadow-lg z-20">
                {info.description}
                <div className="absolute left-2 top-full w-2 h-2 bg-gray-900 transform rotate-45 -translate-y-1" />
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs ${signalColor}`}>{signalLabel}</span>
          <span className={`text-sm font-bold tabular-nums ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
            {isPositive ? '+' : ''}{factor.exposure.toFixed(2)}
          </span>
        </div>
      </div>

      <div className="relative h-3 bg-[var(--color-bg-secondary)] rounded-full overflow-hidden">
        {/* Background grid */}
        <div className="absolute inset-0 flex">
          <div className="w-1/4 border-r border-[var(--color-border)]" />
          <div className="w-1/4 border-r border-[var(--color-border)]" />
          <div className="w-1/4 border-r border-[var(--color-border)]" />
          <div className="w-1/4" />
        </div>

        {/* Center line */}
        <div className="absolute top-0 left-1/2 w-0.5 h-full bg-[var(--color-text-muted)] z-10" />

        {/* Bar */}
        <div
          className={`absolute top-0 h-full rounded-full transition-all duration-500 ${
            isPositive ? barColor.positive : barColor.negative
          }`}
          style={{
            left: isPositive ? '50%' : `${50 - barWidth}%`,
            width: `${barWidth}%`,
          }}
        />
      </div>

      <div className="flex justify-between text-xs text-[var(--color-text-muted)]">
        <span>
          t-stat: <span className={factor.tStat >= 2 ? 'text-green-600 font-medium' : ''}>
            {factor.tStat.toFixed(2)}
          </span>
        </span>
        <span>
          contribution: <span className={factor.contribution > 0 ? 'text-green-600' : factor.contribution < 0 ? 'text-red-600' : ''}>
            {factor.contribution > 0 ? '+' : ''}{(factor.contribution * 100).toFixed(1)}%
          </span>
        </span>
        <span>
          confidence: <span className={factor.confidence >= 0.8 ? 'text-green-600 font-medium' : ''}>
            {(factor.confidence * 100).toFixed(0)}%
          </span>
        </span>
      </div>
    </div>
  );
}
