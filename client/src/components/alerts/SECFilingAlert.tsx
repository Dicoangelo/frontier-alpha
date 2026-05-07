import React, { useState, useMemo, useCallback } from 'react';
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

const severityRails: Record<string, string> = {
  critical: 'before:bg-[var(--color-negative)]',
  high: 'before:bg-[var(--color-warning)]',
  medium: 'before:bg-[var(--color-warning)]',
  low: 'before:bg-[var(--color-info)]',
};

const severityText: Record<string, string> = {
  critical: 'text-[var(--color-negative)]',
  high: 'text-[var(--color-warning)]',
  medium: 'text-[var(--color-warning)]',
  low: 'text-[var(--color-info)]',
};

const severityIconTint: Record<string, string> = {
  critical: 'color-mix(in srgb, var(--color-negative) 12%, transparent)',
  high: 'color-mix(in srgb, var(--color-warning) 12%, transparent)',
  medium: 'color-mix(in srgb, var(--color-warning) 10%, transparent)',
  low: 'color-mix(in srgb, var(--color-info) 12%, transparent)',
};

const severityDotColors: Record<string, string> = {
  critical: 'bg-[var(--color-negative)]',
  high: 'bg-[var(--color-warning)]',
  medium: 'bg-[var(--color-warning)]',
  low: 'bg-[var(--color-info)]',
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
  '8-K': 'bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-[var(--color-accent)]',
  '10-K': 'bg-[color-mix(in_srgb,var(--color-positive)_12%,transparent)] text-[var(--color-positive)]',
  '10-Q': 'bg-[color-mix(in_srgb,var(--color-info)_12%,transparent)] text-[var(--color-info)]',
  '4': 'bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-[var(--color-accent)]',
  'SC 13D': 'bg-[color-mix(in_srgb,var(--color-negative)_12%,transparent)] text-[var(--color-negative)]',
  'SC 13G': 'bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-[var(--color-accent)]',
  '13F-HR': 'bg-theme-tertiary text-theme-secondary',
  'DEF 14A': 'bg-[color-mix(in_srgb,var(--color-positive)_12%,transparent)] text-[var(--color-positive)]',
  'S-1': 'bg-[color-mix(in_srgb,var(--color-positive)_12%,transparent)] text-[var(--color-positive)]',
  'NT 10-K': 'bg-[color-mix(in_srgb,var(--color-negative)_12%,transparent)] text-[var(--color-negative)]',
  'NT 10-Q': 'bg-[color-mix(in_srgb,var(--color-warning)_12%,transparent)] text-[var(--color-warning)]',
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
  const colorClass = filingTypeBadgeColors[baseType] || 'bg-theme-tertiary text-theme-secondary';
  const isAmended = type.endsWith('/A');

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded mono text-xs font-bold tabular-nums ${colorClass}`}
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
      className={`w-2 h-2 rounded-full ${severityDotColors[severity] || 'bg-theme-tertiary'}`}
      title={`${severity.charAt(0).toUpperCase() + severity.slice(1)} priority`}
      aria-hidden="true"
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
      className={`
        glass-slab-floating relative overflow-hidden p-3 pl-5 rounded-lg cursor-pointer
        before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px]
        ${severityRails[alert.severity]}
        transition-[transform,box-shadow] duration-200 animate-press
        ${expanded ? 'shadow-[0_18px_60px_-20px_rgba(123,44,255,0.35)]' : ''}
      `}
      onClick={onToggle}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle();
        }
      }}
      aria-expanded={expanded}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div
            className="p-2 rounded-lg flex-shrink-0 flex items-center gap-2"
            style={{ backgroundColor: severityIconTint[alert.severity] }}
          >
            <SeverityIndicator severity={alert.severity} />
            <FilingTypeBadge type={alert.filing.type} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="mono uppercase tracking-wider font-semibold text-theme truncate">
                {alert.filing.symbol || alert.filing.companyName}
              </span>
              {isRecent && (
                <span className="mono px-1.5 py-0.5 text-[10px] font-bold tracking-wider bg-[var(--color-positive)] text-white rounded animate-pulse-subtle">
                  NEW
                </span>
              )}
              {alert.severity === 'critical' && (
                <AlertTriangle className="w-4 h-4 text-[var(--color-negative)]" aria-hidden="true" />
              )}
            </div>
            {!compact && (
              <p className="text-sm text-theme-secondary truncate mt-0.5">
                {filingTypeLabels[alert.filing.type] || alert.filing.type}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 mono tabular-nums text-[10px] tracking-wider uppercase text-theme-muted flex-shrink-0">
          <Clock className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="whitespace-nowrap">{formatTimeSince(alert.timestamp)}</span>
          {expanded ? (
            <ChevronUp className="w-4 h-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-4 h-4" aria-hidden="true" />
          )}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-theme-light space-y-3 animate-enter">
          <div className="flex items-center gap-2 text-sm text-theme">
            <Building2 className="w-4 h-4 text-theme-muted" aria-hidden="true" />
            <span className="font-medium">{alert.filing.companyName}</span>
          </div>

          <div className="flex items-center gap-2 text-sm text-theme-secondary">
            <Calendar className="w-4 h-4 text-theme-muted" aria-hidden="true" />
            <span className="mono tabular-nums">Filed: {formatDate(alert.timestamp)}</span>
          </div>

          {alert.filing.accessionNumber && (
            <div className="mono text-xs text-theme-muted tabular-nums">
              Accession: {alert.filing.accessionNumber}
            </div>
          )}

          <div className="glass-slab rounded-lg p-3 text-sm text-theme">
            <div className="flex items-start gap-2">
              <TrendingUp className="w-4 h-4 mt-0.5 text-[var(--color-accent)]" aria-hidden="true" />
              <div>
                <p className={`mono text-[10px] tracking-[0.3em] uppercase ${severityText[alert.severity]} mb-1`}>
                  Suggested Action
                </p>
                <p className="text-theme-secondary leading-relaxed">{alert.suggestedAction}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href={alert.filing.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-[image:var(--gradient-sovereign)] text-white text-sm font-medium rounded-lg shadow-[0_4px_18px_-6px_rgba(123,44,255,0.55)] transition-[transform,box-shadow] duration-200 animate-press"
            >
              View Filing
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            </a>
            {alert.filing.formUrl && (
              <a
                href={alert.filing.formUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-theme-tertiary text-theme-secondary border border-theme text-sm font-medium rounded-lg hover:bg-theme-secondary transition-colors duration-200 animate-press"
              >
                All Documents
                <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
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

export const SECFilingAlert = React.memo(function SECFilingAlert({
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

  const toggleExpand = useCallback((id: string) => {
    setExpandedAlert((prev) => (prev === id ? null : id));
  }, []);

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
    <Card className={className}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="p-2 rounded-lg flex-shrink-0"
            style={{ backgroundColor: 'color-mix(in srgb, var(--color-info) 12%, transparent)' }}
          >
            <FileText className="w-5 h-5 text-[var(--color-info)]" aria-hidden="true" />
          </div>
          <div>
            <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Filings · 30-day window</p>
            <h3 className="text-lg font-semibold text-theme mt-0.5">SEC Filings</h3>
          </div>
          {summary.total > 0 && (
            <span className="mono tabular-nums text-xs text-theme-muted">
              {summary.total} filing{summary.total !== 1 ? 's' : ''}
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
            <Badge variant="danger">
              <span className="tabular-nums">{summary.critical}</span> Critical
            </Badge>
          )}
          {summary.high > 0 && (
            <Badge variant="warning">
              <span className="tabular-nums">{summary.high}</span> High
            </Badge>
          )}
          {summary.medium > 0 && (
            <span className="mono px-2 py-1 text-xs font-medium tracking-wider uppercase bg-[color-mix(in_srgb,var(--color-warning)_12%,transparent)] text-[var(--color-warning)] rounded-full">
              <span className="tabular-nums">{summary.medium}</span> Medium
            </span>
          )}
          {summary.low > 0 && (
            <Badge variant="info">
              <span className="tabular-nums">{summary.low}</span> Low
            </Badge>
          )}
        </div>
      )}

      {/* Filters */}
      {showFilters && allAlerts.length > 0 && (
        <div className="glass-slab rounded-lg p-3 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Filter className="w-4 h-4 text-theme-muted" aria-hidden="true" />
            <span className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Filter by type</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilterType('all')}
              aria-label="Show all filing types"
              aria-pressed={filterType === 'all'}
              className={`px-2 py-1 mono text-xs tracking-wider uppercase rounded-full transition-[background-color,color] duration-200 animate-press focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] ${
                filterType === 'all'
                  ? 'bg-[image:var(--gradient-sovereign)] text-white shadow-[0_4px_18px_-6px_rgba(123,44,255,0.55)]'
                  : 'bg-theme-tertiary text-theme-secondary hover:bg-theme-secondary'
              }`}
            >
              All <span className="tabular-nums">({allAlerts.length})</span>
            </button>
            {['8-K', '10-K', '10-Q', '4', 'SC 13D'].map((type) =>
              typeCounts[type] ? (
                <button
                  key={type}
                  onClick={() => setFilterType(type as FilterType)}
                  aria-pressed={filterType === type}
                  className={`px-2 py-1 mono text-xs tracking-wider uppercase rounded-full transition-[background-color,color] duration-200 animate-press ${
                    filterType === type
                      ? 'bg-[image:var(--gradient-sovereign)] text-white shadow-[0_4px_18px_-6px_rgba(123,44,255,0.55)]'
                      : 'bg-theme-tertiary text-theme-secondary hover:bg-theme-secondary'
                  }`}
                >
                  {type} <span className="tabular-nums">({typeCounts[type]})</span>
                </button>
              ) : null
            )}
            {Object.keys(typeCounts).some(
              (t) => !['8-K', '10-K', '10-Q', '4', 'SC 13D'].includes(t)
            ) && (
              <button
                onClick={() => setFilterType('other')}
                aria-pressed={filterType === 'other'}
                className={`px-2 py-1 mono text-xs tracking-wider uppercase rounded-full transition-[background-color,color] duration-200 animate-press ${
                  filterType === 'other'
                    ? 'bg-[image:var(--gradient-sovereign)] text-white shadow-[0_4px_18px_-6px_rgba(123,44,255,0.55)]'
                    : 'bg-theme-tertiary text-theme-secondary hover:bg-theme-secondary'
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
        <div className="py-8 text-center text-theme-muted">
          <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin" aria-hidden="true" />
          <p className="mono text-[10px] tracking-[0.3em] uppercase">Loading SEC filings…</p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="glass-slab-floating relative overflow-hidden rounded-lg pl-5 py-6 px-4 text-center before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[var(--color-warning)]">
          <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-[var(--color-warning)]" aria-hidden="true" />
          <p className="text-theme-secondary">Failed to load SEC filings</p>
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
        <div className="glass-slab gradient-brand-subtle rounded-2xl p-8 text-center">
          <FileText className="w-8 h-8 mx-auto mb-2 text-theme-muted" aria-hidden="true" />
          {filterType !== 'all' || filterSeverity !== 'all' ? (
            <>
              <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">No matches</p>
              <p className="text-sm text-theme-secondary mt-1">No filings match the current filters</p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
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
              <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">All quiet</p>
              <p className="text-sm text-theme-secondary mt-1">No recent SEC filings for your portfolio</p>
              <p className="text-xs text-theme-muted mt-1">Filings from the last 30 days will appear here</p>
            </>
          )}
        </div>
      )}

      {/* Filing list */}
      {visibleAlerts.length > 0 && (
        <div className="space-y-3 animate-stagger">
          {visibleAlerts.map((alert) => (
            <div key={alert.id} className="animate-enter">
              <FilingCard
                alert={alert}
                expanded={expandedAlert === alert.id}
                onToggle={() => toggleExpand(alert.id)}
                compact={compact}
              />
            </div>
          ))}
        </div>
      )}

      {/* Show more/less button */}
      {filteredAlerts.length > maxAlerts && (
        <button
          onClick={() => setShowAllFilings(!showAllFilings)}
          className="w-full mt-3 py-2 mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-info)] hover:opacity-80 font-semibold transition-opacity duration-200 animate-press"
          aria-expanded={showAllFilings}
        >
          {showAllFilings
            ? 'Show less'
            : `Show ${filteredAlerts.length - maxAlerts} more filings`}
        </button>
      )}

      {/* Footer */}
      {symbols.length > 0 && (
        <div className="mt-4 pt-3 border-t border-theme-light mono text-[10px] tracking-[0.2em] uppercase text-theme-muted flex items-center justify-between gap-3">
          <span className="truncate">
            Monitoring · {symbols.slice(0, 5).join(', ')}
            {symbols.length > 5 && ` +${symbols.length - 5} more`}
          </span>
          <a
            href="https://www.sec.gov/edgar/searchedgar/companysearch"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-info)] hover:underline whitespace-nowrap animate-press"
          >
            SEC EDGAR
          </a>
        </div>
      )}
    </Card>
  );
});

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
