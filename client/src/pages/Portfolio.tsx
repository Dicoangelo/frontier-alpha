/**
 * Portfolio Page
 *
 * Live position book — manage holdings, track P&L, rebalance, and export.
 * Layout-wrapped (see App.tsx) — page chrome is provided by parent Layout.
 */

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Edit2, X, Check, Share2, DollarSign, TrendingUp, TrendingDown, BarChart3, Wallet } from 'lucide-react';
import { api, isNetworkError, getErrorMessage } from '@/api/client';
import { useCountUp } from '@/components/portfolio/PortfolioOverview';
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
import { PositionCard } from '@/components/portfolio/mobile/PositionCard';
import { PositionSheet } from '@/components/portfolio/mobile/PositionSheet';
import { FilterBar, type SortKey, type FilterKey } from '@/components/portfolio/mobile/FilterBar';

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

// Canonical input class — matches Settings/Backtest/LoginForm pattern.
const inputClass =
  'block w-full px-4 py-3 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)] transition-[border-color,box-shadow] duration-200 mono text-sm';

const labelClass =
  'block mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-theme-muted mb-2';

const kickerClass =
  'mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-theme-muted mb-2';

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
  const [sheetPositionId, setSheetPositionId] = useState<string | null>(null);
  const [mobileSort, setMobileSort] = useState<SortKey>('weight');
  const [mobileFilter, setMobileFilter] = useState<FilterKey>('all');
  const [mobileQuery, setMobileQuery] = useState('');

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
        <div className="glass-slab rounded-2xl p-6">
          <NetworkError onRetry={handleRetry} />
        </div>
      );
    }

    return (
      <div className="glass-slab rounded-2xl p-6">
        <DataLoadError onRetry={handleRetry} error={getErrorMessage(error)} />
      </div>
    );
  }

  const positions = portfolio?.data?.positions || [];
  const cashBalance = portfolio?.data?.cash || 0;
  const totalValue = portfolio?.data?.totalValue || 0;

  const mobileVisible = useMemo(() => {
    const q = mobileQuery.trim();
    let list = positions.filter((p) => {
      if (q && !p.symbol.includes(q)) return false;
      if (mobileFilter === 'winners' && (p.unrealizedPnL || 0) < 0) return false;
      if (mobileFilter === 'losers' && (p.unrealizedPnL || 0) >= 0) return false;
      return true;
    });
    const pnlPct = (p: Position) => {
      const basis = (p.costBasis || 0) * (p.shares || 0);
      return basis ? (p.unrealizedPnL || 0) / basis : 0;
    };
    list = [...list].sort((a, b) => {
      if (mobileSort === 'alpha') return a.symbol.localeCompare(b.symbol);
      if (mobileSort === 'pnl') return (b.unrealizedPnL || 0) - (a.unrealizedPnL || 0);
      if (mobileSort === 'pnlpct') return pnlPct(b) - pnlPct(a);
      return (b.weight || 0) - (a.weight || 0);
    });
    return list;
  }, [positions, mobileQuery, mobileFilter, mobileSort]);

  const totalPnL = useMemo(
    () => positions.reduce((sum, p) => sum + (p.unrealizedPnL || 0), 0),
    [positions]
  );

  const totalValueRef = useCountUp(totalValue, 800);
  const pnlRef = useCountUp(Math.abs(totalPnL), 800);
  const cashRef = useCountUp(cashBalance, 800);

  // Add Position Form (reused in both inline and bottom sheet)
  const renderAddPositionForm = (onCancel: () => void) => (
    <form onSubmit={handleAdd} className="space-y-5">
      <div>
        <label htmlFor="bs-symbol" className={labelClass}>Symbol</label>
        <input
          id="bs-symbol"
          type="text"
          value={formData.symbol}
          onChange={(e) => setFormData({ ...formData, symbol: e.target.value })}
          required
          className={`${inputClass} uppercase tracking-[0.15em]`}
          placeholder="AAPL"
        />
      </div>
      <div>
        <label htmlFor="bs-shares" className={labelClass}>Shares</label>
        <input
          id="bs-shares"
          type="number"
          step="0.000001"
          inputMode="decimal"
          value={formData.shares}
          onChange={(e) => setFormData({ ...formData, shares: e.target.value })}
          required
          className={`${inputClass} tabular-nums`}
          placeholder="100"
        />
      </div>
      <div>
        <label htmlFor="bs-cost" className={labelClass}>Avg Cost</label>
        <input
          id="bs-cost"
          type="number"
          step="0.01"
          inputMode="decimal"
          value={formData.avgCost}
          onChange={(e) => setFormData({ ...formData, avgCost: e.target.value })}
          required
          className={`${inputClass} tabular-nums`}
          placeholder="150.00"
        />
      </div>
      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={addPositionMutation.isPending}
          className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 min-h-[44px] rounded-sm bg-[image:var(--gradient-sovereign)] text-white mono text-[10px] font-black tracking-[0.3em] uppercase animate-press animate-lift shadow-[0_4px_30px_rgba(123,44,255,0.35)] hover:brightness-110 hover:shadow-[0_6px_40px_rgba(123,44,255,0.5)] disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-[0_4px_30px_rgba(123,44,255,0.35)] transition-[filter,box-shadow] duration-200"
        >
          {addPositionMutation.isPending ? <Spinner className="w-4 h-4" /> : 'Add Position'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 inline-flex items-center justify-center px-5 py-3 min-h-[44px] rounded-sm glass-slab text-theme-secondary hover:text-theme mono text-[10px] tracking-[0.3em] uppercase animate-press transition-colors duration-200"
        >
          Cancel
        </button>
      </div>
    </form>
  );

  const content = (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div
        className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 animate-fade-in-up"
        style={{ animationDelay: '0ms', animationFillMode: 'both' }}
      >
        <div>
          <p className={kickerClass}>
            Positions · <span className="text-[color:var(--color-accent-secondary)]">Live</span>
          </p>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
            <span className="text-gradient-brand">Portfolio</span>
          </h1>
          <p className="mt-3 text-sm sm:text-base text-theme-secondary leading-relaxed max-w-2xl">
            Manage positions, track unrealized P&L, and rebalance with cognitive context on every name.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {portfolio?.data && (
            <>
              <button
                type="button"
                onClick={() => setShowShareModal(true)}
                aria-label="Share portfolio"
                className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-sm glass-slab text-theme-secondary hover:text-theme mono text-[10px] tracking-[0.3em] uppercase animate-press transition-colors duration-200"
              >
                <Share2 className="w-4 h-4" aria-hidden="true" />
                Share
              </button>
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
          <button
            type="button"
            onClick={handleAddPositionClick}
            aria-label="Add position"
            className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] rounded-sm bg-[image:var(--gradient-sovereign)] text-white mono text-[10px] font-black tracking-[0.3em] uppercase animate-press animate-lift shadow-[0_4px_30px_rgba(123,44,255,0.35)] hover:brightness-110 hover:shadow-[0_6px_40px_rgba(123,44,255,0.5)] transition-[filter,box-shadow] duration-200"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Add Position
          </button>
        </div>
      </div>

      {/* ── Stat Tiles ──────────────────────────────────────────────────── */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in-up animate-stagger"
        style={{ animationDelay: '50ms', animationFillMode: 'both' }}
      >
        <div className="animate-enter glass-slab-floating rounded-xl p-4 flex items-center gap-3">
          <div
            className="p-2.5 rounded-lg flex-shrink-0"
            style={{ backgroundColor: 'color-mix(in srgb, var(--color-accent) 12%, transparent)' }}
          >
            <DollarSign className="w-5 h-5" style={{ color: 'var(--color-accent)' }} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Total Value</p>
            <p className="text-xl font-bold mt-1 tabular-nums text-gradient-brand holo-pulse">
              $<span ref={totalValueRef}>0</span>
            </p>
          </div>
        </div>

        <div className="animate-enter glass-slab-floating rounded-xl p-4 flex items-center gap-3">
          <div
            className="p-2.5 rounded-lg flex-shrink-0"
            style={{
              backgroundColor: totalPnL >= 0
                ? 'color-mix(in srgb, var(--color-positive) 12%, transparent)'
                : 'color-mix(in srgb, var(--color-negative) 12%, transparent)',
            }}
          >
            {totalPnL >= 0
              ? <TrendingUp className="w-5 h-5" style={{ color: 'var(--color-positive)' }} aria-hidden="true" />
              : <TrendingDown className="w-5 h-5" style={{ color: 'var(--color-negative)' }} aria-hidden="true" />
            }
          </div>
          <div className="min-w-0">
            <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Unrealized P&L</p>
            <p
              className="text-xl font-bold mt-1 tabular-nums"
              style={{ color: totalPnL >= 0 ? 'var(--color-positive)' : 'var(--color-negative)' }}
            >
              {totalPnL >= 0 ? '+$' : '-$'}<span ref={pnlRef}>0</span>
            </p>
          </div>
        </div>

        <div className="animate-enter glass-slab-floating rounded-xl p-4 flex items-center gap-3">
          <div
            className="p-2.5 rounded-lg flex-shrink-0"
            style={{ backgroundColor: 'color-mix(in srgb, var(--color-info) 12%, transparent)' }}
          >
            <BarChart3 className="w-5 h-5" style={{ color: 'var(--color-info)' }} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Positions</p>
            <p className="text-xl font-bold mt-1 tabular-nums text-theme">{positions.length}</p>
          </div>
        </div>

        <div className="animate-enter glass-slab-floating rounded-xl p-4 flex items-center gap-3">
          <div
            className="p-2.5 rounded-lg flex-shrink-0"
            style={{ backgroundColor: 'color-mix(in srgb, var(--color-warning) 12%, transparent)' }}
          >
            <Wallet className="w-5 h-5" style={{ color: 'var(--color-warning)' }} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Cash Balance</p>
            <p className="text-xl font-bold mt-1 tabular-nums text-theme">
              $<span ref={cashRef}>0</span>
            </p>
          </div>
        </div>
      </div>

      {/* ── Inline Add Form (desktop only) ──────────────────────────────── */}
      {showAddForm && !isMobile && (
        <section
          className="glass-slab rounded-2xl p-6 sm:p-8 animate-fade-in-up"
          style={{ animationFillMode: 'both' }}
        >
          <header className="flex items-start gap-4 mb-6">
            <div
              className="p-2.5 rounded-lg shrink-0"
              style={{ backgroundColor: 'color-mix(in srgb, var(--color-accent) 10%, transparent)' }}
            >
              <Plus className="w-5 h-5" style={{ color: 'var(--color-accent)' }} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className={kickerClass}>New Holding</p>
              <h2 className="text-lg font-bold text-theme mt-1">Add Position</h2>
            </div>
          </header>

          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-4 gap-5 items-end">
            <div>
              <label htmlFor="add-symbol" className={labelClass}>Symbol</label>
              <input
                id="add-symbol"
                type="text"
                value={formData.symbol}
                onChange={(e) => setFormData({ ...formData, symbol: e.target.value })}
                required
                className={`${inputClass} uppercase tracking-[0.15em]`}
                placeholder="AAPL"
              />
            </div>
            <div>
              <label htmlFor="add-shares" className={labelClass}>Shares</label>
              <input
                id="add-shares"
                type="number"
                step="0.000001"
                value={formData.shares}
                onChange={(e) => setFormData({ ...formData, shares: e.target.value })}
                required
                className={`${inputClass} tabular-nums`}
                placeholder="100"
              />
            </div>
            <div>
              <label htmlFor="add-cost" className={labelClass}>Avg Cost</label>
              <input
                id="add-cost"
                type="number"
                step="0.01"
                value={formData.avgCost}
                onChange={(e) => setFormData({ ...formData, avgCost: e.target.value })}
                required
                className={`${inputClass} tabular-nums`}
                placeholder="150.00"
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                type="submit"
                disabled={addPositionMutation.isPending}
                className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 min-h-[44px] rounded-sm bg-[image:var(--gradient-sovereign)] text-white mono text-[10px] font-black tracking-[0.3em] uppercase animate-press animate-lift shadow-[0_4px_30px_rgba(123,44,255,0.35)] hover:brightness-110 hover:shadow-[0_6px_40px_rgba(123,44,255,0.5)] disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-[0_4px_30px_rgba(123,44,255,0.35)] transition-[filter,box-shadow] duration-200"
              >
                {addPositionMutation.isPending ? <Spinner className="w-4 h-4" /> : 'Add'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setFormData({ symbol: '', shares: '', avgCost: '' });
                }}
                className="inline-flex items-center justify-center px-4 py-3 min-h-[44px] rounded-sm glass-slab text-theme-secondary hover:text-theme mono text-[10px] tracking-[0.3em] uppercase animate-press transition-colors duration-200"
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      {/* ── Mobile: Card layout ─────────────────────────────────────────── */}
      {isMobile ? (
        <div
          className="space-y-3 animate-fade-in-up"
          style={{ animationDelay: '100ms', animationFillMode: 'both' }}
        >
          {positions.length === 0 ? (
            <div className="glass-slab gradient-brand-subtle rounded-2xl p-6">
              <EmptyPortfolio onAddPosition={handleAddPositionClick} />
            </div>
          ) : (
            <>
              <FilterBar
                sort={mobileSort}
                onSortChange={setMobileSort}
                filter={mobileFilter}
                onFilterChange={setMobileFilter}
                query={mobileQuery}
                onQueryChange={setMobileQuery}
              />
              {mobileVisible.length === 0 ? (
                <div className="glass-slab rounded-xl p-6 text-center">
                  <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">
                    No positions match your filter
                  </p>
                </div>
              ) : (
                <div className="space-y-3 animate-stagger">
                  {mobileVisible.map((position) => (
                    <div key={position.id} className="animate-enter glass-slab-floating rounded-xl p-4">
                      {editingId === position.id ? (
                        <form onSubmit={handleUpdate} className="space-y-4">
                          <div className="mono text-sm font-bold tracking-[0.15em] uppercase text-theme">
                            {position.symbol}
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label htmlFor={`m-shares-${position.id}`} className={labelClass}>Shares</label>
                              <input
                                id={`m-shares-${position.id}`}
                                type="number"
                                step="0.000001"
                                inputMode="decimal"
                                value={formData.shares}
                                onChange={(e) => setFormData({ ...formData, shares: e.target.value })}
                                className={`${inputClass} tabular-nums`}
                              />
                            </div>
                            <div>
                              <label htmlFor={`m-cost-${position.id}`} className={labelClass}>Avg Cost</label>
                              <input
                                id={`m-cost-${position.id}`}
                                type="number"
                                step="0.01"
                                inputMode="decimal"
                                value={formData.avgCost}
                                onChange={(e) => setFormData({ ...formData, avgCost: e.target.value })}
                                className={`${inputClass} tabular-nums`}
                              />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="submit"
                              className="flex-1 inline-flex items-center justify-center gap-2 min-h-[44px] rounded-sm bg-[image:var(--gradient-sovereign)] text-white mono text-[10px] font-black tracking-[0.3em] uppercase animate-press animate-lift shadow-[0_4px_18px_-6px_rgba(123,44,255,0.55)] transition-[filter,box-shadow] duration-200"
                            >
                              <Check className="w-4 h-4" aria-hidden="true" /> Save
                            </button>
                            <button
                              type="button"
                              onClick={() => { setEditingId(null); setFormData({ symbol: '', shares: '', avgCost: '' }); }}
                              className="flex-1 inline-flex items-center justify-center gap-2 min-h-[44px] rounded-sm glass-slab text-theme-secondary mono text-[10px] tracking-[0.3em] uppercase animate-press transition-colors duration-200"
                            >
                              <X className="w-4 h-4" aria-hidden="true" /> Cancel
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div>
                          <PositionCard
                            position={position}
                            onClick={() => setSheetPositionId(position.id)}
                          />
                          <div className="mt-2 flex items-center gap-1 justify-end border-t border-[var(--color-border-light)] pt-2">
                            <span className="mono text-[10px] tracking-[0.15em] tabular-nums text-theme-muted mr-auto">
                              {position.shares.toFixed(2)} sh · ${(position.currentPrice || position.costBasis).toFixed(2)}
                            </span>
                            <WhyButton symbol={position.symbol} onClick={setWhySymbol} />
                            <button
                              onClick={() => startEdit(position)}
                              className="p-2.5 min-w-[44px] min-h-[44px] text-theme-muted hover:text-[var(--color-accent)] hover:bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] rounded-sm flex items-center justify-center touch-manipulation animate-press transition-colors duration-200"
                              aria-label={`Edit ${position.symbol}`}
                            >
                              <Edit2 className="w-5 h-5" aria-hidden="true" />
                            </button>
                            <button
                              onClick={() => deletePositionMutation.mutate(position.id)}
                              className="p-2.5 min-w-[44px] min-h-[44px] text-theme-muted hover:text-[var(--color-negative)] hover:bg-[color-mix(in_srgb,var(--color-negative)_10%,transparent)] rounded-sm flex items-center justify-center touch-manipulation animate-press transition-colors duration-200"
                              aria-label={`Delete ${position.symbol}`}
                            >
                              <Trash2 className="w-5 h-5" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        /* ── Desktop: Table layout ──────────────────────────────────────── */
        <section
          className="glass-slab rounded-2xl overflow-hidden animate-fade-in-up"
          style={{ animationDelay: '100ms', animationFillMode: 'both' }}
        >
          <div className="overflow-x-auto">
            <table className="w-full" role="table">
              <thead>
                <tr className="border-b border-[var(--color-border-light)]">
                  <th scope="col" className="text-left py-3 px-4 mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Symbol</th>
                  <th scope="col" className="text-right py-3 px-4 mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Shares</th>
                  <th scope="col" className="text-right py-3 px-4 mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Avg Cost</th>
                  <th scope="col" className="text-right py-3 px-4 mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Current</th>
                  <th scope="col" className="text-right py-3 px-4 mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">P&L</th>
                  <th scope="col" className="text-right py-3 px-4 mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Actions</th>
                </tr>
              </thead>
              <tbody>
                {positions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-2">
                      <div className="gradient-brand-subtle rounded-xl">
                        <EmptyPortfolio onAddPosition={handleAddPositionClick} />
                      </div>
                    </td>
                  </tr>
                ) : (
                  positions.map((position) => (
                    <tr
                      key={position.id}
                      className="border-b border-[var(--color-border-light)] last:border-0 hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150"
                    >
                      {editingId === position.id ? (
                        <>
                          <td className="py-3 px-4 mono text-sm tracking-[0.15em] uppercase font-semibold text-theme">{position.symbol}</td>
                          <td className="py-3 px-4">
                            <input
                              type="number"
                              step="0.000001"
                              inputMode="decimal"
                              value={formData.shares}
                              onChange={(e) => setFormData({ ...formData, shares: e.target.value })}
                              className={`${inputClass} text-right tabular-nums w-28`}
                              aria-label={`Edit shares for ${position.symbol}`}
                            />
                          </td>
                          <td className="py-3 px-4">
                            <input
                              type="number"
                              step="0.01"
                              inputMode="decimal"
                              value={formData.avgCost}
                              onChange={(e) => setFormData({ ...formData, avgCost: e.target.value })}
                              className={`${inputClass} text-right tabular-nums w-28`}
                              aria-label={`Edit avg cost for ${position.symbol}`}
                            />
                          </td>
                          <td className="py-3 px-4 text-right tabular-nums text-theme-muted">—</td>
                          <td className="py-3 px-4 text-right tabular-nums text-theme-muted">—</td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={handleUpdate}
                                className="p-2.5 min-w-[44px] min-h-[44px] text-[var(--color-positive)] hover:bg-[color-mix(in_srgb,var(--color-positive)_12%,transparent)] rounded-sm flex items-center justify-center animate-press transition-colors duration-200"
                                aria-label="Save changes"
                              >
                                <Check className="w-5 h-5" aria-hidden="true" />
                              </button>
                              <button
                                onClick={() => {
                                  setEditingId(null);
                                  setFormData({ symbol: '', shares: '', avgCost: '' });
                                }}
                                className="p-2.5 min-w-[44px] min-h-[44px] text-theme-muted hover:bg-[var(--color-bg-secondary)] rounded-sm flex items-center justify-center animate-press transition-colors duration-200"
                                aria-label="Cancel editing"
                              >
                                <X className="w-5 h-5" aria-hidden="true" />
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-3 px-4 mono text-sm tracking-[0.15em] uppercase font-semibold text-theme">{position.symbol}</td>
                          <td className="py-3 px-4 text-right tabular-nums text-theme">{position.shares.toFixed(2)}</td>
                          <td className="py-3 px-4 text-right tabular-nums text-theme">${position.costBasis.toFixed(2)}</td>
                          <td className="py-3 px-4 text-right tabular-nums text-theme">
                            ${(position.currentPrice || position.costBasis).toFixed(2)}
                          </td>
                          <td
                            className="py-3 px-4 text-right tabular-nums font-semibold"
                            style={{
                              color: (position.unrealizedPnL || 0) >= 0
                                ? 'var(--color-positive)'
                                : 'var(--color-negative)',
                            }}
                          >
                            {(position.unrealizedPnL || 0) >= 0 ? '+' : ''}
                            ${(position.unrealizedPnL || 0).toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <WhyButton symbol={position.symbol} onClick={setWhySymbol} />
                              <button
                                onClick={() => startEdit(position)}
                                className="p-2.5 min-w-[44px] min-h-[44px] text-theme-muted hover:text-[var(--color-accent)] hover:bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] rounded-sm flex items-center justify-center animate-press transition-colors duration-200"
                                aria-label={`Edit ${position.symbol}`}
                              >
                                <Edit2 className="w-5 h-5" aria-hidden="true" />
                              </button>
                              <button
                                onClick={() => deletePositionMutation.mutate(position.id)}
                                className="p-2.5 min-w-[44px] min-h-[44px] text-theme-muted hover:text-[var(--color-negative)] hover:bg-[color-mix(in_srgb,var(--color-negative)_10%,transparent)] rounded-sm flex items-center justify-center animate-press transition-colors duration-200"
                                aria-label={`Delete ${position.symbol}`}
                              >
                                <Trash2 className="w-5 h-5" aria-hidden="true" />
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
        </section>
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

      {/* Mobile position detail sheet */}
      <PositionSheet
        position={positions.find((p) => p.id === sheetPositionId) || null}
        onClose={() => setSheetPositionId(null)}
        onEdit={() => {
          const p = positions.find((x) => x.id === sheetPositionId);
          if (p) startEdit(p);
          setSheetPositionId(null);
        }}
        onDelete={(id) => {
          if (id) deletePositionMutation.mutate(id);
        }}
      />
    </div>
  );

  return (
    <PullToRefresh onRefresh={handleRefresh} className="min-h-full">
      {content}
    </PullToRefresh>
  );
}
