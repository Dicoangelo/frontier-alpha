/**
 * Broker Adapter - Abstract interface for broker integrations
 *
 * Supports multiple brokers through a unified interface:
 * - Alpaca (paper and live trading)
 * - Interactive Brokers (future)
 * - TD Ameritrade (future)
 */

import { logger } from '../lib/logger.js';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface BrokerAccount {
  id: string;
  status: 'active' | 'inactive' | 'restricted';
  currency: string;
  buyingPower: number;
  cash: number;
  portfolioValue: number;
  dayTradeCount: number;
  patternDayTrader: boolean;
  tradingBlocked?: boolean;
  transfersBlocked?: boolean;
  accountBlocked?: boolean;
  createdAt?: Date;
  multiplier?: number;
  shortingEnabled?: boolean;
  longMarketValue?: number;
  shortMarketValue?: number;
  equity?: number;
  lastEquity?: number;
  initialMargin?: number;
  maintenanceMargin?: number;
  dayTradingBuyingPower?: number;
  regtBuyingPower?: number;
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
  changeToday?: number;
  assetId?: string;
  assetClass?: string;
  exchange?: string;
}

export interface Order {
  id: string;
  clientOrderId?: string;
  symbol: string;
  qty: number;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop_limit' | 'trailing_stop';
  timeInForce: 'day' | 'gtc' | 'ioc' | 'fok' | 'opg' | 'cls';
  limitPrice?: number;
  stopPrice?: number;
  trailPercent?: number;
  trailPrice?: number;
  extendedHours?: boolean;
  status: OrderStatus;
  filledQty: number;
  filledAvgPrice?: number;
  createdAt: Date;
  updatedAt: Date;
  submittedAt?: Date;
  filledAt?: Date;
  expiredAt?: Date;
  canceledAt?: Date;
  failedAt?: Date;
  replacedAt?: Date;
  replacedBy?: string;
  replaces?: string;
  assetId?: string;
  assetClass?: string;
  legs?: OrderLeg[];
}

export interface OrderLeg {
  symbol: string;
  qty: number;
  side: 'buy' | 'sell';
  positionIntent?: 'buy_to_open' | 'buy_to_close' | 'sell_to_open' | 'sell_to_close';
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
  | 'pending_replace'
  | 'calculated'
  | 'stopped'
  | 'accepted_for_bidding'
  | 'held';

export interface OrderRequest {
  symbol: string;
  qty: number;
  notional?: number; // Dollar amount instead of qty
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop_limit' | 'trailing_stop';
  timeInForce?: 'day' | 'gtc' | 'ioc' | 'fok' | 'opg' | 'cls';
  limitPrice?: number;
  stopPrice?: number;
  trailPercent?: number;
  trailPrice?: number;
  extendedHours?: boolean;
  clientOrderId?: string;
  orderClass?: 'simple' | 'bracket' | 'oco' | 'oto';
  takeProfit?: { limitPrice: number };
  stopLoss?: { stopPrice: number; limitPrice?: number };
}

export interface BrokerConfig {
  apiKey: string;
  apiSecret: string;
  paperTrading?: boolean;
  baseUrl?: string;
}

export interface MarketClock {
  isOpen: boolean;
  nextOpen: Date;
  nextClose: Date;
  timestamp: Date;
}

export interface Asset {
  id: string;
  symbol: string;
  name: string;
  exchange: string;
  assetClass: string;
  tradable: boolean;
  marginable: boolean;
  shortable: boolean;
  easyToBorrow: boolean;
  fractionable: boolean;
  status: string;
}

export interface Quote {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  bidSize?: number;
  askSize?: number;
  volume?: number;
  timestamp?: Date;
}

export interface OrderValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  estimatedCost?: number;
  estimatedFees?: number;
}

