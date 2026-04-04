/**
 * Trading routes — Alpaca broker adapter (paper + live).
 *
 * Ported from the 7 hand-written Vercel functions in `api/v1/trading/*` to
 * unify on the single Fastify surface exposed via `buildApp()`. Preserves
 * all demo-mode fallbacks (clock, quote, orders, positions) so the UI stays
 * functional without ALPACA_API_KEY configured.
 *
 * Endpoints:
 *   GET    /api/v1/trading/account    (auth) — Alpaca account snapshot
 *   GET    /api/v1/trading/clock              — Market clock (+ demo fallback)
 *   POST   /api/v1/trading/connect            — Broker credential test
 *   GET    /api/v1/trading/orders     (auth) — List orders
 *   POST   /api/v1/trading/orders     (auth) — Place order
 *   DELETE /api/v1/trading/orders     (auth) — Cancel (?id=… or ?cancelAll=true)
 *   GET    /api/v1/trading/positions  (auth) — Open positions
 *   POST   /api/v1/trading/preview            — Order preview + validation
 *   GET    /api/v1/trading/quote              — Single or batch quotes
 */

import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth.js';
import { logger } from '../observability/logger.js';

interface RouteContext {
  server: unknown;
}

// ---------------------------------------------------------------------------
// Env + base URLs
// ---------------------------------------------------------------------------

function brokerConfig() {
  const alpacaKey = process.env.ALPACA_API_KEY;
  const alpacaSecret = process.env.ALPACA_API_SECRET;
  const isPaper = process.env.ALPACA_PAPER_TRADING !== 'false';
  const configured = !!(alpacaKey && alpacaSecret);
  const baseUrl = isPaper
    ? 'https://paper-api.alpaca.markets'
    : 'https://api.alpaca.markets';
  return { alpacaKey, alpacaSecret, isPaper, configured, baseUrl };
}

const alpacaHeaders = (key?: string, secret?: string) => ({
  'APCA-API-KEY-ID': key ?? '',
  'APCA-API-SECRET-KEY': secret ?? '',
});

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

const DEMO_PRICES: Record<string, number> = {
  AAPL: 175.5, MSFT: 378.25, GOOGL: 140.8, GOOG: 141.2, NVDA: 495.2,
  TSLA: 245.6, AMZN: 178.9, META: 485.3, SPY: 478.5, QQQ: 415.7,
  AMD: 142.3, NFLX: 485.9, DIS: 112.4, BA: 205.8, JPM: 168.7,
  V: 267.3, MA: 434.1, BRK: 385.2, JNJ: 158.4, WMT: 175.8,
  PG: 155.6, UNH: 524.3, HD: 345.7, BAC: 33.45, XOM: 105.2,
  CVX: 155.8, PFE: 28.75, KO: 59.85, PEP: 172.4, ABBV: 168.9,
  TMO: 545.6, CSCO: 48.95, ORCL: 113.2, INTC: 43.75, IBM: 167.8,
  CRM: 285.4, ADBE: 545.9,
};

function getDemoQuote(symbol: string) {
  const upper = symbol.toUpperCase();
  const basePrice = DEMO_PRICES[upper] || 100 + Math.random() * 100;
  const spread = basePrice * 0.001;
  return {
    symbol: upper,
    bid: basePrice - spread / 2,
    ask: basePrice + spread / 2,
    last: basePrice,
    bidSize: Math.floor(Math.random() * 500) + 100,
    askSize: Math.floor(Math.random() * 500) + 100,
    timestamp: new Date().toISOString(),
    source: 'demo' as const,
  };
}

