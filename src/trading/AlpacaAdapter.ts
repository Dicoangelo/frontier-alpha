/**
 * Alpaca Broker Adapter
 *
 * Integration with Alpaca Markets API for paper and live trading.
 * https://alpaca.markets/docs/api-references/trading-api/
 *
 * Features:
 * - Paper and live trading support
 * - Full order lifecycle management
 * - Real-time quotes via data API
 * - Account and position tracking
 * - Market clock and asset information
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios';
import { logger } from '../lib/logger.js';
import {
  BrokerAdapter,
  type BrokerConfig,
  type BrokerAccount,
  type BrokerPosition,
  type Order,
  type OrderRequest,
  type Quote,
  type MarketClock,
  type Asset,
  MockBrokerAdapter,
} from './BrokerAdapter.js';

// ============================================================================
// Constants
// ============================================================================

const ALPACA_PAPER_URL = 'https://paper-api.alpaca.markets';
const ALPACA_LIVE_URL = 'https://api.alpaca.markets';
const ALPACA_DATA_URL = 'https://data.alpaca.markets';

const REQUEST_TIMEOUT = 15000;
const _MAX_RETRIES = 3;

// ============================================================================
// Alpaca Response Types
// ============================================================================

interface AlpacaAccount {
  id: string;
  account_number: string;
  status: string;
  currency: string;
  buying_power: string;
  cash: string;
  portfolio_value: string;
  pattern_day_trader: boolean;
  trade_suspended_by_user: boolean;
  trading_blocked: boolean;
  transfers_blocked: boolean;
  account_blocked: boolean;
  created_at: string;
  shorting_enabled: boolean;
  multiplier: string;
  long_market_value: string;
  short_market_value: string;
  equity: string;
  last_equity: string;
  initial_margin: string;
  maintenance_margin: string;
  daytrade_count: number;
  daytrading_buying_power: string;
  regt_buying_power: string;
}

interface AlpacaPosition {
  asset_id: string;
  symbol: string;
  exchange: string;
  asset_class: string;
  qty: string;
  qty_available: string;
  side: string;
  market_value: string;
  cost_basis: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  current_price: string;
  avg_entry_price: string;
  lastday_price: string;
  change_today: string;
}

interface AlpacaOrder {
  id: string;
  client_order_id: string;
  created_at: string;
  updated_at: string;
  submitted_at: string;
  filled_at: string | null;
  expired_at: string | null;
  canceled_at: string | null;
  failed_at: string | null;
  replaced_at: string | null;
  replaced_by: string | null;
  replaces: string | null;
  asset_id: string;
  symbol: string;
  asset_class: string;
  qty: string;
  filled_qty: string;
  type: string;
  side: string;
  time_in_force: string;
  limit_price: string | null;
  stop_price: string | null;
  filled_avg_price: string | null;
  status: string;
  extended_hours: boolean;
  trail_price: string | null;
  trail_percent: string | null;
  legs?: AlpacaOrder[];
}

interface AlpacaClock {
  timestamp: string;
  is_open: boolean;
  next_open: string;
  next_close: string;
}

interface AlpacaAsset {
  id: string;
  class: string;
  exchange: string;
  symbol: string;
  name: string;
  status: string;
  tradable: boolean;
  marginable: boolean;
  shortable: boolean;
  easy_to_borrow: boolean;
  fractionable: boolean;
}

interface AlpacaQuote {
  t: string; // timestamp
  ax: string; // ask exchange
  ap: number; // ask price
  as: number; // ask size
  bx: string; // bid exchange
  bp: number; // bid price
  bs: number; // bid size
}

// ============================================================================
// Alpaca Adapter Implementation
// ============================================================================

export class AlpacaAdapter extends BrokerAdapter {
  private client: AxiosInstance;
  private dataClient: AxiosInstance;
  private _isPaperTrading: boolean;

  constructor(config: BrokerConfig) {
    super(config);

    this._isPaperTrading = config.paperTrading !== false;
    const baseUrl = this._isPaperTrading ? ALPACA_PAPER_URL : ALPACA_LIVE_URL;

    this.client = axios.create({
      baseURL: config.baseUrl || baseUrl,
      headers: {
        'APCA-API-KEY-ID': config.apiKey,
        'APCA-API-SECRET-KEY': config.apiSecret,
        'Content-Type': 'application/json',
      },
      timeout: REQUEST_TIMEOUT,
    });

    this.dataClient = axios.create({
      baseURL: ALPACA_DATA_URL,
      headers: {
        'APCA-API-KEY-ID': config.apiKey,
        'APCA-API-SECRET-KEY': config.apiSecret,
        'Content-Type': 'application/json',
      },
      timeout: REQUEST_TIMEOUT,
    });

    // Add request/response interceptors for logging and error handling
    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Response interceptor for error handling
    const errorHandler = (error: AxiosError) => {
      if (error.response) {
        const data = error.response.data as Record<string, unknown>;
        logger.error({ status: error.response.status, data }, 'Alpaca API error');

        // Throw a more descriptive error
        const message = data?.message || data?.error || error.message;
        throw new Error(`Alpaca API Error: ${message}`);
      } else if (error.request) {
        logger.error({ message: error.message }, 'Alpaca network error');
        throw new Error(`Network Error: ${error.message}`);
      }
      throw error;
    };

    this.client.interceptors.response.use((r) => r, errorHandler);
    this.dataClient.interceptors.response.use((r) => r, errorHandler);
  }

  get name(): string {
    return 'Alpaca Markets';
  }

  get isPaperTrading(): boolean {
    return this._isPaperTrading;
  }

  // ========================================
  // Connection Methods
  // ========================================

  async connect(): Promise<boolean> {
    try {
      await this.client.get('/v2/account');
      this.connected = true;
      logger.info({ mode: this.isPaperTrading ? 'paper' : 'live' }, 'Alpaca connected');
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

  // ========================================
  // Account Methods
  // ========================================

  async getAccount(): Promise<BrokerAccount> {
    const response = await this.client.get<AlpacaAccount>('/v2/account');
    return this.mapAccount(response.data);
  }

  private mapAccount(data: AlpacaAccount): BrokerAccount {
    return {
      id: data.id,
      status: data.status === 'ACTIVE' ? 'active' : data.status === 'INACTIVE' ? 'inactive' : 'restricted',
      currency: data.currency,
      buyingPower: parseFloat(data.buying_power),
      cash: parseFloat(data.cash),
      portfolioValue: parseFloat(data.portfolio_value),
      dayTradeCount: data.daytrade_count || 0,
      patternDayTrader: data.pattern_day_trader || false,
      tradingBlocked: data.trading_blocked,
      transfersBlocked: data.transfers_blocked,
      accountBlocked: data.account_blocked,
      createdAt: new Date(data.created_at),
      multiplier: parseInt(data.multiplier),
      shortingEnabled: data.shorting_enabled,
      longMarketValue: parseFloat(data.long_market_value),
      shortMarketValue: parseFloat(data.short_market_value),
      equity: parseFloat(data.equity),
      lastEquity: parseFloat(data.last_equity),
      initialMargin: parseFloat(data.initial_margin),
      maintenanceMargin: parseFloat(data.maintenance_margin),
      dayTradingBuyingPower: parseFloat(data.daytrading_buying_power),
      regtBuyingPower: parseFloat(data.regt_buying_power),
    };
  }

  // ========================================
  // Position Methods
  // ========================================

  async getPositions(): Promise<BrokerPosition[]> {
    const response = await this.client.get<AlpacaPosition[]>('/v2/positions');
    return response.data.map((p) => this.mapPosition(p));
  }

  async getPosition(symbol: string): Promise<BrokerPosition | null> {
    try {
      const response = await this.client.get<AlpacaPosition>(`/v2/positions/${symbol}`);
      return this.mapPosition(response.data);
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  private mapPosition(data: AlpacaPosition): BrokerPosition {
    const qty = parseFloat(data.qty);
    return {
      symbol: data.symbol,
      qty: Math.abs(qty),
      side: qty >= 0 ? 'long' : 'short',
      marketValue: parseFloat(data.market_value),
      costBasis: parseFloat(data.cost_basis),
      unrealizedPnL: parseFloat(data.unrealized_pl),
      unrealizedPnLPercent: parseFloat(data.unrealized_plpc) * 100,
      currentPrice: parseFloat(data.current_price),
      avgEntryPrice: parseFloat(data.avg_entry_price),
      changeToday: parseFloat(data.change_today) * 100,
      assetId: data.asset_id,
      assetClass: data.asset_class,
      exchange: data.exchange,
    };
  }

  // ========================================
  // Order Methods
  // ========================================

  async submitOrder(orderReq: OrderRequest): Promise<Order> {
    const validation = await this.validateOrder(orderReq);
    if (!validation.valid) {
      throw new Error(validation.errors.join(', '));
    }

    const payload: Record<string, unknown> = {
      symbol: orderReq.symbol.toUpperCase(),
      side: orderReq.side,
      type: orderReq.type,
      time_in_force: orderReq.timeInForce || 'day',
    };

    // Use qty or notional (Alpaca supports both)
    if (orderReq.qty) {
      payload.qty = orderReq.qty.toString();
    } else if (orderReq.notional) {
      payload.notional = orderReq.notional.toString();
    }

    if (orderReq.limitPrice) {
      payload.limit_price = orderReq.limitPrice.toString();
    }

    if (orderReq.stopPrice) {
      payload.stop_price = orderReq.stopPrice.toString();
    }

    if (orderReq.trailPercent) {
      payload.trail_percent = orderReq.trailPercent.toString();
    }

    if (orderReq.trailPrice) {
      payload.trail_price = orderReq.trailPrice.toString();
    }

    if (orderReq.extendedHours !== undefined) {
      payload.extended_hours = orderReq.extendedHours;
    }

    if (orderReq.clientOrderId) {
      payload.client_order_id = orderReq.clientOrderId;
    }

    // Bracket/OCO/OTO orders
    if (orderReq.orderClass && orderReq.orderClass !== 'simple') {
      payload.order_class = orderReq.orderClass;

      if (orderReq.takeProfit) {
        payload.take_profit = {
          limit_price: orderReq.takeProfit.limitPrice.toString(),
        };
      }

      if (orderReq.stopLoss) {
        payload.stop_loss = {
          stop_price: orderReq.stopLoss.stopPrice.toString(),
          limit_price: orderReq.stopLoss.limitPrice?.toString(),
        };
      }
    }

    const response = await this.client.post<AlpacaOrder>('/v2/orders', payload);
    return this.mapOrder(response.data);
  }

  async getOrder(orderId: string): Promise<Order | null> {
    try {
      const response = await this.client.get<AlpacaOrder>(`/v2/orders/${orderId}`);
      return this.mapOrder(response.data);
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async getOrders(status?: string): Promise<Order[]> {
    const params: Record<string, string | number> = { limit: 100 };
    if (status) {
      params.status = status;
    }

    const response = await this.client.get<AlpacaOrder[]>('/v2/orders', { params });
    return response.data.map((o) => this.mapOrder(o));
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    try {
      await this.client.delete(`/v2/orders/${orderId}`);
      return true;
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && (error.response?.status === 404 || error.response?.status === 422)) {
        return false;
      }
      throw error;
    }
  }

  async cancelAllOrders(): Promise<number> {
    try {
      const response = await this.client.delete('/v2/orders');
      return Array.isArray(response.data) ? response.data.length : 0;
    } catch (error) {
      logger.error({ err: error }, 'Alpaca failed to cancel all orders');
      return 0;
    }
  }

  async replaceOrder(orderId: string, updates: Partial<OrderRequest>): Promise<Order> {
    const payload: Record<string, string> = {};

    if (updates.qty !== undefined) {
      payload.qty = updates.qty.toString();
    }

    if (updates.limitPrice !== undefined) {
      payload.limit_price = updates.limitPrice.toString();
    }

    if (updates.stopPrice !== undefined) {
      payload.stop_price = updates.stopPrice.toString();
    }

    if (updates.trailPrice !== undefined) {
      payload.trail = updates.trailPrice.toString();
    }

    if (updates.timeInForce !== undefined) {
      payload.time_in_force = updates.timeInForce;
    }

    if (updates.clientOrderId !== undefined) {
      payload.client_order_id = updates.clientOrderId;
    }

    const response = await this.client.patch<AlpacaOrder>(`/v2/orders/${orderId}`, payload);
    return this.mapOrder(response.data);
  }

  private mapOrder(data: AlpacaOrder): Order {
    return {
      id: data.id,
      clientOrderId: data.client_order_id,
      symbol: data.symbol,
      qty: parseFloat(data.qty),
      side: data.side as 'buy' | 'sell',
      type: data.type as Order['type'],
      timeInForce: data.time_in_force as Order['timeInForce'],
      limitPrice: data.limit_price ? parseFloat(data.limit_price) : undefined,
      stopPrice: data.stop_price ? parseFloat(data.stop_price) : undefined,
      trailPrice: data.trail_price ? parseFloat(data.trail_price) : undefined,
      trailPercent: data.trail_percent ? parseFloat(data.trail_percent) : undefined,
      extendedHours: data.extended_hours,
      status: data.status.toLowerCase() as Order['status'],
      filledQty: parseFloat(data.filled_qty),
      filledAvgPrice: data.filled_avg_price ? parseFloat(data.filled_avg_price) : undefined,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
      submittedAt: data.submitted_at ? new Date(data.submitted_at) : undefined,
      filledAt: data.filled_at ? new Date(data.filled_at) : undefined,
      expiredAt: data.expired_at ? new Date(data.expired_at) : undefined,
      canceledAt: data.canceled_at ? new Date(data.canceled_at) : undefined,
      failedAt: data.failed_at ? new Date(data.failed_at) : undefined,
      replacedAt: data.replaced_at ? new Date(data.replaced_at) : undefined,
      replacedBy: data.replaced_by || undefined,
      replaces: data.replaces || undefined,
      assetId: data.asset_id,
      assetClass: data.asset_class,
      legs: data.legs?.map((l) => this.mapOrder(l)),
    };
  }

  // ========================================
  // Market Data Methods
  // ========================================

  async getQuote(symbol: string): Promise<Quote | null> {
    try {
      const response = await this.dataClient.get(`/v2/stocks/${symbol}/quotes/latest`);
      const quote = response.data.quote as AlpacaQuote;

      return {
        symbol: symbol.toUpperCase(),
        bid: quote.bp,
        ask: quote.ap,
        last: (quote.bp + quote.ap) / 2, // Midpoint
        bidSize: quote.bs,
        askSize: quote.as,
        timestamp: new Date(quote.t),
      };
    } catch (error) {
      logger.error({ err: error, symbol }, 'Alpaca failed to get quote');
      return null;
    }
  }

  async getQuotes(symbols: string[]): Promise<Map<string, Quote>> {
    const quotes = new Map<string, Quote>();

    try {
      const symbolList = symbols.join(',');
      const response = await this.dataClient.get(`/v2/stocks/quotes/latest?symbols=${symbolList}`);

      for (const [sym, quoteData] of Object.entries(response.data.quotes || {})) {
        const q = quoteData as AlpacaQuote;
        quotes.set(sym.toUpperCase(), {
          symbol: sym.toUpperCase(),
          bid: q.bp,
          ask: q.ap,
          last: (q.bp + q.ap) / 2,
          bidSize: q.bs,
          askSize: q.as,
          timestamp: new Date(q.t),
        });
      }
    } catch (error) {
      logger.error({ err: error }, 'Alpaca failed to get bulk quotes');
      // Fallback to individual requests
      for (const symbol of symbols) {
        const quote = await this.getQuote(symbol);
        if (quote) {
          quotes.set(symbol.toUpperCase(), quote);
        }
      }
    }

    return quotes;
  }

  async getMarketClock(): Promise<MarketClock> {
    const response = await this.client.get<AlpacaClock>('/v2/clock');
    const data = response.data;

    return {
      isOpen: data.is_open,
      nextOpen: new Date(data.next_open),
      nextClose: new Date(data.next_close),
      timestamp: new Date(data.timestamp),
    };
  }

  async isMarketOpen(): Promise<boolean> {
    const clock = await this.getMarketClock();
    return clock.isOpen;
  }

  async getAsset(symbol: string): Promise<Asset | null> {
    try {
      const response = await this.client.get<AlpacaAsset>(`/v2/assets/${symbol}`);
      const data = response.data;

      return {
        id: data.id,
        symbol: data.symbol,
        name: data.name,
        exchange: data.exchange,
        assetClass: data.class,
        tradable: data.tradable,
        marginable: data.marginable,
        shortable: data.shortable,
        easyToBorrow: data.easy_to_borrow,
        fractionable: data.fractionable,
        status: data.status,
      };
    } catch (error) {
      logger.error({ err: error, symbol }, 'Alpaca failed to get asset');
      return null;
    }
  }

  // ========================================
  // Activity & History Methods
  // ========================================

  async getAccountActivities(
    activityType?: 'FILL' | 'TRANS' | 'MISC' | 'ACATC' | 'ACATS' | 'CSD' | 'CSR' | 'DIV' | 'DIVCGL' | 'DIVCGS' | 'DIVFEE' | 'DIVFT' | 'DIVNRA' | 'DIVROC' | 'DIVTW' | 'DIVTXEX' | 'INT' | 'INTNRA' | 'INTTW' | 'JNL' | 'JNLC' | 'JNLS' | 'MA' | 'NC' | 'OPASN' | 'OPEXP' | 'OPXRC' | 'PTC' | 'PTR' | 'REORG' | 'SC' | 'SSO' | 'SSP' | 'CFEE' | 'FEE',
    after?: Date,
    until?: Date,
    direction?: 'asc' | 'desc',
    pageSize?: number,
    pageToken?: string
  ): Promise<unknown[]> {
    const params: Record<string, string | number> = {};

    if (activityType) {
      params.activity_type = activityType;
    }
    if (after) {
      params.after = after.toISOString();
    }
    if (until) {
      params.until = until.toISOString();
    }
    if (direction) {
      params.direction = direction;
    }
    if (pageSize) {
      params.page_size = pageSize;
    }
    if (pageToken) {
      params.page_token = pageToken;
    }

    const response = await this.client.get('/v2/account/activities', { params });
    return response.data;
  }

  async getPortfolioHistory(
    period?: '1D' | '1W' | '1M' | '3M' | '1A' | 'all',
    timeframe?: '1Min' | '5Min' | '15Min' | '1H' | '1D',
    dateEnd?: Date,
    extendedHours?: boolean
  ): Promise<{
    timestamps: number[];
    equity: number[];
    profitLoss: number[];
    profitLossPct: number[];
    baseValue: number;
    timeframe: string;
  }> {
    const params: Record<string, string | boolean> = {};

    if (period) params.period = period;
    if (timeframe) params.timeframe = timeframe;
    if (dateEnd) params.date_end = dateEnd.toISOString().split('T')[0];
    if (extendedHours !== undefined) params.extended_hours = extendedHours;

    const response = await this.client.get('/v2/account/portfolio/history', { params });
    const data = response.data;

    return {
      timestamps: data.timestamp,
      equity: data.equity,
      profitLoss: data.profit_loss,
      profitLossPct: data.profit_loss_pct,
      baseValue: data.base_value,
      timeframe: data.timeframe,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

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
  return new MockBrokerAdapter(fullConfig);
}

// ============================================================================
// Broker Manager Singleton
// ============================================================================

let _broker: BrokerAdapter | null = null;

export function getBroker(): BrokerAdapter {
  if (!_broker) {
    const alpacaKey = process.env.ALPACA_API_KEY;
    const alpacaSecret = process.env.ALPACA_API_SECRET;

    if (alpacaKey && alpacaSecret) {
      _broker = createBroker('alpaca', {
        apiKey: alpacaKey,
        apiSecret: alpacaSecret,
        paperTrading: process.env.ALPACA_PAPER_TRADING !== 'false',
      });
    } else {
      _broker = createBroker('mock');
    }
  }

  return _broker;
}

export function setBroker(broker: BrokerAdapter): void {
  _broker = broker;
}

export function resetBroker(): void {
  _broker = null;
}
