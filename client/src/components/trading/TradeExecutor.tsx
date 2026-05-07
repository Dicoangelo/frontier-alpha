import { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingCart,
  AlertCircle,
  CheckCircle,
  Eye,
} from 'lucide-react';
import { Card } from '@/components/shared/Card';
import { Button } from '@/components/shared/Button';
import {
  useTrading,
  useQuote,
  type OrderRequest,
  type Order,
  type OrderPreview,
  type OrderValidation,
} from '@/hooks/useTrading';
import { AccountSummary } from './AccountSummary';
import { OrderPreviewModal } from './OrderPreviewModal';
import { OrderHistory } from './OrderHistory';

interface TradeExecutorProps {
  defaultSymbol?: string;
  onOrderSubmitted?: (order: Order) => void;
  className?: string;
}

const orderTypeOptions = [
  { value: 'market', label: 'Market', description: 'Execute immediately at current price' },
  { value: 'limit', label: 'Limit', description: 'Execute at specified price or better' },
  { value: 'stop', label: 'Stop', description: 'Triggers market order when price reaches stop' },
  { value: 'stop_limit', label: 'Stop Limit', description: 'Triggers limit order when price reaches stop' },
];

const timeInForceOptions = [
  { value: 'day', label: 'Day', description: 'Valid until market close' },
  { value: 'gtc', label: 'GTC', description: 'Good til canceled' },
  { value: 'ioc', label: 'IOC', description: 'Immediate or cancel' },
  { value: 'fok', label: 'FOK', description: 'Fill or kill' },
];

