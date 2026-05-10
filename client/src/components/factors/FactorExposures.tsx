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
      <span className="flex items-center gap-1 mono tabular-nums text-xs text-theme-muted">
        <Minus className="w-3 h-3" aria-hidden="true" /> Neutral
      </span>
    );
  }
  if (value > 0) {
    return (
      <span className="flex items-center gap-1 mono tabular-nums text-xs text-[var(--color-positive)]">
        <TrendingUp className="w-3 h-3" aria-hidden="true" /> +{value.toFixed(2)}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 mono tabular-nums text-xs text-[var(--color-negative)]">
      <TrendingDown className="w-3 h-3" aria-hidden="true" /> {value.toFixed(2)}
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
        <div className="flex gap-1 bg-theme-tertiary rounded-lg p-0.5 border border-theme-light">
          <button
            onClick={() => setViewMode('grouped')}
            aria-pressed={viewMode === 'grouped'}
            className={`px-3 py-1 mono text-[10px] tracking-wider uppercase rounded-md transition-[background-color,color] duration-200 animate-press ${
              viewMode === 'grouped'
                ? 'bg-theme shadow text-theme'
                : 'text-theme-secondary hover:text-theme'
            }`}
          >
            Grouped
          </button>
          <button
            onClick={() => setViewMode('flat')}
            aria-pressed={viewMode === 'flat'}
            className={`px-3 py-1 mono text-[10px] tracking-wider uppercase rounded-md transition-[background-color,color] duration-200 animate-press ${
              viewMode === 'flat'
                ? 'bg-theme shadow text-theme'
                : 'text-theme-secondary hover:text-theme'
            }`}
          >
            By Impact
          </button>
        </div>
      }
    >
      {factors.length === 0 ? (
        <div className="glass-slab gradient-brand-subtle rounded-2xl py-10 px-6 text-center">
          <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">No exposures</p>
          <p className="text-sm text-theme-secondary mt-2">No factor exposures calculated yet.</p>
          <p className="text-xs text-theme-muted mt-1">Add positions to see factor analysis.</p>
          <Link
            to="/help#what-are-factors"
            className="inline-flex items-center gap-1 mt-4 mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-info)] hover:opacity-80 transition-opacity duration-200 animate-press"
          >
            <HelpCircle className="w-4 h-4" aria-hidden="true" />
            Learn about factors
          </Link>
        </div>
      ) : viewMode === 'grouped' ? (
        <div className="space-y-4 animate-stagger">
          {CATEGORY_ORDER.map((category) => {
            const categoryFactors = groupedFactors[category];
            if (!categoryFactors || categoryFactors.length === 0) return null;

            const isExpanded = expandedCategories.has(category);
            const netExposure = categoryNetExposure[category];

            return (
              <div
                key={category}
                className="glass-slab rounded-xl overflow-hidden transition-[box-shadow] duration-200 hover:shadow-[0_18px_60px_-24px_rgba(0,0,0,0.18)] animate-enter"
              >
                <button
                  onClick={() => toggleCategory(category)}
                  aria-expanded={isExpanded}
                  className="w-full flex items-center justify-between p-3 hover:bg-theme-secondary transition-colors duration-200 animate-press"
                >
                  <div className="flex items-center gap-3">
                    <span className="mono text-[10px] sm:text-xs tracking-[0.3em] uppercase font-semibold text-theme">
                      {category}
                    </span>
                    <span className="mono tabular-nums text-[10px] tracking-wider text-theme-muted">
                      ({categoryFactors.length})
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <NetExposureIndicator value={netExposure} />
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-theme-muted" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-theme-muted" aria-hidden="true" />
                    )}
                  </div>
                </button>
                <div className="h-[1px] bg-[image:var(--gradient-sovereign)] opacity-30" aria-hidden="true" />

                <AccordionContent isExpanded={isExpanded}>
                  <div className="p-4 space-y-4">
                    {categoryFactors.map((factor, idx) => (
                      <FactorBar
                        key={`${factor.factor}-${idx}`}
                        factor={factor}
                        showCategory={false}
                      />
                    ))}
                  </div>
                </AccordionContent>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-4 animate-stagger">
          {sortedFactors.slice(0, 10).map((factor, idx) => (
            <div
              key={`${factor.factor}-${idx}`}
              className="animate-enter"
            >
              <FactorBar factor={factor} />
            </div>
          ))}
          {sortedFactors.length > 10 && (
            <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted text-center">
              Showing top <span className="tabular-nums">10</span> of <span className="tabular-nums">{sortedFactors.length}</span> factors by impact
            </p>
          )}
        </div>
      )}

      {insight && (
        <div className="glass-slab gradient-brand-subtle relative overflow-hidden mt-6 p-4 rounded-2xl before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[image:var(--gradient-sovereign)]">
          <div className="flex items-start gap-3 pl-2">
            <div
              className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'color-mix(in srgb, var(--color-accent) 12%, transparent)' }}
            >
              <span className="text-lg" aria-hidden="true">🧠</span>
            </div>
            <div>
              <p className="mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-accent)]">AI Insight</p>
              <p className="text-sm text-theme-secondary mt-1 leading-relaxed">{insight}</p>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
