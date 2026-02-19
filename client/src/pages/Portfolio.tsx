import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Edit2, X, Check, Share2, DollarSign, TrendingUp, TrendingDown, BarChart3, Wallet } from 'lucide-react';
import { api, isNetworkError, getErrorMessage } from '@/api/client';
import { useCountUp } from '@/components/portfolio/PortfolioOverview';
import { Card } from '@/components/shared/Card';
import { Button } from '@/components/shared/Button';
import { Spinner } from '@/components/shared/Spinner';
import { SkeletonPortfolioPage } from '@/components/shared/Skeleton';
import { PortfolioExport } from '@/components/portfolio/PortfolioExport';
import { ShareModal } from '@/components/portfolio/ShareModal';
import { DataLoadError, NetworkError, EmptyPortfolio } from '@/components/shared/EmptyState';
import { PullToRefresh } from '@/components/shared/PullToRefresh';
import { BottomSheet, useBottomSheet } from '@/components/shared/BottomSheet';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useToast } from '@/hooks/useToast';
import { TradeReasoning, WhyButton } from '@/components/explainer/TradeReasoning';

interface Position {
  id: string;
  symbol: string;
  shares: number;
  costBasis: number;
  currentPrice: number;
  unrealizedPnL: number;
  weight: number;
}

interface PortfolioData {
  id: string;
  name: string;
  cash: number;
  positions: Position[];
  totalValue: number;
}

