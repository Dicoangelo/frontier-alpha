import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Edit2, X, Check } from 'lucide-react';
import { api, isNetworkError, getErrorMessage } from '@/api/client';
import { Card } from '@/components/shared/Card';
import { Button } from '@/components/shared/Button';
import { Spinner } from '@/components/shared/Spinner';
import { SkeletonPortfolioPage } from '@/components/shared/Skeleton';
import { PortfolioExport } from '@/components/portfolio/PortfolioExport';
import { DataLoadError, NetworkError, EmptyPortfolio } from '@/components/shared/EmptyState';
import { PullToRefresh } from '@/components/shared/PullToRefresh';
import { BottomSheet, useBottomSheet } from '@/components/shared/BottomSheet';
import { useIsMobile } from '@/hooks/useIsMobile';

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
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ symbol: '', shares: '', avgCost: '' });

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
    },
  });

  const updatePositionMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string; shares: number; avgCost: number }) =>
      api.put(`/portfolio/positions/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      setEditingId(null);
      setFormData({ symbol: '', shares: '', avgCost: '' });
    },
  });

  const deletePositionMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/portfolio/positions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
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

  // Add Position Form Component (reused in both inline and bottom sheet)
  const AddPositionForm = ({ onCancel }: { onCancel: () => void }) => (
    <form onSubmit={handleAdd} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Symbol</label>
        <input
          type="text"
          value={formData.symbol}
          onChange={(e) => setFormData({ ...formData, symbol: e.target.value })}
          required
          className="w-full px-3 py-3 min-h-[44px] border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-base"
          placeholder="AAPL"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Shares</label>
        <input
          type="number"
          step="0.000001"
          inputMode="decimal"
          value={formData.shares}
          onChange={(e) => setFormData({ ...formData, shares: e.target.value })}
          required
          className="w-full px-3 py-3 min-h-[44px] border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-base"
          placeholder="100"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Avg Cost</label>
        <input
          type="number"
          step="0.01"
          inputMode="decimal"
          value={formData.avgCost}
          onChange={(e) => setFormData({ ...formData, avgCost: e.target.value })}
          required
          className="w-full px-3 py-3 min-h-[44px] border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-base"
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Portfolio Management</h1>
        <div className="flex items-center gap-3">
          {portfolio?.data && (
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
          )}
          <Button onClick={handleAddPositionClick}>
            <Plus className="w-4 h-4 mr-2" />
            Add Position
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-sm text-gray-500">Total Value</p>
          <p className="text-2xl font-bold text-gray-900">
            ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-gray-500">Positions</p>
          <p className="text-2xl font-bold text-gray-900">{positions.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-gray-500">Cash Balance</p>
          <p className="text-2xl font-bold text-gray-900">
            ${cashBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
        </Card>
      </div>

      {/* Inline Add Form (desktop only) */}
      {showAddForm && !isMobile && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Add New Position</h2>
          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Symbol</label>
              <input
                type="text"
                value={formData.symbol}
                onChange={(e) => setFormData({ ...formData, symbol: e.target.value })}
                required
                className="w-full px-3 py-2 min-h-[44px] border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="AAPL"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Shares</label>
              <input
                type="number"
                step="0.000001"
                value={formData.shares}
                onChange={(e) => setFormData({ ...formData, shares: e.target.value })}
                required
                className="w-full px-3 py-2 min-h-[44px] border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Avg Cost</label>
              <input
                type="number"
                step="0.01"
                value={formData.avgCost}
                onChange={(e) => setFormData({ ...formData, avgCost: e.target.value })}
                required
                className="w-full px-3 py-2 min-h-[44px] border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
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

      <Card>
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 px-4 font-medium text-gray-600">Symbol</th>
                <th className="text-right py-3 px-4 font-medium text-gray-600">Shares</th>
                <th className="text-right py-3 px-4 font-medium text-gray-600 hidden sm:table-cell">Avg Cost</th>
                <th className="text-right py-3 px-4 font-medium text-gray-600 hidden sm:table-cell">Current</th>
                <th className="text-right py-3 px-4 font-medium text-gray-600">P&L</th>
                <th className="text-right py-3 px-4 font-medium text-gray-600">Actions</th>
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
                  <tr key={position.id} className="border-b hover:bg-gray-50">
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
                            className="w-24 px-2 py-2 min-h-[44px] border rounded text-right"
                          />
                        </td>
                        <td className="py-3 px-4 hidden sm:table-cell">
                          <input
                            type="number"
                            step="0.01"
                            inputMode="decimal"
                            value={formData.avgCost}
                            onChange={(e) => setFormData({ ...formData, avgCost: e.target.value })}
                            className="w-24 px-2 py-2 min-h-[44px] border rounded text-right"
                          />
                        </td>
                        <td className="py-3 px-4 text-right hidden sm:table-cell">-</td>
                        <td className="py-3 px-4 text-right">-</td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={handleUpdate}
                              className="p-2.5 min-w-[44px] min-h-[44px] text-green-600 hover:bg-green-50 rounded-lg flex items-center justify-center touch-manipulation"
                              aria-label="Save changes"
                            >
                              <Check className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => {
                                setEditingId(null);
                                setFormData({ symbol: '', shares: '', avgCost: '' });
                              }}
                              className="p-2.5 min-w-[44px] min-h-[44px] text-gray-500 hover:bg-gray-100 rounded-lg flex items-center justify-center touch-manipulation"
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
                        <td className="py-3 px-4 text-right hidden sm:table-cell">${position.costBasis.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right hidden sm:table-cell">
                          ${(position.currentPrice || position.costBasis).toFixed(2)}
                        </td>
                        <td className={`py-3 px-4 text-right ${
                          (position.unrealizedPnL || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {(position.unrealizedPnL || 0) >= 0 ? '+' : ''}
                          ${(position.unrealizedPnL || 0).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => startEdit(position)}
                              className="p-2.5 min-w-[44px] min-h-[44px] text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg flex items-center justify-center touch-manipulation"
                              aria-label={`Edit ${position.symbol}`}
                            >
                              <Edit2 className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => deletePositionMutation.mutate(position.id)}
                              className="p-2.5 min-w-[44px] min-h-[44px] text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg flex items-center justify-center touch-manipulation"
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
        <AddPositionForm
          onCancel={() => {
            addPositionSheet.close();
            setFormData({ symbol: '', shares: '', avgCost: '' });
          }}
        />
      </BottomSheet>
    </div>
  );

  return (
    <PullToRefresh onRefresh={handleRefresh} className="min-h-full">
      {content}
    </PullToRefresh>
  );
}
