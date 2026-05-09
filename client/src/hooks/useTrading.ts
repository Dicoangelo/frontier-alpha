/**
 * Trading Hook - Unified interface for broker integration
 *
 * Provides:
 * - Account information and connection status
 * - Position management
 * - Order placement, preview, and cancellation
 * - Real-time quotes
 * - Market clock status
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getErrorMessage } from '@/api/client';
import { toast } from '@/components/shared/Toast';
import { useAuthStore } from '@/stores/authStore';

/**
 * US-003 auth gate — every read-side trading query is Bearer-protected,
 * so we must hold the request until the auth store has finished its
 * initial Supabase session-load.
 */
function useAuthGate(): boolean {
  const isReady = useAuthStore((s) => s.isReady);
  const session = useAuthStore((s) => s.session);
  return isReady && !!session?.access_token;
}

// ============================================================================
// Types
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
  multiplier?: number;
  equity?: number;
  lastEquity?: number;
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
}

export interface Order {
  id: string;
  symbol: string;
  qty: number;
  side: 'buy' | 'sell';
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

export interface OrderRequest {
  symbol: string;
  qty?: number;
  notional?: number;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop_limit' | 'trailing_stop';
  timeInForce?: 'day' | 'gtc' | 'ioc' | 'fok';
  limitPrice?: number;
  stopPrice?: number;
  trailPercent?: number;
  trailPrice?: number;
  extendedHours?: boolean;
  orderClass?: 'simple' | 'bracket' | 'oco' | 'oto';
  takeProfit?: { limitPrice: number };
  stopLoss?: { stopPrice: number; limitPrice?: number };
}

export interface Quote {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  bidSize?: number;
  askSize?: number;
  volume?: number;
  change?: number;
  changePercent?: number;
  timestamp?: string;
}

export interface MarketClock {
  isOpen: boolean;
  nextOpen: string;
  nextClose: string;
  timestamp: string;
}

export interface OrderPreview {
  symbol: string;
  side: 'buy' | 'sell';
  type: string;
  qty: number;
  currentPrice: number;
  bid: number;
  ask: number;
  estimatedPrice: number;
  estimatedCost: number;
  estimatedFees: number;
  estimatedTotal: number;
  slippageEstimate: number;
  marketImpact: 'low' | 'medium' | 'high';
}

export interface OrderValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ============================================================================
// Account Hook
// ============================================================================

export function useBrokerAccount() {
  const authReady = useAuthGate();
  return useQuery({
    queryKey: ['trading', 'account'],
    queryFn: async () => {
      const response = await api.get('/trading/account');
      return response.data as {
        account: BrokerAccount;
        brokerConnected: boolean;
        brokerType: string;
        paperTrading: boolean;
      };
    },
    enabled: authReady,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
}

// ============================================================================
// Positions Hook
// ============================================================================

export function useBrokerPositions() {
  const authReady = useAuthGate();
  return useQuery({
    queryKey: ['trading', 'positions'],
    queryFn: async () => {
      const response = await api.get('/trading/positions');
      return response.data as {
        positions: BrokerPosition[];
        count: number;
        brokerConnected: boolean;
        brokerType: string;
        paperTrading: boolean;
      };
    },
    enabled: authReady,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
}

// ============================================================================
// Orders Hook
// ============================================================================

export function useBrokerOrders(options?: { status?: string }) {
  const authReady = useAuthGate();
  return useQuery({
    queryKey: ['trading', 'orders', options?.status],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (options?.status) {
        params.append('status', options.status);
      }
      const response = await api.get(`/trading/orders${params.toString() ? '?' + params.toString() : ''}`);
      return response.data as {
        orders: Order[];
        count: number;
        brokerConnected: boolean;
        brokerType: string;
        paperTrading: boolean;
      };
    },
    enabled: authReady,
    staleTime: 10 * 1000,
    refetchInterval: 30 * 1000,
  });
}

// ============================================================================
// Order Mutations
// ============================================================================

export function useSubmitOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderReq: OrderRequest) => {
      const response = await api.post('/trading/orders', orderReq);
      return response.data as {
        order: Order;
        broker: string;
        paperTrading: boolean;
      };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['trading', 'orders'] });
      queryClient.invalidateQueries({ queryKey: ['trading', 'account'] });
      queryClient.invalidateQueries({ queryKey: ['trading', 'positions'] });
      toast.success('Order submitted', `${variables.side.toUpperCase()} ${variables.qty ?? ''} ${variables.symbol}`);
    },
    onError: (error) => {
      toast.error('Order failed', getErrorMessage(error));
    },
  });
}

export function useCancelOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderId: string) => {
      const response = await api.delete(`/trading/orders?id=${orderId}`);
      return response.data as { canceled: boolean; orderId: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trading', 'orders'] });
      toast.success('Order canceled');
    },
    onError: (error) => {
      toast.error('Failed to cancel order', getErrorMessage(error));
    },
  });
}

