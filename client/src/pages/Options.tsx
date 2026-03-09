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
import { SkeletonOptionsPage } from '@/components/shared/Skeleton';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Layers,
  BarChart3,
  Target,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/shared/Button';
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
    <div className="flex items-center gap-3 p-4 rounded-xl bg-[var(--color-bg-tertiary)] border border-[var(--color-border-light)] hover:shadow-lg transition-all duration-200 active:scale-[0.98]">
      <div
        className="p-2.5 rounded-lg flex-shrink-0"
        style={{ backgroundColor: `color-mix(in srgb, ${cssColor} 12%, transparent)` }}
      >
        <span style={{ color: cssColor }}>{icon}</span>
      </div>
      <div className="min-w-0">
        <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">{label}</p>
        <p className={`text-xl font-bold mt-0.5 ${color}`}>{value}</p>
        {subtitle && <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────

export function Options() {
  const [activeTab, setActiveTab] = useState<TabId>('chain');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 600);
    return () => clearTimeout(timer);
  }, []);

  if (isLoading) return <SkeletonOptionsPage />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in-up"
        style={{ animationDelay: '0ms', animationFillMode: 'both' }}
      >
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-[var(--color-text)]">Options</h1>
          <p className="text-[var(--color-text-muted)] mt-1">
            Chain, Greeks, volatility surface &amp; strategy analysis
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)]">
            <span className="text-xs text-[var(--color-text-muted)]">Underlying</span>
            <span className="ml-2 text-sm font-bold text-[var(--color-text)]">{UNDERLYING_SYMBOL}</span>
            <span className="ml-1 text-sm font-mono text-[var(--color-text-muted)]">${UNDERLYING_PRICE.toFixed(2)}</span>
          </div>
          <Button variant="outline" disabled>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div
        className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-in-up"
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

      {/* Tab Navigation */}
      <div
        className="flex overflow-x-auto border-b border-[var(--color-border)] animate-fade-in-up"
        style={{ animationDelay: '100ms', animationFillMode: 'both' }}
        role="tablist"
        aria-label="Options sections"
      >
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors active:scale-[0.97] min-h-[44px] ${
                activeTab === tab.id
                  ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                  : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-border)]'
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
