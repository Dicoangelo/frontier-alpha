import React from 'react';
import {
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  X,
  RefreshCw,
  Activity,
} from 'lucide-react';
import { Card } from '@/components/shared/Card';
import { Button } from '@/components/shared/Button';
import { Badge } from '@/components/shared/Badge';
import type { Order } from '@/hooks/useTrading';

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

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface OrderHistoryProps {
  orders: Order[];
  ordersLoading: boolean;
  onRefetch: () => void;
  onCancelOrder: (orderId: string) => void;
  isCanceling: boolean;
}

export const OrderHistory = React.memo(function OrderHistory({
  orders,
  ordersLoading,
  onRefetch,
  onCancelOrder,
  isCanceling,
}: OrderHistoryProps) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-[var(--color-warning)]" />
          <h3 className="font-semibold text-[var(--color-text)]">Orders</h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefetch}
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
          <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-40 animate-pulse-subtle" />
          <p>No orders yet</p>
          <p className="text-sm">Place an order above to get started</p>
        </div>
      ) : (
        <div className="space-y-0">
          {orders.slice(0, 10).map((order, idx) => (
            <div
              key={order.id}
              className="relative pl-6 animate-fade-in-up hover:shadow-lg transition-shadow duration-200"
              style={{ animationDelay: `${idx * 50}ms`, animationFillMode: 'both' }}
            >
              {/* Timeline dot */}
              <div
                className="absolute left-0 top-4 w-3 h-3 rounded-full border-2 border-[var(--color-border)]"
                style={{
                  backgroundColor: order.side === 'buy'
                    ? 'var(--color-positive)'
                    : 'var(--color-negative)',
                }}
              />
              {/* Timeline line (not on last item) */}
              {idx < Math.min(orders.length, 10) - 1 && (
                <div className="absolute left-[5px] top-7 bottom-0 w-0.5 bg-[var(--color-border)]" />
              )}

              {/* Order content */}
              <div className="p-3 mb-2 border border-[var(--color-border-light)] rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{
                      backgroundColor: order.side === 'buy'
                        ? 'color-mix(in srgb, var(--color-positive) 10%, transparent)'
                        : 'color-mix(in srgb, var(--color-negative) 10%, transparent)',
                    }}
                  >
                    {order.side === 'buy' ? (
                      <TrendingUp className="w-4 h-4 text-[var(--color-positive)]" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-[var(--color-negative)]" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[var(--color-text)]">{order.symbol}</span>
                      <Badge variant={statusColors[order.status] || 'neutral'}>
                        {order.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-[var(--color-text-muted)]">
                        {order.qty} shares @ {order.type === 'market' ? 'Market' : `$${order.limitPrice || order.filledAvgPrice || '-'}`}
                      </p>
                      {order.createdAt && (
                        <span className="text-xs text-[var(--color-text-muted)] opacity-70">
                          {formatRelativeTime(order.createdAt)}
                        </span>
                      )}
                    </div>
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
                      onClick={() => onCancelOrder(order.id)}
                      disabled={isCanceling}
                    >
                      <X className="w-4 h-4 text-[var(--color-negative)]" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
});
