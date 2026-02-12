import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FileText,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  Calendar,
  Building2,
  Clock,
  TrendingUp,
  Filter,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Card } from '@/components/shared/Card';
import { Button } from '@/components/shared/Button';
import { Badge } from '@/components/shared/Badge';
import { api } from '@/api/client';

// ============================================================================
// TYPES
// ============================================================================

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
  formUrl?: string;
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
  typeDescription?: string;
}

interface SECFilingAlertProps {
  symbols: string[];
  className?: string;
  maxAlerts?: number;
  showFilters?: boolean;
  compact?: boolean;
}

interface FilingSummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  byType?: Record<string, number>;
  bySymbol?: Record<string, number>;
}

type FilterType = 'all' | '8-K' | '10-K' | '10-Q' | '4' | 'SC 13D' | 'other';
type SeverityFilter = 'all' | 'critical' | 'high' | 'medium' | 'low';

// ============================================================================
// CONSTANTS
// ============================================================================

const severityColors: Record<string, string> = {
  critical: 'bg-red-500/10 text-red-400 border-red-500/20',
  high: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  medium: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  low: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
};

const severityDotColors: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-amber-500',
  low: 'bg-blue-500',
};

const filingTypeIcons: Record<string, string> = {
  '8-K': '8K',
  '8-K/A': '8K',
  '10-K': '10K',
  '10-K/A': '10K',
  '10-Q': '10Q',
  '10-Q/A': '10Q',
  '4': 'F4',
  '4/A': 'F4',
  'SC 13D': '13D',
  'SC 13D/A': '13D',
  'SC 13G': '13G',
  'SC 13G/A': '13G',
  '13F-HR': '13F',
  '13F-HR/A': '13F',
  'DEF 14A': 'DEF',
  'DEFA14A': 'DEF',
  'S-1': 'S1',
  'S-1/A': 'S1',
  'S-3': 'S3',
  'NT 10-K': 'NT',
  'NT 10-Q': 'NT',
};

const filingTypeBadgeColors: Record<string, string> = {
  '8-K': 'bg-purple-500/10 text-purple-700',
  '10-K': 'bg-green-500/10 text-green-600',
  '10-Q': 'bg-blue-500/10 text-blue-500',
  '4': 'bg-indigo-100 text-indigo-700',
  'SC 13D': 'bg-red-500/10 text-red-400',
  'SC 13G': 'bg-pink-100 text-pink-700',
  '13F-HR': 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]',
  'DEF 14A': 'bg-teal-100 text-teal-700',
  'S-1': 'bg-emerald-100 text-emerald-700',
  'NT 10-K': 'bg-red-200 text-red-400',
  'NT 10-Q': 'bg-orange-200 text-orange-500',
};

const filingTypeLabels: Record<string, string> = {
  '8-K': 'Material Event',
  '8-K/A': 'Material Event (Amended)',
  '10-K': 'Annual Report',
  '10-K/A': 'Annual Report (Amended)',
  '10-Q': 'Quarterly Report',
  '10-Q/A': 'Quarterly Report (Amended)',
  '4': 'Insider Transaction',
  '4/A': 'Insider Transaction (Amended)',
  'SC 13D': 'Activist Ownership (>5%)',
  'SC 13D/A': 'Activist Ownership (Amended)',
  'SC 13G': 'Passive Ownership (>5%)',
  'SC 13G/A': 'Passive Ownership (Amended)',
  '13F-HR': 'Institutional Holdings',
  '13F-HR/A': 'Institutional Holdings (Amended)',
  'DEF 14A': 'Proxy Statement',
  'DEFA14A': 'Additional Proxy Materials',
  'S-1': 'IPO Registration',
  'S-1/A': 'IPO Registration (Amended)',
  'S-3': 'Shelf Registration',
  '424B4': 'Prospectus',
  '424B5': 'Prospectus Supplement',
  'NT 10-K': 'Late Annual Filing Notice',
  'NT 10-Q': 'Late Quarterly Filing Notice',
  '6-K': 'Foreign Issuer Report',
  '20-F': 'Foreign Annual Report',
};

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Format time since filing in a human-readable way
 */
