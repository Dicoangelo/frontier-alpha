/**
 * Trading Module - Unified exports for broker integrations
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
  setBroker,
  resetBroker,
} from './AlpacaAdapter.js';