export function Portfolio() {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const addPositionSheet = useBottomSheet();
  const { toastSuccess, toastError } = useToast();
  const [showAddForm, setShowAddForm] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ symbol: '', shares: '', avgCost: '' });
  const [whySymbol, setWhySymbol] = useState<string | null>(null);

  const { data: portfolio, isLoading, error, refetch } = useQuery<{ data: PortfolioData }>({
    queryKey: ['portfolio'],
    queryFn: () => api.get('/portfolio'),
  });

  const addPositionMutation = useMutation({
    mutationFn: (data: { symbol: string; shares: number; avgCost: number }) =>
      api.post('/portfolio/positions', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      setShowAddForm(false);
      addPositionSheet.close();
      setFormData({ symbol: '', shares: '', avgCost: '' });
      toastSuccess('Position added', { message: `${formData.symbol.toUpperCase()} added to portfolio` });
    },
    onError: (error) => {
      toastError('Failed to add position', { message: getErrorMessage(error) });
    },
  });

  const updatePositionMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string; shares: number; avgCost: number }) =>
      api.put(`/portfolio/positions/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      setEditingId(null);
      toastSuccess('Position updated');
      setFormData({ symbol: '', shares: '', avgCost: '' });
    },
    onError: (error) => {
      toastError('Failed to update position', { message: getErrorMessage(error) });
    },
  });

  const deletePositionMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/portfolio/positions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      toastSuccess('Position removed');
    },
    onError: (error) => {
      toastError('Failed to remove position', { message: getErrorMessage(error) });
    },
  });

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['portfolio'] });
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    addPositionMutation.mutate({
      symbol: formData.symbol.toUpperCase(),
      shares: parseFloat(formData.shares),
      avgCost: parseFloat(formData.avgCost),
    });
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    updatePositionMutation.mutate({
      id: editingId,
      shares: parseFloat(formData.shares),
      avgCost: parseFloat(formData.avgCost),
    });
  };

  const startEdit = (position: Position) => {
    setEditingId(position.id);
    setFormData({
      symbol: position.symbol,
      shares: position.shares.toString(),
      avgCost: position.costBasis.toString(),
    });
  };

  const handleAddPositionClick = () => {
    if (isMobile) {
      addPositionSheet.open();
    } else {
      setShowAddForm(true);
    }
  };

  if (isLoading) {
    return <SkeletonPortfolioPage />;
  }

  if (error) {
    const handleRetry = () => refetch();

    // Show NetworkError for connection issues, DataLoadError for API errors
    if (isNetworkError(error)) {
      return (
        <Card className="p-6">
          <NetworkError onRetry={handleRetry} />
        </Card>
      );
    }

    return (
      <Card className="p-6">
        <DataLoadError onRetry={handleRetry} error={getErrorMessage(error)} />
      </Card>
    );
  }

  const positions = portfolio?.data?.positions || [];
  const cashBalance = portfolio?.data?.cash || 0;
  const totalValue = portfolio?.data?.totalValue || 0;

  const totalPnL = useMemo(
    () => positions.reduce((sum, p) => sum + (p.unrealizedPnL || 0), 0),
    [positions]
  );

  const totalValueRef = useCountUp(totalValue, 800);
  const pnlRef = useCountUp(Math.abs(totalPnL), 800);
  const cashRef = useCountUp(cashBalance, 800);

  // Add Position Form (reused in both inline and bottom sheet)
  const renderAddPositionForm = (onCancel: () => void) => (
    <form onSubmit={handleAdd} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Symbol</label>
        <input
          type="text"
          value={formData.symbol}
          onChange={(e) => setFormData({ ...formData, symbol: e.target.value })}
          required
          className="w-full px-3 py-3 min-h-[44px] border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-[var(--color-info)] text-base"
          placeholder="AAPL"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Shares</label>
        <input
          type="number"
          step="0.000001"
          inputMode="decimal"
          value={formData.shares}
          onChange={(e) => setFormData({ ...formData, shares: e.target.value })}
          required
          className="w-full px-3 py-3 min-h-[44px] border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-[var(--color-info)] text-base"
          placeholder="100"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Avg Cost</label>
        <input
          type="number"
          step="0.01"
          inputMode="decimal"
          value={formData.avgCost}
          onChange={(e) => setFormData({ ...formData, avgCost: e.target.value })}
          required
          className="w-full px-3 py-3 min-h-[44px] border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-[var(--color-info)] text-base"
          placeholder="150.00"
        />
      </div>
      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={addPositionMutation.isPending} fullWidth>
          {addPositionMutation.isPending ? <Spinner className="w-4 h-4" /> : 'Add Position'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          fullWidth
        >
          Cancel
        </Button>
      </div>
    </form>
  );

  const content = (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-fade-in-up" style={{ animationFillMode: 'both' }}>
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-[var(--color-text)]">Portfolio Management</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">Manage positions, track performance, and rebalance</p>
        </div>
        <div className="flex items-center gap-3">
          {portfolio?.data && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowShareModal(true)}
              >
                <Share2 className="w-4 h-4 mr-2" />
                Share
              </Button>
              <PortfolioExport
                portfolio={{
                  id: portfolio.data.id,
                  name: portfolio.data.name,
                  positions: portfolio.data.positions.map((p) => ({
                    symbol: p.symbol,
                    shares: p.shares,
                    weight: p.weight,
                    costBasis: p.costBasis,
                    currentPrice: p.currentPrice,
                    unrealizedPnL: p.unrealizedPnL,
                  })),
                  cash: portfolio.data.cash,
                  totalValue: portfolio.data.totalValue,
                  currency: 'USD',
                }}
              />
            </>
          )}
          <Button onClick={handleAddPositionClick}>
            <Plus className="w-4 h-4 mr-2" />
            Add Position
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in-up" style={{ animationDelay: '50ms', animationFillMode: 'both' }}>
        <div className="flex items-center gap-3 p-4 rounded-xl bg-[var(--color-bg-tertiary)]">
          <div className="p-3 rounded-lg flex-shrink-0" style={{ backgroundColor: 'var(--color-accent-light)' }}>
            <DollarSign className="w-5 h-5" style={{ color: 'var(--color-accent)' }} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Total Value</p>
            <p className="text-xl font-bold text-[var(--color-text)] mt-0.5">
              $<span ref={totalValueRef}>0</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 p-4 rounded-xl bg-[var(--color-bg-tertiary)]">
          <div className="p-3 rounded-lg flex-shrink-0" style={{ backgroundColor: totalPnL >= 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)' }}>
            {totalPnL >= 0
              ? <TrendingUp className="w-5 h-5" style={{ color: 'var(--color-positive)' }} />
              : <TrendingDown className="w-5 h-5" style={{ color: 'var(--color-negative)' }} />
            }
          </div>
          <div className="min-w-0">
            <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Unrealized P&L</p>
            <p className="text-xl font-bold mt-0.5" style={{ color: totalPnL >= 0 ? 'var(--color-positive)' : 'var(--color-negative)' }}>
              {totalPnL >= 0 ? '+$' : '-$'}<span ref={pnlRef}>0</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 p-4 rounded-xl bg-[var(--color-bg-tertiary)]">
          <div className="p-3 rounded-lg flex-shrink-0" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)' }}>
            <BarChart3 className="w-5 h-5" style={{ color: 'var(--color-info)' }} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Positions</p>
            <p className="text-xl font-bold text-[var(--color-text)] mt-0.5">{positions.length}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 p-4 rounded-xl bg-[var(--color-bg-tertiary)]">
          <div className="p-3 rounded-lg flex-shrink-0" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)' }}>
            <Wallet className="w-5 h-5" style={{ color: 'var(--color-warning)' }} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Cash Balance</p>
            <p className="text-xl font-bold text-[var(--color-text)] mt-0.5">
              $<span ref={cashRef}>0</span>
            </p>
          </div>
        </div>
      </div>

      {/* Inline Add Form (desktop only) */}
      {showAddForm && !isMobile && (
        <Card className="p-6 animate-fade-in-up" style={{ animationFillMode: 'both' }}>
          <h2 className="text-lg font-semibold mb-4">Add New Position</h2>
          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Symbol</label>
              <input
                type="text"
                value={formData.symbol}
                onChange={(e) => setFormData({ ...formData, symbol: e.target.value })}
                required
                className="w-full px-3 py-2 min-h-[44px] border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-[var(--color-info)]"
                placeholder="AAPL"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Shares</label>
              <input
                type="number"
                step="0.000001"
                value={formData.shares}
                onChange={(e) => setFormData({ ...formData, shares: e.target.value })}
                required
                className="w-full px-3 py-2 min-h-[44px] border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-[var(--color-info)]"
                placeholder="100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Avg Cost</label>
              <input
                type="number"
                step="0.01"
                value={formData.avgCost}
                onChange={(e) => setFormData({ ...formData, avgCost: e.target.value })}
                required
                className="w-full px-3 py-2 min-h-[44px] border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-[var(--color-info)]"
                placeholder="150.00"
              />
            </div>
            <div className="flex items-end gap-2">
              <Button type="submit" disabled={addPositionMutation.isPending}>
                {addPositionMutation.isPending ? <Spinner className="w-4 h-4" /> : 'Add'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setShowAddForm(false);
                  setFormData({ symbol: '', shares: '', avgCost: '' });
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Mobile: Card layout */}
      {isMobile ? (
        <div className="space-y-3 animate-fade-in-up" style={{ animationDelay: '100ms', animationFillMode: 'both' }}>
          {positions.length === 0 ? (
            <Card className="p-6">
              <EmptyPortfolio onAddPosition={handleAddPositionClick} />
            </Card>
          ) : (
            positions.map((position) => (
              <Card key={position.id} className="p-4">
                {editingId === position.id ? (
                  <form onSubmit={handleUpdate} className="space-y-3">
                    <div className="font-bold text-lg text-[var(--color-text)]">{position.symbol}</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-[var(--color-text-muted)] mb-1">Shares</label>
                        <input
                          type="number"
                          step="0.000001"
                          inputMode="decimal"
                          value={formData.shares}
                          onChange={(e) => setFormData({ ...formData, shares: e.target.value })}
                          className="w-full px-3 py-2 min-h-[44px] border border-[var(--color-border)] rounded-lg text-base"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-[var(--color-text-muted)] mb-1">Avg Cost</label>
                        <input
                          type="number"
                          step="0.01"
                          inputMode="decimal"
                          value={formData.avgCost}
                          onChange={(e) => setFormData({ ...formData, avgCost: e.target.value })}
                          className="w-full px-3 py-2 min-h-[44px] border border-[var(--color-border)] rounded-lg text-base"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        className="flex-1 min-h-[44px] bg-[var(--color-positive)] text-white rounded-lg font-medium flex items-center justify-center gap-2"
                      >
                        <Check className="w-4 h-4" /> Save
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEditingId(null); setFormData({ symbol: '', shares: '', avgCost: '' }); }}
                        className="flex-1 min-h-[44px] bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] rounded-lg font-medium flex items-center justify-center gap-2"
                      >
                        <X className="w-4 h-4" /> Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="font-bold text-lg text-[var(--color-text)]">{position.symbol}</span>
                        <span className={`text-sm font-semibold ${
                          (position.unrealizedPnL || 0) >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'
                        }`}>
                          {(position.unrealizedPnL || 0) >= 0 ? '+' : ''}
                          ${(position.unrealizedPnL || 0).toFixed(2)}
                        </span>
                      </div>
                      <div className="text-sm text-[var(--color-text-secondary)]">
                        {position.shares.toFixed(2)} shares
                      </div>
                      <div className="text-xs text-[var(--color-text-muted)] mt-0.5">
                        Cost ${position.costBasis.toFixed(2)} · Current ${(position.currentPrice || position.costBasis).toFixed(2)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <WhyButton symbol={position.symbol} onClick={setWhySymbol} />
                      <button
                        onClick={() => startEdit(position)}
                        className="p-2.5 min-w-[44px] min-h-[44px] text-[var(--color-text-muted)] hover:text-[var(--color-info)] hover:bg-[var(--color-info)]/10 rounded-lg flex items-center justify-center touch-manipulation"
                        aria-label={`Edit ${position.symbol}`}
                      >
                        <Edit2 className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => deletePositionMutation.mutate(position.id)}
                        className="p-2.5 min-w-[44px] min-h-[44px] text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 rounded-lg flex items-center justify-center touch-manipulation"
                        aria-label={`Delete ${position.symbol}`}
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                )}
              </Card>
            ))
          )}
        </div>
      ) : (
        /* Desktop: Table layout */
        <Card className="animate-fade-in-up" style={{ animationDelay: '100ms', animationFillMode: 'both' }}>
          <div className="overflow-x-auto">
            <table className="w-full" role="table">
              <thead>
                <tr className="border-b border-[var(--color-border-light)]">
                  <th scope="col" className="text-left py-3 px-4 font-medium text-xs uppercase tracking-wider text-[var(--color-text-muted)]">Symbol</th>
                  <th scope="col" className="text-right py-3 px-4 font-medium text-xs uppercase tracking-wider text-[var(--color-text-muted)]">Shares</th>
                  <th scope="col" className="text-right py-3 px-4 font-medium text-xs uppercase tracking-wider text-[var(--color-text-muted)]">Avg Cost</th>
                  <th scope="col" className="text-right py-3 px-4 font-medium text-xs uppercase tracking-wider text-[var(--color-text-muted)]">Current</th>
                  <th scope="col" className="text-right py-3 px-4 font-medium text-xs uppercase tracking-wider text-[var(--color-text-muted)]">P&L</th>
                  <th scope="col" className="text-right py-3 px-4 font-medium text-xs uppercase tracking-wider text-[var(--color-text-muted)]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {positions.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <EmptyPortfolio onAddPosition={handleAddPositionClick} />
                    </td>
                  </tr>
                ) : (
                  positions.map((position) => (
                    <tr key={position.id} className="border-b border-[var(--color-border-light)] last:border-0 hover:bg-[var(--color-bg-tertiary)] transition-colors">
                      {editingId === position.id ? (
                        <>
                          <td className="py-3 px-4 font-medium">{position.symbol}</td>
                          <td className="py-3 px-4">
                            <input
                              type="number"
                              step="0.000001"
                              inputMode="decimal"
                              value={formData.shares}
                              onChange={(e) => setFormData({ ...formData, shares: e.target.value })}
                              className="w-24 px-2 py-2 min-h-[44px] border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] rounded-lg text-right focus:ring-2 focus:ring-[var(--color-info)] focus:outline-none"
                            />
                          </td>
                          <td className="py-3 px-4">
                            <input
                              type="number"
                              step="0.01"
                              inputMode="decimal"
                              value={formData.avgCost}
                              onChange={(e) => setFormData({ ...formData, avgCost: e.target.value })}
                              className="w-24 px-2 py-2 min-h-[44px] border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] rounded-lg text-right focus:ring-2 focus:ring-[var(--color-info)] focus:outline-none"
                            />
                          </td>
                          <td className="py-3 px-4 text-right">-</td>
                          <td className="py-3 px-4 text-right">-</td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={handleUpdate}
                                className="p-2.5 min-w-[44px] min-h-[44px] text-[var(--color-positive)] hover:bg-[var(--color-positive)]/10 rounded-lg flex items-center justify-center"
                                aria-label="Save changes"
                              >
                                <Check className="w-5 h-5" />
                              </button>
                              <button
                                onClick={() => {
                                  setEditingId(null);
                                  setFormData({ symbol: '', shares: '', avgCost: '' });
                                }}
                                className="p-2.5 min-w-[44px] min-h-[44px] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-secondary)] rounded-lg flex items-center justify-center"
                                aria-label="Cancel editing"
                              >
                                <X className="w-5 h-5" />
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-3 px-4 font-medium">{position.symbol}</td>
                          <td className="py-3 px-4 text-right">{position.shares.toFixed(2)}</td>
                          <td className="py-3 px-4 text-right">${position.costBasis.toFixed(2)}</td>
                          <td className="py-3 px-4 text-right">
                            ${(position.currentPrice || position.costBasis).toFixed(2)}
                          </td>
                          <td className={`py-3 px-4 text-right ${
                            (position.unrealizedPnL || 0) >= 0 ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]'
                          }`}>
                            {(position.unrealizedPnL || 0) >= 0 ? '+' : ''}
                            ${(position.unrealizedPnL || 0).toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <WhyButton symbol={position.symbol} onClick={setWhySymbol} />
                              <button
                                onClick={() => startEdit(position)}
                                className="p-2.5 min-w-[44px] min-h-[44px] text-[var(--color-text-muted)] hover:text-[var(--color-info)] hover:bg-[var(--color-info)]/10 rounded-lg flex items-center justify-center"
                                aria-label={`Edit ${position.symbol}`}
                              >
                                <Edit2 className="w-5 h-5" />
                              </button>
                              <button
                                onClick={() => deletePositionMutation.mutate(position.id)}
                                className="p-2.5 min-w-[44px] min-h-[44px] text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 rounded-lg flex items-center justify-center"
                                aria-label={`Delete ${position.symbol}`}
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Bottom Sheet for mobile Add Position */}
      <BottomSheet
        isOpen={addPositionSheet.isOpen}
        onClose={() => {
          addPositionSheet.close();
          setFormData({ symbol: '', shares: '', avgCost: '' });
        }}
        title="Add New Position"
        height="auto"
      >
        {renderAddPositionForm(() => {
            addPositionSheet.close();
            setFormData({ symbol: '', shares: '', avgCost: '' });
          })}
      </BottomSheet>

      {/* Share Modal */}
      {portfolio?.data && (
        <ShareModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          portfolioId={portfolio.data.id}
          portfolioName={portfolio.data.name}
        />
      )}

      {/* Trade Reasoning Modal */}
      <TradeReasoning
        symbol={whySymbol || ''}
        isOpen={!!whySymbol}
        onClose={() => setWhySymbol(null)}
      />
    </div>
  );

  return (
    <PullToRefresh onRefresh={handleRefresh} className="min-h-full">
      {content}
    </PullToRefresh>
  );
}