function formatTimeSince(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

/**
 * Format date for display
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Check if filing is recent (within 24 hours)
 */
function isRecentFiling(dateString: string): boolean {
  const date = new Date(dateString);
  const now = new Date();
  return now.getTime() - date.getTime() < 24 * 60 * 60 * 1000;
}

/**
 * Get the base filing type (without amendments)
 */
function getBaseFilingType(type: string): string {
  return type.replace(/\/A$/, '');
}

// ============================================================================
// FILING TYPE BADGE COMPONENT
// ============================================================================

function FilingTypeBadge({ type }: { type: string }) {
  const baseType = getBaseFilingType(type);
  const icon = filingTypeIcons[type] || filingTypeIcons[baseType] || type.slice(0, 3).toUpperCase();
  const colorClass = filingTypeBadgeColors[baseType] || 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]';
  const isAmended = type.endsWith('/A');

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold ${colorClass}`}
      title={filingTypeLabels[type] || type}
    >
      {icon}
      {isAmended && <span className="text-[10px] opacity-75">(A)</span>}
    </span>
  );
}

// ============================================================================
// SEVERITY INDICATOR COMPONENT
// ============================================================================

function SeverityIndicator({ severity }: { severity: string }) {
  return (
    <span
      className={`w-2 h-2 rounded-full ${severityDotColors[severity] || 'bg-gray-400'}`}
      title={`${severity.charAt(0).toUpperCase() + severity.slice(1)} priority`}
    />
  );
}

// ============================================================================
// SINGLE FILING CARD COMPONENT
// ============================================================================

interface FilingCardProps {
  alert: FilingAlert;
  expanded: boolean;
  onToggle: () => void;
  compact?: boolean;
}

function FilingCard({ alert, expanded, onToggle, compact = false }: FilingCardProps) {
  const isRecent = isRecentFiling(alert.timestamp);

  return (
    <div
      className={`p-3 rounded-lg border transition-all cursor-pointer hover:shadow-sm ${
        severityColors[alert.severity]
      } ${expanded ? 'ring-2 ring-blue-500 shadow-md' : ''}`}
      onClick={onToggle}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="flex-shrink-0 flex items-center gap-2">
            <SeverityIndicator severity={alert.severity} />
            <FilingTypeBadge type={alert.filing.type} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-[var(--color-text)] truncate">
                {alert.filing.symbol || alert.filing.companyName}
              </span>
              {isRecent && (
                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-green-500 text-white rounded animate-pulse">
                  NEW
                </span>
              )}
              {alert.severity === 'critical' && (
                <AlertTriangle className="w-4 h-4 text-red-600" />
              )}
            </div>
            {!compact && (
              <p className="text-sm opacity-75 truncate">
                {filingTypeLabels[alert.filing.type] || alert.filing.type}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)] flex-shrink-0">
          <Clock className="w-3.5 h-3.5" />
          <span className="whitespace-nowrap">{formatTimeSince(alert.timestamp)}</span>
          {expanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-current/20 space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <Building2 className="w-4 h-4" />
            <span className="font-medium">{alert.filing.companyName}</span>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <Calendar className="w-4 h-4" />
            <span>Filed: {formatDate(alert.timestamp)}</span>
          </div>

          {alert.filing.accessionNumber && (
            <div className="text-xs text-[var(--color-text-secondary)]">
              Accession: {alert.filing.accessionNumber}
            </div>
          )}

          <div className="p-2 bg-[var(--color-bg)]/50 rounded text-sm">
            <TrendingUp className="w-4 h-4 inline mr-2" />
            <span className="font-medium">Suggested Action: </span>
            {alert.suggestedAction}
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href={alert.filing.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              View Filing
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            {alert.filing.formUrl && (
              <a
                href={alert.filing.formUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] text-sm font-medium rounded-lg hover:bg-[var(--color-border)] transition-colors"
              >
                All Documents
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function SECFilingAlert({
  symbols,
  className = '',
  maxAlerts = 10,
  showFilters = true,
  compact = false,
}: SECFilingAlertProps) {
  const [expandedAlert, setExpandedAlert] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [filterSeverity, setFilterSeverity] = useState<SeverityFilter>('all');
  const [showAllFilings, setShowAllFilings] = useState(false);

  // Fetch filings from API
  const {
    data: response,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['sec-filings', symbols.join(',')],
    queryFn: async () => {
      // Try new endpoint first, fall back to alerts endpoint
      try {
        const result = await api.get(`/sec/filings?symbols=${symbols.join(',')}`);
        // Transform response to match expected format
        if (result?.data?.filings) {
          return {
            data: {
              alerts: result.data.filings,
              summary: result.data.summary,
            },
          };
        }
        return result;
      } catch {
        // Fall back to alerts endpoint
        return api.get(`/alerts/sec-filings?symbols=${symbols.join(',')}`);
      }
    },
    enabled: symbols.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 10 * 60 * 1000, // Auto-refresh every 10 minutes
  });

  const allAlerts: FilingAlert[] = useMemo(
    () => response?.data?.alerts || response?.data?.filings || [],
    [response?.data?.alerts, response?.data?.filings]
  );
  const summary: FilingSummary = useMemo(() => response?.data?.summary || {
    total: allAlerts.length,
    critical: allAlerts.filter((a) => a.severity === 'critical').length,
    high: allAlerts.filter((a) => a.severity === 'high').length,
    medium: allAlerts.filter((a) => a.severity === 'medium').length,
    low: allAlerts.filter((a) => a.severity === 'low').length,
  }, [response?.data?.summary, allAlerts]);

  // Filter alerts based on user selection
  const filteredAlerts = useMemo(() => {
    let filtered = allAlerts;

    // Filter by filing type
    if (filterType !== 'all') {
      if (filterType === 'other') {
        const mainTypes = ['8-K', '10-K', '10-Q', '4', 'SC 13D'];
        filtered = filtered.filter(
          (a) => !mainTypes.some((t) => a.filing.type.startsWith(t))
        );
      } else {
        filtered = filtered.filter((a) => a.filing.type.startsWith(filterType));
      }
    }

    // Filter by severity
    if (filterSeverity !== 'all') {
      filtered = filtered.filter((a) => a.severity === filterSeverity);
    }

    return filtered;
  }, [allAlerts, filterType, filterSeverity]);

  const visibleAlerts = showAllFilings
    ? filteredAlerts
    : filteredAlerts.slice(0, maxAlerts);

  const toggleExpand = (id: string) => {
    setExpandedAlert(expandedAlert === id ? null : id);
  };

  // Count filing types for filter badges
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const alert of allAlerts) {
      const baseType = getBaseFilingType(alert.filing.type);
      counts[baseType] = (counts[baseType] || 0) + 1;
    }
    return counts;
  }, [allAlerts]);

  return (
    <Card className={`p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-[var(--color-text)]">SEC Filings</h3>
          {summary.total > 0 && (
            <span className="text-sm text-[var(--color-text-muted)]">
              {summary.total} filing{summary.total !== 1 ? 's' : ''} (last 30 days)
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          aria-label="Refresh SEC filings"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} aria-hidden="true" />
        </Button>
      </div>

      {/* Summary badges */}
      {summary.total > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {summary.critical > 0 && (
            <Badge variant="danger">{summary.critical} Critical</Badge>
          )}
          {summary.high > 0 && (
            <Badge variant="warning">{summary.high} High</Badge>
          )}
          {summary.medium > 0 && (
            <span className="px-2 py-1 text-xs font-medium bg-amber-500/10 text-amber-600 rounded-full">
              {summary.medium} Medium
            </span>
          )}
          {summary.low > 0 && (
            <Badge variant="info">{summary.low} Low</Badge>
          )}
        </div>
      )}

      {/* Filters */}
      {showFilters && allAlerts.length > 0 && (
        <div className="mb-4 p-3 bg-[var(--color-bg-tertiary)] rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Filter className="w-4 h-4 text-[var(--color-text-muted)]" />
            <span className="text-sm font-medium text-[var(--color-text-secondary)]">Filter by type:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilterType('all')}
              className={`px-2 py-1 text-xs rounded-full transition-colors ${
                filterType === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]'
              }`}
            >
              All ({allAlerts.length})
            </button>
            {['8-K', '10-K', '10-Q', '4', 'SC 13D'].map((type) =>
              typeCounts[type] ? (
                <button
                  key={type}
                  onClick={() => setFilterType(type as FilterType)}
                  className={`px-2 py-1 text-xs rounded-full transition-colors ${
                    filterType === type
                      ? 'bg-blue-600 text-white'
                      : 'bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]'
                  }`}
                >
                  {type} ({typeCounts[type]})
                </button>
              ) : null
            )}
            {Object.keys(typeCounts).some(
              (t) => !['8-K', '10-K', '10-Q', '4', 'SC 13D'].includes(t)
            ) && (
              <button
                onClick={() => setFilterType('other')}
                className={`px-2 py-1 text-xs rounded-full transition-colors ${
                  filterType === 'other'
                    ? 'bg-blue-600 text-white'
                    : 'bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]'
                }`}
              >
                Other
              </button>
            )}
          </div>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="py-8 text-center text-[var(--color-text-muted)]">
          <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin" />
          <p>Loading SEC filings...</p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="py-6 text-center">
          <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-amber-500" />
          <p className="text-[var(--color-text-secondary)]">Failed to load SEC filings</p>
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
      {!isLoading && !error && filteredAlerts.length === 0 && (
        <div className="py-8 text-center text-[var(--color-text-muted)]">
          <FileText className="w-8 h-8 mx-auto mb-2 text-[var(--color-text-muted)]" />
          {filterType !== 'all' || filterSeverity !== 'all' ? (
            <>
              <p>No filings match the current filters</p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-2"
                onClick={() => {
                  setFilterType('all');
                  setFilterSeverity('all');
                }}
              >
                Clear Filters
              </Button>
            </>
          ) : (
            <>
              <p>No recent SEC filings for your portfolio</p>
              <p className="text-sm mt-1">
                Filings from the last 30 days will appear here
              </p>
            </>
          )}
        </div>
      )}

      {/* Filing list */}
      {visibleAlerts.length > 0 && (
        <div className="space-y-3">
          {visibleAlerts.map((alert) => (
            <FilingCard
              key={alert.id}
              alert={alert}
              expanded={expandedAlert === alert.id}
              onToggle={() => toggleExpand(alert.id)}
              compact={compact}
            />
          ))}
        </div>
      )}

      {/* Show more/less button */}
      {filteredAlerts.length > maxAlerts && (
        <button
          onClick={() => setShowAllFilings(!showAllFilings)}
          className="w-full mt-3 py-2 text-sm text-blue-600 hover:text-blue-500 font-medium transition-colors"
          aria-expanded={showAllFilings}
        >
          {showAllFilings
            ? 'Show less'
            : `Show ${filteredAlerts.length - maxAlerts} more filings`}
        </button>
      )}

      {/* Footer */}
      {symbols.length > 0 && (
        <div className="mt-4 pt-3 border-t border-[var(--color-border-light)] text-xs text-[var(--color-text-muted)] flex items-center justify-between">
          <span>
            Monitoring: {symbols.slice(0, 5).join(', ')}
            {symbols.length > 5 && ` +${symbols.length - 5} more`}
          </span>
          <a
            href="https://www.sec.gov/edgar/searchedgar/companysearch"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline"
          >
            SEC EDGAR Search
          </a>
        </div>
      )}
    </Card>
  );
}

// ============================================================================
// DEMO/STANDALONE COMPONENT
// ============================================================================

export function SECFilingAlertDemo() {
  const demoSymbols = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA'];
  return <SECFilingAlert symbols={demoSymbols} maxAlerts={10} showFilters={true} />;
}

// ============================================================================
// COMPACT WIDGET FOR DASHBOARD
// ============================================================================

export function SECFilingWidget({
  symbols,
  className = '',
}: {
  symbols: string[];
  className?: string;
}) {
  return (
    <SECFilingAlert
      symbols={symbols}
      className={className}
      maxAlerts={5}
      showFilters={false}
      compact={true}
    />
  );
}
