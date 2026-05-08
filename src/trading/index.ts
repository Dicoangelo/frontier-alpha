/**
 * Trading Module — Unified exports for broker integrations.
 *
 * Broker resolution rules:
 *   - ALPACA_API_KEY + ALPACA_API_SECRET set  → AlpacaAdapter
 *   - otherwise (per-user calls)              → SimulatedBroker (Supabase-persisted,
 *                                                live Polygon quotes)
 *   - otherwise (singleton, no user context)  → MockBrokerAdapter
 *
 * Per-user route handlers should call `getBrokerForUser(userId)`.
 */

export {
  BrokerAdapter,
  MockBrokerAdapter,
  type BrokerAccount,
  type BrokerPosition,
  type Order,
  type OrderRequest,
  type OrderStatus,
  type OrderLeg,
  type BrokerConfig,
  type MarketClock,
  type Asset,
  type Quote,
  type OrderValidationResult,
} from './BrokerAdapter.js';

export {
  AlpacaAdapter,
  createBroker,
  getBroker,
  getBrokerForUser,
  resolveBrokerKind,
  setBroker,
  resetBroker,
  type BrokerKind,
} from './AlpacaAdapter.js';

export {
  SimulatedBroker,
  createSimulatedBroker,
  type SimulatedBrokerConfig,
} from './SimulatedBroker.js';