export function useCancelAllOrders() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await api.delete('/trading/orders?cancelAll=true');
      return response.data as { canceled: number };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['trading', 'orders'] });
      toast.success('All orders canceled', `${data.canceled} order${data.canceled !== 1 ? 's' : ''} canceled`);
    },
    onError: (error) => {
      toast.error('Failed to cancel orders', getErrorMessage(error));
    },
  });
}

// ============================================================================
// Order Preview Hook
// ============================================================================

export function useOrderPreview() {
  return useMutation({
    mutationFn: async (orderReq: Partial<OrderRequest>) => {
      const response = await api.post('/trading/preview', orderReq);
      return response.data as {
        preview: OrderPreview;
        account: {
          buyingPower: number;
          status: string;
          remainingBuyingPower: number;
        };
        validation: OrderValidation;
        source: string;
      };
    },
  });
}

// ============================================================================
// Quotes Hook
// ============================================================================

export function useQuote(symbol: string) {
  const authReady = useAuthGate();
  return useQuery({
    queryKey: ['trading', 'quote', symbol],
    queryFn: async () => {
      const response = await api.get(`/trading/quote?symbol=${symbol}`);
      const data = response.data as { quotes: Record<string, Quote> };
      return data.quotes[symbol.toUpperCase()];
    },
    enabled: authReady && !!symbol,
    staleTime: 5 * 1000,
    refetchInterval: 10 * 1000,
  });
}

export function useQuotes(symbols: string[]) {
  const authReady = useAuthGate();
  return useQuery({
    queryKey: ['trading', 'quotes', symbols.sort().join(',')],
    queryFn: async () => {
      const response = await api.get(`/trading/quote?symbols=${symbols.join(',')}`);
      return response.data as { quotes: Record<string, Quote>; source: string };
    },
    enabled: authReady && symbols.length > 0,
    staleTime: 5 * 1000,
    refetchInterval: 10 * 1000,
  });
}

// ============================================================================
// Market Clock Hook
// ============================================================================

export function useMarketClock() {
  const authReady = useAuthGate();
  return useQuery({
    queryKey: ['trading', 'clock'],
    queryFn: async () => {
      const response = await api.get('/trading/clock');
      return response.data as MarketClock & { source: string };
    },
    enabled: authReady,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });
}

// ============================================================================
// Broker Connection Hook
// ============================================================================

export function useConnectBroker() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (config: {
      broker: 'alpaca' | 'mock';
      apiKey?: string;
      apiSecret?: string;
      paperTrading?: boolean;
    }) => {
      const response = await api.post('/trading/connect', config);
      return response.data as {
        connected: boolean;
        broker: string;
        paperTrading: boolean;
        account?: BrokerAccount;
        message: string;
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['trading'] });
      toast.success('Broker connected', data.message);
    },
    onError: (error) => {
      toast.error('Broker connection failed', getErrorMessage(error));
    },
  });
}

// ============================================================================
// Combined Trading State Hook
// ============================================================================

export function useTrading() {
  const accountQuery = useBrokerAccount();
  const positionsQuery = useBrokerPositions();
  const ordersQuery = useBrokerOrders();
  const clockQuery = useMarketClock();
  const submitOrder = useSubmitOrder();
  const cancelOrder = useCancelOrder();
  const cancelAllOrders = useCancelAllOrders();
  const orderPreview = useOrderPreview();
  const connectBroker = useConnectBroker();

  return {
    // Account
    account: accountQuery.data?.account,
    brokerConnected: accountQuery.data?.brokerConnected ?? false,
    brokerType: accountQuery.data?.brokerType ?? 'demo',
    paperTrading: accountQuery.data?.paperTrading ?? true,
    accountLoading: accountQuery.isLoading,
    accountError: accountQuery.error,
    refetchAccount: accountQuery.refetch,

    // Positions
    positions: positionsQuery.data?.positions ?? [],
    positionsLoading: positionsQuery.isLoading,
    positionsError: positionsQuery.error,
    refetchPositions: positionsQuery.refetch,

    // Orders
    orders: ordersQuery.data?.orders ?? [],
    ordersLoading: ordersQuery.isLoading,
    ordersError: ordersQuery.error,
    refetchOrders: ordersQuery.refetch,

    // Market Clock
    marketClock: clockQuery.data,
    isMarketOpen: clockQuery.data?.isOpen ?? false,

    // Mutations
    submitOrder,
    cancelOrder,
    cancelAllOrders,
    orderPreview,
    connectBroker,

    // Loading states
    isLoading: accountQuery.isLoading || positionsQuery.isLoading || ordersQuery.isLoading,
  };
}
