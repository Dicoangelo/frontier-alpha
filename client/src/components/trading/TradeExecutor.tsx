import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
} from 'lucide-react';
import { Card } from '@/components/shared/Card';
import { Button } from '@/components/shared/Button';
import { Badge } from '@/components/shared/Badge';
import { api } from '@/api/client';

interface OrderRequest {
  symbol: string;
  qty: number;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop_limit';
  timeInForce?: 'day' | 'gtc' | 'ioc' | 'fok';
  limitPrice?: number;
  stopPrice?: number;
}

interface Order {
  id: string;
  symbol: string;
  qty: number;
  side: string;
  type: string;
  status: string;
  filledQty: number;
  filledAvgPrice?: number;
  createdAt: string;
}

interface Account {
  id: string;
  status: string;
  currency: string;
  buyingPower: number;
  cash: number;
  portfolioValue: number;
}

interface TradeExecutorProps {
  defaultSymbol?: string;
  onOrderSubmitted?: (order: Order) => void;
  className?: string;
}

const orderTypeOptions = [
  { value: 'market', label: 'Market' },
  { value: 'limit', label: 'Limit' },
  { value: 'stop', label: 'Stop' },
  { value: 'stop_limit', label: 'Stop Limit' },
];

const timeInForceOptions = [
  { value: 'day', label: 'Day' },
  { value: 'gtc', label: 'GTC' },
  { value: 'ioc', label: 'IOC' },
  { value: 'fok', label: 'FOK' },
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
  const queryClient = useQueryClient();

  // Form state
  const [symbol, setSymbol] = useState(defaultSymbol);
  const [qty, setQty] = useState<number>(1);
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState<'market' | 'limit' | 'stop' | 'stop_limit'>('market');
  const [timeInForce, setTimeInForce] = useState<'day' | 'gtc' | 'ioc' | 'fok'>('day');
  const [limitPrice, setLimitPrice] = useState<number | undefined>(undefined);
  const [stopPrice, setStopPrice] = useState<number | undefined>(undefined);

  // Fetch account info
  const { data: accountData, isLoading: accountLoading } = useQuery({
    queryKey: ['broker-account'],
    queryFn: () => api.get('/broker/trade?action=account'),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });

  const account: Account | null = accountData?.data?.account || null;
  const brokerConnected = accountData?.data?.brokerConnected || false;
  const brokerType = accountData?.data?.brokerType || 'demo';
  const paperTrading = accountData?.data?.paperTrading ?? true;

  // Fetch orders
  const {
    data: ordersData,
    isLoading: ordersLoading,
    refetch: refetchOrders,
  } = useQuery({
    queryKey: ['broker-orders'],
    queryFn: () => api.get('/broker/trade?action=orders'),
    staleTime: 10 * 1000,
    refetchInterval: 30 * 1000,
  });

  const orders: Order[] = ordersData?.data?.orders || [];

  // Submit order mutation
  const submitOrderMutation = useMutation({
    mutationFn: (orderReq: OrderRequest) => api.post('/broker/trade', orderReq),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['broker-orders'] });
      queryClient.invalidateQueries({ queryKey: ['broker-account'] });
      if (onOrderSubmitted && data?.data?.order) {
        onOrderSubmitted(data.data.order);
      }
      // Reset form
      setSymbol('');
      setQty(1);
      setLimitPrice(undefined);
      setStopPrice(undefined);
    },
  });

  // Cancel order mutation
  const cancelOrderMutation = useMutation({
    mutationFn: (orderId: string) => api.delete(`/broker/trade?orderId=${orderId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['broker-orders'] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!symbol.trim()) return;
    if (qty <= 0) return;

    const orderReq: OrderRequest = {
      symbol: symbol.toUpperCase(),
      qty,
      side,
      type: orderType,
      timeInForce,
    };

    if (orderType === 'limit' || orderType === 'stop_limit') {
      orderReq.limitPrice = limitPrice;
    }

    if (orderType === 'stop' || orderType === 'stop_limit') {
      orderReq.stopPrice = stopPrice;
    }

    submitOrderMutation.mutate(orderReq);
  };

  const needsLimitPrice = orderType === 'limit' || orderType === 'stop_limit';
  const needsStopPrice = orderType === 'stop' || orderType === 'stop_limit';

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Account Info */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-gray-900">Account</h3>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={brokerConnected ? 'success' : 'warning'}>
              {brokerType === 'alpaca' ? 'Alpaca' : 'Demo'}
            </Badge>
            {paperTrading && (
              <Badge variant="info">Paper Trading</Badge>
            )}
          </div>
        </div>

        {accountLoading ? (
          <div className="flex items-center gap-2 text-gray-500">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Loading account...
          </div>
        ) : account ? (
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-gray-500">Buying Power</p>
              <p className="text-lg font-semibold text-green-600">
                ${account.buyingPower.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Cash</p>
              <p className="text-lg font-semibold text-gray-900">
                ${account.cash.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Portfolio Value</p>
              <p className="text-lg font-semibold text-gray-900">
                ${account.portfolioValue.toLocaleString()}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-gray-500">Account info unavailable</p>
        )}
      </Card>

      {/* Order Form */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <ShoppingCart className="w-5 h-5 text-purple-600" />
          <h3 className="font-semibold text-gray-900">Place Order</h3>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Symbol */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Symbol</label>
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="AAPL"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          {/* Side Toggle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Side</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSide('buy')}
                className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                  side === 'buy'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <TrendingDown className="w-4 h-4" />
                Sell
              </button>
            </div>
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
            <input
              type="number"
              value={qty}
              onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
              min="1"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          {/* Order Type */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Order Type</label>
              <select
                value={orderType}
                onChange={(e) => setOrderType(e.target.value as typeof orderType)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {orderTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Time in Force</label>
              <select
                value={timeInForce}
                onChange={(e) => setTimeInForce(e.target.value as typeof timeInForce)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Limit Price</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                <input
                  type="number"
                  value={limitPrice || ''}
                  onChange={(e) => setLimitPrice(parseFloat(e.target.value) || undefined)}
                  step="0.01"
                  placeholder="0.00"
                  className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required={needsLimitPrice}
                />
              </div>
            </div>
          )}

          {/* Stop Price */}
          {needsStopPrice && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Stop Price</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                <input
                  type="number"
                  value={stopPrice || ''}
                  onChange={(e) => setStopPrice(parseFloat(e.target.value) || undefined)}
                  step="0.01"
                  placeholder="0.00"
                  className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required={needsStopPrice}
                />
              </div>
            </div>
          )}

          {/* Error Display */}
          {submitOrderMutation.isError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm">
                {(submitOrderMutation.error as any)?.response?.data?.error || 'Order submission failed'}
              </span>
            </div>
          )}

          {/* Success Display */}
          {submitOrderMutation.isSuccess && (
            <div className="flex items-center gap-2 p-3 bg-green-50 text-green-700 rounded-lg">
              <CheckCircle className="w-4 h-4" />
              <span className="text-sm">Order submitted successfully!</span>
            </div>
          )}

          {/* Submit Button */}
          <Button
            type="submit"
            variant={side === 'buy' ? 'primary' : 'danger'}
            fullWidth
            isLoading={submitOrderMutation.isPending}
            leftIcon={side === 'buy' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          >
            {side === 'buy' ? 'Buy' : 'Sell'} {symbol || 'Stock'}
          </Button>

          {!brokerConnected && (
            <p className="text-xs text-center text-gray-500">
              Demo mode - configure ALPACA_API_KEY for real trading
            </p>
          )}
        </form>
      </Card>

      {/* Orders List */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-orange-600" />
            <h3 className="font-semibold text-gray-900">Orders</h3>
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
          <div className="py-8 text-center text-gray-500">
            <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin" />
            <p>Loading orders...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="py-8 text-center text-gray-500">
            <ShoppingCart className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p>No orders yet</p>
            <p className="text-sm">Place an order above to get started</p>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((order) => (
              <div
                key={order.id}
                className="p-3 border border-gray-100 rounded-lg flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      order.side === 'buy' ? 'bg-green-100' : 'bg-red-100'
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
                      <span className="font-semibold text-gray-900">{order.symbol}</span>
                      <Badge variant={statusColors[order.status] || 'neutral'}>
                        {order.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-500">
                      {order.qty} shares @ {order.type === 'market' ? 'Market' : `$${order.filledAvgPrice || '—'}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {order.filledQty > 0 && order.filledAvgPrice && (
                    <span className="text-sm text-gray-600">
                      ${(order.filledQty * order.filledAvgPrice).toFixed(2)}
                    </span>
                  )}
                  {['new', 'accepted', 'pending_new', 'partially_filled'].includes(order.status) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => cancelOrderMutation.mutate(order.id)}
                      disabled={cancelOrderMutation.isPending}
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
  const queryClient = useQueryClient();

  const submitOrderMutation = useMutation({
    mutationFn: (orderReq: OrderRequest) => api.post('/broker/trade', orderReq),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['broker-orders'] });
      if (onOrderSubmitted && data?.data?.order) {
        onOrderSubmitted(data.data.order);
      }
    },
  });

  const handleQuickTrade = () => {
    submitOrderMutation.mutate({
      symbol: symbol.toUpperCase(),
      qty,
      side,
      type: 'market',
      timeInForce: 'day',
    });
  };

  return (
    <div className={`p-4 bg-gray-50 rounded-lg ${className}`}>
      <div className="flex items-center gap-3">
        <DollarSign className="w-5 h-5 text-blue-600" />
        <span className="font-semibold text-gray-900">{symbol}</span>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <input
          type="number"
          value={qty}
          onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
          min="1"
          className="w-20 px-2 py-1 border border-gray-300 rounded text-center"
        />
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            setSide('buy');
            handleQuickTrade();
          }}
          isLoading={submitOrderMutation.isPending && side === 'buy'}
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
          isLoading={submitOrderMutation.isPending && side === 'sell'}
          className="flex-1"
        >
          Sell
        </Button>
      </div>
      {submitOrderMutation.isError && (
        <p className="mt-2 text-xs text-red-600">
          {(submitOrderMutation.error as any)?.response?.data?.error || 'Order failed'}
        </p>
      )}
      {submitOrderMutation.isSuccess && (
        <p className="mt-2 text-xs text-green-600">Order submitted!</p>
      )}
    </div>
  );
}
