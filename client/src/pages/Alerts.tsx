import { useState, useEffect, useCallback } from 'react';
import { Bell, Filter, RefreshCw } from 'lucide-react';
import { Card } from '@/components/shared/Card';
import { Button } from '@/components/shared/Button';
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
    console.log(`Alert action: ${action} on ${id}`);
    // Navigate to appropriate page based on action
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

  // Show skeleton while loading
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bell className="w-6 h-6 text-[var(--color-text-secondary)]" />
            <h1 className="text-2xl font-bold text-[var(--color-text)]">Alerts</h1>
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
    <div className="space-y-6">
      {errorBanner}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Bell className="w-6 h-6 text-[var(--color-text-secondary)]" />
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Alerts</h1>
          {Object.values(severityCounts).reduce((a, b) => a + b, 0) > 0 && (
            <span className="px-2 py-1 text-sm font-medium bg-red-500/10 text-red-400 rounded-full">
              {Object.values(severityCounts).reduce((a, b) => a + b, 0)} active
            </span>
          )}
        </div>
        <Button onClick={loadAlerts} isLoading={isLoading} variant="secondary">
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          label="Critical"
          count={severityCounts.critical || 0}
          indicator="🔴"
          color="bg-red-500/10 border-red-500/20"
          onClick={() => setSeverityFilter(severityFilter === 'critical' ? 'all' : 'critical')}
          active={severityFilter === 'critical'}
        />
        <SummaryCard
          label="High"
          count={severityCounts.high || 0}
          indicator="🟠"
          color="bg-orange-500/10 border-orange-500/20"
          onClick={() => setSeverityFilter(severityFilter === 'high' ? 'all' : 'high')}
          active={severityFilter === 'high'}
        />
        <SummaryCard
          label="Medium"
          count={severityCounts.medium || 0}
          indicator="🟡"
          color="bg-yellow-500/10 border-yellow-500/20"
          onClick={() => setSeverityFilter(severityFilter === 'medium' ? 'all' : 'medium')}
          active={severityFilter === 'medium'}
        />
        <SummaryCard
          label="Low"
          count={severityCounts.low || 0}
          indicator="🔵"
          color="bg-blue-500/10 border-blue-500/20"
          onClick={() => setSeverityFilter(severityFilter === 'low' ? 'all' : 'low')}
          active={severityFilter === 'low'}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-[var(--color-text-muted)]" />
          <span className="text-sm text-[var(--color-text-secondary)]">Filter:</span>
        </div>
        <label className="flex items-center gap-2 text-sm min-h-[44px]">
          <input
            type="checkbox"
            checked={showAcknowledged}
            onChange={(e) => setShowAcknowledged(e.target.checked)}
            className="w-5 h-5 rounded border-[var(--color-border)]"
          />
          Show acknowledged
        </label>
        {severityFilter !== 'all' && (
          <button
            onClick={() => setSeverityFilter('all')}
            className="text-sm text-blue-600 hover:text-blue-700 min-h-[44px] px-2"
          >
            Clear filter
          </button>
        )}
      </div>

      {/* Factor Drift Monitor */}
      <FactorDriftAlert
        exposures={factorExposures}
        onAlertGenerated={handleFactorDriftAlerts}
      />

      {/* SEC Filing Alerts */}
      <SECFilingAlert
        symbols={portfolioSymbols}
        maxAlerts={5}
      />

      {/* Alert List */}
      <Card>
        {filteredAlerts.length === 0 ? (
          <EmptyAlerts />
        ) : (
          <AlertList
            alerts={filteredAlerts}
            onAcknowledge={handleAcknowledge}
            onAction={handleAction}
            maxVisible={10}
          />
        )}
      </Card>
    </div>
  );
}

function SummaryCard({
  label,
  count,
  indicator,
  color,
  onClick,
  active,
}: {
  label: string;
  count: number;
  indicator: string;
  color: string;
  onClick: () => void;
  active: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`p-4 min-h-[44px] rounded-lg border transition-all ${color} ${
        active ? 'ring-2 ring-blue-500' : ''
      } hover:shadow-md`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-lg">{indicator}</span>
        <span className="text-2xl font-bold text-[var(--color-text)]">{count}</span>
      </div>
      <p className="text-sm text-[var(--color-text-secondary)] text-left">{label}</p>
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