function getDemoMarketClock() {
  const now = new Date();
  const day = now.getUTCDay();
  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();
  const minutes = hour * 60 + minute;
  // US market hours: Mon-Fri 14:30-21:00 UTC
  const marketOpenMin = 14 * 60 + 30;
  const marketCloseMin = 21 * 60;
  const isWeekday = day >= 1 && day <= 5;
  const isOpen = isWeekday && minutes >= marketOpenMin && minutes < marketCloseMin;
  const nextOpen = new Date(now);
  nextOpen.setUTCHours(14, 30, 0, 0);
  if (!isOpen || minutes >= marketCloseMin) {
    nextOpen.setUTCDate(nextOpen.getUTCDate() + 1);
  }
  while (nextOpen.getUTCDay() === 0 || nextOpen.getUTCDay() === 6) {
    nextOpen.setUTCDate(nextOpen.getUTCDate() + 1);
  }
  const nextClose = new Date(now);
  nextClose.setUTCHours(21, 0, 0, 0);
  if (minutes >= marketCloseMin) {
    nextClose.setUTCDate(nextClose.getUTCDate() + 1);
  }
  return {
    isOpen,
    nextOpen: nextOpen.toISOString(),
    nextClose: nextClose.toISOString(),
    timestamp: now.toISOString(),
    source: 'demo' as const,
  };
}

// In-memory demo orders (ephemeral)
interface DemoOrder {
  id: string;
  symbol: string;
  qty: number;
  side: string;
  type: string;
  status: string;
  timeInForce: string;
  limitPrice?: number;
  stopPrice?: number;
  filledQty: number;
  filledAvgPrice?: number;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  filledAt?: string;
  canceledAt?: string;
  extendedHours?: boolean;
}
const demoOrders = new Map<string, DemoOrder>();

