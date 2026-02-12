/**
 * Broker Adapter - Abstract interface for broker integrations
 *
 * Supports multiple brokers through a unified interface:
 * - Alpaca (paper and live trading)
 * - Interactive Brokers (future)
 * - TD Ameritrade (future)
 */

import { logger } from '../lib/logger.js';

export interface BrokerAccount {
  id: string;
  status: 'active' | 'inactive' | 'restricted';
  currency: string;
  buyingPower: number;
  cash: number;
  portfolioValue: number;
  dayTradeCount: number;
  patternDayTrader: boolean;
}

export interface BrokerPosition {
  symbol: string;
  qty: number;
  side: 'long' | 'short';
  marketValue: number;
  costBasis: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  currentPrice: number;
  avgEntryPrice: number;
}

export interface Order {
  id: string;
  clientOrderId?: string;
  symbol: string;
  qty: number;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop_limit';
  timeInForce: 'day' | 'gtc' | 'ioc' | 'fok';
  limitPrice?: number;
  stopPrice?: number;
  status: OrderStatus;
  filledQty: number;
  filledAvgPrice?: number;
  createdAt: Date;
  updatedAt: Date;
  submittedAt?: Date;
  filledAt?: Date;
  expiredAt?: Date;
  canceledAt?: Date;
}

export type OrderStatus =
  | 'new'
  | 'accepted'
  | 'pending_new'
  | 'partially_filled'
  | 'filled'
  | 'done_for_day'
  | 'canceled'
  | 'expired'
  | 'replaced'
  | 'rejected'
  | 'suspended'
  | 'pending_cancel'
  | 'pending_replace';

export interface OrderRequest {
  symbol: string;
  qty: number;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop_limit';
  timeInForce?: 'day' | 'gtc' | 'ioc' | 'fok';
  limitPrice?: number;
  stopPrice?: number;
  clientOrderId?: string;
}

export interface BrokerConfig {
  apiKey: string;
  apiSecret: string;
  paperTrading?: boolean;
  baseUrl?: string;
}

/**
 * Abstract broker interface - implemented by each broker adapter
 */
export abstract class BrokerAdapter {
  protected config: BrokerConfig;
  protected connected = false;

  constructor(config: BrokerConfig) {
    this.config = config;
  }

  abstract get name(): string;
  abstract get isPaperTrading(): boolean;

  // Connection
  abstract connect(): Promise<boolean>;
  abstract disconnect(): Promise<void>;
  isConnected(): boolean {
    return this.connected;
  }

  // Account
  abstract getAccount(): Promise<BrokerAccount>;
  abstract getPositions(): Promise<BrokerPosition[]>;
  abstract getPosition(symbol: string): Promise<BrokerPosition | null>;

  // Orders
  abstract submitOrder(order: OrderRequest): Promise<Order>;
  abstract getOrder(orderId: string): Promise<Order | null>;
  abstract getOrders(status?: string): Promise<Order[]>;
  abstract cancelOrder(orderId: string): Promise<boolean>;
  abstract cancelAllOrders(): Promise<boolean>;

  // Market data (if supported)
  abstract getQuote(symbol: string): Promise<{ bid: number; ask: number; last: number } | null>;

  /**
   * Validate order before submission
   */
  validateOrder(order: OrderRequest): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!order.symbol || order.symbol.length === 0) {
      errors.push('Symbol is required');
    }

    if (!order.qty || order.qty <= 0) {
      errors.push('Quantity must be positive');
    }

    if (!['buy', 'sell'].includes(order.side)) {
      errors.push('Side must be "buy" or "sell"');
    }

    if (!['market', 'limit', 'stop', 'stop_limit'].includes(order.type)) {
      errors.push('Invalid order type');
    }

    if (order.type === 'limit' && !order.limitPrice) {
      errors.push('Limit price is required for limit orders');
    }

    if (order.type === 'stop' && !order.stopPrice) {
      errors.push('Stop price is required for stop orders');
    }

    if (order.type === 'stop_limit' && (!order.limitPrice || !order.stopPrice)) {
      errors.push('Both limit and stop prices are required for stop-limit orders');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Calculate order value
   */
  calculateOrderValue(order: OrderRequest, currentPrice: number): number {
    const price = order.limitPrice || currentPrice;
    return order.qty * price;
  }
}

/**
 * Mock broker for testing without real API
 */
export class MockBrokerAdapter extends BrokerAdapter {
  private positions: Map<string, BrokerPosition> = new Map();
  private orders: Map<string, Order> = new Map();
  private account: BrokerAccount;