// ============================================================================
// Abstract Broker Adapter
// ============================================================================

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
  abstract cancelAllOrders(): Promise<number>;
  abstract replaceOrder(orderId: string, updates: Partial<OrderRequest>): Promise<Order>;

  // Market data
  abstract getQuote(symbol: string): Promise<Quote | null>;
  abstract getQuotes(symbols: string[]): Promise<Map<string, Quote>>;
  abstract getMarketClock(): Promise<MarketClock>;
  abstract isMarketOpen(): Promise<boolean>;
  abstract getAsset(symbol: string): Promise<Asset | null>;

  /**
   * Validate order before submission
   */
  async validateOrder(order: OrderRequest, account?: BrokerAccount): Promise<OrderValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic validation
    if (!order.symbol || order.symbol.length === 0) {
      errors.push('Symbol is required');
    }

    if ((!order.qty || order.qty <= 0) && (!order.notional || order.notional <= 0)) {
      errors.push('Either quantity or notional amount must be positive');
    }

    if (!['buy', 'sell'].includes(order.side)) {
      errors.push('Side must be "buy" or "sell"');
    }

    if (!['market', 'limit', 'stop', 'stop_limit', 'trailing_stop'].includes(order.type)) {
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

    if (order.type === 'trailing_stop' && !order.trailPercent && !order.trailPrice) {
      errors.push('Trail percent or trail price is required for trailing stop orders');
    }

    // Get quote for cost estimation
    let estimatedCost = 0;
    if (order.symbol && errors.length === 0) {
      try {
        const quote = await this.getQuote(order.symbol);
        if (quote) {
          const price = order.limitPrice || (order.side === 'buy' ? quote.ask : quote.bid);
          const qty = order.qty || (order.notional ? order.notional / price : 0);
          estimatedCost = qty * price;
        }
      } catch {
        warnings.push('Could not fetch quote for cost estimation');
      }
    }

    // Check buying power if account provided
    if (account && order.side === 'buy' && estimatedCost > 0) {
      if (estimatedCost > account.buyingPower) {
        errors.push(`Insufficient buying power. Required: $${estimatedCost.toFixed(2)}, Available: $${account.buyingPower.toFixed(2)}`);
      }
    }

    // Warnings
    if (order.type === 'market') {
      warnings.push('Market orders execute at current market price which may differ from displayed price');
    }

    if (order.extendedHours) {
      warnings.push('Extended hours trading has lower liquidity and higher spreads');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      estimatedCost,
      estimatedFees: 0, // Most brokers are commission-free now
    };
  }

  /**
   * Calculate order value
   */
  calculateOrderValue(order: OrderRequest, currentPrice: number): number {
    const price = order.limitPrice || currentPrice;
    return (order.qty || 0) * price;
  }

  /**
   * Get order preview with estimated impact
   */
  async getOrderPreview(order: OrderRequest): Promise<{
    estimatedPrice: number;
    estimatedCost: number;
    estimatedFees: number;
    estimatedTotal: number;
    marketImpact: 'low' | 'medium' | 'high';
    validation: OrderValidationResult;
  }> {
    const account = await this.getAccount();
    const validation = await this.validateOrder(order, account);
    const quote = await this.getQuote(order.symbol);

    const estimatedPrice = order.limitPrice || (quote ? (order.side === 'buy' ? quote.ask : quote.bid) : 0);
    const qty = order.qty || (order.notional && estimatedPrice ? order.notional / estimatedPrice : 0);
    const estimatedCost = qty * estimatedPrice;
    const estimatedFees = 0; // Most brokers commission-free

    // Simple market impact estimate based on order size
    let marketImpact: 'low' | 'medium' | 'high' = 'low';
    if (estimatedCost > 100000) {
      marketImpact = 'high';
    } else if (estimatedCost > 10000) {
      marketImpact = 'medium';
    }

    return {
      estimatedPrice,
      estimatedCost,
      estimatedFees,
      estimatedTotal: estimatedCost + estimatedFees,
      marketImpact,
      validation,
    };
  }
}

// ============================================================================
// Mock Broker Adapter for Testing
// ============================================================================

export class MockBrokerAdapter extends BrokerAdapter {
  private positions: Map<string, BrokerPosition> = new Map();
  private orders: Map<string, Order> = new Map();
  private account: BrokerAccount;
  private mockPrices: Map<string, number> = new Map([
    ['AAPL', 175.50],
    ['MSFT', 378.25],
    ['GOOGL', 140.80],
    ['NVDA', 495.20],
    ['TSLA', 245.60],
    ['AMZN', 178.90],
    ['META', 485.30],
    ['SPY', 478.50],
  ]);

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
      equity: 100000,
      multiplier: 2,
      shortingEnabled: true,
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
    const validation = await this.validateOrder(orderReq);
    if (!validation.valid) {
      throw new Error(validation.errors.join(', '));
    }

    const orderId = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date();

    // Get mock price
    const mockPrice = this.mockPrices.get(orderReq.symbol.toUpperCase()) || 100;
    const fillPrice = orderReq.limitPrice || mockPrice;

    // Simulate immediate fill for market orders
    const isFilled = orderReq.type === 'market';