function mapAlpacaOrder(data: Record<string, unknown>): DemoOrder {
  const d = data as Record<string, string | null | undefined>;
  return {
    id: d.id as string,
    symbol: d.symbol as string,
    qty: parseFloat((d.qty as string) || '0'),
    side: d.side as string,
    type: d.type as string,
    status: ((d.status as string) || '').toLowerCase(),
    timeInForce: d.time_in_force as string,
    limitPrice: d.limit_price ? parseFloat(d.limit_price) : undefined,
    stopPrice: d.stop_price ? parseFloat(d.stop_price) : undefined,
    filledQty: parseFloat((d.filled_qty as string) || '0'),
    filledAvgPrice: d.filled_avg_price ? parseFloat(d.filled_avg_price) : undefined,
    createdAt: d.created_at as string,
    updatedAt: d.updated_at as string,
    submittedAt: d.submitted_at as string | undefined,
    filledAt: d.filled_at as string | undefined,
    canceledAt: d.canceled_at as string | undefined,
    extendedHours: (data as { extended_hours?: boolean }).extended_hours,
  };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function tradingRoutes(fastify: FastifyInstance, _opts: RouteContext) {
  // =========================================================================
  // GET /api/v1/trading/account  (auth)
  // =========================================================================
  fastify.get(
    '/api/v1/trading/account',
    { preHandler: authMiddleware },
    async (_request, reply) => {
      const { alpacaKey, alpacaSecret, isPaper, configured, baseUrl } = brokerConfig();
      if (!configured) {
        return reply.status(503).send({
          success: false,
          error: {
            code: 'BROKER_UNAVAILABLE',
            message: 'Broker not configured. Set ALPACA_API_KEY and ALPACA_API_SECRET.',
          },
        });
      }
      try {
        const { default: axios } = await import('axios');
        const response = await axios.get(`${baseUrl}/v2/account`, {
          headers: alpacaHeaders(alpacaKey, alpacaSecret),
          timeout: 10000,
        });
        const a = response.data;
        return {
          success: true,
          data: {
            accountId: a.id,
            accountNumber: a.account_number,
            status: a.status,
            currency: a.currency,
            buyingPower: parseFloat(a.buying_power),
            cash: parseFloat(a.cash),
            portfolioValue: parseFloat(a.portfolio_value),
            equity: parseFloat(a.equity),
            lastEquity: parseFloat(a.last_equity),
            longMarketValue: parseFloat(a.long_market_value),
            shortMarketValue: parseFloat(a.short_market_value),
            initialMargin: parseFloat(a.initial_margin),
            maintenanceMargin: parseFloat(a.maintenance_margin),
            sma: parseFloat(a.sma),
            daytradeCount: a.daytrade_count,
            dayTradingBuyingPower: parseFloat(a.daytrading_buying_power),
            regtBuyingPower: parseFloat(a.regt_buying_power),
            multiplier: parseFloat(a.multiplier),
            patternDayTrader: a.pattern_day_trader,
            tradingBlocked: a.trading_blocked,
            transfersBlocked: a.transfers_blocked,
            accountBlocked: a.account_blocked,
            createdAt: a.created_at,
            paperTrading: isPaper,
            broker: 'alpaca',
          },
        };
      } catch (err) {
        logger.error({ err }, '[Trading Account] Alpaca error');
        return reply.status(502).send({
          success: false,
          error: { code: 'BROKER_ERROR', message: 'Failed to fetch account' },
        });
      }
    }
  );

  // =========================================================================
  // GET /api/v1/trading/clock  (public, demo fallback)
  // =========================================================================
  fastify.get('/api/v1/trading/clock', async () => {
    const { alpacaKey, alpacaSecret, configured, baseUrl } = brokerConfig();
    if (!configured) {
      return { success: true, data: getDemoMarketClock() };
    }
    try {
      const { default: axios } = await import('axios');
      const response = await axios.get(`${baseUrl}/v2/clock`, {
        headers: alpacaHeaders(alpacaKey, alpacaSecret),
        timeout: 5000,
      });
      const c = response.data;
      return {
        success: true,
        data: {
          isOpen: c.is_open,
          nextOpen: c.next_open,
          nextClose: c.next_close,
          timestamp: c.timestamp,
          source: 'alpaca' as const,
        },
      };
    } catch (err) {
      logger.warn({ err }, '[Trading Clock] Alpaca error, falling back to demo');
      return { success: true, data: getDemoMarketClock() };
    }
  });

  // =========================================================================
  // POST /api/v1/trading/connect  (public)
  // =========================================================================
  interface ConnectBody {
    broker?: 'alpaca' | 'mock';
    apiKey?: string;
    apiSecret?: string;
    paperTrading?: boolean;
  }
  fastify.post<{ Body: ConnectBody }>(
    '/api/v1/trading/connect',
    async (request, reply) => {
      const { broker = 'alpaca', apiKey, apiSecret, paperTrading } = request.body || {};
      if (broker === 'mock') {
        return {
          success: true,
          data: { connected: true, broker: 'mock', paperTrading: true },
        };
      }
      if (broker !== 'alpaca') {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: `Unsupported broker: ${broker}` },
        });
      }
      const key = apiKey || process.env.ALPACA_API_KEY;
      const secret = apiSecret || process.env.ALPACA_API_SECRET;
      const isPaper = paperTrading !== undefined
        ? paperTrading
        : process.env.ALPACA_PAPER_TRADING !== 'false';
      if (!key || !secret) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Alpaca API key and secret are required',
          },
        });
      }
      const baseUrl = isPaper
        ? 'https://paper-api.alpaca.markets'
        : 'https://api.alpaca.markets';
      try {
        const { default: axios } = await import('axios');
        const response = await axios.get(`${baseUrl}/v2/account`, {
          headers: alpacaHeaders(key, secret),
          timeout: 10000,
        });
        return {
          success: true,
          data: {
            connected: true,
            broker: 'alpaca',
            paperTrading: isPaper,
            accountStatus: response.data.status,
            accountNumber: response.data.account_number,
          },
        };
      } catch (err) {
        const e = err as { response?: { status?: number } };
        if (e.response?.status === 401 || e.response?.status === 403) {
          return reply.status(401).send({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Invalid Alpaca credentials' },
          });
        }
        logger.error({ err }, '[Trading Connect] Alpaca error');
        return reply.status(502).send({
          success: false,
          error: { code: 'BROKER_ERROR', message: 'Failed to connect to broker' },
        });
      }
    }
  );

  // =========================================================================
  // GET /api/v1/trading/positions  (auth)
  // =========================================================================
  fastify.get(
    '/api/v1/trading/positions',
    { preHandler: authMiddleware },
    async (_request, reply) => {
      const { alpacaKey, alpacaSecret, isPaper, configured, baseUrl } = brokerConfig();
      if (!configured) {
        reply.header('X-Data-Source', 'mock');
        return {
          success: true,
          data: { positions: [], count: 0, brokerConnected: false, brokerType: 'demo' },
        };
      }
      try {
        const { default: axios } = await import('axios');
        const response = await axios.get(`${baseUrl}/v2/positions`, {
          headers: alpacaHeaders(alpacaKey, alpacaSecret),
          timeout: 10000,
        });
        const positions = (response.data as Array<Record<string, string>>).map((p) => {
          const qty = parseFloat(p.qty);
          return {
            symbol: p.symbol,
            qty,
            side: qty >= 0 ? 'long' : 'short',
            marketValue: parseFloat(p.market_value),
            costBasis: parseFloat(p.cost_basis),
            unrealizedPnL: parseFloat(p.unrealized_pl),
            unrealizedPnLPercent: parseFloat(p.unrealized_plpc) * 100,
            currentPrice: parseFloat(p.current_price),
            avgEntryPrice: parseFloat(p.avg_entry_price),
            changeToday: parseFloat(p.change_today) * 100,
            assetId: p.asset_id,
            assetClass: p.asset_class,
            exchange: p.exchange,
          };
        });
        reply.header('X-Data-Source', 'live');
        return {
          success: true,
          data: {
            positions,
            count: positions.length,
            brokerConnected: true,
            brokerType: 'alpaca',
            paperTrading: isPaper,
          },
        };
      } catch (err) {
        logger.error({ err }, '[Trading Positions] Alpaca error');
        reply.header('X-Data-Source', 'mock');
        return {
          success: true,
          data: { positions: [], count: 0, brokerConnected: false, brokerType: 'demo' },
        };
      }
    }
  );

  // =========================================================================
  // GET /api/v1/trading/quote  (public, demo fallback)
  // =========================================================================
  interface QuoteQuery { symbol?: string; symbols?: string }
  fastify.get<{ Querystring: QuoteQuery }>(
    '/api/v1/trading/quote',
    async (request, reply) => {
      const { symbol, symbols } = request.query;
      if (!symbol && !symbols) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'symbol or symbols query param required' },
        });
      }
      const { alpacaKey, alpacaSecret, configured } = brokerConfig();

      // Batch mode
      if (symbols) {
        const symList = symbols.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
        if (!configured) {
          reply.header('X-Data-Source', 'mock');
          return {
            success: true,
            data: { quotes: symList.map(getDemoQuote), count: symList.length },
          };
        }
        try {
          const { default: axios } = await import('axios');
          const response = await axios.get(
            `https://data.alpaca.markets/v2/stocks/quotes/latest`,
            {
              headers: alpacaHeaders(alpacaKey, alpacaSecret),
              params: { symbols: symList.join(',') },
              timeout: 10000,
            }
          );
          const quotesData = (response.data.quotes || {}) as Record<string, { bp: number; ap: number; bs: number; as: number; t: string }>;
          const quotes = symList.map((sym) => {
            const q = quotesData[sym];
            if (!q) return getDemoQuote(sym);
            return {
              symbol: sym,
              bid: q.bp,
              ask: q.ap,
              last: (q.bp + q.ap) / 2,
              bidSize: q.bs,
              askSize: q.as,
              timestamp: q.t,
              source: 'alpaca' as const,
            };
          });
          reply.header('X-Data-Source', 'live');
          return { success: true, data: { quotes, count: quotes.length } };
        } catch (err) {
          logger.warn({ err }, '[Trading Quote] Alpaca batch error, falling back to demo');
          reply.header('X-Data-Source', 'mock');
          return {
            success: true,
            data: { quotes: symList.map(getDemoQuote), count: symList.length },
          };
        }
      }

      // Single-symbol mode
      const sym = (symbol as string).toUpperCase();
      if (!configured) {
        reply.header('X-Data-Source', 'mock');
        return { success: true, data: getDemoQuote(sym) };
      }
      try {
        const { default: axios } = await import('axios');
        const response = await axios.get(
          `https://data.alpaca.markets/v2/stocks/${sym}/quotes/latest`,
          { headers: alpacaHeaders(alpacaKey, alpacaSecret), timeout: 10000 }
        );
        const q = response.data.quote;
        if (!q) {
          reply.header('X-Data-Source', 'mock');
          return { success: true, data: getDemoQuote(sym) };
        }
        reply.header('X-Data-Source', 'live');
        return {
          success: true,
          data: {
            symbol: sym,
            bid: q.bp,
            ask: q.ap,
            last: (q.bp + q.ap) / 2,
            bidSize: q.bs,
            askSize: q.as,
            timestamp: q.t,
            source: 'alpaca' as const,
          },
        };
      } catch (err) {
        logger.warn({ err }, '[Trading Quote] Alpaca error, falling back to demo');
        reply.header('X-Data-Source', 'mock');
        return { success: true, data: getDemoQuote(sym) };
      }
    }
  );

  // =========================================================================
  // POST /api/v1/trading/preview  (public)
  // =========================================================================
  interface PreviewBody {
    symbol?: string;
    qty?: number;
    notional?: number;
    side?: 'buy' | 'sell';
    type?: 'market' | 'limit' | 'stop' | 'stop_limit' | 'trailing_stop';
    limitPrice?: number;
    stopPrice?: number;
  }
  fastify.post<{ Body: PreviewBody }>(
    '/api/v1/trading/preview',
    async (request, reply) => {
      const body = request.body || {};
      const errors: string[] = [];
      const warnings: string[] = [];

      if (!body.symbol) errors.push('Symbol is required');
      if (!body.side || !['buy', 'sell'].includes(body.side)) errors.push('Valid side (buy/sell) is required');
      if (!body.type) errors.push('Order type is required');
      if ((!body.qty || body.qty <= 0) && (!body.notional || body.notional <= 0)) {
        errors.push('Either quantity or notional amount must be positive');
      }
      if (body.type === 'limit' && !body.limitPrice) errors.push('Limit price required for limit orders');
      if (body.type === 'stop' && !body.stopPrice) errors.push('Stop price required for stop orders');
      if (body.type === 'stop_limit' && (!body.limitPrice || !body.stopPrice)) {
        errors.push('Both limit and stop prices required for stop-limit orders');
      }

      if (errors.length > 0) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Order validation failed', details: errors },
        });
      }

      const sym = body.symbol!.toUpperCase();
      const { alpacaKey, alpacaSecret, configured, baseUrl } = brokerConfig();

      // Resolve estimated price
      let estimatedPrice: number;
      let priceSource: 'alpaca' | 'demo' = 'demo';
      if (configured) {
        try {
          const { default: axios } = await import('axios');
          const quoteResp = await axios.get(
            `https://data.alpaca.markets/v2/stocks/${sym}/quotes/latest`,
            { headers: alpacaHeaders(alpacaKey, alpacaSecret), timeout: 5000 }
          );
          const q = quoteResp.data.quote;
          estimatedPrice = body.limitPrice || (q ? (q.bp + q.ap) / 2 : getDemoQuote(sym).last);
          priceSource = q ? 'alpaca' : 'demo';
        } catch {
          estimatedPrice = body.limitPrice || getDemoQuote(sym).last;
        }
      } else {
        estimatedPrice = body.limitPrice || getDemoQuote(sym).last;
      }

      const qty = body.qty || (body.notional ? Math.floor(body.notional / estimatedPrice) : 0);
      const estimatedCost = qty * estimatedPrice;
      const estimatedFees = 0; // Alpaca commission-free
      const estimatedTotal = estimatedCost + estimatedFees;

      // Account buying power check (best-effort)
      let buyingPower: number | undefined;
      if (configured && body.side === 'buy') {
        try {
          const { default: axios } = await import('axios');
          const accResp = await axios.get(`${baseUrl}/v2/account`, {
            headers: alpacaHeaders(alpacaKey, alpacaSecret),
            timeout: 5000,
          });
          buyingPower = parseFloat(accResp.data.buying_power);
          if (buyingPower < estimatedTotal) {
            warnings.push(`Insufficient buying power ($${buyingPower.toFixed(2)} < $${estimatedTotal.toFixed(2)})`);
          }
        } catch {
          // swallow — preview should still succeed
        }
      }

      // Market impact heuristic
      const marketImpact: 'low' | 'medium' | 'high' =
        estimatedCost > 100000 ? 'high' : estimatedCost > 10000 ? 'medium' : 'low';
      const slippageEstimate = estimatedPrice * (marketImpact === 'high' ? 0.002 : marketImpact === 'medium' ? 0.001 : 0.0005);

      return {
        success: true,
        data: {
          preview: {
            symbol: sym,
            side: body.side,
            type: body.type,
            qty,
            estimatedPrice,
            estimatedCost,
            estimatedFees,
            estimatedTotal,
            slippageEstimate,
            marketImpact,
            priceSource,
          },
          account: buyingPower !== undefined ? { buyingPower } : undefined,
          validation: { valid: true, errors: [], warnings },
        },
      };
    }
  );

  // =========================================================================
  // GET /api/v1/trading/orders  (auth)
  // =========================================================================
  interface OrdersQuery {
    status?: string;
    limit?: string;
    after?: string;
    until?: string;
    direction?: string;
    nested?: string;
  }
  fastify.get<{ Querystring: OrdersQuery }>(
    '/api/v1/trading/orders',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { status, limit = '100', after, until, direction = 'desc', nested } = request.query;
      const { alpacaKey, alpacaSecret, isPaper, configured, baseUrl } = brokerConfig();

      if (!configured) {
        const orders = Array.from(demoOrders.values())
          .filter((o) => !status || o.status === status)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, parseInt(limit, 10));
        reply.header('X-Data-Source', 'mock');
        return {
          success: true,
          data: {
            orders,
            count: orders.length,
            brokerConnected: false,
            brokerType: 'demo',
            paperTrading: true,
          },
        };
      }

      try {
        const { default: axios } = await import('axios');
        const params: Record<string, string | boolean> = { limit, direction };
        if (status) params.status = status;
        if (after) params.after = after;
        if (until) params.until = until;
        if (nested === 'true') params.nested = true;

        const response = await axios.get(`${baseUrl}/v2/orders`, {
          headers: alpacaHeaders(alpacaKey, alpacaSecret),
          params,
          timeout: 10000,
        });
        const orders = (response.data as Array<Record<string, unknown>>).map(mapAlpacaOrder);
        reply.header('X-Data-Source', 'live');
        return {
          success: true,
          data: {
            orders,
            count: orders.length,
            brokerConnected: true,
            brokerType: 'alpaca',
            paperTrading: isPaper,
          },
        };
      } catch (err) {
        logger.error({ err }, '[Trading Orders] List error');
        return reply.status(502).send({
          success: false,
          error: { code: 'BROKER_ERROR', message: 'Failed to fetch orders' },
        });
      }
    }
  );

  // =========================================================================
  // POST /api/v1/trading/orders  (auth)
  // =========================================================================
  interface PlaceOrderBody {
    symbol?: string;
    qty?: number;
    notional?: number;
    side?: 'buy' | 'sell';
    type?: 'market' | 'limit' | 'stop' | 'stop_limit' | 'trailing_stop';
    timeInForce?: string;
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
  fastify.post<{ Body: PlaceOrderBody }>(
    '/api/v1/trading/orders',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const orderReq = request.body || {};
      const errors: string[] = [];
      if (!orderReq.symbol) errors.push('Symbol is required');
      if ((!orderReq.qty || orderReq.qty <= 0) && (!orderReq.notional || orderReq.notional <= 0)) {
        errors.push('Either quantity or notional amount must be positive');
      }
      if (!orderReq.side || !['buy', 'sell'].includes(orderReq.side)) errors.push('Side must be "buy" or "sell"');
      if (!orderReq.type || !['market', 'limit', 'stop', 'stop_limit', 'trailing_stop'].includes(orderReq.type)) {
        errors.push('Invalid order type');
      }
      if (orderReq.type === 'limit' && !orderReq.limitPrice) errors.push('Limit price required for limit orders');
      if (orderReq.type === 'stop' && !orderReq.stopPrice) errors.push('Stop price required for stop orders');
      if (orderReq.type === 'stop_limit' && (!orderReq.limitPrice || !orderReq.stopPrice)) {
        errors.push('Both limit and stop prices required for stop-limit orders');
      }
      if (orderReq.type === 'trailing_stop' && !orderReq.trailPercent && !orderReq.trailPrice) {
        errors.push('Trail percent or trail price required for trailing stop orders');
      }
      if (errors.length > 0) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Order validation failed', details: errors },
        });
      }

      const { alpacaKey, alpacaSecret, isPaper, configured, baseUrl } = brokerConfig();

      if (!configured) {
        const orderId = `demo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const now = new Date();
        const sym = orderReq.symbol!.toUpperCase();
        const demoPrice = DEMO_PRICES[sym] || 100 + Math.random() * 100;
        const fillPrice = orderReq.limitPrice || demoPrice;
        const qty = orderReq.qty || (orderReq.notional ? Math.floor(orderReq.notional / fillPrice) : 0);
        const isFilled = orderReq.type === 'market';
        const order: DemoOrder = {
          id: orderId,
          symbol: sym,
          qty,
          side: orderReq.side!,
          type: orderReq.type!,
          status: isFilled ? 'filled' : 'new',
          timeInForce: orderReq.timeInForce || 'day',
          limitPrice: orderReq.limitPrice,
          stopPrice: orderReq.stopPrice,
          filledQty: isFilled ? qty : 0,
          filledAvgPrice: isFilled ? fillPrice : undefined,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          submittedAt: now.toISOString(),
          filledAt: isFilled ? now.toISOString() : undefined,
          extendedHours: orderReq.extendedHours,
        };
        demoOrders.set(orderId, order);
        reply.header('X-Data-Source', 'mock');
        return {
          success: true,
          data: {
            order,
            broker: 'demo',
            paperTrading: true,
            message: 'Demo order submitted. Configure ALPACA_API_KEY for real trading.',
          },
        };
      }

      const payload: Record<string, unknown> = {
        symbol: orderReq.symbol!.toUpperCase(),
        side: orderReq.side,
        type: orderReq.type,
        time_in_force: orderReq.timeInForce || 'day',
      };
      if (orderReq.qty) payload.qty = orderReq.qty.toString();
      else if (orderReq.notional) payload.notional = orderReq.notional.toString();
      if (orderReq.limitPrice) payload.limit_price = orderReq.limitPrice.toString();
      if (orderReq.stopPrice) payload.stop_price = orderReq.stopPrice.toString();
      if (orderReq.trailPercent) payload.trail_percent = orderReq.trailPercent.toString();
      if (orderReq.trailPrice) payload.trail_price = orderReq.trailPrice.toString();
      if (orderReq.extendedHours !== undefined) payload.extended_hours = orderReq.extendedHours;
      if (orderReq.clientOrderId) payload.client_order_id = orderReq.clientOrderId;
      if (orderReq.orderClass && orderReq.orderClass !== 'simple') {
        payload.order_class = orderReq.orderClass;
        if (orderReq.takeProfit) {
          payload.take_profit = { limit_price: orderReq.takeProfit.limitPrice.toString() };
        }
        if (orderReq.stopLoss) {
          payload.stop_loss = {
            stop_price: orderReq.stopLoss.stopPrice.toString(),
            limit_price: orderReq.stopLoss.limitPrice?.toString(),
          };
        }
      }

      try {
        const { default: axios } = await import('axios');
        const response = await axios.post(`${baseUrl}/v2/orders`, payload, {
          headers: {
            ...alpacaHeaders(alpacaKey, alpacaSecret),
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        });
        const order = mapAlpacaOrder(response.data);
        reply.header('X-Data-Source', 'live');
        return {
          success: true,
          data: { order, broker: 'alpaca', paperTrading: isPaper },
        };
      } catch (err) {
        const e = err as { response?: { status?: number; data?: unknown } };
        logger.error({ err: e.response?.data || err }, '[Trading Orders] Place error');
        if (e.response?.status === 403) {
          return reply.status(400).send({
            success: false,
            error: { code: 'ORDER_REJECTED', message: 'Order rejected by broker' },
          });
        }
        if (e.response?.status === 422) {
          return reply.status(400).send({
            success: false,
            error: { code: 'ORDER_REJECTED', message: 'Order rejected — check order parameters' },
          });
        }
        return reply.status(500).send({
          success: false,
          error: { code: 'BROKER_ERROR', message: 'Order submission failed' },
        });
      }
    }
  );

  // =========================================================================
  // DELETE /api/v1/trading/orders  (auth) — ?id=… or ?cancelAll=true
  // =========================================================================
  interface CancelQuery { id?: string; cancelAll?: string }
  fastify.delete<{ Querystring: CancelQuery }>(
    '/api/v1/trading/orders',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id, cancelAll } = request.query;
      const { alpacaKey, alpacaSecret, configured, baseUrl } = brokerConfig();

      if (cancelAll === 'true') {
        if (!configured) {
          let canceled = 0;
          for (const order of demoOrders.values()) {
            if (!['filled', 'canceled', 'expired'].includes(order.status)) {
              order.status = 'canceled';
              order.canceledAt = new Date().toISOString();
              order.updatedAt = new Date().toISOString();
              canceled++;
            }
          }
          return { success: true, data: { canceled } };
        }
        try {
          const { default: axios } = await import('axios');
          const response = await axios.delete(`${baseUrl}/v2/orders`, {
            headers: alpacaHeaders(alpacaKey, alpacaSecret),
            timeout: 10000,
          });
          return {
            success: true,
            data: {
              canceled: Array.isArray(response.data) ? response.data.length : 0,
              orders: response.data,
            },
          };
        } catch (err) {
          logger.error({ err }, '[Trading Orders] Cancel all error');
          return reply.status(502).send({
            success: false,
            error: { code: 'BROKER_ERROR', message: 'Failed to cancel orders' },
          });
        }
      }

      if (!id) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Order ID is required' },
        });
      }

      if (!configured) {
        const order = demoOrders.get(id);
        if (order && !['filled', 'canceled', 'expired'].includes(order.status)) {
          order.status = 'canceled';
          order.canceledAt = new Date().toISOString();
          order.updatedAt = new Date().toISOString();
          return { success: true, data: { canceled: true, orderId: id } };
        }
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Order not found' },
        });
      }

      try {
        const { default: axios } = await import('axios');
        await axios.delete(`${baseUrl}/v2/orders/${id}`, {
          headers: alpacaHeaders(alpacaKey, alpacaSecret),
          timeout: 10000,
        });
        return { success: true, data: { canceled: true, orderId: id } };
      } catch (err) {
        const e = err as { response?: { status?: number } };
        if (e.response?.status === 404) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Order not found' },
          });
        }
        logger.error({ err }, '[Trading Orders] Cancel error');
        return reply.status(502).send({
          success: false,
          error: { code: 'BROKER_ERROR', message: 'Order cancellation failed' },
        });
      }
    }
  );
}
