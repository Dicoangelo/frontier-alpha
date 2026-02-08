import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Lock,
  Clock,
  Eye,
  AlertTriangle,
  ArrowLeft,
  PieChart,
  BarChart3,
  Share2,
} from 'lucide-react';
// Note: api is not used here since shared portfolios are accessed via public endpoint
import { Card } from '@/components/shared/Card';
import { Spinner } from '@/components/shared/Spinner';

interface SharedPosition {
  id: string;
  symbol: string;
  shares: number;
  weight: number;
  costBasis: number;
  currentPrice: number;
  unrealizedPnL: number;
  change: number;
}

interface FactorExposure {
  factor: string;
  category: string;
  exposure: number;
  tStat: number;
  confidence: number;
  contribution: number;
}

interface SharedPortfolioData {
  portfolio: {
    id: string;
    name: string;
    ownerName: string;
    positions: SharedPosition[];
    cash: number;
    totalValue: number;
    currency: string;
    benchmark: string;
  };
  share: {
    permissions: 'view' | 'edit';
    expiresAt: string | null;
  };
  factorExposures: FactorExposure[];
  metrics: {
    positionCount: number;
    totalPnL: number;
    topHolding: SharedPosition | null;
  };
}

export function SharedPortfolio() {
  const { token } = useParams<{ token: string }>();

  const { data, isLoading, error } = useQuery<{ data: SharedPortfolioData }>({
    queryKey: ['shared-portfolio', token],
    queryFn: async () => {
      // Use fetch directly since this is a public endpoint
      const response = await fetch(`/api/v1/portfolio/shared/${token}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to load shared portfolio');
      }
      return response.json();
    },
    enabled: !!token,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center">
        <div className="text-center">
          <Spinner size="lg" />
          <p className="mt-4 text-[var(--color-text-muted)]">Loading shared portfolio...</p>
        </div>
      </div>
    );
  }

  if (error) {
    const errorMessage = error instanceof Error ? error.message : 'An error occurred';
    const isExpired = errorMessage.toLowerCase().includes('expired');
    const isNotFound = errorMessage.toLowerCase().includes('not found') || errorMessage.toLowerCase().includes('revoked');

    return (
      <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center">
          <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center ${
            isExpired ? 'bg-yellow-500/10' : 'bg-red-500/10'
          }`}>
            {isExpired ? (
              <Clock className="w-8 h-8 text-yellow-600" />
            ) : (
              <AlertTriangle className="w-8 h-8 text-red-600" />
            )}
          </div>
          <h1 className="mt-6 text-xl font-semibold text-[var(--color-text)]">
            {isExpired ? 'Share Link Expired' : isNotFound ? 'Share Link Not Found' : 'Unable to Load Portfolio'}
          </h1>
          <p className="mt-2 text-[var(--color-text-muted)]">
            {isExpired
              ? 'This share link has expired. Please ask the owner for a new link.'
              : isNotFound
              ? 'This share link may have been revoked or never existed.'
              : errorMessage}
          </p>
          <Link
            to="/landing"
            className="mt-6 inline-flex items-center gap-2 text-blue-600 hover:text-blue-700"
          >
            <ArrowLeft className="w-4 h-4" />
            Go to Frontier Alpha
          </Link>
        </Card>
      </div>
    );
  }

  const portfolio = data?.data?.portfolio;
  const share = data?.data?.share;
  const factorExposures = data?.data?.factorExposures || [];
  // metrics available for future use: data?.data?.metrics

  if (!portfolio) {
    return (
      <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center">
        <Card className="max-w-md w-full p-8 text-center">
          <AlertTriangle className="w-12 h-12 text-[var(--color-text-muted)] mx-auto" />
          <h1 className="mt-4 text-lg font-medium text-[var(--color-text)]">No Data Available</h1>
        </Card>
      </div>
    );
  }

  const totalPnL = portfolio.positions.reduce((sum, p) => sum + p.unrealizedPnL, 0);
  const pnlPercent = totalPnL / (portfolio.totalValue - totalPnL) * 100;

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      {/* Shared Portfolio Banner */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <Share2 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm text-white/80">Shared Portfolio</p>
                <h1 className="text-xl font-semibold">{portfolio.name}</h1>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1 px-3 py-1 bg-white/20 rounded-full text-sm">
                <Eye className="w-4 h-4" />
                {share?.permissions === 'edit' ? 'Can Edit' : 'View Only'}
              </span>
              {share?.expiresAt && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-white/20 rounded-full text-sm">
                  <Clock className="w-4 h-4" />
                  Expires {new Date(share.expiresAt).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Owner Badge */}
      <div className="max-w-6xl mx-auto px-4 -mt-3">
        <div className="inline-flex items-center gap-2 bg-[var(--color-bg)] px-4 py-2 rounded-full shadow-sm border border-[var(--color-border)]">
          <Lock className="w-4 h-4 text-[var(--color-text-muted)]" />
          <span className="text-sm text-[var(--color-text-secondary)]">
            Shared by <span className="font-medium text-[var(--color-text)]">{portfolio.ownerName}</span>
          </span>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* Overview Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-500/10 rounded-lg">
                <DollarSign className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-[var(--color-text-muted)]">Total Value</p>
                <p className="text-2xl font-bold text-[var(--color-text)]">
                  ${portfolio.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-lg ${totalPnL >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                {totalPnL >= 0 ? (
                  <TrendingUp className="w-6 h-6 text-green-600" />
                ) : (
                  <TrendingDown className="w-6 h-6 text-red-600" />
                )}
              </div>
              <div>
                <p className="text-sm text-[var(--color-text-muted)]">Unrealized P&L</p>
                <p className={`text-2xl font-bold ${totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {totalPnL >= 0 ? '+' : ''}${totalPnL.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-lg ${pnlPercent >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                {pnlPercent >= 0 ? (
                  <TrendingUp className="w-6 h-6 text-green-600" />
                ) : (
                  <TrendingDown className="w-6 h-6 text-red-600" />
                )}
              </div>
              <div>
                <p className="text-sm text-[var(--color-text-muted)]">Return</p>
                <p className={`text-2xl font-bold ${pnlPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-500/10 rounded-lg">
                <PieChart className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-[var(--color-text-muted)]">Positions</p>
                <p className="text-2xl font-bold text-[var(--color-text)]">{portfolio.positions.length}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Positions Table */}
        <Card>
          <div className="px-6 py-4 border-b border-[var(--color-border-light)]">
            <h2 className="text-lg font-semibold text-[var(--color-text)]">Holdings</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-[var(--color-bg-tertiary)]">
                  <th className="text-left py-3 px-6 font-medium text-[var(--color-text-secondary)]">Symbol</th>
                  <th className="text-right py-3 px-6 font-medium text-[var(--color-text-secondary)]">Shares</th>
                  <th className="text-right py-3 px-6 font-medium text-[var(--color-text-secondary)]">Weight</th>
                  <th className="text-right py-3 px-6 font-medium text-[var(--color-text-secondary)]">Price</th>
                  <th className="text-right py-3 px-6 font-medium text-[var(--color-text-secondary)]">Value</th>
                  <th className="text-right py-3 px-6 font-medium text-[var(--color-text-secondary)]">P&L</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.positions.map((position) => (
                  <tr key={position.id} className="border-b hover:bg-[var(--color-bg-tertiary)]">
                    <td className="py-4 px-6">
                      <span className="font-semibold text-[var(--color-text)]">{position.symbol}</span>
                    </td>
                    <td className="py-4 px-6 text-right text-[var(--color-text-secondary)]">
                      {position.shares.toFixed(2)}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 bg-[var(--color-border)] rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full"
                            style={{ width: `${Math.min(position.weight * 100, 100)}%` }}
                          />
                        </div>
                        <span className="text-sm text-[var(--color-text-secondary)] w-12 text-right">
                          {(position.weight * 100).toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-right text-[var(--color-text-secondary)]">
                      ${position.currentPrice.toFixed(2)}
                    </td>
                    <td className="py-4 px-6 text-right font-medium text-[var(--color-text)]">
                      ${(position.shares * position.currentPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className={`py-4 px-6 text-right font-medium ${
                      position.unrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {position.unrealizedPnL >= 0 ? '+' : ''}
                      ${position.unrealizedPnL.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
                {/* Cash row */}
                <tr className="border-b bg-[var(--color-bg-tertiary)]">
                  <td className="py-4 px-6">
                    <span className="font-semibold text-[var(--color-text-secondary)]">Cash</span>
                  </td>
                  <td className="py-4 px-6 text-right text-[var(--color-text-muted)]">-</td>
                  <td className="py-4 px-6 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 bg-[var(--color-border)] rounded-full h-2">
                        <div
                          className="bg-gray-400 h-2 rounded-full"
                          style={{ width: `${Math.min((portfolio.cash / portfolio.totalValue) * 100, 100)}%` }}
                        />
                      </div>
                      <span className="text-sm text-[var(--color-text-secondary)] w-12 text-right">
                        {((portfolio.cash / portfolio.totalValue) * 100).toFixed(1)}%
                      </span>
                    </div>
                  </td>
                  <td className="py-4 px-6 text-right text-[var(--color-text-muted)]">-</td>
                  <td className="py-4 px-6 text-right font-medium text-[var(--color-text)]">
                    ${portfolio.cash.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-4 px-6 text-right text-[var(--color-text-muted)]">-</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>

        {/* Factor Exposures (if available) */}
        {factorExposures.length > 0 && (
          <Card>
            <div className="px-6 py-4 border-b border-[var(--color-border-light)]">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-[var(--color-text-muted)]" />
                <h2 className="text-lg font-semibold text-[var(--color-text)]">Factor Exposures</h2>
              </div>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {factorExposures.slice(0, 8).map((factor) => (
                  <div key={factor.factor} className="p-3 bg-[var(--color-bg-tertiary)] rounded-lg">
                    <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide">{factor.category}</p>
                    <p className="font-medium text-[var(--color-text)]">{factor.factor}</p>
                    <p className={`text-lg font-bold ${factor.exposure >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {factor.exposure >= 0 ? '+' : ''}{factor.exposure.toFixed(3)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}

        {/* Footer */}
        <div className="text-center text-sm text-[var(--color-text-muted)] py-8">
          <p>
            Powered by{' '}
            <Link to="/landing" className="text-blue-600 hover:text-blue-700 font-medium">
              Frontier Alpha
            </Link>
          </p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            This is a read-only view of a shared portfolio. Data may be delayed.
          </p>
        </div>
      </div>
    </div>
  );
}

export default SharedPortfolio;