    const order: Order = {
      id: orderId,
      clientOrderId: orderReq.clientOrderId,
      symbol: orderReq.symbol.toUpperCase(),
      qty: orderReq.qty || 0,
      side: orderReq.side,
      type: orderReq.type,
      timeInForce: orderReq.timeInForce || 'day',
      limitPrice: orderReq.limitPrice,
      stopPrice: orderReq.stopPrice,
      trailPercent: orderReq.trailPercent,
      trailPrice: orderReq.trailPrice,
      extendedHours: orderReq.extendedHours,
      status: isFilled ? 'filled' : 'new',
      filledQty: isFilled ? (orderReq.qty || 0) : 0,
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
    const cost = order.qty * fillPrice;

    if (existing) {
      const newQty = existing.qty + qty;
      if (newQty === 0) {
        this.positions.delete(order.symbol);
        // Update cash for closed position
        if (order.side === 'sell') {
          this.account.cash += cost;
          this.account.buyingPower += cost;
        }
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
        marketValue: cost,
        costBasis: cost,
        unrealizedPnL: 0,
        unrealizedPnLPercent: 0,
        currentPrice: fillPrice,
        avgEntryPrice: fillPrice,
      });

      // Update account
      this.account.cash -= cost;
      this.account.buyingPower -= cost;
    }

    // Update portfolio value
    let totalValue = this.account.cash;
    for (const pos of this.positions.values()) {
      totalValue += pos.marketValue;
    }
    this.account.portfolioValue = totalValue;
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

  async cancelAllOrders(): Promise<number> {
    let count = 0;
    for (const order of this.orders.values()) {
      if (!['filled', 'canceled', 'expired'].includes(order.status)) {
        order.status = 'canceled';
        order.canceledAt = new Date();
        order.updatedAt = new Date();
        count++;
      }
    }
    return count;
  }

  async replaceOrder(orderId: string, updates: Partial<OrderRequest>): Promise<Order> {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    if (['filled', 'canceled', 'expired'].includes(order.status)) {
      throw new Error('Cannot replace completed order');
    }

    // Create new order with updates
    const newOrderId = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date();

    const newOrder: Order = {
      ...order,
      id: newOrderId,
      qty: updates.qty ?? order.qty,
      limitPrice: updates.limitPrice ?? order.limitPrice,
      stopPrice: updates.stopPrice ?? order.stopPrice,
      timeInForce: updates.timeInForce ?? order.timeInForce,
      status: 'new',
      replaces: orderId,
      createdAt: now,
      updatedAt: now,
    };

    // Mark old order as replaced
    order.status = 'replaced';
    order.replacedBy = newOrderId;
    order.replacedAt = now;
    order.updatedAt = now;

    this.orders.set(newOrderId, newOrder);
    return newOrder;
  }

  async getQuote(symbol: string): Promise<Quote | null> {
    const basePrice = this.mockPrices.get(symbol.toUpperCase()) || 100 + Math.random() * 100;
    const spread = basePrice * 0.001; // 0.1% spread

    return {
      symbol: symbol.toUpperCase(),
      bid: basePrice - spread,
      ask: basePrice + spread,
      last: basePrice,
      bidSize: 100,
      askSize: 100,
      volume: Math.floor(Math.random() * 10000000),
      timestamp: new Date(),
    };
  }

  async getQuotes(symbols: string[]): Promise<Map<string, Quote>> {
    const quotes = new Map<string, Quote>();
    for (const symbol of symbols) {
      const quote = await this.getQuote(symbol);
      if (quote) {
        quotes.set(symbol.toUpperCase(), quote);
      }
    }
    return quotes;
  }

  async getMarketClock(): Promise<MarketClock> {
    const now = new Date();
    const hour = now.getUTCHours();
    const day = now.getUTCDay();

    // US Market hours: 9:30 AM - 4:00 PM ET (14:30 - 21:00 UTC)
    const isWeekday = day >= 1 && day <= 5;
    const isDuringHours = hour >= 14 && hour < 21;
    const isOpen = isWeekday && isDuringHours;

    const nextOpen = new Date(now);
    nextOpen.setUTCHours(14, 30, 0, 0);
    if (now >= nextOpen) {
      nextOpen.setDate(nextOpen.getDate() + 1);
    }
    while (nextOpen.getUTCDay() === 0 || nextOpen.getUTCDay() === 6) {
      nextOpen.setDate(nextOpen.getDate() + 1);
    }

    const nextClose = new Date(now);
    nextClose.setUTCHours(21, 0, 0, 0);

    return {
      isOpen,
      nextOpen,
      nextClose,
      timestamp: now,
    };
  }

  async isMarketOpen(): Promise<boolean> {
    const clock = await this.getMarketClock();
    return clock.isOpen;
  }

  async getAsset(symbol: string): Promise<Asset | null> {
    return {
      id: `mock-asset-${symbol}`,
      symbol: symbol.toUpperCase(),
      name: `${symbol} Inc.`,
      exchange: 'NASDAQ',
      assetClass: 'us_equity',
      tradable: true,
      marginable: true,
      shortable: true,
      easyToBorrow: true,
      fractionable: true,
      status: 'active',
    };
  }
}
