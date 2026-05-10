/**
 * Alerts Page
 *
 * Risk alerts, factor drift monitoring, and SEC filings — single mission control.
 * Layout-wrapped (see App.tsx) — page chrome is provided by parent Layout.
 */

import { useState, useEffect, useCallback } from 'react';
import { Bell, Filter, RefreshCw, ShieldAlert, Mail } from 'lucide-react';
import { AlertList } from '@/components/alerts/AlertCard';
import { FactorDriftAlert } from '@/components/alerts/FactorDriftAlert';
import { SECFilingAlert } from '@/components/alerts/SECFilingAlert';
import { SkeletonCard } from '@/components/shared/Skeleton';
import { DataLoadError, EmptyAlerts } from '@/components/shared/EmptyState';
import { MockDataBanner } from '@/components/shared/MockDataBanner';
import { toast } from '@/components/shared/Toast';
import { api } from '@/api/client';
import { useEmailDeliveryStatus } from '@/hooks/useIntegrationsHealth';
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
  const [emailChannel, setEmailChannel] = useState(false);
  // US-007: track whether any panel on the page is showing fallback demo data
  // (alert API failed, or factor exposures API failed and we seeded demos).
  const [usingDemoAlerts, setUsingDemoAlerts] = useState(false);
  const [usingDemoFactors, setUsingDemoFactors] = useState(false);
  const emailStatus = useEmailDeliveryStatus();
  const emailDegraded = emailStatus === 'degraded';

  const loadAlerts = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await api.get('/alerts');
      const alertsData = response.data?.alerts || response.data || [];
      setAlerts(alertsData);
      setUsingDemoAlerts(false);
    } catch (error) {
      console.error('Failed to load alerts:', error);
      const message = error instanceof Error ? error.message : 'Failed to load alerts';
      setLoadError(message);
      toast.error('Failed to load alerts', message);
      // US-002: don't seed mock NVDA / MSFT alerts on a new account.
      // The "All Clear" panel below renders correctly with an empty list.
      setAlerts([]);
      setUsingDemoAlerts(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load factor exposures from portfolio.
  //
  // US-002: when the user has zero positions, we no longer seed
  // ['AAPL','MSFT','NVDA',...] as fake symbols and we no longer fabricate
  // factor exposures. The corresponding cards must hide entirely so the
  // page never displays "Critical · Momentum drift on NVDA" for a brand
  // new account that has no holdings.
  const loadFactorExposures = useCallback(async () => {
    try {
      const portfolioRes = await api.get('/portfolio');
      const positions = portfolioRes.data?.positions || [];
      const symbols = positions.map((p: { symbol: string }) => p.symbol);

      if (symbols.length === 0) {
        setPortfolioSymbols([]);
        setFactorExposures([]);
        setUsingDemoFactors(false);
        return;
      }

      setPortfolioSymbols(symbols);
      setUsingDemoFactors(false);

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
    } catch (error) {
      console.error('Failed to load factor exposures:', error);
      // Soft failure — toast for awareness but don't render an error
      // banner. Factor-drift section hides when exposures stay empty.
      toast.warning(
        'Factor data unavailable',
        error instanceof Error ? error.message : 'Drift detection paused until next refresh.',
      );
      setPortfolioSymbols([]);
      setFactorExposures([]);
      setUsingDemoFactors(false);
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
      // Optimistic-update + warn-toast pattern: persistence failed but
      // UI stays acknowledged so the user isn't blocked. The warning
      // toast tells them a refresh might roll it back.
      toast.warning(
        'Acknowledgement saved locally',
        error instanceof Error
          ? `Server rejected the update: ${error.message}. It may revert on refresh.`
          : 'Server rejected the update. It may revert on refresh.',
      );
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

  const showMockBanner = usingDemoAlerts || usingDemoFactors;

  return (
    <div className="space-y-6 max-w-7xl mx-auto" data-testid="visual-alerts-ready">
      {showMockBanner && <MockDataBanner force pageKey="alerts" />}
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

        {/* Notification channel — Email (kept enabled even when delivery offline) */}
        <div className="flex items-center gap-2">
          <span className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">
            Channels
          </span>
          <label className="inline-flex items-center gap-2 cursor-pointer min-h-[36px] animate-press">
            <input
              type="checkbox"
              checked={emailChannel}
              onChange={(e) => setEmailChannel(e.target.checked)}
              aria-describedby={emailDegraded ? 'alerts-email-offline' : undefined}
              className="w-4 h-4 rounded-sm border border-[var(--color-border)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 transition-[border-color,box-shadow] duration-200 accent-[var(--color-accent)]"
            />
            <span className="inline-flex items-center gap-1.5 mono text-[10px] tracking-[0.3em] uppercase text-theme-secondary">
              <Mail className="w-3.5 h-3.5" aria-hidden="true" />
              Email
            </span>
          </label>
          {emailDegraded && (
            <span
              id="alerts-email-offline"
              role="status"
              className="inline-flex items-center gap-1.5 mono text-[10px] tracking-[0.25em] uppercase px-2 py-0.5 rounded-full text-[var(--color-warning)]"
              style={{ backgroundColor: 'color-mix(in srgb, var(--color-warning) 12%, transparent)' }}
            >
              Email Offline · Saved alerts only fire in-app
            </span>
          )}
        </div>

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
      {/* US-002: factor drift cards only render when there are real factor
          exposures from the user's portfolio. A brand new account renders
          neither this nor the SEC filings — we don't want a Critical-badge
          drift alert for a portfolio that doesn't exist. */}
      {factorExposures.length > 0 && (
        <div
          className="animate-fade-in-up"
          style={{ animationDelay: '150ms', animationFillMode: 'both' }}
        >
          <FactorDriftAlert
            exposures={factorExposures}
            onAlertGenerated={handleFactorDriftAlerts}
          />
        </div>
      )}

      {/* ── SEC Filing Alerts ───────────────────────────────────────────── */}
      {portfolioSymbols.length > 0 ? (
        <div
          className="animate-fade-in-up"
          style={{ animationDelay: '200ms', animationFillMode: 'both' }}
        >
          <SECFilingAlert
            symbols={portfolioSymbols}
            maxAlerts={5}
          />
        </div>
      ) : (
        <div
          className="glass-slab rounded-2xl p-10 text-center animate-fade-in-up"
          style={{ animationDelay: '200ms', animationFillMode: 'both' }}
        >
          <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">SEC Filings · Awaiting Positions</p>
          <h3 className="text-lg font-bold text-theme mt-2">No filings to monitor</h3>
          <p className="text-sm text-theme-secondary mt-2 max-w-md mx-auto leading-relaxed">
            Add positions to your portfolio to surface 8-K, 10-K, 10-Q, and insider Form 4
            filings for the companies you hold.
          </p>
        </div>
      )}

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

// US-002: getDemoAlerts() removed. The page no longer seeds NVDA / MSFT
// drift / earnings alerts when the API fails or the user has no positions.
// The "All Clear" panel handles the empty case directly.
