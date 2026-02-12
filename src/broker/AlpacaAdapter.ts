/**
 * Alpaca Broker Adapter
 *
 * Integration with Alpaca Markets API for paper and live trading.
 * https://alpaca.markets/docs/api-documentation/
 */

import axios, { type AxiosInstance } from 'axios';
import { logger } from '../lib/logger.js';
import {
  BrokerAdapter,
  type BrokerConfig,
  type BrokerAccount,
  type BrokerPosition,
  type Order,
  type OrderRequest,
} from './BrokerAdapter.js';

const ALPACA_PAPER_URL = 'https://paper-api.alpaca.markets';
const ALPACA_LIVE_URL = 'https://api.alpaca.markets';
const ALPACA_DATA_URL = 'https://data.alpaca.markets';

export class AlpacaAdapter extends BrokerAdapter {
  private client: AxiosInstance;
  private dataClient: AxiosInstance;

  constructor(config: BrokerConfig) {
    super(config);

    const baseUrl = config.paperTrading !== false ? ALPACA_PAPER_URL : ALPACA_LIVE_URL;

    this.client = axios.create({
      baseURL: config.baseUrl || baseUrl,
      headers: {
        'APCA-API-KEY-ID': config.apiKey,
        'APCA-API-SECRET-KEY': config.apiSecret,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    this.dataClient = axios.create({
      baseURL: ALPACA_DATA_URL,
      headers: {
        'APCA-API-KEY-ID': config.apiKey,
        'APCA-API-SECRET-KEY': config.apiSecret,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });
  }

  get name(): string {
    return 'Alpaca Markets';
  }

  get isPaperTrading(): boolean {
    return this.config.paperTrading !== false;
  }

  /**
   * Connect and verify credentials
   */
  async connect(): Promise<boolean> {
    try {
      await this.client.get('/v2/account');
      this.connected = true;
      logger.info({ mode: this.isPaperTrading ? 'Paper' : 'Live' }, 'Alpaca connected');
      return true;
    } catch (error) {
      logger.error({ err: error }, 'Alpaca connection failed');
      this.connected = false;
      return false;
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    logger.info('Alpaca disconnected');
  }

  /**
   * Get account information
   */
  async getAccount(): Promise<BrokerAccount> {
    const response = await this.client.get('/v2/account');
    const data = response.data;

    return {
      id: data.id,
      status: data.status === 'ACTIVE' ? 'active' : 'inactive',
      currency: data.currency,
      buyingPower: parseFloat(data.buying_power),
      cash: parseFloat(data.cash),
      portfolioValue: parseFloat(data.portfolio_value),
      dayTradeCount: data.daytrade_count || 0,
      patternDayTrader: data.pattern_day_trader || false,
    };
  }

  /**
   * Get all positions
   */
  async getPositions(): Promise<BrokerPosition[]> {
    const response = await this.client.get('/v2/positions');
    return response.data.map((p: any) => this.mapPosition(p));
  }

  /**
   * Get single position
   */
  async getPosition(symbol: string): Promise<BrokerPosition | null> {
    try {
      const response = await this.client.get(`/v2/positions/${symbol}`);
      return this.mapPosition(response.data);
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  private mapPosition(data: any): BrokerPosition {
    return {
      symbol: data.symbol,
      qty: parseFloat(data.qty),
      side: parseFloat(data.qty) >= 0 ? 'long' : 'short',
      marketValue: parseFloat(data.market_value),
      costBasis: parseFloat(data.cost_basis),
      unrealizedPnL: parseFloat(data.unrealized_pl),
      unrealizedPnLPercent: parseFloat(data.unrealized_plpc) * 100,
      currentPrice: parseFloat(data.current_price),
      avgEntryPrice: parseFloat(data.avg_entry_price),
    };
  }

  /**
   * Submit an order
   */
  async submitOrder(orderReq: OrderRequest): Promise<Order> {
    const validation = this.validateOrder(orderReq);
    if (!validation.valid) {
      throw new Error(validation.errors.join(', '));
    }

    const payload: any = {
      symbol: orderReq.symbol.toUpperCase(),
      qty: orderReq.qty.toString(),
      side: orderReq.side,
      type: orderReq.type,
      time_in_force: orderReq.timeInForce || 'day',
    };

    if (orderReq.limitPrice) {
      payload.limit_price = orderReq.limitPrice.toString();
    }

    if (orderReq.stopPrice) {
      payload.stop_price = orderReq.stopPrice.toString();
    }

    if (orderReq.clientOrderId) {
      payload.client_order_id = orderReq.clientOrderId;
    }

    const response = await this.client.post('/v2/orders', payload);
    return this.mapOrder(response.data);
  }

  /**
   * Get order by ID
   */
  async getOrder(orderId: string): Promise<Order | null> {
    try {
      const response = await this.client.get(`/v2/orders/${orderId}`);
      return this.mapOrder(response.data);
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get orders with optional status filter
   */
  async getOrders(status?: string): Promise<Order[]> {
    const params: any = { limit: 100 };
    if (status) {
      params.status = status;
    }

    const response = await this.client.get('/v2/orders', { params });
    return response.data.map((o: any) => this.mapOrder(o));
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string): Promise<boolean> {
    try {
      await this.client.delete(`/v2/orders/${orderId}`);
      return true;
    } catch (error: any) {
      if (error.response?.status === 404 || error.response?.status === 422) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Cancel all open orders
   */
  async cancelAllOrders(): Promise<boolean> {
    try {
      await this.client.delete('/v2/orders');
      return true;
    } catch (error) {
      logger.error({ err: error }, 'Alpaca failed to cancel all orders');
      return false;
    }
  }

  private mapOrder(data: any): Order {
    return {
      id: data.id,
      clientOrderId: data.client_order_id,
      symbol: data.symbol,
      qty: parseFloat(data.qty),
      side: data.side,
      type: data.type,
      timeInForce: data.time_in_force,
      limitPrice: data.limit_price ? parseFloat(data.limit_price) : undefined,
      stopPrice: data.stop_price ? parseFloat(data.stop_price) : undefined,
      status: data.status.toLowerCase(),
      filledQty: parseFloat(data.filled_qty),
      filledAvgPrice: data.filled_avg_price ? parseFloat(data.filled_avg_price) : undefined,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
      submittedAt: data.submitted_at ? new Date(data.submitted_at) : undefined,
      filledAt: data.filled_at ? new Date(data.filled_at) : undefined,
      expiredAt: data.expired_at ? new Date(data.expired_at) : undefined,
      canceledAt: data.canceled_at ? new Date(data.canceled_at) : undefined,
    };
  }

  /**
   * Get latest quote for a symbol
   */
  async getQuote(symbol: string): Promise<{ bid: number; ask: number; last: number } | null> {
    try {
      const response = await this.dataClient.get(`/v2/stocks/${symbol}/quotes/latest`);
      const quote = response.data.quote;

      return {
        bid: quote.bp,
        ask: quote.ap,
        last: (quote.bp + quote.ap) / 2, // Midpoint
      };
    } catch (error) {
      logger.error({ err: error, symbol }, 'Alpaca failed to get quote');
      return null;
    }
  }

  /**
   * Get market clock (trading hours)
   */
  async getMarketClock(): Promise<{
    isOpen: boolean;
    nextOpen: Date;
    nextClose: Date;
  }> {
    const response = await this.client.get('/v2/clock');
    const data = response.data;

    return {
      isOpen: data.is_open,
      nextOpen: new Date(data.next_open),
      nextClose: new Date(data.next_close),
    };
  }

  /**
   * Check if market is open
   */
  async isMarketOpen(): Promise<boolean> {
    const clock = await this.getMarketClock();
    return clock.isOpen;
  }
}

// Factory function to create appropriate broker
export function createBroker(
  type: 'alpaca' | 'mock' = 'mock',
  config?: Partial<BrokerConfig>
): BrokerAdapter {
  const fullConfig: BrokerConfig = {
    apiKey: config?.apiKey || process.env.ALPACA_API_KEY || '',
    apiSecret: config?.apiSecret || process.env.ALPACA_API_SECRET || '',
    paperTrading: config?.paperTrading ?? true,
    baseUrl: config?.baseUrl,
  };

  if (type === 'alpaca' && fullConfig.apiKey && fullConfig.apiSecret) {
    return new AlpacaAdapter(fullConfig);
  }

  // Fall back to mock broker
  const { MockBrokerAdapter } = require('./BrokerAdapter');
  return new MockBrokerAdapter(fullConfig);
}
