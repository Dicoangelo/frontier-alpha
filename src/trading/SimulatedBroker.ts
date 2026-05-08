/**
 * SimulatedBroker — Internal paper-trading broker for users without Alpaca
 *
 * Persists accounts, orders, and positions in Supabase (paper_accounts,
 * paper_orders, paper_positions). Fills against the live Polygon quote stream
 * via MarketDataProvider. Mirrors the BrokerAdapter contract so the trading
 * surface (`/api/v1/trading/*`) is broker-agnostic.
 *
 * Use cases:
 * - Canadian (and other non-US) users who can't open Alpaca accounts
 * - MVP demo flows
 * - Internal testing without burning Alpaca paper-account state
 *
 * Design choices (v1):
 * - Market orders fill instantly at current ask (buy) / bid (sell).
 * - Limit orders that are immediately marketable fill at the limit price;
 *   non-marketable limits are persisted as `pending` (no background fill loop —
 *   that's TODO for v2).
 * - Stop / stop-limit orders are persisted as `pending` only; no trigger loop.
 * - Partial fills are not modeled — fills are atomic (either full or pending).
 * - Buying-power formula mirrors Alpaca: cash * 2 (Reg-T 50% margin).
 * - Shorting is disabled at the asset level (`shortable: false`).
 * - Persistence uses the service-role client because the broker runs server-side
 *   and explicitly scopes every query by the JWT-derived user_id. RLS still
 *   enforces the boundary for any client that hits paper_* tables directly.
 */

import { randomUUID } from 'crypto';
import {
  BrokerAdapter,
  type BrokerAccount,
  type BrokerConfig,
  type BrokerPosition,
  type Order,
  type OrderRequest,
  type Quote,
  type MarketClock,
  type Asset,
} from './BrokerAdapter.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { marketDataProvider } from '../data/MarketDataProvider.js';
import { logger } from '../lib/logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SimulatedBrokerConfig extends BrokerConfig {
  userId: string;
  /**
   * Optional override for the per-account starting cash. Defaults to $100,000.
   */
  startingCash?: number;
}

interface PaperAccountRow {
  user_id: string;
  cash_usd: number | string;
  starting_cash: number | string;
  created_at: string;
  updated_at: string;
}

interface PaperOrderRow {
  id: string;
  user_id: string;
  symbol: string;
  side: 'buy' | 'sell';
  qty: number | string;
  type: 'market' | 'limit' | 'stop' | 'stop_limit';
  limit_price: number | string | null;
  stop_price: number | string | null;
  time_in_force: string | null;
  status: 'pending' | 'filled' | 'partially_filled' | 'canceled' | 'rejected' | 'expired';
  filled_qty: number | string | null;
  filled_avg_price: number | string | null;
  submitted_at: string;
  filled_at: string | null;
  canceled_at: string | null;
  reject_reason: string | null;
  client_order_id: string | null;
}

