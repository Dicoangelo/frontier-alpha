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
        <div className="flex items-center gap-2 mb-4">
          <ShoppingCart className="w-5 h-5 text-[var(--color-accent)]" />
          <h3 className="font-semibold text-[var(--color-text)]">Place Order</h3>
        </div>

        <form id="order-form" onSubmit={handleSubmit} className="space-y-4">
          {/* Symbol with Quote */}
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Symbol</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="AAPL"
                className="flex-1 px-3 py-2 min-h-[44px] border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-[var(--color-accent)] focus:border-[var(--color-accent)]"
                required
              />
              {quote && (
                <div className="flex items-center gap-2 px-3 py-2 bg-[var(--color-bg-tertiary)] rounded-lg text-sm">
                  <span className="text-[var(--color-text-muted)]">Bid:</span>
                  <span className="font-medium">${quote.bid.toFixed(2)}</span>
                  <span className="text-[var(--color-text-muted)]">|</span>
                  <span className="text-[var(--color-text-muted)]">Ask:</span>
                  <span className="font-medium">${quote.ask.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Side Toggle */}
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Side</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSide('buy')}
                className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                  side === 'buy'
                    ? 'bg-[var(--color-positive)] text-white'
                    : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]'
                }`}
              >
                <TrendingUp className="w-4 h-4" />
                Buy
              </button>
              <button
                type="button"
                onClick={() => setSide('sell')}
                className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                  side === 'sell'
                    ? 'bg-[var(--color-negative)] text-white'
                    : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]'
                }`}
              >
                <TrendingDown className="w-4 h-4" />
                Sell
              </button>
            </div>
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Quantity</label>
            <input
              type="number"
              value={qty}
              onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
              min="1"
              className="w-full px-3 py-2 min-h-[44px] border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-[var(--color-accent)] focus:border-[var(--color-accent)]"
              required
            />
            {estimatedCost > 0 && (
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                Estimated {side === 'buy' ? 'cost' : 'proceeds'}: ${estimatedCost.toFixed(2)}
              </p>
            )}
          </div>

          {/* Order Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Order Type</label>
              <select
                value={orderType}
                onChange={(e) => setOrderType(e.target.value as typeof orderType)}
                className="w-full px-3 py-2 min-h-[44px] border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-[var(--color-accent)] focus:border-[var(--color-accent)]"
              >
                {orderTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Time in Force</label>
              <select
                value={timeInForce}
                onChange={(e) => setTimeInForce(e.target.value as typeof timeInForce)}
                className="w-full px-3 py-2 min-h-[44px] border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-[var(--color-accent)] focus:border-[var(--color-accent)]"
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
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Limit Price</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]">$</span>
                <input
                  type="number"
                  value={limitPrice || ''}
                  onChange={(e) => setLimitPrice(parseFloat(e.target.value) || undefined)}
                  step="0.01"
                  placeholder="0.00"
                  className="w-full pl-7 pr-3 py-2 border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-[var(--color-accent)] focus:border-[var(--color-accent)]"
                  required={needsLimitPrice}
                />
              </div>
            </div>
          )}

          {/* Stop Price */}
          {needsStopPrice && (
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Stop Price</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]">$</span>
                <input
                  type="number"
                  value={stopPrice || ''}
                  onChange={(e) => setStopPrice(parseFloat(e.target.value) || undefined)}
                  step="0.01"
                  placeholder="0.00"
                  className="w-full pl-7 pr-3 py-2 border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-[var(--color-accent)] focus:border-[var(--color-accent)]"
                  required={needsStopPrice}
                />
              </div>
            </div>
          )}

          {/* Extended Hours */}
          {!isMarketOpen && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={extendedHours}
                onChange={(e) => setExtendedHours(e.target.checked)}
                className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
              />
              <span className="text-sm text-[var(--color-text-secondary)]">Extended hours trading</span>
            </label>
          )}

          {/* Error Display */}
          {submitOrder.isError && (
            <div
              className="flex items-center gap-2 p-3 rounded-lg"
              style={{ backgroundColor: 'color-mix(in srgb, var(--color-negative) 10%, transparent)' }}
            >
              <AlertCircle className="w-4 h-4 text-[var(--color-negative)]" />
              <span className="text-sm text-[var(--color-negative)]">
                {(submitOrder.error as Error)?.message || 'Order submission failed'}
              </span>
            </div>
          )}

          {/* Success Display */}
          {submitSuccess && (
            <div
              className="flex items-center gap-2 p-3 rounded-lg"
              style={{ backgroundColor: 'color-mix(in srgb, var(--color-positive) 10%, transparent)' }}
            >
              <CheckCircle className="w-4 h-4 text-[var(--color-positive)]" />
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
              className="flex-1"
            >
              Preview
            </Button>
            <Button
              type="submit"
              variant={side === 'buy' ? 'primary' : 'danger'}
              isLoading={submitOrder.isPending}
              leftIcon={side === 'buy' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              className="flex-1"
            >
              {side === 'buy' ? 'Buy' : 'Sell'} {symbol || 'Stock'}
            </Button>
          </div>

          {!brokerConnected && (
            <p className="text-xs text-center text-[var(--color-text-muted)]">
              Demo mode - configure ALPACA_API_KEY for real trading
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
    <div className={`p-4 bg-[var(--color-bg-tertiary)] rounded-lg ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-[var(--color-info)]" />
          <span className="font-semibold text-[var(--color-text)]">{symbol}</span>
        </div>
        {quote && (
          <span className="text-sm text-[var(--color-text-secondary)]">${quote.last.toFixed(2)}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={qty}
          onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
          min="1"
          className="w-20 px-2 py-1 border border-[var(--color-border)] rounded text-center"
        />
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            setSide('buy');
            handleQuickTrade();
          }}
          isLoading={submitOrder.isPending && side === 'buy'}
          className="flex-1 bg-[var(--color-positive)] hover:opacity-90"
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
          className="flex-1"
        >
          Sell
        </Button>
      </div>
      {estimatedCost > 0 && (
        <p className="text-xs text-[var(--color-text-muted)] mt-2 text-center">
          Est. {side === 'buy' ? 'cost' : 'proceeds'}: ${estimatedCost.toFixed(2)}
        </p>
      )}
      {submitOrder.isError && (
        <p className="mt-2 text-xs text-[var(--color-negative)]">
          {(submitOrder.error as Error)?.message || 'Order failed'}
        </p>
      )}
      {submitOrder.isSuccess && (
        <p className="mt-2 text-xs text-[var(--color-positive)]">Order submitted!</p>
      )}
    </div>
  );
}
