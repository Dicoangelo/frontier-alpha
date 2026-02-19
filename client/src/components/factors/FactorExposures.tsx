import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus, HelpCircle } from 'lucide-react';
import { Card } from '@/components/shared/Card';
import { FactorBar } from './FactorBar';
import type { FactorExposure } from '@/types';

// Factor category mapping
const FACTOR_CATEGORIES: Record<string, string> = {
  momentum_12m: 'Momentum',
  momentum_6m: 'Momentum',
  momentum_3m: 'Momentum',
  roe: 'Quality',
  roa: 'Quality',
  gross_margin: 'Quality',
  debt_equity: 'Quality',
  current_ratio: 'Quality',
  value: 'Value',
  pe_ratio: 'Value',
  pb_ratio: 'Value',
  low_vol: 'Volatility',
  volatility: 'Volatility',
  size: 'Size',
  interest_rate_sensitivity: 'Macro',
  inflation_beta: 'Macro',
  credit_spread_beta: 'Macro',
  vix_beta: 'Macro',
  sector_tech: 'Sector',
  sector_healthcare: 'Sector',
  sector_financials: 'Sector',
  sector_consumer: 'Sector',
  sector_energy: 'Sector',
};

const CATEGORY_ORDER = ['Momentum', 'Quality', 'Value', 'Volatility', 'Size', 'Macro', 'Sector', 'Other'];

interface FactorExposuresProps {
  factors: FactorExposure[];
  insight?: string;
}

function NetExposureIndicator({ value }: { value: number }) {
  if (Math.abs(value) < 0.1) {
    return (
      <span className="flex items-center gap-1 text-[var(--color-text-muted)]">
        <Minus className="w-3 h-3" /> Neutral
      </span>
    );
  }
  if (value > 0) {
    return (
      <span className="flex items-center gap-1 text-[var(--color-positive)]">
        <TrendingUp className="w-3 h-3" /> +{value.toFixed(2)}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[var(--color-negative)]">
      <TrendingDown className="w-3 h-3" /> {value.toFixed(2)}
    </span>
  );
}

function AccordionContent({ isExpanded, children }: { isExpanded: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (!ref.current) return;
    if (isExpanded) {
      setHeight(ref.current.scrollHeight);
    } else {
      setHeight(0);
    }
  }, [isExpanded]);

  return (
    <div
      style={{
        height: `${height}px`,
        overflow: 'hidden',
        transition: 'height 250ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      <div ref={ref}>
        {children}
      </div>
    </div>
  );
}

export function FactorExposures({ factors, insight }: FactorExposuresProps) {
  const [viewMode, setViewMode] = useState<'grouped' | 'flat'>('grouped');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(CATEGORY_ORDER));

  // Group factors by category
  const groupedFactors = factors.reduce((acc, factor) => {
    const category = FACTOR_CATEGORIES[factor.factor] || 'Other';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(factor);
    return acc;
  }, {} as Record<string, FactorExposure[]>);

  // Sort within each category by absolute exposure
  Object.values(groupedFactors).forEach(group => {
    group.sort((a, b) => Math.abs(b.exposure) - Math.abs(a.exposure));
  });

  const sortedFactors = [...factors].sort((a, b) => Math.abs(b.exposure) - Math.abs(a.exposure));

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  // Calculate net exposure by category
  const categoryNetExposure = CATEGORY_ORDER.reduce((acc, category) => {
    const categoryFactors = groupedFactors[category] || [];
    acc[category] = categoryFactors.reduce((sum, f) => sum + f.exposure, 0);
    return acc;
  }, {} as Record<string, number>);

  return (
    <Card
      title="Factor Exposures"
      action={
        <div className="flex gap-1 bg-[var(--color-bg-tertiary)] rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('grouped')}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              viewMode === 'grouped' ? 'bg-[var(--color-bg)] shadow text-[var(--color-text)]' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
            }`}
          >
            Grouped
          </button>
          <button
            onClick={() => setViewMode('flat')}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              viewMode === 'flat' ? 'bg-[var(--color-bg)] shadow text-[var(--color-text)]' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
            }`}
          >
            By Impact
          </button>
        </div>
      }
    >
      {factors.length === 0 ? (
        <div className="text-center py-8 text-[var(--color-text-muted)]">
          <p>No factor exposures calculated yet.</p>
          <p className="text-sm mt-2">Add positions to see factor analysis.</p>
          <Link
            to="/help#what-are-factors"
            className="inline-flex items-center gap-1 mt-4 text-sm text-[var(--color-info)] hover:text-[var(--color-info)]"
          >
            <HelpCircle className="w-4 h-4" />
            Learn about factors
          </Link>
        </div>
      ) : viewMode === 'grouped' ? (
        <div className="space-y-4">
          {CATEGORY_ORDER.map((category, idx) => {
            const categoryFactors = groupedFactors[category];
            if (!categoryFactors || categoryFactors.length === 0) return null;

            const isExpanded = expandedCategories.has(category);
            const netExposure = categoryNetExposure[category];

            return (
              <div
                key={category}
                className="border border-[var(--color-border)] rounded-lg overflow-hidden transition-shadow duration-200 hover:shadow-lg animate-fade-in-up"
                style={{ animationDelay: `${idx * 50}ms`, animationFillMode: 'both' }}
              >
                <button
                  onClick={() => toggleCategory(category)}
                  className="w-full flex items-center justify-between p-3 bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-bg-secondary)] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-[var(--color-text)]">{category}</span>
                    <span className="text-xs text-[var(--color-text-muted)]">({categoryFactors.length})</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <NetExposureIndicator value={netExposure} />
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-[var(--color-text-muted)]" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-[var(--color-text-muted)]" />
                    )}
                  </div>
                </button>

                <AccordionContent isExpanded={isExpanded}>
                  <div className="p-3 space-y-4 bg-[var(--color-bg)]">
                    {categoryFactors.map((factor) => (
                      <FactorBar key={factor.factor} factor={factor} showCategory={false} />
                    ))}
                  </div>
                </AccordionContent>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-4">
          {sortedFactors.slice(0, 10).map((factor, idx) => (
            <div
              key={factor.factor}
              className="animate-fade-in-up"
              style={{ animationDelay: `${idx * 50}ms`, animationFillMode: 'both' }}
            >
              <FactorBar factor={factor} />
            </div>
          ))}
          {sortedFactors.length > 10 && (
            <p className="text-xs text-[var(--color-text-muted)] text-center">
              Showing top 10 of {sortedFactors.length} factors by impact
            </p>
          )}
        </div>
      )}

      {insight && (
        <div className="mt-6 p-4 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-lg border border-[rgba(59, 130, 246,0.2)]">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 bg-[rgba(59, 130, 246,0.1)] rounded-full flex items-center justify-center">
              <span className="text-lg">🧠</span>
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--color-text)] mb-1">AI Insight</p>
              <p className="text-sm text-[var(--color-text-secondary)]">{insight}</p>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