export function TradeExecutor({
  defaultSymbol = '',
  onOrderSubmitted,
  className = '',
}: TradeExecutorProps) {
  const {
    account,
    brokerConnected,
    brokerType,
    paperTrading,
    accountLoading,
    orders,
    ordersLoading,
    refetchOrders,
    submitOrder,
    cancelOrder,
    orderPreview,
    isMarketOpen,
  } = useTrading();

  // Form state
  const [symbol, setSymbol] = useState(defaultSymbol);
  const [qty, setQty] = useState<number>(1);
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState<'market' | 'limit' | 'stop' | 'stop_limit'>('market');
  const [timeInForce, setTimeInForce] = useState<'day' | 'gtc' | 'ioc' | 'fok'>('day');
  const [limitPrice, setLimitPrice] = useState<number | undefined>(undefined);
  const [stopPrice, setStopPrice] = useState<number | undefined>(undefined);
  const [extendedHours, setExtendedHours] = useState(false);

  // Preview state
  const [showPreview, setShowPreview] = useState(false);
  const [preview, setPreview] = useState<OrderPreview | null>(null);
  const [validation, setValidation] = useState<OrderValidation | null>(null);

  // Success/error state
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Get real-time quote for the symbol
  const { data: quote } = useQuote(symbol);

  // Update default symbol when prop changes
  useEffect(() => {
    if (defaultSymbol) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing prop to local state
      setSymbol(defaultSymbol);
    }
  }, [defaultSymbol]);

  // Auto-fill limit price from quote
  useEffect(() => {
    if (quote && (orderType === 'limit' || orderType === 'stop_limit') && !limitPrice) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- initializing from external data
      setLimitPrice(side === 'buy' ? quote.ask : quote.bid);
    }
  }, [quote, orderType, side, limitPrice]);

  const needsLimitPrice = orderType === 'limit' || orderType === 'stop_limit';
  const needsStopPrice = orderType === 'stop' || orderType === 'stop_limit';

  // Handle order preview
  const handlePreview = useCallback(async () => {
    if (!symbol.trim() || qty <= 0) return;

    const orderReq: Partial<OrderRequest> = {
      symbol: symbol.toUpperCase(),
      qty,
      side,
      type: orderType,
    };

    if (needsLimitPrice && limitPrice) {
      orderReq.limitPrice = limitPrice;
    }

    if (needsStopPrice && stopPrice) {
      orderReq.stopPrice = stopPrice;
    }

    try {
      const result = await orderPreview.mutateAsync(orderReq);
      setPreview(result.preview);
      setValidation(result.validation);
      setShowPreview(true);
    } catch (error) {
      console.error('Preview failed:', error);
    }
  }, [symbol, qty, side, orderType, limitPrice, stopPrice, needsLimitPrice, needsStopPrice, orderPreview]);

  // Handle order submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!symbol.trim()) return;
    if (qty <= 0) return;

    const orderReq: OrderRequest = {
      symbol: symbol.toUpperCase(),
      qty,
      side,
      type: orderType,
      timeInForce,
      extendedHours,
    };

    if (needsLimitPrice && limitPrice) {
      orderReq.limitPrice = limitPrice;
    }

    if (needsStopPrice && stopPrice) {
      orderReq.stopPrice = stopPrice;
    }

    try {
      const result = await submitOrder.mutateAsync(orderReq);

      setSubmitSuccess(true);
      setTimeout(() => setSubmitSuccess(false), 3000);

      if (onOrderSubmitted && result.order) {
        onOrderSubmitted(result.order);
      }

      // Reset form
      setSymbol('');
      setQty(1);
      setLimitPrice(undefined);
      setStopPrice(undefined);
      setShowPreview(false);
      setPreview(null);
      setValidation(null);
    } catch (error) {
      console.error('Order submission failed:', error);
    }
  };

  // Confirm and submit from preview
  const handleConfirmOrder = () => {
    setShowPreview(false);
    const form = document.getElementById('order-form') as HTMLFormElement;
    if (form) {
      form.requestSubmit();
    }
  };

  // Calculate estimated cost
  const estimatedCost = quote ? qty * (side === 'buy' ? quote.ask : quote.bid) : 0;

  return (
    <div className={`space-y-6 ${className}`}>
      <AccountSummary
        account={account}
        accountLoading={accountLoading}
        brokerConnected={brokerConnected}
        brokerType={brokerType}
        paperTrading={paperTrading}
        isMarketOpen={isMarketOpen}
      />

      {/* Order Form */}
      <Card className="p-4">
        <div className="mb-4">
          <p className="mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-theme-muted">
            Order Ticket
          </p>
          <h3 className="mt-1 font-semibold text-theme flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-[var(--color-accent)]" aria-hidden="true" />
            Place Order
          </h3>
        </div>

        <form id="order-form" onSubmit={handleSubmit} className="space-y-4">
          {/* Symbol with Quote */}
          <div>
            <label className="block mono text-[10px] tracking-[0.3em] uppercase font-medium text-theme-secondary mb-1.5">
              Symbol
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="AAPL"
                className="flex-1 px-3 py-2 min-h-[44px] glass-slab-floating rounded-lg text-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] transition-[border-color,box-shadow] duration-200"
                required
              />
              {quote && (
                <div className="flex items-center gap-2 px-3 py-2 glass-slab-floating rounded-lg text-sm">
                  <span className="mono text-[10px] tracking-[0.2em] uppercase text-theme-muted">Bid</span>
                  <span className="mono font-medium tabular-nums text-theme">${quote.bid.toFixed(2)}</span>
                  <span className="text-theme-muted" aria-hidden="true">·</span>
                  <span className="mono text-[10px] tracking-[0.2em] uppercase text-theme-muted">Ask</span>
                  <span className="mono font-medium tabular-nums text-theme">${quote.ask.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Side Toggle */}
          <div>
            <label className="block mono text-[10px] tracking-[0.3em] uppercase font-medium text-theme-secondary mb-1.5">Side</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSide('buy')}
                aria-pressed={side === 'buy'}
                className={`flex-1 py-2 min-h-[44px] px-4 rounded-lg font-medium animate-press transition-[background-color,box-shadow,transform] duration-200 flex items-center justify-center gap-2 ${
                  side === 'buy'
                    ? 'bg-[image:var(--gradient-sovereign)] text-white shadow-[0_18px_60px_-20px_rgba(123,44,255,0.35)] animate-lift'
                    : 'glass-slab-floating text-theme-secondary hover:text-theme'
                }`}
              >
                <TrendingUp className="w-4 h-4" aria-hidden="true" />
                Buy
              </button>
              <button
                type="button"
                onClick={() => setSide('sell')}
                aria-pressed={side === 'sell'}
                className={`flex-1 py-2 min-h-[44px] px-4 rounded-lg font-medium animate-press transition-[background-color,box-shadow,transform] duration-200 flex items-center justify-center gap-2 ${
                  side === 'sell'
                    ? 'text-white shadow-[0_18px_60px_-20px_rgba(239,68,68,0.35)] animate-lift'
                    : 'glass-slab-floating text-theme-secondary hover:text-theme'
                }`}
                style={side === 'sell' ? { backgroundColor: 'var(--color-negative)' } : undefined}
              >
                <TrendingDown className="w-4 h-4" aria-hidden="true" />
                Sell
              </button>
            </div>
          </div>

          {/* Quantity */}
          <div>
            <label className="block mono text-[10px] tracking-[0.3em] uppercase font-medium text-theme-secondary mb-1.5">Quantity</label>
            <input
              type="number"
              value={qty}
              onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
              min="1"
              className="w-full px-3 py-2 min-h-[44px] glass-slab-floating rounded-lg mono tabular-nums text-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] transition-[border-color,box-shadow] duration-200"
              required
            />
            {estimatedCost > 0 && (
              <p className="mono text-[10px] tracking-[0.2em] uppercase tabular-nums text-theme-muted mt-1.5">
                Est. {side === 'buy' ? 'cost' : 'proceeds'}: ${estimatedCost.toFixed(2)}
              </p>
            )}
          </div>

          {/* Order Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block mono text-[10px] tracking-[0.3em] uppercase font-medium text-theme-secondary mb-1.5">Order Type</label>
              <select
                value={orderType}
                onChange={(e) => setOrderType(e.target.value as typeof orderType)}
                className="w-full px-3 py-2 min-h-[44px] glass-slab-floating rounded-lg text-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] transition-[border-color,box-shadow] duration-200"
              >
                {orderTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block mono text-[10px] tracking-[0.3em] uppercase font-medium text-theme-secondary mb-1.5">Time in Force</label>
              <select
                value={timeInForce}
                onChange={(e) => setTimeInForce(e.target.value as typeof timeInForce)}
                className="w-full px-3 py-2 min-h-[44px] glass-slab-floating rounded-lg text-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] transition-[border-color,box-shadow] duration-200"
              >
                {timeInForceOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Limit Price */}
          {needsLimitPrice && (
            <div>
              <label className="block mono text-[10px] tracking-[0.3em] uppercase font-medium text-theme-secondary mb-1.5">Limit Price</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted">$</span>
                <input
                  type="number"
                  value={limitPrice || ''}
                  onChange={(e) => setLimitPrice(parseFloat(e.target.value) || undefined)}
                  step="0.01"
                  placeholder="0.00"
                  className="w-full pl-7 pr-3 py-2 min-h-[44px] glass-slab-floating rounded-lg mono tabular-nums text-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] transition-[border-color,box-shadow] duration-200"
                  required={needsLimitPrice}
                />
              </div>
            </div>
          )}

          {/* Stop Price */}
          {needsStopPrice && (
            <div>
              <label className="block mono text-[10px] tracking-[0.3em] uppercase font-medium text-theme-secondary mb-1.5">Stop Price</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted">$</span>
                <input
                  type="number"
                  value={stopPrice || ''}
                  onChange={(e) => setStopPrice(parseFloat(e.target.value) || undefined)}
                  step="0.01"
                  placeholder="0.00"
                  className="w-full pl-7 pr-3 py-2 min-h-[44px] glass-slab-floating rounded-lg mono tabular-nums text-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] transition-[border-color,box-shadow] duration-200"
                  required={needsStopPrice}
                />
              </div>
            </div>
          )}

          {/* Extended Hours */}
          {!isMarketOpen && (
            <label className="flex items-center gap-2 cursor-pointer animate-press">
              <input
                type="checkbox"
                checked={extendedHours}
                onChange={(e) => setExtendedHours(e.target.checked)}
                className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]"
              />
              <span className="text-sm text-theme-secondary">Extended hours trading</span>
            </label>
          )}

          {/* Error Display — type rail */}
          {submitOrder.isError && (
            <div
              className="glass-slab-floating relative overflow-hidden flex items-center gap-2 p-3 pl-5 rounded-xl before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px]"
              style={{ backgroundColor: 'color-mix(in srgb, var(--color-negative) 8%, transparent)' }}
            >
              <span aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-[3px] bg-[var(--color-negative)]" />
              <AlertCircle className="w-4 h-4 text-[var(--color-negative)]" aria-hidden="true" />
              <span className="text-sm leading-relaxed text-[var(--color-negative)]">
                {(submitOrder.error as Error)?.message || 'Order submission failed'}
              </span>
            </div>
          )}

          {/* Success Display — type rail */}
          {submitSuccess && (
            <div
              className="glass-slab-floating relative overflow-hidden flex items-center gap-2 p-3 pl-5 rounded-xl before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px]"
              style={{ backgroundColor: 'color-mix(in srgb, var(--color-positive) 8%, transparent)' }}
            >
              <span aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-[3px] bg-[var(--color-positive)]" />
              <CheckCircle className="w-4 h-4 text-[var(--color-positive)]" aria-hidden="true" />
              <span className="text-sm text-[var(--color-positive)]">Order submitted successfully!</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handlePreview}
              disabled={!symbol.trim() || qty <= 0 || orderPreview.isPending}
              leftIcon={<Eye className="w-4 h-4" />}
              className="flex-1 animate-press"
            >
              Preview
            </Button>
            <Button
              type="submit"
              variant={side === 'buy' ? 'primary' : 'danger'}
              isLoading={submitOrder.isPending}
              leftIcon={side === 'buy' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              className={`flex-1 animate-press animate-lift ${side === 'buy' ? 'bg-[image:var(--gradient-sovereign)]' : ''}`}
            >
              {side === 'buy' ? 'Buy' : 'Sell'} {symbol || 'Stock'}
            </Button>
          </div>

          {!brokerConnected && (
            <p className="mono text-[10px] tracking-[0.2em] uppercase text-center text-theme-muted">
              Demo mode — configure ALPACA_API_KEY for real trading
            </p>
          )}
        </form>
      </Card>

      {/* Order Preview Modal */}
      {showPreview && preview && (
        <OrderPreviewModal
          preview={preview}
          validation={validation}
          side={side}
          isSubmitting={submitOrder.isPending ?? false}
          onClose={() => setShowPreview(false)}
          onConfirm={handleConfirmOrder}
        />
      )}

      <OrderHistory
        orders={orders}
        ordersLoading={ordersLoading}
        onRefetch={() => refetchOrders()}
        onCancelOrder={(id) => cancelOrder.mutate(id)}
        isCanceling={cancelOrder.isPending}
      />
    </div>
  );
}

// Compact version for embedding in other pages
export function TradeExecutorCompact({
  symbol,
  onOrderSubmitted,
  className = '',
}: {
  symbol: string;
  onOrderSubmitted?: (order: Order) => void;
  className?: string;
}) {
  const [qty, setQty] = useState(1);
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const { submitOrder } = useTrading();
  const { data: quote } = useQuote(symbol);

  const handleQuickTrade = async () => {
    try {
      const result = await submitOrder.mutateAsync({
        symbol: symbol.toUpperCase(),
        qty,
        side,
        type: 'market',
        timeInForce: 'day',
      });

      if (onOrderSubmitted && result.order) {
        onOrderSubmitted(result.order);
      }
    } catch (error) {
      console.error('Quick trade failed:', error);
    }
  };

  const estimatedCost = quote ? qty * (side === 'buy' ? quote.ask : quote.bid) : 0;

  return (
    <div className={`glass-slab-floating rounded-xl p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-[var(--color-info)]" aria-hidden="true" />
          <span className="font-semibold text-theme">{symbol}</span>
        </div>
        {quote && (
          <span className="mono text-sm tabular-nums text-theme-secondary">${quote.last.toFixed(2)}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={qty}
          onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
          min="1"
          className="w-20 px-2 py-1.5 min-h-[40px] glass-slab-floating rounded-lg mono tabular-nums text-center text-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] transition-[border-color,box-shadow] duration-200"
        />
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            setSide('buy');
            handleQuickTrade();
          }}
          isLoading={submitOrder.isPending && side === 'buy'}
          className="flex-1 bg-[image:var(--gradient-sovereign)] animate-press animate-lift"
        >
          Buy
        </Button>
        <Button
          variant="danger"
          size="sm"
          onClick={() => {
            setSide('sell');
            handleQuickTrade();
          }}
          isLoading={submitOrder.isPending && side === 'sell'}
          className="flex-1 animate-press animate-lift"
        >
          Sell
        </Button>
      </div>
      {estimatedCost > 0 && (
        <p className="mono text-[10px] tracking-[0.2em] uppercase tabular-nums text-theme-muted mt-2 text-center">
          Est. {side === 'buy' ? 'cost' : 'proceeds'}: ${estimatedCost.toFixed(2)}
        </p>
      )}
      {submitOrder.isError && (
        <p className="mt-2 text-xs text-[var(--color-negative)] leading-relaxed">
          {(submitOrder.error as Error)?.message || 'Order failed'}
        </p>
      )}
      {submitOrder.isSuccess && (
        <p className="mt-2 text-xs text-[var(--color-positive)]">Order submitted!</p>
      )}
    </div>
  );
}
