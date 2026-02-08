import { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingCart,
  X,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Wallet,
  Activity,
  Eye,
  AlertTriangle,
  Zap,
} from 'lucide-react';
import { Card } from '@/components/shared/Card';
import { Button } from '@/components/shared/Button';
import { Badge } from '@/components/shared/Badge';
import {
  useTrading,
  useQuote,
  type OrderRequest,
  type Order,
  type OrderPreview,
  type OrderValidation,
} from '@/hooks/useTrading';

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

const statusColors: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  filled: 'success',
  partially_filled: 'info',
  new: 'info',
  accepted: 'info',
  pending_new: 'warning',
  canceled: 'neutral',
  expired: 'neutral',
  rejected: 'danger',
};

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
      setSymbol(defaultSymbol);
    }
  }, [defaultSymbol]);

  // Auto-fill limit price from quote
  useEffect(() => {
    if (quote && (orderType === 'limit' || orderType === 'stop_limit') && !limitPrice) {
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
      {/* Account Info */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-[var(--color-text)]">Account</h3>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={brokerConnected ? 'success' : 'warning'}>
              {brokerType === 'alpaca' ? 'Alpaca' : 'Demo'}
            </Badge>
            {paperTrading && (
              <Badge variant="info">Paper Trading</Badge>
            )}
            {!isMarketOpen && (
              <Badge variant="neutral">Market Closed</Badge>
            )}
          </div>
        </div>

        {accountLoading ? (
          <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Loading account...
          </div>
        ) : account ? (
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-[var(--color-text-muted)]">Buying Power</p>
              <p className="text-lg font-semibold text-green-600">
                ${account.buyingPower.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-text-muted)]">Cash</p>
              <p className="text-lg font-semibold text-[var(--color-text)]">
                ${account.cash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-text-muted)]">Portfolio Value</p>
              <p className="text-lg font-semibold text-[var(--color-text)]">
                ${account.portfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-[var(--color-text-muted)]">Account info unavailable</p>
        )}
      </Card>

      {/* Order Form */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <ShoppingCart className="w-5 h-5 text-purple-600" />
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
                className="flex-1 px-3 py-2 border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                    ? 'bg-green-600 text-white'
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
                    ? 'bg-red-600 text-white'
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
              className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
            {estimatedCost > 0 && (
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                Estimated {side === 'buy' ? 'cost' : 'proceeds'}: ${estimatedCost.toFixed(2)}
              </p>
            )}
          </div>

          {/* Order Type */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">Order Type</label>
              <select
                value={orderType}
                onChange={(e) => setOrderType(e.target.value as typeof orderType)}
                className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                  className="w-full pl-7 pr-3 py-2 border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                  className="w-full pl-7 pr-3 py-2 border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                className="w-4 h-4 rounded border-[var(--color-border)] text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-[var(--color-text-secondary)]">Extended hours trading</span>
            </label>
          )}

          {/* Error Display */}
          {submitOrder.isError && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 text-red-400 rounded-lg">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm">
                {(submitOrder.error as any)?.response?.data?.error || 'Order submission failed'}
              </span>
            </div>
          )}

          {/* Success Display */}
          {submitSuccess && (
            <div className="flex items-center gap-2 p-3 bg-green-500/10 text-green-600 rounded-lg">
              <CheckCircle className="w-4 h-4" />
              <span className="text-sm">Order submitted successfully!</span>
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[var(--color-text)]">Order Preview</h3>
              <button
                onClick={() => setShowPreview(false)}
                className="p-1 hover:bg-[var(--color-bg-secondary)] rounded"
              >
                <X className="w-5 h-5 text-[var(--color-text-muted)]" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Order Summary */}
              <div className="p-4 bg-[var(--color-bg-tertiary)] rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-secondary)]">Symbol</span>
                  <span className="font-semibold">{preview.symbol}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-secondary)]">Side</span>
                  <Badge variant={preview.side === 'buy' ? 'success' : 'danger'}>
                    {preview.side.toUpperCase()}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-secondary)]">Quantity</span>
                  <span className="font-semibold">{preview.qty}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-secondary)]">Order Type</span>
                  <span className="font-semibold capitalize">{preview.type}</span>
                </div>
              </div>

              {/* Price Details */}
              <div className="p-4 border border-[var(--color-border)] rounded-lg space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--color-text-secondary)]">Current Price</span>
                  <span>${preview.currentPrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--color-text-secondary)]">Estimated Price</span>
                  <span>${preview.estimatedPrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--color-text-secondary)]">Estimated Cost</span>
                  <span>${preview.estimatedCost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--color-text-secondary)]">Fees</span>
                  <span>${preview.estimatedFees.toFixed(2)}</span>
                </div>
                {preview.slippageEstimate > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--color-text-secondary)]">Est. Slippage</span>
                    <span className="text-yellow-600">${preview.slippageEstimate.toFixed(2)}</span>
                  </div>
                )}
                <hr className="my-2" />
                <div className="flex justify-between font-semibold">
                  <span>Total</span>
                  <span>${preview.estimatedTotal.toFixed(2)}</span>
                </div>
              </div>

              {/* Market Impact */}
              <div className="flex items-center gap-2">
                <Zap className={`w-4 h-4 ${
                  preview.marketImpact === 'high' ? 'text-red-500' :
                  preview.marketImpact === 'medium' ? 'text-yellow-500' :
                  'text-green-500'
                }`} />
                <span className="text-sm text-[var(--color-text-secondary)]">
                  Market Impact: <span className="font-medium capitalize">{preview.marketImpact}</span>
                </span>
              </div>

              {/* Validation */}
              {validation && (
                <>
                  {validation.errors.length > 0 && (
                    <div className="p-3 bg-red-500/10 rounded-lg">
                      {validation.errors.map((error, i) => (
                        <div key={i} className="flex items-start gap-2 text-red-400 text-sm">
                          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                          <span>{error}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {validation.warnings.length > 0 && (
                    <div className="p-3 bg-yellow-500/10 rounded-lg space-y-1">
                      {validation.warnings.map((warning, i) => (
                        <div key={i} className="flex items-start gap-2 text-yellow-700 text-sm">
                          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                          <span>{warning}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setShowPreview(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  variant={side === 'buy' ? 'primary' : 'danger'}
                  onClick={handleConfirmOrder}
                  disabled={!!(validation && !validation.valid)}
                  isLoading={submitOrder.isPending ?? false}
                  className="flex-1"
                >
                  Confirm {side === 'buy' ? 'Buy' : 'Sell'}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Orders List */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-orange-600" />
            <h3 className="font-semibold text-[var(--color-text)]">Orders</h3>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetchOrders()}
            disabled={ordersLoading}
          >
            <RefreshCw className={`w-4 h-4 ${ordersLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {ordersLoading && orders.length === 0 ? (
          <div className="py-8 text-center text-[var(--color-text-muted)]">
            <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin" />
            <p>Loading orders...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="py-8 text-center text-[var(--color-text-muted)]">
            <ShoppingCart className="w-8 h-8 mx-auto mb-2 text-[var(--color-text-muted)]" />
            <p>No orders yet</p>
            <p className="text-sm">Place an order above to get started</p>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.slice(0, 10).map((order) => (
              <div
                key={order.id}
                className="p-3 border border-[var(--color-border-light)] rounded-lg flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      order.side === 'buy' ? 'bg-green-500/10' : 'bg-red-500/10'
                    }`}
                  >
                    {order.side === 'buy' ? (
                      <TrendingUp className="w-4 h-4 text-green-600" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-red-600" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[var(--color-text)]">{order.symbol}</span>
                      <Badge variant={statusColors[order.status] || 'neutral'}>
                        {order.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-[var(--color-text-muted)]">
                      {order.qty} shares @ {order.type === 'market' ? 'Market' : `$${order.limitPrice || order.filledAvgPrice || '-'}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {order.filledQty > 0 && order.filledAvgPrice && (
                    <span className="text-sm text-[var(--color-text-secondary)]">
                      ${(order.filledQty * order.filledAvgPrice).toFixed(2)}
                    </span>
                  )}
                  {['new', 'accepted', 'pending_new', 'partially_filled'].includes(order.status) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => cancelOrder.mutate(order.id)}
                      disabled={cancelOrder.isPending}
                    >
                      <X className="w-4 h-4 text-red-500" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
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
          <DollarSign className="w-5 h-5 text-blue-600" />
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
          className="flex-1 bg-green-600 hover:bg-green-700"
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
        <p className="mt-2 text-xs text-red-600">
          {(submitOrder.error as any)?.response?.data?.error || 'Order failed'}
        </p>
      )}
      {submitOrder.isSuccess && (
        <p className="mt-2 text-xs text-green-600">Order submitted!</p>
      )}
    </div>
  );
}