interface PaperPositionRow {
  user_id: string;
  symbol: string;
  qty: number | string;
  avg_entry_price: number | string;
  cost_basis: number | string;
  opened_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_STARTING_CASH = 100_000;
const MARGIN_MULTIPLIER = 2; // Alpaca-style Reg-T 50% margin

const num = (v: number | string | null | undefined, fallback = 0): number => {
  if (v === null || v === undefined) return fallback;
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : fallback;
};

// Map our internal status to the BrokerAdapter Order.status union.
function mapOrderStatus(status: PaperOrderRow['status']): Order['status'] {
  switch (status) {
    case 'pending':
      return 'new';
    case 'filled':
      return 'filled';
    case 'partially_filled':
      return 'partially_filled';
    case 'canceled':
      return 'canceled';
    case 'rejected':
      return 'rejected';
    case 'expired':
      return 'expired';
    default:
      return 'new';
  }
}

// Reverse mapping for getOrders(status?) — accept any BrokerAdapter status hint
// and translate it to the persisted column where possible.
function toPersistedStatus(status?: string): PaperOrderRow['status'] | null {
  if (!status) return null;
  switch (status) {
    case 'new':
    case 'accepted':
    case 'pending_new':
    case 'held':
    case 'pending':
      return 'pending';
    case 'filled':
      return 'filled';
    case 'partially_filled':
      return 'partially_filled';
    case 'canceled':
    case 'pending_cancel':
      return 'canceled';
    case 'rejected':
      return 'rejected';
    case 'expired':
      return 'expired';
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// SimulatedBroker
// ---------------------------------------------------------------------------

export class SimulatedBroker extends BrokerAdapter {
  private readonly userId: string;
  private readonly startingCash: number;

  constructor(config: SimulatedBrokerConfig) {
    super(config);
    if (!config.userId) {
      throw new Error('SimulatedBroker requires a userId in config');
    }
    this.userId = config.userId;
    this.startingCash = config.startingCash ?? DEFAULT_STARTING_CASH;
  }

  get name(): string {
    return 'Simulated Broker (Frontier Alpha)';
  }

  get isPaperTrading(): boolean {
    return true;
  }

  // -------------------------------------------------------------------------
  // Connection (no-op — always "connected")
  // -------------------------------------------------------------------------

  async connect(): Promise<boolean> {
    this.connected = true;
    return true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  // -------------------------------------------------------------------------
  // Account
  // -------------------------------------------------------------------------

  /**
   * Fetches the user's paper_accounts row, creating it lazily on first call.
   * Computes derived fields (equity, buying power, market values) from open
   * positions marked-to-market against the live quote stream.
   */
  async getAccount(): Promise<BrokerAccount> {
    const row = await this.ensureAccountRow();
    const positions = await this.getPositions();

    let longMarketValue = 0;
    for (const p of positions) {
      if (p.side === 'long') longMarketValue += p.marketValue;
    }
    const cash = num(row.cash_usd);
    const equity = cash + longMarketValue;
    const buyingPower = Math.max(0, cash * MARGIN_MULTIPLIER);

    return {
      id: `paper-${this.userId}`,
      status: 'active',
      currency: 'USD',
      buyingPower,
      cash,
      portfolioValue: equity,
      dayTradeCount: 0,
      patternDayTrader: false,
      tradingBlocked: false,
      transfersBlocked: false,
      accountBlocked: false,
      createdAt: new Date(row.created_at),
      multiplier: MARGIN_MULTIPLIER,
      shortingEnabled: false,
      longMarketValue,
      shortMarketValue: 0,
      equity,
      lastEquity: num(row.starting_cash, this.startingCash),
      initialMargin: 0,
      maintenanceMargin: 0,
      dayTradingBuyingPower: buyingPower,
      regtBuyingPower: buyingPower,
    };
  }

  private async ensureAccountRow(): Promise<PaperAccountRow> {
    const { data, error } = await supabaseAdmin
      .from('paper_accounts')
      .select('*')
      .eq('user_id', this.userId)
      .maybeSingle();

    if (error) {
      logger.error({ err: error, userId: this.userId }, 'paper_accounts read failed');
      throw new Error(`SimulatedBroker: failed to read paper account (${error.message})`);
    }

    if (data) return data as PaperAccountRow;

    const insert = {
      user_id: this.userId,
      cash_usd: this.startingCash,
      starting_cash: this.startingCash,
    };
    const { data: created, error: insertErr } = await supabaseAdmin
      .from('paper_accounts')
      .insert(insert)
      .select('*')
      .single();

    if (insertErr || !created) {
      logger.error({ err: insertErr, userId: this.userId }, 'paper_accounts insert failed');
      throw new Error(`SimulatedBroker: failed to create paper account (${insertErr?.message ?? 'unknown'})`);
    }
    return created as PaperAccountRow;
  }

  // -------------------------------------------------------------------------
  // Positions
  // -------------------------------------------------------------------------

  async getPositions(): Promise<BrokerPosition[]> {
    const { data, error } = await supabaseAdmin
      .from('paper_positions')
      .select('*')
      .eq('user_id', this.userId);

    if (error) {
      logger.error({ err: error, userId: this.userId }, 'paper_positions read failed');
      throw new Error(`SimulatedBroker: failed to read positions (${error.message})`);
    }

    const rows = (data ?? []) as PaperPositionRow[];
    if (rows.length === 0) return [];

    // Mark-to-market against the live quote stream
    const symbols = rows.map((r) => r.symbol.toUpperCase());
    const quotes = await this.getQuotes(symbols);

    return rows.map((r) => this.markPosition(r, quotes.get(r.symbol.toUpperCase())));
  }

  async getPosition(symbol: string): Promise<BrokerPosition | null> {
    const sym = symbol.toUpperCase();
    const { data, error } = await supabaseAdmin
      .from('paper_positions')
      .select('*')
      .eq('user_id', this.userId)
      .eq('symbol', sym)
      .maybeSingle();

    if (error) {
      logger.error({ err: error, userId: this.userId, symbol: sym }, 'paper_position read failed');
      throw new Error(`SimulatedBroker: failed to read position (${error.message})`);
    }
    if (!data) return null;

    const quote = await this.getQuote(sym);
    return this.markPosition(data as PaperPositionRow, quote ?? undefined);
  }

  private markPosition(row: PaperPositionRow, quote?: Quote): BrokerPosition {
    const qty = num(row.qty);
    const avgEntry = num(row.avg_entry_price);
    const costBasis = num(row.cost_basis);
    const currentPrice = quote?.last ?? quote?.ask ?? avgEntry;
    const marketValue = qty * currentPrice;
    const unrealizedPnL = marketValue - costBasis;
    const unrealizedPnLPercent = avgEntry > 0 ? ((currentPrice / avgEntry) - 1) * 100 : 0;

    return {
      symbol: row.symbol.toUpperCase(),
      qty: Math.abs(qty),
      side: qty >= 0 ? 'long' : 'short',
      marketValue,
      costBasis,
      unrealizedPnL,
      unrealizedPnLPercent,
      currentPrice,
      avgEntryPrice: avgEntry,
      assetClass: 'us_equity',
    };
  }

  // -------------------------------------------------------------------------
  // Orders
  // -------------------------------------------------------------------------

  async submitOrder(orderReq: OrderRequest): Promise<Order> {
    const sym = (orderReq.symbol ?? '').toUpperCase();
    const account = await this.getAccount();

    // Run the abstract validator (basic shape + buying power).
    const validation = await this.validateOrder({ ...orderReq, symbol: sym }, account);
    if (!validation.valid) {
      await this.persistRejectedOrder(orderReq, sym, validation.errors.join('; '));
      throw new Error(validation.errors.join(', '));
    }

    // Trailing-stop is not modeled in v1.
    if (orderReq.type === 'trailing_stop') {
      await this.persistRejectedOrder(orderReq, sym, 'trailing_stop not supported by SimulatedBroker v1');
      throw new Error('SimulatedBroker: trailing_stop orders are not supported in v1');
    }

    // Resolve fill price against the live quote stream.
    const quote = await this.getQuote(sym);
    if (!quote) {
      await this.persistRejectedOrder(orderReq, sym, `no quote available for ${sym}`);
      throw new Error(`SimulatedBroker: no quote available for ${sym}`);
    }

    const refPrice = orderReq.side === 'buy' ? quote.ask : quote.bid;
    const qty =
      orderReq.qty ??
      (orderReq.notional && refPrice > 0 ? Math.floor(orderReq.notional / refPrice) : 0);

    if (!qty || qty <= 0) {
      await this.persistRejectedOrder(orderReq, sym, 'computed quantity is zero');
      throw new Error('SimulatedBroker: order quantity must be positive');
    }

    // Decide whether the order can fill immediately.
    const decision = this.decideFill(orderReq, refPrice);

    if (decision.fill) {
      const fillPrice = decision.fillPrice;
      const cost = qty * fillPrice;

      // Buying-power check at fill time (account already loaded).
      if (orderReq.side === 'buy' && cost > account.buyingPower) {
        await this.persistRejectedOrder(
          orderReq,
          sym,
          `insufficient buying power (need $${cost.toFixed(2)}, have $${account.buyingPower.toFixed(2)})`
        );
        throw new Error(
          `SimulatedBroker: insufficient buying power. Required $${cost.toFixed(2)}, available $${account.buyingPower.toFixed(2)}`
        );
      }

      // For sells, ensure we have the position. Shorting is not allowed in v1.
      if (orderReq.side === 'sell') {
        const existing = await this.getRawPosition(sym);
        const existingQty = existing ? num(existing.qty) : 0;
        if (existingQty < qty) {
          await this.persistRejectedOrder(
            orderReq,
            sym,
            `insufficient position to sell (have ${existingQty}, want ${qty})`
          );
          throw new Error(
            `SimulatedBroker: insufficient position to sell ${qty} ${sym} (currently hold ${existingQty})`
          );
        }
      }

      const inserted = await this.persistFilledOrder(orderReq, sym, qty, fillPrice);
      await this.applyFillToPosition(sym, orderReq.side, qty, fillPrice);
      await this.adjustCash(orderReq.side === 'buy' ? -cost : cost);
      return this.mapOrderRow(inserted);
    }

    // Non-marketable limit / stop / stop-limit — persist as pending.
    // TODO: add a background fill loop that re-evaluates pending orders against
    // streaming quotes. For now, the order will sit until manually canceled.
    const pending = await this.persistPendingOrder(orderReq, sym, qty);
    return this.mapOrderRow(pending);
  }

  /**
   * Decide whether a freshly submitted order should fill immediately and at
   * what price.
   *  - market: always fills at the current ref price
   *  - limit (buy): fills if ask <= limit, at the limit price (price improvement off)
   *  - limit (sell): fills if bid >= limit, at the limit price
   *  - stop / stop_limit: never fills synchronously in v1 (no trigger loop)
   */
  private decideFill(
    req: OrderRequest,
    refPrice: number
  ): { fill: true; fillPrice: number } | { fill: false } {
    if (req.type === 'market') {
      return { fill: true, fillPrice: refPrice };
    }
    if (req.type === 'limit' && req.limitPrice !== undefined) {
      if (req.side === 'buy' && refPrice <= req.limitPrice) {
        return { fill: true, fillPrice: req.limitPrice };
      }
      if (req.side === 'sell' && refPrice >= req.limitPrice) {
        return { fill: true, fillPrice: req.limitPrice };
      }
    }
    return { fill: false };
  }

  private async persistFilledOrder(
    req: OrderRequest,
    symbol: string,
    qty: number,
    fillPrice: number
  ): Promise<PaperOrderRow> {
    const now = new Date().toISOString();
    const insert: Partial<PaperOrderRow> = {
      id: randomUUID(),
      user_id: this.userId,
      symbol,
      side: req.side,
      qty,
      type: this.coerceOrderType(req.type),
      limit_price: req.limitPrice ?? null,
      stop_price: req.stopPrice ?? null,
      time_in_force: req.timeInForce ?? 'day',
      status: 'filled',
      filled_qty: qty,
      filled_avg_price: fillPrice,
      submitted_at: now,
      filled_at: now,
      client_order_id: req.clientOrderId ?? null,
    };
    const { data, error } = await supabaseAdmin
      .from('paper_orders')
      .insert(insert)
      .select('*')
      .single();
    if (error || !data) {
      logger.error({ err: error, userId: this.userId, symbol }, 'paper_orders filled insert failed');
      throw new Error(`SimulatedBroker: failed to persist filled order (${error?.message ?? 'unknown'})`);
    }
    return data as PaperOrderRow;
  }

  private async persistPendingOrder(
    req: OrderRequest,
    symbol: string,
    qty: number
  ): Promise<PaperOrderRow> {
    const insert: Partial<PaperOrderRow> = {
      id: randomUUID(),
      user_id: this.userId,
      symbol,
      side: req.side,
      qty,
      type: this.coerceOrderType(req.type),
      limit_price: req.limitPrice ?? null,
      stop_price: req.stopPrice ?? null,
      time_in_force: req.timeInForce ?? 'day',
      status: 'pending',
      filled_qty: 0,
      filled_avg_price: null,
      submitted_at: new Date().toISOString(),
      client_order_id: req.clientOrderId ?? null,
    };
    const { data, error } = await supabaseAdmin
      .from('paper_orders')
      .insert(insert)
      .select('*')
      .single();
    if (error || !data) {
      logger.error({ err: error, userId: this.userId, symbol }, 'paper_orders pending insert failed');
      throw new Error(`SimulatedBroker: failed to persist pending order (${error?.message ?? 'unknown'})`);
    }
    return data as PaperOrderRow;
  }

  private async persistRejectedOrder(
    req: OrderRequest,
    symbol: string,
    reason: string
  ): Promise<void> {
    const insert: Partial<PaperOrderRow> = {
      id: randomUUID(),
      user_id: this.userId,
      symbol: symbol || (req.symbol ?? '').toUpperCase() || 'UNKNOWN',
      side: req.side ?? 'buy',
      qty: req.qty ?? 0,
      type: this.coerceOrderType(req.type ?? 'market'),
      limit_price: req.limitPrice ?? null,
      stop_price: req.stopPrice ?? null,
      time_in_force: req.timeInForce ?? 'day',
      status: 'rejected',
      filled_qty: 0,
      submitted_at: new Date().toISOString(),
      reject_reason: reason,
      client_order_id: req.clientOrderId ?? null,
    };
    // Best-effort — never throw from the rejection persistence path.
    const { error } = await supabaseAdmin.from('paper_orders').insert(insert);
    if (error) {
      logger.warn({ err: error, userId: this.userId, symbol, reason }, 'paper_orders rejected insert failed');
    }
  }

  private coerceOrderType(t: OrderRequest['type']): PaperOrderRow['type'] {
    if (t === 'market' || t === 'limit' || t === 'stop' || t === 'stop_limit') return t;
    // trailing_stop falls through here — caller should already have rejected it.
    return 'market';
  }

  async getOrder(orderId: string): Promise<Order | null> {
    const { data, error } = await supabaseAdmin
      .from('paper_orders')
      .select('*')
      .eq('user_id', this.userId)
      .eq('id', orderId)
      .maybeSingle();
    if (error) {
      logger.error({ err: error, userId: this.userId, orderId }, 'paper_orders read failed');
      throw new Error(`SimulatedBroker: failed to read order (${error.message})`);
    }
    return data ? this.mapOrderRow(data as PaperOrderRow) : null;
  }

  async getOrders(status?: string): Promise<Order[]> {
    let query = supabaseAdmin
      .from('paper_orders')
      .select('*')
      .eq('user_id', this.userId)
      .order('submitted_at', { ascending: false })
      .limit(200);

    const persisted = toPersistedStatus(status);
    if (persisted) {
      query = query.eq('status', persisted);
    } else if (status === 'open') {
      query = query.eq('status', 'pending');
    } else if (status === 'closed') {
      query = query.in('status', ['filled', 'canceled', 'rejected', 'expired']);
    }

    const { data, error } = await query;
    if (error) {
      logger.error({ err: error, userId: this.userId, status }, 'paper_orders list failed');
      throw new Error(`SimulatedBroker: failed to list orders (${error.message})`);
    }
    return ((data ?? []) as PaperOrderRow[]).map((r) => this.mapOrderRow(r));
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('paper_orders')
      .update({ status: 'canceled', canceled_at: now })
      .eq('user_id', this.userId)
      .eq('id', orderId)
      .eq('status', 'pending')
      .select('id');

    if (error) {
      logger.error({ err: error, userId: this.userId, orderId }, 'paper_orders cancel failed');
      return false;
    }
    return Array.isArray(data) && data.length > 0;
  }

  async cancelAllOrders(): Promise<number> {
    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('paper_orders')
      .update({ status: 'canceled', canceled_at: now })
      .eq('user_id', this.userId)
      .eq('status', 'pending')
      .select('id');
    if (error) {
      logger.error({ err: error, userId: this.userId }, 'paper_orders cancel-all failed');
      return 0;
    }
    return Array.isArray(data) ? data.length : 0;
  }

  async replaceOrder(orderId: string, updates: Partial<OrderRequest>): Promise<Order> {
    const existing = await this.getOrder(orderId);
    if (!existing) {
      throw new Error('SimulatedBroker: order not found');
    }
    if (['filled', 'canceled', 'rejected', 'expired'].includes(existing.status)) {
      throw new Error('SimulatedBroker: cannot replace a completed order');
    }

    // v1: cancel existing + submit new. The new order goes through the full
    // submitOrder pipeline (validation, fill decision, persistence).
    await this.cancelOrder(orderId);
    return this.submitOrder({
      symbol: existing.symbol,
      qty: updates.qty ?? existing.qty,
      side: existing.side,
      type: existing.type === 'trailing_stop' ? 'market' : existing.type,
      timeInForce: updates.timeInForce ?? existing.timeInForce,
      limitPrice: updates.limitPrice ?? existing.limitPrice,
      stopPrice: updates.stopPrice ?? existing.stopPrice,
      clientOrderId: updates.clientOrderId ?? existing.clientOrderId,
    });
  }

  private mapOrderRow(row: PaperOrderRow): Order {
    const submitted = new Date(row.submitted_at);
    const filled = row.filled_at ? new Date(row.filled_at) : undefined;
    const canceled = row.canceled_at ? new Date(row.canceled_at) : undefined;
    return {
      id: row.id,
      clientOrderId: row.client_order_id ?? undefined,
      symbol: row.symbol.toUpperCase(),
      qty: num(row.qty),
      side: row.side,
      type: row.type,
      timeInForce: (row.time_in_force as Order['timeInForce']) ?? 'day',
      limitPrice: row.limit_price !== null ? num(row.limit_price) : undefined,
      stopPrice: row.stop_price !== null ? num(row.stop_price) : undefined,
      status: mapOrderStatus(row.status),
      filledQty: num(row.filled_qty),
      filledAvgPrice: row.filled_avg_price !== null ? num(row.filled_avg_price) : undefined,
      createdAt: submitted,
      updatedAt: filled ?? canceled ?? submitted,
      submittedAt: submitted,
      filledAt: filled,
      canceledAt: canceled,
      assetClass: 'us_equity',
    };
  }

  // -------------------------------------------------------------------------
  // Position & cash mutations (internal, atomic-ish)
  // -------------------------------------------------------------------------

  private async getRawPosition(symbol: string): Promise<PaperPositionRow | null> {
    const { data, error } = await supabaseAdmin
      .from('paper_positions')
      .select('*')
      .eq('user_id', this.userId)
      .eq('symbol', symbol)
      .maybeSingle();
    if (error) {
      logger.error({ err: error, userId: this.userId, symbol }, 'paper_position raw read failed');
      throw new Error(`SimulatedBroker: failed to read position (${error.message})`);
    }
    return (data ?? null) as PaperPositionRow | null;
  }

  private async applyFillToPosition(
    symbol: string,
    side: 'buy' | 'sell',
    qty: number,
    fillPrice: number
  ): Promise<void> {
    const existing = await this.getRawPosition(symbol);
    const now = new Date().toISOString();

    if (!existing) {
      // Sells without a position were already rejected upstream.
      const insert = {
        user_id: this.userId,
        symbol,
        qty,
        avg_entry_price: fillPrice,
        cost_basis: qty * fillPrice,
        opened_at: now,
        updated_at: now,
      };
      const { error } = await supabaseAdmin.from('paper_positions').insert(insert);
      if (error) {
        logger.error({ err: error, userId: this.userId, symbol }, 'paper_position insert failed');
        throw new Error(`SimulatedBroker: failed to open position (${error.message})`);
      }
      return;
    }

    const existingQty = num(existing.qty);
    const existingAvg = num(existing.avg_entry_price);
    const existingCost = num(existing.cost_basis);

    if (side === 'buy') {
      const newQty = existingQty + qty;
      const newCost = existingCost + qty * fillPrice;
      const newAvg = newQty > 0 ? newCost / newQty : fillPrice;
      const { error } = await supabaseAdmin
        .from('paper_positions')
        .update({
          qty: newQty,
          avg_entry_price: newAvg,
          cost_basis: newCost,
          updated_at: now,
        })
        .eq('user_id', this.userId)
        .eq('symbol', symbol);
      if (error) {
        logger.error({ err: error, userId: this.userId, symbol }, 'paper_position add failed');
        throw new Error(`SimulatedBroker: failed to update position (${error.message})`);
      }
      return;
    }

    // Sell: reduce qty (or close out)
    const newQty = existingQty - qty;
    if (newQty <= 0) {
      const { error } = await supabaseAdmin
        .from('paper_positions')
        .delete()
        .eq('user_id', this.userId)
        .eq('symbol', symbol);
      if (error) {
        logger.error({ err: error, userId: this.userId, symbol }, 'paper_position close failed');
        throw new Error(`SimulatedBroker: failed to close position (${error.message})`);
      }
      return;
    }

    // Partial close — keep avg_entry_price, reduce cost_basis proportionally.
    const newCost = existingAvg * newQty;
    const { error } = await supabaseAdmin
      .from('paper_positions')
      .update({
        qty: newQty,
        cost_basis: newCost,
        updated_at: now,
      })
      .eq('user_id', this.userId)
      .eq('symbol', symbol);
    if (error) {
      logger.error({ err: error, userId: this.userId, symbol }, 'paper_position reduce failed');
      throw new Error(`SimulatedBroker: failed to reduce position (${error.message})`);
    }
  }

  private async adjustCash(delta: number): Promise<void> {
    // Read-modify-write — Postgres NUMERIC arithmetic via Supabase doesn't
    // expose atomic increments through the JS client without an RPC. Race
    // conditions are tolerable in v1 because submitOrder is per-user serial in
    // practice (one user, one connection per request).
    const row = await this.ensureAccountRow();
    const next = num(row.cash_usd) + delta;
    const { error } = await supabaseAdmin
      .from('paper_accounts')
      .update({ cash_usd: next, updated_at: new Date().toISOString() })
      .eq('user_id', this.userId);
    if (error) {
      logger.error({ err: error, userId: this.userId, delta }, 'paper_account cash adjust failed');
      throw new Error(`SimulatedBroker: failed to adjust cash (${error.message})`);
    }
  }

  // -------------------------------------------------------------------------
  // Market data — delegate to the existing live quote stream
  // -------------------------------------------------------------------------

  async getQuote(symbol: string): Promise<Quote | null> {
    try {
      const q = await marketDataProvider.getQuote(symbol);
      if (!q) return null;
      return this.adaptQuote(q);
    } catch (err) {
      logger.warn({ err, symbol }, 'SimulatedBroker getQuote failed');
      return null;
    }
  }

  async getQuotes(symbols: string[]): Promise<Map<string, Quote>> {
    const out = new Map<string, Quote>();
    await Promise.all(
      symbols.map(async (sym) => {
        const q = await this.getQuote(sym);
        if (q) out.set(sym.toUpperCase(), q);
      })
    );
    return out;
  }

  /**
   * MarketDataProvider returns the platform-wide Quote shape (with `change` /
   * `changePercent`). The BrokerAdapter Quote shape has bid/ask/last with
   * optional sizes — we adapt here.
   */
  private adaptQuote(q: { symbol: string; bid: number; ask: number; last: number; timestamp: Date }): Quote {
    return {
      symbol: q.symbol.toUpperCase(),
      bid: q.bid,
      ask: q.ask,
      last: q.last,
      timestamp: q.timestamp,
    };
  }

  async getMarketClock(): Promise<MarketClock> {
    // NYSE hours, 9:30-16:00 ET = 14:30-21:00 UTC (ignoring DST nuance — close
    // enough for paper trading).
    const now = new Date();
    const day = now.getUTCDay();
    const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const openMin = 14 * 60 + 30;
    const closeMin = 21 * 60;
    const isWeekday = day >= 1 && day <= 5;
    const isOpen = isWeekday && minutes >= openMin && minutes < closeMin;

    const nextOpen = new Date(now);
    nextOpen.setUTCHours(14, 30, 0, 0);
    if (!isOpen || minutes >= closeMin) {
      nextOpen.setUTCDate(nextOpen.getUTCDate() + 1);
    }
    while (nextOpen.getUTCDay() === 0 || nextOpen.getUTCDay() === 6) {
      nextOpen.setUTCDate(nextOpen.getUTCDate() + 1);
    }

    const nextClose = new Date(now);
    nextClose.setUTCHours(21, 0, 0, 0);
    if (minutes >= closeMin) {
      nextClose.setUTCDate(nextClose.getUTCDate() + 1);
    }

    return { isOpen, nextOpen, nextClose, timestamp: now };
  }

  async isMarketOpen(): Promise<boolean> {
    const c = await this.getMarketClock();
    return c.isOpen;
  }

  async getAsset(symbol: string): Promise<Asset | null> {
    const sym = symbol.toUpperCase();
    return {
      id: `paper-asset-${sym}`,
      symbol: sym,
      name: sym,
      exchange: 'NASDAQ',
      assetClass: 'us_equity',
      tradable: true,
      marginable: true,
      shortable: false, // SimulatedBroker v1 does not allow shorting
      easyToBorrow: false,
      fractionable: false,
      status: 'active',
    };
  }
}

// ---------------------------------------------------------------------------
// Factory helper (kept here so the index.ts wiring stays slim)
// ---------------------------------------------------------------------------

export function createSimulatedBroker(userId: string, opts?: { startingCash?: number }): SimulatedBroker {
  return new SimulatedBroker({
    apiKey: '',
    apiSecret: '',
    paperTrading: true,
    userId,
    startingCash: opts?.startingCash,
  });
}
