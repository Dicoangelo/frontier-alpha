/**
 * Alerts Page
 *
 * Risk alerts, factor drift monitoring, and SEC filings — single mission control.
 * Layout-wrapped (see App.tsx) — page chrome is provided by parent Layout.
 */

import { useState, useEffect, useCallback } from 'react';
import { Bell, Filter, RefreshCw, ShieldAlert } from 'lucide-react';
import { AlertList } from '@/components/alerts/AlertCard';
import { FactorDriftAlert } from '@/components/alerts/FactorDriftAlert';
import { SECFilingAlert } from '@/components/alerts/SECFilingAlert';
import { SkeletonCard } from '@/components/shared/Skeleton';
import { DataLoadError, EmptyAlerts } from '@/components/shared/EmptyState';
import { api } from '@/api/client';
import type { RiskAlert } from '@/types';

interface FactorExposure {
  factor: string;
  exposure: number;
}

type SeverityFilter = 'all' | 'critical' | 'high' | 'medium' | 'low';

const kickerClass =
  'mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-theme-muted mb-2';

export function Alerts() {
  const [alerts, setAlerts] = useState<RiskAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [showAcknowledged, setShowAcknowledged] = useState(false);
  const [factorExposures, setFactorExposures] = useState<FactorExposure[]>([]);
  const [portfolioSymbols, setPortfolioSymbols] = useState<string[]>([]);

  const loadAlerts = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await api.get('/alerts');
      const alertsData = response.data?.alerts || response.data || [];
      setAlerts(alertsData);
    } catch (error) {
      console.error('Failed to load alerts:', error);
      setLoadError('Failed to load alerts');
      // Use demo alerts for testing
      setAlerts(getDemoAlerts());
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load factor exposures from portfolio
  const loadFactorExposures = useCallback(async () => {
    try {
      const portfolioRes = await api.get('/portfolio');
      const positions = portfolioRes.data?.positions || [];
      const symbols = positions.map((p: { symbol: string }) => p.symbol);

      // Set portfolio symbols for SEC filing alerts
      setPortfolioSymbols(symbols.length > 0 ? symbols : ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN']);

      if (symbols.length > 0) {
        const factorRes = await api.get(`/portfolio/factors/${symbols.join(',')}`);
        const factorData = factorRes.data || {};
        // Aggregate factors across positions
        const factorMap = new Map<string, number>();
        for (const symbol of symbols) {
          const symbolFactors = factorData[symbol] || [];
          for (const f of symbolFactors) {
            const current = factorMap.get(f.factor) || 0;
            factorMap.set(f.factor, current + f.exposure / symbols.length);
          }
        }
        setFactorExposures(
          Array.from(factorMap.entries()).map(([factor, exposure]) => ({
            factor,
            exposure,
          }))
        );
      }
    } catch (error) {
      console.error('Failed to load factor exposures:', error);
      // Use demo symbols
      setPortfolioSymbols(['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN']);
      // Use demo exposures
      setFactorExposures([
        { factor: 'momentum_12m', exposure: 0.85 },
        { factor: 'value', exposure: -0.28 },
        { factor: 'low_vol', exposure: -0.42 },
        { factor: 'roe', exposure: 0.62 },
        { factor: 'market', exposure: 1.15 },
      ]);
    }
  }, []);

  useEffect(() => {
    loadAlerts();
    loadFactorExposures();
  }, [loadAlerts, loadFactorExposures]);

  // Handle new alerts from factor drift monitor
  const handleFactorDriftAlerts = (newAlerts: Array<{
    id: string;
    type: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    title: string;
    message: string;
    timestamp?: string;
    acknowledged?: boolean;
  }>) => {
    setAlerts(prev => {
      // Filter out old factor drift alerts and add new ones
      const nonDriftAlerts = prev.filter(a => a.type !== 'factor_drift');
      // Convert DriftAlert to RiskAlert format
      const convertedAlerts: RiskAlert[] = newAlerts.map(a => ({
        id: a.id,
        type: a.type,
        severity: a.severity,
        title: a.title,
        message: a.message,
        timestamp: a.timestamp ? new Date(a.timestamp) : new Date(),
        acknowledged: a.acknowledged ?? false,
      }));
      return [...convertedAlerts, ...nonDriftAlerts];
    });
  };

  const handleAcknowledge = async (id: string) => {
    try {
      await api.post(`/alerts/${id}/acknowledge`);
      setAlerts(prev =>
        prev.map(alert =>
          alert.id === id ? { ...alert, acknowledged: true } : alert
        )
      );
    } catch (error) {
      console.error('Failed to acknowledge alert:', error);
      // Still update UI for demo
      setAlerts(prev =>
        prev.map(alert =>
          alert.id === id ? { ...alert, acknowledged: true } : alert
        )
      );
    }
  };

  const handleAction = async (id: string, action: string) => {
    // Handle alert action — Navigate to appropriate page based on action
    switch (action) {
      case 'reduce_risk':
      case 'rebalance':
        window.location.href = '/optimize';
        break;
      case 'view_forecast':
        window.location.href = '/earnings';
        break;
      case 'details':
      case 'review':
        window.location.href = '/factors';
        break;
      default:
        // Acknowledge the alert
        handleAcknowledge(id);
    }
  };

  // Filter alerts
  const filteredAlerts = alerts.filter(alert => {
    if (!showAcknowledged && alert.acknowledged) return false;
    if (severityFilter !== 'all' && alert.severity !== severityFilter) return false;
    return true;
  });

  // Count by severity
  const severityCounts = alerts.reduce((acc, alert) => {
    if (!alert.acknowledged) {
      acc[alert.severity] = (acc[alert.severity] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  const totalActive = Object.values(severityCounts).reduce((a, b) => a + b, 0);

  // Show skeleton while loading
  if (isLoading) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <p className={kickerClass}>Alerts · Loading</p>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
              <span className="text-gradient-brand">Risk</span>{' '}
              <span className="text-theme">Watchtower</span>
            </h1>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
        </div>
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  // Show error state — still show demo data below
  const errorBanner = loadError ? (
    <div className="mb-4">
      <DataLoadError onRetry={loadAlerts} error={loadError} />
    </div>
  ) : null;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {errorBanner}

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div
        className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 animate-fade-in-up"
        style={{ animationDelay: '0ms', animationFillMode: 'both' }}
      >
        <div>
          <p className={kickerClass}>
            Alerts · <span className="text-[color:var(--color-accent-secondary)]">Live Watchtower</span>
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
              <span className="text-gradient-brand">Risk</span>{' '}
              <span className="text-theme">Watchtower</span>
            </h1>
            {totalActive > 0 && (
              <span
                className="mono text-[10px] tracking-[0.3em] uppercase px-2.5 py-1 rounded-full tabular-nums text-[var(--color-negative)]"
                style={{ backgroundColor: 'color-mix(in srgb, var(--color-negative) 12%, transparent)' }}
              >
                {totalActive} active
              </span>
            )}
          </div>
          <p className="mt-3 text-sm sm:text-base text-theme-secondary leading-relaxed max-w-2xl">
            Real-time drawdown, concentration, factor drift, and SEC filing surveillance.
            Acknowledge or route directly into rebalance flow.
          </p>
        </div>

        <button
          onClick={loadAlerts}
          disabled={isLoading}
          aria-label="Refresh alerts"
          className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-sm glass-slab text-theme-secondary hover:text-theme mono text-[10px] tracking-[0.3em] uppercase animate-press transition-colors duration-200 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {/* ── Severity Summary Tiles ──────────────────────────────────────── */}
      <div
        className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-in-up animate-stagger"
        style={{ animationDelay: '50ms', animationFillMode: 'both' }}
      >
        <SeverityTile
          label="Critical"
          count={severityCounts.critical || 0}
          rail="var(--color-negative)"
          onClick={() => setSeverityFilter(severityFilter === 'critical' ? 'all' : 'critical')}
          active={severityFilter === 'critical'}
        />
        <SeverityTile
          label="High"
          count={severityCounts.high || 0}
          rail="var(--color-warning)"
          onClick={() => setSeverityFilter(severityFilter === 'high' ? 'all' : 'high')}
          active={severityFilter === 'high'}
        />
        <SeverityTile
          label="Medium"
          count={severityCounts.medium || 0}
          rail="var(--color-accent-secondary)"
          onClick={() => setSeverityFilter(severityFilter === 'medium' ? 'all' : 'medium')}
          active={severityFilter === 'medium'}
        />
        <SeverityTile
          label="Low"
          count={severityCounts.low || 0}
          rail="var(--color-accent)"
          onClick={() => setSeverityFilter(severityFilter === 'low' ? 'all' : 'low')}
          active={severityFilter === 'low'}
        />
      </div>

      {/* ── Filter Chips ────────────────────────────────────────────────── */}
      <div
        className="glass-slab-floating rounded-xl px-4 py-3 flex flex-wrap items-center gap-3 animate-fade-in-up"
        style={{ animationDelay: '100ms', animationFillMode: 'both' }}
      >
        <div className="flex items-center gap-2 mr-1">
          <Filter className="w-4 h-4 text-theme-muted" aria-hidden="true" />
          <span className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Filter</span>
        </div>

        <label className="inline-flex items-center gap-2 cursor-pointer min-h-[36px] animate-press">
          <input
            type="checkbox"
            checked={showAcknowledged}
            onChange={(e) => setShowAcknowledged(e.target.checked)}
            className="w-4 h-4 rounded-sm border border-[var(--color-border)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 transition-[border-color,box-shadow] duration-200 accent-[var(--color-accent)]"
          />
          <span className="mono text-[10px] tracking-[0.3em] uppercase text-theme-secondary">
            Show acknowledged
          </span>
        </label>

        {severityFilter !== 'all' && (
          <button
            onClick={() => setSeverityFilter('all')}
            aria-label="Clear severity filter"
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm border border-[color:var(--color-border)] text-[var(--color-accent)] mono text-[10px] tracking-[0.3em] uppercase animate-press hover:border-[var(--color-accent)] transition-[color,border-color] duration-200"
          >
            Clear filter
          </button>
        )}
      </div>

      {/* ── Factor Drift Monitor ────────────────────────────────────────── */}
      <div
        className="animate-fade-in-up"
        style={{ animationDelay: '150ms', animationFillMode: 'both' }}
      >
        <FactorDriftAlert
          exposures={factorExposures}
          onAlertGenerated={handleFactorDriftAlerts}
        />
      </div>

      {/* ── SEC Filing Alerts ───────────────────────────────────────────── */}
      <div
        className="animate-fade-in-up"
        style={{ animationDelay: '200ms', animationFillMode: 'both' }}
      >
        <SECFilingAlert
          symbols={portfolioSymbols}
          maxAlerts={5}
        />
      </div>

      {/* ── Alert List ──────────────────────────────────────────────────── */}
      <div
        className="animate-fade-in-up"
        style={{ animationDelay: '250ms', animationFillMode: 'both' }}
      >
        {filteredAlerts.length === 0 ? (
          <div className="glass-slab gradient-brand-subtle rounded-2xl p-10 text-center">
            <div
              className="w-12 h-12 mx-auto mb-4 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'color-mix(in srgb, var(--color-positive) 14%, transparent)' }}
            >
              <ShieldAlert className="w-6 h-6" style={{ color: 'var(--color-positive)' }} aria-hidden="true" />
            </div>
            <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted mb-2">
              All Clear
            </p>
            <h3 className="text-lg font-bold text-theme mb-2">No active alerts</h3>
            <p className="text-sm text-theme-secondary max-w-md mx-auto mb-6">
              Your watchtower is quiet. Configure thresholds to be notified when drawdown,
              concentration, or factor drift cross your tolerance.
            </p>
            <button
              type="button"
              onClick={() => { window.location.href = '/settings'; }}
              aria-label="Configure alerts"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] rounded-sm bg-[image:var(--gradient-sovereign)] text-white mono text-[10px] font-black tracking-[0.3em] uppercase animate-press animate-lift shadow-[0_4px_30px_rgba(123,44,255,0.35)] hover:brightness-110 hover:shadow-[0_6px_40px_rgba(123,44,255,0.5)] transition-[filter,box-shadow] duration-200"
            >
              <Bell className="w-4 h-4" aria-hidden="true" />
              Configure Alerts
            </button>
            {/* Defensive — keep underlying empty-state slot if the gradient panel is hidden */}
            <div className="sr-only">
              <EmptyAlerts />
            </div>
          </div>
        ) : (
          <div className="glass-slab rounded-2xl p-2 sm:p-4">
            <AlertList
              alerts={filteredAlerts}
              onAcknowledge={handleAcknowledge}
              onAction={handleAction}
              maxVisible={10}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Severity Tile ────────────────────────────────────────────────────────
function SeverityTile({
  label,
  count,
  rail,
  onClick,
  active,
}: {
  label: string;
  count: number;
  rail: string;
  onClick: () => void;
  active: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`Filter by ${label} severity`}
      className={`animate-enter glass-slab-floating relative overflow-hidden rounded-xl p-4 text-left animate-press transition-[border-color,box-shadow] duration-200 before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px]`}
      style={{
        ...(active
          ? { boxShadow: `0 8px 30px -12px ${rail === 'var(--color-accent-secondary)' ? 'rgba(192,132,252,0.4)' : rail === 'var(--color-warning)' ? 'rgba(245,158,11,0.4)' : rail === 'var(--color-negative)' ? 'rgba(239,68,68,0.4)' : 'rgba(123,44,255,0.4)'}` }
          : {}),
        // rail before-pseudo via inline style is not possible — set via CSS var fallback
      }}
    >
      <span
        aria-hidden="true"
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ backgroundColor: rail }}
      />
      <div className="flex items-center justify-between mb-2 pl-1">
        <span
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: rail }}
          aria-hidden="true"
        />
        <span className="text-2xl font-bold text-theme tabular-nums">{count}</span>
      </div>
      <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted text-left pl-1">
        {label}
      </p>
    </button>
  );
}

// Demo alerts for development/testing
function getDemoAlerts(): RiskAlert[] {
  return [
    {
      id: 'alert-1',
      type: 'drawdown',
      severity: 'critical',
      title: 'Portfolio Drawdown Alert',
      message: 'Your portfolio has declined 8.5% from its peak. Consider reducing risk exposure or adding protective positions.',
      timestamp: new Date(Date.now() - 1800000),
      acknowledged: false,
    },
    {
      id: 'alert-2',
      type: 'concentration',
      severity: 'high',
      title: 'Position Concentration Risk',
      message: 'NVDA represents 28% of your portfolio. This exceeds the recommended 20% single-position limit.',
      timestamp: new Date(Date.now() - 3600000),
      acknowledged: false,
    },
    {
      id: 'alert-3',
      type: 'earnings',
      severity: 'medium',
      title: 'Upcoming Earnings: NVDA',
      message: 'NVDA reports earnings in 3 days. Expected move is 8.2%. Consider your risk management strategy.',
      timestamp: new Date(Date.now() - 7200000),
      acknowledged: false,
    },
    {
      id: 'alert-4',
      type: 'volatility_spike',
      severity: 'high',
      title: 'Volatility Spike Detected',
      message: 'Market volatility (VIX) has increased 25% today. Your portfolio beta of 1.3 amplifies this risk.',
      timestamp: new Date(Date.now() - 10800000),
      acknowledged: false,
    },
    {
      id: 'alert-5',
      type: 'factor_drift',
      severity: 'low',
      title: 'Factor Drift: Momentum',
      message: 'Your momentum exposure has drifted from target (0.5 → 0.8). Consider rebalancing if intentional tilt change.',
      timestamp: new Date(Date.now() - 86400000),
      acknowledged: false,
    },
  ];
}
