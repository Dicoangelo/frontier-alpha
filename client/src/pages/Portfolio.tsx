import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Edit2, X, Check } from 'lucide-react';
import { api } from '@/api/client';
import { Card } from '@/components/shared/Card';
import { Button } from '@/components/shared/Button';
import { Spinner } from '@/components/shared/Spinner';

interface Position {
  id?: string;
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
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ symbol: '', shares: '', avgCost: '' });

  const { data: portfolio, isLoading, error } = useQuery<{ data: PortfolioData }>({
    queryKey: ['portfolio'],
    queryFn: () => api.get('/portfolio'),
  });

  const addPositionMutation = useMutation({
    mutationFn: (data: { symbol: string; shares: number; avgCost: number }) =>
      api.post('/portfolio/positions', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      setShowAddForm(false);
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-6">
        <p className="text-red-600">Failed to load portfolio. Please try again.</p>
      </Card>
    );
  }

  const positions = portfolio?.data?.positions || [];
  const cashBalance = portfolio?.data?.cash || 0;
  const totalValue = portfolio?.data?.totalValue || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Portfolio Management</h1>
        <Button onClick={() => setShowAddForm(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Position
        </Button>
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

      {showAddForm && (
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
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
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 px-4 font-medium text-gray-600">Symbol</th>
                <th className="text-right py-3 px-4 font-medium text-gray-600">Shares</th>
                <th className="text-right py-3 px-4 font-medium text-gray-600">Avg Cost</th>
                <th className="text-right py-3 px-4 font-medium text-gray-600">Current</th>
                <th className="text-right py-3 px-4 font-medium text-gray-600">P&L</th>
                <th className="text-right py-3 px-4 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {positions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-500">
                    No positions yet. Add your first position to get started.
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
                            value={formData.shares}
                            onChange={(e) => setFormData({ ...formData, shares: e.target.value })}
                            className="w-24 px-2 py-1 border rounded text-right"
                          />
                        </td>
                        <td className="py-3 px-4">
                          <input
                            type="number"
                            step="0.01"
                            value={formData.avgCost}
                            onChange={(e) => setFormData({ ...formData, avgCost: e.target.value })}
                            className="w-24 px-2 py-1 border rounded text-right"
                          />
                        </td>
                        <td className="py-3 px-4 text-right">-</td>
                        <td className="py-3 px-4 text-right">-</td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={handleUpdate}
                            className="p-1 text-green-600 hover:bg-green-50 rounded"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setEditingId(null);
                              setFormData({ symbol: '', shares: '', avgCost: '' });
                            }}
                            className="p-1 text-gray-500 hover:bg-gray-100 rounded ml-1"
                          >
                            <X className="w-4 h-4" />
                          </button>
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
                          (position.unrealizedPnL || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {(position.unrealizedPnL || 0) >= 0 ? '+' : ''}
                          ${(position.unrealizedPnL || 0).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => startEdit(position)}
                            className="p-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => deletePositionMutation.mutate(position.id)}
                            className="p-1 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded ml-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
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
    </div>
  );
}
