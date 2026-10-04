import React, { useState } from 'react';
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
  error?: string;
}

export const OrderHistory = React.memo(function OrderHistory({
  orders,
  ordersLoading,
  onRefetch,
  onCancelOrder,
  isCanceling,
  error,
}: OrderHistoryProps) {
  const [visibleCount, setVisibleCount] = useState(10);
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-theme-muted">
            Order History
          </p>
          <h3 className="mt-1 font-semibold text-theme flex items-center gap-2">
            <Activity className="w-5 h-5 text-[var(--color-warning)]" aria-hidden="true" />
            Orders
          </h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefetch}
          disabled={ordersLoading}
          className="animate-press"
          aria-label="Refresh orders"
        >
          <RefreshCw className={`w-4 h-4 ${ordersLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
        </Button>
      </div>

      {error ? <p role="alert" className="workspace-inline-error">{error}. Use Refresh orders to try again.</p> : ordersLoading && orders.length === 0 ? (
        <div className="py-8 text-center text-theme-muted">
          <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin" aria-hidden="true" />
          <p className="mono text-[11px] tracking-[0.2em] uppercase">Loading orders...</p>
        </div>
      ) : orders.length === 0 ? (
        <div className="py-8 text-center text-theme-muted">
          <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-40 animate-pulse-subtle" aria-hidden="true" />
          <p className="mono text-[11px] tracking-[0.2em] uppercase">No orders yet</p>
          <p className="text-sm leading-relaxed mt-1">Place an order above to get started</p>
        </div>
      ) : (
        <div className="space-y-0 glass-slab-floating rounded-xl p-3" style={{ minHeight: 200 }}>
          {orders.slice(0, visibleCount).map((order, idx) => {
            const railColor = order.side === 'buy'
              ? 'var(--color-positive)'
              : 'var(--color-negative)';
            return (
              <div
                key={order.id}
                className="relative border-b border-[var(--color-border-light)] last:border-0"
                style={{ animationDelay: `${idx * 50}ms`, animationFillMode: 'both' }}
              >
                {/* Order content */}
                <div
                  className="py-3 flex flex-wrap gap-3 items-center justify-between"
                >
                  <div className="flex items-center gap-3 pl-1">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{
                        backgroundColor: `color-mix(in srgb, ${railColor} 10%, transparent)`,
                      }}
                    >
                      {order.side === 'buy' ? (
                        <TrendingUp className="w-4 h-4 text-[var(--color-positive)]" aria-hidden="true" />
                      ) : (
                        <TrendingDown className="w-4 h-4 text-[var(--color-negative)]" aria-hidden="true" />
                      )}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-theme">{order.symbol}</span>
                        <Badge variant={statusColors[order.status] || 'neutral'}>
                          {order.status.replaceAll('_', ' ')}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="mono text-xs tabular-nums text-theme-muted">
                          {order.side === 'buy' ? 'Buy' : 'Sell'} {order.qty} shares · {order.filledAvgPrice ? `$${order.filledAvgPrice.toFixed(2)} fill` : order.limitPrice ? `$${order.limitPrice.toFixed(2)} limit` : order.type.replaceAll('_', ' ')}
                        </p>
                        {order.createdAt && (
                          <span className="mono text-[10px] tracking-[0.2em] uppercase tabular-nums text-theme-muted opacity-70">
                            {formatRelativeTime(order.createdAt)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {order.filledQty > 0 && order.filledAvgPrice && (
                      <span className="mono text-sm tabular-nums text-theme-secondary">
                        ${(order.filledQty * order.filledAvgPrice).toFixed(2)}
                      </span>
                    )}
                    {['new', 'accepted', 'pending_new', 'partially_filled'].includes(order.status) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onCancelOrder(order.id)}
                        disabled={isCanceling}
                        className="animate-press"
                        aria-label={`Cancel order ${order.symbol}`}
                      >
                        <X className="w-4 h-4 text-[var(--color-negative)]" aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {orders.length > visibleCount && <Button variant="ghost" className="mt-3 w-full" onClick={() => setVisibleCount((count) => count + 10)}>Show more orders ({orders.length - visibleCount} remaining)</Button>}
    </Card>
  );
});
