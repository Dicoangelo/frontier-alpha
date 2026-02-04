import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FileText,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  Calendar,
  Building2,
} from 'lucide-react';
import { Card } from '@/components/shared/Card';
import { Button } from '@/components/shared/Button';
import { Badge } from '@/components/shared/Badge';
import { api } from '@/api/client';

interface SECFiling {
  id: string;
  type: string;
  title: string;
  accessionNumber: string;
  filedAt: string;
  url: string;
  cik: string;
  symbol?: string;
  companyName: string;
  description: string;
}

interface FilingAlert {
  id: string;
  type: 'sec_filing';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  message: string;
  timestamp: string;
  filing: SECFiling;
  suggestedAction: string;
}

interface SECFilingAlertProps {
  symbols: string[];
  className?: string;
  maxAlerts?: number;
}

const severityColors: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low: 'bg-blue-100 text-blue-700 border-blue-200',
};

const filingTypeIcons: Record<string, string> = {
  '8-K': '📊',
  '10-K': '📈',
  '10-Q': '📋',
  '4': '👤',
  'SC 13D': '🎯',
  'SC 13G': '📌',
  'DEF 14A': '🗳️',
  'S-1': '🚀',
};

const filingTypeLabels: Record<string, string> = {
  '8-K': 'Material Event',
  '10-K': 'Annual Report',
  '10-Q': 'Quarterly Report',
  '4': 'Insider Trade',
  'SC 13D': 'Activist Ownership',
  'SC 13G': 'Institutional Ownership',
  'DEF 14A': 'Proxy Statement',
  'S-1': 'IPO Filing',
  '13F-HR': 'Fund Holdings',
};

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

export function SECFilingAlert({
  symbols,
  className = '',
  maxAlerts = 10,
}: SECFilingAlertProps) {
  const [expandedAlert, setExpandedAlert] = useState<string | null>(null);

  const {
    data: response,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['sec-filings', symbols.join(',')],
    queryFn: () => api.get(`/alerts/sec-filings?symbols=${symbols.join(',')}`),
    enabled: symbols.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 10 * 60 * 1000, // Auto-refresh every 10 minutes
  });

  const alerts: FilingAlert[] = response?.data?.alerts?.slice(0, maxAlerts) || [];
  const summary = response?.data?.summary || {
    total: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };

  const toggleExpand = (id: string) => {
    setExpandedAlert(expandedAlert === id ? null : id);
  };

  return (
    <Card className={`p-6 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">SEC Filings</h3>
          {summary.total > 0 && (
            <span className="text-sm text-gray-500">
              {summary.total} filing{summary.total !== 1 ? 's' : ''} (last 30 days)
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw
            className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`}
          />
        </Button>
      </div>

      {/* Summary badges */}
      {summary.total > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {summary.critical > 0 && (
            <Badge variant="danger">{summary.critical} Critical</Badge>
          )}
          {summary.high > 0 && (
            <span className="px-2 py-1 text-xs font-medium bg-orange-100 text-orange-700 rounded-full">
              {summary.high} High Priority
            </span>
          )}
          {summary.medium > 0 && (
            <span className="px-2 py-1 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">
              {summary.medium} Medium
            </span>
          )}
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="py-8 text-center text-gray-500">
          <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin" />
          <p>Loading SEC filings...</p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="py-6 text-center">
          <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-amber-500" />
          <p className="text-gray-600">Failed to load SEC filings</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-2"
            onClick={() => refetch()}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && alerts.length === 0 && (
        <div className="py-8 text-center text-gray-500">
          <FileText className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          <p>No recent SEC filings for your portfolio</p>
          <p className="text-sm mt-1">Filings from the last 30 days will appear here</p>
        </div>
      )}

      {/* Filing list */}
      {alerts.length > 0 && (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`p-3 rounded-lg border transition-all cursor-pointer ${
                severityColors[alert.severity]
              } ${expandedAlert === alert.id ? 'ring-2 ring-blue-500' : ''}`}
              onClick={() => toggleExpand(alert.id)}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <span className="text-xl">
                    {filingTypeIcons[alert.filing.type] || '📄'}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">
                        {alert.filing.symbol || alert.filing.companyName}
                      </span>
                      <span className="text-sm font-medium px-1.5 py-0.5 bg-white/50 rounded">
                        {alert.filing.type}
                      </span>
                    </div>
                    <p className="text-sm opacity-80">
                      {filingTypeLabels[alert.filing.type] || alert.filing.type}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="w-3.5 h-3.5" />
                  {formatDate(alert.timestamp)}
                </div>
              </div>

              {/* Expanded details */}
              {expandedAlert === alert.id && (
                <div className="mt-3 pt-3 border-t border-current/20">
                  <div className="flex items-center gap-2 text-sm mb-2">
                    <Building2 className="w-4 h-4" />
                    <span>{alert.filing.companyName}</span>
                  </div>
                  <p className="text-sm mb-3">{alert.suggestedAction}</p>
                  <a
                    href={alert.filing.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 text-sm font-medium underline"
                  >
                    View Filing on SEC.gov
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      {symbols.length > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-100 text-xs text-gray-500 flex items-center justify-between">
          <span>
            Monitoring: {symbols.slice(0, 5).join(', ')}
            {symbols.length > 5 && ` +${symbols.length - 5} more`}
          </span>
          <a
            href="https://www.sec.gov/edgar"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline"
          >
            SEC EDGAR
          </a>
        </div>
      )}
    </Card>
  );
}

// Demo component
export function SECFilingAlertDemo() {
  const demoSymbols = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN'];
  return <SECFilingAlert symbols={demoSymbols} />;
}
