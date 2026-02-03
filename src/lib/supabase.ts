import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://rqidgeittsjkpkykmdrz.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';

if (!supabaseServiceKey) {
  console.warn('SUPABASE_SERVICE_KEY not set - database features will be disabled');
}

// Server-side client with service role key (bypasses RLS)
export const supabaseAdmin: SupabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Client for user-scoped operations (uses user's JWT)
export function createUserClient(accessToken: string): SupabaseClient {
  return createClient(supabaseUrl, supabaseServiceKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// Database types for Frontier Alpha tables
export interface FrontierPortfolio {
  id: string;
  user_id: string;
  name: string;
  cash_balance: number;
  benchmark: string;
  created_at: string;
  updated_at: string;
}

export interface FrontierPosition {
  id: string;
  portfolio_id: string;
  symbol: string;
  shares: number;
  avg_cost: number;
  created_at: string;
  updated_at: string;
}

export interface FrontierRiskAlert {
  id: string;
  user_id: string;
  alert_type: 'drawdown' | 'volatility' | 'concentration' | 'correlation' | 'factor_drift' | 'liquidity' | 'earnings' | 'stop_loss' | 'take_profit';
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  acknowledged_at: string | null;
  created_at: string;
}

export interface FrontierQuoteCache {
  symbol: string;
  price: number;
  change: number;
  change_percent: number;
  volume: number;
  market_cap: number | null;
  pe_ratio: number | null;
  high_52w: number | null;
  low_52w: number | null;
  cached_at: string;
}

export interface FrontierUserSettings {
  user_id: string;
  display_name: string | null;
  risk_tolerance: 'conservative' | 'moderate' | 'aggressive';
  notifications_enabled: boolean;
  email_alerts: boolean;
  max_position_pct: number;
  stop_loss_pct: number;
  take_profit_pct: number;
  created_at: string;
  updated_at: string;
}