  constructor(config: BrokerConfig) {
    super(config);
    this.account = {
      id: 'mock-account',
      status: 'active',
      currency: 'USD',
      buyingPower: 100000,
      cash: 100000,
      portfolioValue: 100000,
      dayTradeCount: 0,
      patternDayTrader: false,
    };
  }

  get name(): string {
    return 'Mock Broker';
  }

  get isPaperTrading(): boolean {
    return true;
  }

  async connect(): Promise<boolean> {
    this.connected = true;
    logger.info('MockBroker connected');
    return true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    logger.info('MockBroker disconnected');
  }

  async getAccount(): Promise<BrokerAccount> {
    return this.account;
  }

  async getPositions(): Promise<BrokerPosition[]> {
    return Array.from(this.positions.values());
  }

  async getPosition(symbol: string): Promise<BrokerPosition | null> {
    return this.positions.get(symbol.toUpperCase()) || null;
  }

  async submitOrder(orderReq: OrderRequest): Promise<Order> {
    const validation = this.validateOrder(orderReq);
    if (!validation.valid) {
      throw new Error(validation.errors.join(', '));
    }

    const orderId = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date();

    // Simulate immediate fill for market orders
    const isFilled = orderReq.type === 'market';
    const fillPrice = orderReq.limitPrice || 100; // Mock price

    const order: Order = {
      id: orderId,
      clientOrderId: orderReq.clientOrderId,
      symbol: orderReq.symbol.toUpperCase(),
      qty: orderReq.qty,
      side: orderReq.side,
      type: orderReq.type,
      timeInForce: orderReq.timeInForce || 'day',
      limitPrice: orderReq.limitPrice,
      stopPrice: orderReq.stopPrice,
      status: isFilled ? 'filled' : 'new',
      filledQty: isFilled ? orderReq.qty : 0,
      filledAvgPrice: isFilled ? fillPrice : undefined,
      createdAt: now,
      updatedAt: now,
      submittedAt: now,
      filledAt: isFilled ? now : undefined,
    };

    this.orders.set(orderId, order);

    // Update positions for filled orders
    if (isFilled) {
      this.updatePositionForFill(order, fillPrice);
    }

    return order;
  }

  private updatePositionForFill(order: Order, fillPrice: number): void {
    const existing = this.positions.get(order.symbol);
    const qty = order.side === 'buy' ? order.qty : -order.qty;

    if (existing) {
      const newQty = existing.qty + qty;
      if (newQty === 0) {
        this.positions.delete(order.symbol);
      } else {
        existing.qty = newQty;
        existing.marketValue = newQty * fillPrice;
        existing.currentPrice = fillPrice;
        existing.unrealizedPnL = (fillPrice - existing.avgEntryPrice) * newQty;
        existing.unrealizedPnLPercent = (fillPrice / existing.avgEntryPrice - 1) * 100;
      }
    } else if (order.side === 'buy') {
      this.positions.set(order.symbol, {
        symbol: order.symbol,
        qty: order.qty,
        side: 'long',
        marketValue: order.qty * fillPrice,
        costBasis: order.qty * fillPrice,
        unrealizedPnL: 0,
        unrealizedPnLPercent: 0,
        currentPrice: fillPrice,
        avgEntryPrice: fillPrice,
      });
    }
  }

  async getOrder(orderId: string): Promise<Order | null> {
    return this.orders.get(orderId) || null;
  }

  async getOrders(status?: string): Promise<Order[]> {
    const orders = Array.from(this.orders.values());
    if (status) {
      return orders.filter((o) => o.status === status);
    }
    return orders;
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    const order = this.orders.get(orderId);
    if (order && !['filled', 'canceled', 'expired'].includes(order.status)) {
      order.status = 'canceled';
      order.canceledAt = new Date();
      order.updatedAt = new Date();
      return true;
    }
    return false;
  }

  async cancelAllOrders(): Promise<boolean> {
    for (const order of this.orders.values()) {
      if (!['filled', 'canceled', 'expired'].includes(order.status)) {
        order.status = 'canceled';
        order.canceledAt = new Date();
        order.updatedAt = new Date();
      }
    }
    return true;
  }

  async getQuote(_symbol: string): Promise<{ bid: number; ask: number; last: number } | null> {
    // Return mock quote
    const basePrice = 100 + Math.random() * 100;
    return {
      bid: basePrice - 0.01,
      ask: basePrice + 0.01,
      last: basePrice,
    };
  }
}
