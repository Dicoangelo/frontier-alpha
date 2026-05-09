/**
 * Options Dashboard Page
 *
 * Orchestrator for four sections:
 * - Chain: Options chain table (calls left, puts right, strike center)
 * - Greeks: Delta/gamma heatmap by strike and expiration
 * - Vol Surface: 3D-style surface chart (strike x expiration x IV)
 * - Strategies: P&L payoff diagram with strategy selection
 */

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SkeletonOptionsPage } from '@/components/shared/Skeleton';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Layers,
  BarChart3,
  Target,
  RefreshCw,
  Plug,
} from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { MockDataBanner } from '@/components/shared/MockDataBanner';
import { EmptyState } from '@/components/shared/EmptyState';
import { portfolioApi } from '@/api/portfolio';
import { useNavigate } from 'react-router-dom';
import {
  UNDERLYING_PRICE,
  UNDERLYING_SYMBOL,
  MOCK_CHAIN,
  MOCK_HEATMAP,
  MOCK_VOL_SURFACE,
  getATMIV,
  getIVSkew,
} from '@/components/options/options-types';
import { OptionsChain } from '@/components/options/OptionsChain';
import { GreeksHeatmap } from '@/components/options/GreeksHeatmap';
import { VolSurface } from '@/components/options/VolSurface';
import { StrategySelector } from '@/components/options/StrategySelector';

// ── Tabs ────────────────────────────────────────────────────────

type TabId = 'chain' | 'greeks' | 'surface' | 'strategies';

const TABS: { id: TabId; label: string; icon: typeof Activity }[] = [
  { id: 'chain', label: 'Chain', icon: Layers },
  { id: 'greeks', label: 'Greeks', icon: BarChart3 },
  { id: 'surface', label: 'Vol Surface', icon: Activity },
  { id: 'strategies', label: 'Strategies', icon: Target },
];

// ── MetricCard ──────────────────────────────────────────────────

interface MetricCardProps {
  label: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  color?: string;
}

function MetricCard({ label, value, subtitle, icon, color = 'text-[var(--color-text)]' }: MetricCardProps) {
  const colorMatch = color.match(/var\(([^)]+)\)/);
  const cssColor = colorMatch ? `var(${colorMatch[1]})` : 'var(--color-text-muted)';

  return (
    <div className="glass-slab rounded-xl p-4 sm:p-6 flex items-center gap-3 animate-enter animate-press transition-[border-color,box-shadow] duration-200">
      <div
        className="p-2.5 rounded-lg flex-shrink-0"
        style={{ backgroundColor: `color-mix(in srgb, ${cssColor} 12%, transparent)` }}
      >
        <span style={{ color: cssColor }}>{icon}</span>
      </div>
      <div className="min-w-0">
        <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">{label}</p>
        <p className={`mono tabular-nums text-xl font-bold mt-1 ${color}`}>{value}</p>
        {subtitle && <p className="text-xs text-theme-muted mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────

export function Options() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>('chain');
  const [isLoading, setIsLoading] = useState(true);

  // US-002: detect whether the user has any positions wired. Without one,
  // we render an explicit empty state instead of a chain of mock 1.00/1.00
  // strikes for AAPL — those numbers read as live to a brand new account.
  const { data: portfolio } = useQuery({
    queryKey: ['portfolio'],
    queryFn: portfolioApi.getPortfolio,
    retry: false,
  });
  const hasPositions = (portfolio?.positions?.length ?? 0) > 0;

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 600);
    return () => clearTimeout(timer);
  }, []);

  if (isLoading) return <SkeletonOptionsPage />;

  if (!hasPositions) {
    return (
      <div className="space-y-6">
        <div
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in-up"
          style={{ animationDelay: '0ms', animationFillMode: 'both' }}
        >
          <div>
            <p className="mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-theme-muted mb-2">
              Execution · Options
            </p>
            <h1 className="text-2xl lg:text-3xl font-bold text-theme">
              <span className="text-gradient-brand">Options</span>
            </h1>
            <p className="text-sm text-theme-secondary mt-1">
              Chain, Greeks, volatility surface &amp; strategy analysis
            </p>
          </div>
        </div>
        <EmptyState
          icon={<Plug className="w-8 h-8" />}
          kicker="Options · Awaiting Position"
          title="Connect a position to see the live chain"
          description="The options chain, Greeks heatmap, and vol surface populate from a real underlying. Add at least one equity position to your portfolio first."
          action={{ label: 'Add Position', onClick: () => navigate('/portfolio') }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="visual-options-ready">
      <MockDataBanner force pageKey="options" />

      {/* Header */}
      <div
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in-up"
        style={{ animationDelay: '0ms', animationFillMode: 'both' }}
      >
        <div>
          <p className="mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-theme-muted mb-2">
            Execution \u00B7 Options
          </p>
          <h1 className="text-2xl lg:text-3xl font-bold text-theme">
            <span className="text-gradient-brand">Options</span>
          </h1>
          <p className="text-sm text-theme-secondary mt-1">
            Chain, Greeks, volatility surface &amp; strategy analysis
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="glass-slab-floating rounded-xl px-4 py-2.5 flex items-center gap-2">
            <span className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Underlying</span>
            <span className="mono uppercase text-sm font-bold text-theme">{UNDERLYING_SYMBOL}</span>
            <span className="mono tabular-nums text-sm text-theme-muted">${UNDERLYING_PRICE.toFixed(2)}</span>
          </div>
          <Button variant="outline" disabled>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div
        className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-stagger animate-fade-in-up"
        style={{ animationDelay: '50ms', animationFillMode: 'both' }}
      >
        <MetricCard
          label="ATM IV"
          value={`${(getATMIV(MOCK_VOL_SURFACE) * 100).toFixed(1)}%`}
          icon={<Activity className="w-4 h-4" />}
          color="text-[var(--color-accent)]"
        />
        <MetricCard
          label="IV Skew"
          value={`${(getIVSkew(MOCK_VOL_SURFACE) * 100).toFixed(1)}%`}
          icon={<TrendingDown className="w-4 h-4" />}
          color="text-[var(--color-warning)]"
        />
        <MetricCard
          label="Put/Call Ratio"
          value="0.78"
          subtitle="Below average"
          icon={<BarChart3 className="w-4 h-4" />}
        />
        <MetricCard
          label="Exp. Move"
          value={`\u00B1$${(UNDERLYING_PRICE * getATMIV(MOCK_VOL_SURFACE) * Math.sqrt(8 / 365) * 100 / 100).toFixed(2)}`}
          subtitle="Weekly"
          icon={<TrendingUp className="w-4 h-4" />}
          color="text-[var(--color-positive)]"
        />
      </div>

      {/* Tab Navigation \u2014 segmented control */}
      <div
        className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-1 rounded-lg bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] animate-fade-in-up"
        style={{ animationDelay: '100ms', animationFillMode: 'both' }}
        role="tablist"
        aria-label="Options sections"
      >
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-controls={`panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-md min-h-[44px] mono text-[11px] tracking-[0.2em] uppercase font-semibold animate-press transition-colors duration-200 ${
                isActive
                  ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                  : 'text-theme-secondary hover:text-theme'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      <div
        id={`panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={activeTab}
        className="animate-fade-in-up"
        style={{ animationDelay: '150ms', animationFillMode: 'both' }}
      >
        {activeTab === 'chain' && <OptionsChain contracts={MOCK_CHAIN} />}
        {activeTab === 'greeks' && <GreeksHeatmap cells={MOCK_HEATMAP} />}
        {activeTab === 'surface' && <VolSurface points={MOCK_VOL_SURFACE} />}
        {activeTab === 'strategies' && <StrategySelector />}
      </div>
    </div>
  );
}

export default Options;
